/**
 * Document ingestion service - orchestrates parsing, chunking, and indexing
 */

import { stat } from 'fs/promises';
import { basename } from 'path';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

import { parseDocument, getFileType, getMimeType, isSupportedFile } from './parsers/index.js';
import { getChunkingService } from '../chunking/service.js';
import { getEmbeddingService } from '../embedding/service.js';
import {
  insertDocument,
  updateDocument,
  getDocumentByPath,
  deleteDocument as deleteDocumentFromDb,
  insertChunks,
  deleteChunksByDocumentId,
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

    const filename = basename(filepath);

    try {
      // Validate file
      if (!isSupportedFile(filepath)) {
        throw new Error(`Unsupported file type: ${filepath}`);
      }

      const fileStat = await stat(filepath);
      if (!fileStat.isFile()) {
        throw new Error(`Not a file: ${filepath}`);
      }

      // Check if already indexed
      const existing = getDocumentByPath(filepath);
      if (existing && !options.forceReindex) {
        // Check if file has changed
        const newChecksum = await this.computeChecksum(filepath);
        if (existing.checksum === newChecksum) {
          return {
            documentId: existing.id,
            filename,
            status: 'success',
            chunkCount: existing.chunkCount,
          };
        }
        // File changed, reindex
        await this.deleteDocument(existing.id);
      } else if (existing && options.forceReindex) {
        await this.deleteDocument(existing.id);
      }

      // Create document record
      const fileType = getFileType(filepath)!;
      const checksum = await this.computeChecksum(filepath);
      const documentId = uuidv4();

      const document: Omit<Document, 'createdAt' | 'updatedAt'> = {
        id: documentId,
        filename,
        filepath,
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

      try {
        // Parse document
        const parsed = await parseDocument(filepath);

        // Update metadata from parsed content
        if (parsed.metadata) {
          updateDocument(documentId, {
            metadata: { ...document.metadata, ...parsed.metadata },
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

        // Store chunks in SQLite
        insertChunks(chunkData);

        // Store vectors in Qdrant
        const vectorPoints = chunkData.map((chunk, index) => ({
          id: chunk.id,
          vector: embeddingResponse.embeddings[index],
          payload: {
            chunk_id: chunk.id,
            document_id: documentId,
            content: chunk.content,
            chunk_index: chunk.chunkIndex,
            filename,
            filepath,
            file_type: fileType,
            metadata: chunk.metadata,
          },
        }));

        await upsertVectors(vectorPoints);

        // Update document status
        updateDocument(documentId, {
          status: 'indexed',
          chunkCount: chunks.length,
          indexedAt: new Date(),
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
    await this.initialize();

    // Delete vectors from Qdrant
    await deleteVectorsByDocumentId(documentId);

    // Delete chunks from SQLite
    deleteChunksByDocumentId(documentId);

    // Delete document from SQLite
    return deleteDocumentFromDb(documentId);
  }

  /**
   * Compute file checksum
   */
  private async computeChecksum(filepath: string): Promise<string> {
    const content = await readFile(filepath);
    return createHash('sha256').update(content).digest('hex');
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
