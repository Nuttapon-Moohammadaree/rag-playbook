/**
 * Document ingestion service - orchestrates parsing, chunking, and indexing
 */

import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { basename } from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import { parseDocument, getFileType, getMimeType, isSupportedFile } from './parsers/index.js';
import { validateFilePath, validateDocumentId, documentLockManager } from '../../utils/security.js';
import { getChunkingService } from '../chunking/service.js';
import { getEmbeddingService } from '../embedding/service.js';
import { getSummarizer } from '../llm/summarizer.js';
import { getTagger } from '../llm/tagger.js';
import { config } from '../../config/index.js';
import {
  insertDocument,
  updateDocument,
  getDocumentByPath,
  deleteDocument as deleteDocumentFromDb,
  insertChunks,
  deleteChunksByDocumentId,
  withTransaction,
} from '../../storage/sqlite.js';
import {
  ensureCollection,
  upsertVectors,
  deleteVectorsByDocumentId,
} from '../../storage/qdrant.js';
import type {
  Document,
  IngestionResult,
  IngestionOptions,
  FileType,
} from '../../types/index.js';

export class IngestionService {
  private chunkingService = getChunkingService();
  private embeddingService = getEmbeddingService();
  private initialized = false;

  /**
   * Initialize storage backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await ensureCollection();
    this.initialized = true;
  }

  /**
   * Index a document by file path
   */
  async indexDocument(
    filepath: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    await this.initialize();

    // Validate and canonicalize path to prevent directory traversal
    const validatedPath = validateFilePath(filepath);
    const filename = basename(validatedPath);

    // Acquire document lock to prevent race conditions with concurrent indexing
    // This ensures only one indexing operation can happen per filepath at a time
    const releaseLock = await documentLockManager.acquire(validatedPath);

    try {
      // Validate file
      if (!isSupportedFile(validatedPath)) {
        throw new Error(`Unsupported file type: ${filename}`);
      }

      const fileStat = await stat(validatedPath);
      if (!fileStat.isFile()) {
        throw new Error(`Not a file: ${filename}`);
      }

      // Compute checksum first (needed for comparison and new record)
      const checksum = await this.computeChecksum(validatedPath);
      const fileType = getFileType(validatedPath)!;
      const documentId = uuidv4();

      // Use transaction to atomically check and create document record
      const transactionResult = withTransaction(() => {
        // Check if already indexed (inside transaction for atomicity)
        const existing = getDocumentByPath(validatedPath);

        if (existing && !options.forceReindex) {
          // Check if file has changed
          if (existing.checksum === checksum) {
            return {
              type: 'existing' as const,
              documentId: existing.id,
              chunkCount: existing.chunkCount,
            };
          }
          // File changed, mark for reindex (delete outside transaction due to async)
          return { type: 'reindex' as const, existingId: existing.id };
        } else if (existing && options.forceReindex) {
          return { type: 'reindex' as const, existingId: existing.id };
        }

        // Create new document record
        const document: Omit<Document, 'createdAt' | 'updatedAt'> = {
          id: documentId,
          filename,
          filepath: validatedPath,
          fileType,
          fileSize: fileStat.size,
          mimeType: getMimeType(fileType),
          checksum,
          status: 'processing',
          chunkCount: 0,
          indexedAt: null,
          metadata: {},
        };

        insertDocument(document);
        return { type: 'new' as const, documentId };
      });

      // Handle transaction result
      if (transactionResult.type === 'existing') {
        // Lock will be released in finally block
        return {
          documentId: transactionResult.documentId,
          filename,
          status: 'success',
          chunkCount: transactionResult.chunkCount,
        };
      }

      // For reindex case, we need to delete old document and create new record
      let actualDocumentId = documentId;
      if (transactionResult.type === 'reindex') {
        // Delete old document (async operations must be outside transaction)
        // Lock is still held, preventing other concurrent reindex attempts
        await this.deleteDocument(transactionResult.existingId);

        // Create new document record after deletion
        const newDocumentId = uuidv4();
        actualDocumentId = newDocumentId;

        const document: Omit<Document, 'createdAt' | 'updatedAt'> = {
          id: newDocumentId,
          filename,
          filepath: validatedPath,
          fileType,
          fileSize: fileStat.size,
          mimeType: getMimeType(fileType),
          checksum,
          status: 'processing',
          chunkCount: 0,
          indexedAt: null,
          metadata: {},
        };
        insertDocument(document);
      }

      try {
        // Parse document
        const parsed = await parseDocument(validatedPath);

        // Update metadata from parsed content
        if (parsed.metadata) {
          updateDocument(actualDocumentId, {
            metadata: parsed.metadata,
          });
        }

        // Chunk content
        const chunks = this.chunkingService.chunk(parsed.content, {
          chunkSize: options.chunkSize,
          chunkOverlap: options.chunkOverlap,
        });

        if (chunks.length === 0) {
          throw new Error('No content to index');
        }

        // Prepare chunk data
        const chunkData = chunks.map((chunk, index) => ({
          id: uuidv4(),
          documentId: actualDocumentId,
          content: chunk.content,
          chunkIndex: index,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata,
        }));

        // Generate embeddings
        const texts = chunkData.map(c => c.content);
        const embeddingResponse = await this.embeddingService.embed(texts);

        // Validate embeddings array length matches chunks
        if (embeddingResponse.embeddings.length !== chunkData.length) {
          throw new Error(
            `Embedding count mismatch: expected ${chunkData.length}, got ${embeddingResponse.embeddings.length}`
          );
        }

        // Validate embedding dimensions match configured vector size
        const expectedDimension = config.qdrant.vectorSize;
        for (let i = 0; i < embeddingResponse.embeddings.length; i++) {
          const embedding = embeddingResponse.embeddings[i];
          if (embedding && embedding.length !== expectedDimension) {
            throw new Error(
              `Embedding dimension mismatch at index ${i}: expected ${expectedDimension}, got ${embedding.length}`
            );
          }
        }

        // Store chunks in SQLite
        insertChunks(chunkData);

        // Store vectors in Qdrant
        const vectorPoints = chunkData.map((chunk, index) => {
          const vector = embeddingResponse.embeddings[index];
          if (!vector) {
            throw new Error(`Missing embedding for chunk index ${index}`);
          }
          return {
            id: chunk.id,
            vector,
            payload: {
              chunk_id: chunk.id,
              document_id: actualDocumentId,
              content: chunk.content,
              chunk_index: chunk.chunkIndex,
              filename,
              filepath: validatedPath,
              file_type: fileType,
              metadata: chunk.metadata,
            },
          };
        });

        await upsertVectors(vectorPoints);

        // Generate LLM enhancements if enabled (non-blocking)
        let summary: string | undefined;
        let tags: string[] | undefined;

        if (config.llm.autoSummary || config.llm.autoTags) {
          const docTitle = parsed.metadata?.title ?? filename;
          const contentSample = parsed.content.substring(0, 10000);

          // Generate summary and tags in parallel
          const [summaryResult, tagsResult] = await Promise.allSettled([
            config.llm.autoSummary
              ? getSummarizer().generateBriefSummary(contentSample)
              : Promise.resolve(undefined),
            config.llm.autoTags
              ? getTagger().generateTags(contentSample, docTitle)
              : Promise.resolve(undefined),
          ]);

          if (summaryResult.status === 'fulfilled' && summaryResult.value) {
            summary = summaryResult.value;
          }
          if (tagsResult.status === 'fulfilled' && tagsResult.value) {
            tags = tagsResult.value;
          }
        }

        // Update document status
        updateDocument(actualDocumentId, {
          status: 'indexed',
          chunkCount: chunks.length,
          indexedAt: new Date(),
          summary,
          tags,
        });

        return {
          documentId: actualDocumentId,
          filename,
          status: 'success',
          chunkCount: chunks.length,
        };
      } catch (error) {
        // Mark document as failed
        updateDocument(actualDocumentId, {
          status: 'failed',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    } catch (error) {
      return {
        documentId: '',
        filename,
        status: 'failed',
        chunkCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * Index raw text content without a file
   */
  async indexText(
    content: string,
    title: string,
    metadata: Record<string, unknown> = {}
  ): Promise<IngestionResult> {
    await this.initialize();

    const documentId = uuidv4();
    const filename = `${title}.txt`;
    const filepath = `memory://${documentId}`;

    try {
      if (!content || content.trim().length === 0) {
        throw new Error('Content cannot be empty');
      }

      // Create document record
      const document: Omit<Document, 'createdAt' | 'updatedAt'> = {
        id: documentId,
        filename,
        filepath,
        fileType: 'txt' as FileType,
        fileSize: Buffer.byteLength(content, 'utf8'),
        mimeType: 'text/plain',
        checksum: createHash('sha256').update(content).digest('hex'),
        status: 'processing',
        chunkCount: 0,
        indexedAt: null,
        metadata: {
          title,
          source: 'text',
          ...metadata,
        },
      };

      insertDocument(document);

      try {
        // Chunk content
        const chunks = this.chunkingService.chunk(content, {});

        if (chunks.length === 0) {
          throw new Error('No content to index');
        }

        // Prepare chunk data
        const chunkData = chunks.map((chunk, index) => ({
          id: uuidv4(),
          documentId,
          content: chunk.content,
          chunkIndex: index,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata,
        }));

        // Generate embeddings
        const texts = chunkData.map(c => c.content);
        const embeddingResponse = await this.embeddingService.embed(texts);

        // Validate embeddings array length matches chunks
        if (embeddingResponse.embeddings.length !== chunkData.length) {
          throw new Error(
            `Embedding count mismatch: expected ${chunkData.length}, got ${embeddingResponse.embeddings.length}`
          );
        }

        // Validate embedding dimensions match configured vector size
        const expectedDimension = config.qdrant.vectorSize;
        for (let i = 0; i < embeddingResponse.embeddings.length; i++) {
          const embedding = embeddingResponse.embeddings[i];
          if (embedding && embedding.length !== expectedDimension) {
            throw new Error(
              `Embedding dimension mismatch at index ${i}: expected ${expectedDimension}, got ${embedding.length}`
            );
          }
        }

        // Store chunks in SQLite
        insertChunks(chunkData);

        // Store vectors in Qdrant
        const vectorPoints = chunkData.map((chunk, index) => {
          const vector = embeddingResponse.embeddings[index];
          if (!vector) {
            throw new Error(`Missing embedding for chunk index ${index}`);
          }
          return {
            id: chunk.id,
            vector,
            payload: {
              chunk_id: chunk.id,
              document_id: documentId,
              content: chunk.content,
              chunk_index: chunk.chunkIndex,
              filename,
              filepath,
              file_type: 'txt',
              metadata: chunk.metadata,
            },
          };
        });

        await upsertVectors(vectorPoints);

        // Generate LLM enhancements if enabled (non-blocking)
        let summary: string | undefined;
        let tags: string[] | undefined;

        if (config.llm.autoSummary || config.llm.autoTags) {
          const contentSample = content.substring(0, 10000);

          // Generate summary and tags in parallel
          const [summaryResult, tagsResult] = await Promise.allSettled([
            config.llm.autoSummary
              ? getSummarizer().generateBriefSummary(contentSample)
              : Promise.resolve(undefined),
            config.llm.autoTags
              ? getTagger().generateTags(contentSample, title)
              : Promise.resolve(undefined),
          ]);

          if (summaryResult.status === 'fulfilled' && summaryResult.value) {
            summary = summaryResult.value;
          }
          if (tagsResult.status === 'fulfilled' && tagsResult.value) {
            tags = tagsResult.value;
          }
        }

        // Update document status
        updateDocument(documentId, {
          status: 'indexed',
          chunkCount: chunks.length,
          indexedAt: new Date(),
          summary,
          tags,
        });

        return {
          documentId,
          filename,
          status: 'success',
          chunkCount: chunks.length,
        };
      } catch (error) {
        // Mark document as failed
        updateDocument(documentId, {
          status: 'failed',
          metadata: {
            ...document.metadata,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    } catch (error) {
      return {
        documentId: '',
        filename,
        status: 'failed',
        chunkCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete a document and its chunks
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    // Validate document ID format
    validateDocumentId(documentId);

    await this.initialize();

    // Delete vectors from Qdrant
    await deleteVectorsByDocumentId(documentId);

    // Delete chunks from SQLite
    deleteChunksByDocumentId(documentId);

    // Delete document from SQLite
    return deleteDocumentFromDb(documentId);
  }

  /**
   * Compute file checksum using streaming to avoid loading entire file into memory
   */
  private computeChecksum(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filepath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }
}

// Singleton instance
let ingestionService: IngestionService | null = null;

export function getIngestionService(): IngestionService {
  if (!ingestionService) {
    ingestionService = new IngestionService();
  }
  return ingestionService;
}
