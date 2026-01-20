/**
 * RAG MCP Server - Main Entry Point
 *
 * This module provides both programmatic API and CLI interface.
 *
 * Usage:
 *   - MCP Server: node dist/mcp/server.js
 *   - CLI: node dist/index.js <command>
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { getIngestionService } from './core/ingestion/service.js';
import { getRetrievalService } from './core/retrieval/service.js';
import { getAllDocuments, getDocumentById, closeDatabase } from './storage/sqlite.js';
import { getCollectionInfo } from './storage/qdrant.js';
import { isSupportedFile } from './core/ingestion/parsers/index.js';
import { getAskService } from './core/ask/service.js';
import type { Document, SearchResult, IngestionResult } from './types/index.js';

// Re-export services for programmatic use
export { getIngestionService } from './core/ingestion/service.js';
export { getRetrievalService } from './core/retrieval/service.js';
export { getEmbeddingService } from './core/embedding/service.js';
export { getChunkingService } from './core/chunking/service.js';
export { getRerankingService } from './core/reranking/service.js';
export * from './types/index.js';

/**
 * High-level API for RAG operations
 */
export class RagMcpClient {
  private ingestionService = getIngestionService();
  private retrievalService = getRetrievalService();

  /**
   * Index a document
   */
  async indexDocument(filepath: string, forceReindex = false): Promise<IngestionResult> {
    return this.ingestionService.indexDocument(filepath, { forceReindex });
  }

  /**
   * Search for documents
   */
  async search(query: string, limit = 10, rerank?: boolean): Promise<SearchResult[]> {
    return this.retrievalService.search({ query, limit, rerank });
  }

  /**
   * List all documents
   */
  listDocuments(): Document[] {
    return getAllDocuments();
  }

  /**
   * Get a document by ID
   */
  getDocument(id: string): Document | null {
    return getDocumentById(id);
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<boolean> {
    return this.ingestionService.deleteDocument(id);
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{ documentCount: number; vectorCount: number; status: string }> {
    const documents = getAllDocuments();
    const collectionInfo = await getCollectionInfo();

    return {
      documentCount: documents.length,
      vectorCount: collectionInfo.vectorCount,
      status: collectionInfo.status,
    };
  }

  /**
   * Close connections
   */
  close(): void {
    closeDatabase();
  }

  /**
   * Batch index all documents in a directory
   */
  async batchIndex(
    dirPath: string,
    options: {
      recursive?: boolean;
      concurrency?: number;
      onProgress?: (current: number, total: number, filename: string, status: 'success' | 'failed' | 'skipped') => void;
    } = {}
  ): Promise<{ success: number; failed: number; skipped: number; errors: Array<{ file: string; error: string }> }> {
    const { recursive = true, concurrency = 3, onProgress } = options;

    // Collect all files
    const files = await this.collectFiles(dirPath, recursive);
    const supportedFiles = files.filter(f => isSupportedFile(f));

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors: Array<{ file: string; error: string }> = [];

    // Process in batches for concurrency control
    for (let i = 0; i < supportedFiles.length; i += concurrency) {
      const batch = supportedFiles.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (filepath) => {
          const result = await this.indexDocument(filepath);
          return { filepath, result };
        })
      );

      for (const res of results) {
        if (res.status === 'fulfilled') {
          const { filepath, result } = res.value;
          const filename = filepath.split('/').pop() ?? filepath;
          if (result.status === 'success') {
            success++;
            onProgress?.(success + failed + skipped, supportedFiles.length, filename, 'success');
          } else {
            failed++;
            errors.push({ file: filepath, error: result.error ?? 'Unknown error' });
            onProgress?.(success + failed + skipped, supportedFiles.length, filename, 'failed');
          }
        } else {
          failed++;
          errors.push({ file: 'unknown', error: res.reason?.message ?? 'Unknown error' });
        }
      }
    }

    return { success, failed, skipped, errors };
  }

  /**
   * Recursively collect files from directory
   */
  private async collectFiles(dirPath: string, recursive: boolean): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        const subFiles = await this.collectFiles(fullPath, recursive);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

/**
 * CLI interface
 */
async function cli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  const client = new RagMcpClient();

  try {
    switch (command) {
      case 'index': {
        const filepath = args[1];
        if (!filepath) {
          console.error('Usage: index <filepath>');
          process.exit(1);
        }
        console.log(`Indexing: ${filepath}`);
        const result = await client.indexDocument(filepath);
        if (result.status === 'success') {
          console.log(`Success: ${result.chunkCount} chunks indexed`);
        } else {
          console.error(`Failed: ${result.error}`);
          process.exit(1);
        }
        break;
      }

      case 'search': {
        // Parse --rerank and --no-rerank flags
        const searchArgs = args.slice(1);
        const rerankIndex = searchArgs.findIndex(a => a === '--rerank');
        const noRerankIndex = searchArgs.findIndex(a => a === '--no-rerank');

        let rerank: boolean | undefined;
        if (rerankIndex !== -1) {
          rerank = true;
          searchArgs.splice(rerankIndex, 1);
        } else if (noRerankIndex !== -1) {
          rerank = false;
          searchArgs.splice(noRerankIndex, 1);
        }

        const query = searchArgs.join(' ');
        if (!query) {
          console.error('Usage: search <query> [--rerank|--no-rerank]');
          process.exit(1);
        }
        const rerankLabel = rerank === true ? ' (rerank: on)' : rerank === false ? ' (rerank: off)' : '';
        console.log(`Searching: "${query}"${rerankLabel}`);
        const results = await client.search(query, 10, rerank);
        if (results.length === 0) {
          console.log('No results found');
        } else {
          for (const result of results) {
            console.log(`\n[${result.score.toFixed(3)}] ${result.document.filename}`);
            console.log(`  ${result.content.substring(0, 200)}...`);
          }
        }
        break;
      }

      case 'list': {
        const documents = client.listDocuments();
        if (documents.length === 0) {
          console.log('No documents indexed');
        } else {
          console.log(`${documents.length} documents:\n`);
          for (const doc of documents) {
            console.log(`  [${doc.status}] ${doc.filename} (${doc.chunkCount} chunks)`);
            console.log(`    ID: ${doc.id}`);
            console.log(`    Path: ${doc.filepath}`);
          }
        }
        break;
      }

      case 'delete': {
        const id = args[1];
        if (!id) {
          console.error('Usage: delete <document-id>');
          process.exit(1);
        }
        const deleted = await client.deleteDocument(id);
        console.log(deleted ? 'Document deleted' : 'Document not found');
        break;
      }

      case 'stats': {
        const stats = await client.getStats();
        console.log('RAG MCP Server Statistics:');
        console.log(`  Documents: ${stats.documentCount}`);
        console.log(`  Vectors: ${stats.vectorCount}`);
        console.log(`  Status: ${stats.status}`);
        break;
      }

      case 'batch-index': {
        const dirPath = args[1];
        if (!dirPath) {
          console.error('Usage: batch-index <directory>');
          process.exit(1);
        }
        console.log(`Batch indexing: ${dirPath}\n`);
        const startTime = Date.now();
        const result = await client.batchIndex(dirPath, {
          concurrency: 3,
          onProgress: (current, total, filename, status) => {
            const icon = status === 'success' ? '✓' : status === 'failed' ? '✗' : '○';
            console.log(`[${current}/${total}] ${icon} ${filename}`);
          },
        });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\nCompleted in ${elapsed}s:`);
        console.log(`  Success: ${result.success}`);
        console.log(`  Failed: ${result.failed}`);
        if (result.errors.length > 0) {
          console.log('\nErrors:');
          for (const err of result.errors.slice(0, 10)) {
            console.log(`  - ${err.file.split('/').pop()}: ${err.error}`);
          }
          if (result.errors.length > 10) {
            console.log(`  ... and ${result.errors.length - 10} more`);
          }
        }
        break;
      }

      case 'ask': {
        // Parse --rerank and --no-rerank flags
        const askArgs = args.slice(1);
        const askRerankIndex = askArgs.findIndex(a => a === '--rerank');
        const askNoRerankIndex = askArgs.findIndex(a => a === '--no-rerank');

        let askRerank: boolean | undefined;
        if (askRerankIndex !== -1) {
          askRerank = true;
          askArgs.splice(askRerankIndex, 1);
        } else if (askNoRerankIndex !== -1) {
          askRerank = false;
          askArgs.splice(askNoRerankIndex, 1);
        }

        const question = askArgs.join(' ');
        if (!question) {
          console.error('Usage: ask <question> [--rerank|--no-rerank]');
          process.exit(1);
        }
        const askRerankLabel = askRerank === true ? ' (rerank: on)' : askRerank === false ? ' (rerank: off)' : '';
        console.log(`Question: "${question}"${askRerankLabel}\n`);
        const askService = getAskService();
        const response = await askService.ask({ question, rerank: askRerank });
        console.log('Answer:');
        console.log(response.answer);
        if (response.sources.length > 0) {
          console.log('\nSources:');
          for (const source of response.sources) {
            console.log(`  [${source.score}] ${source.filename}`);
          }
        }
        if (response.usage) {
          console.log(`\n(Tokens: ${response.usage.totalTokens})`);
        }
        break;
      }

      case 'help':
      default: {
        console.log(`
RAG MCP Server CLI

Commands:
  index <filepath>     Index a single document
  batch-index <dir>    Index all documents in directory
  search <query>       Search indexed documents
    --rerank           Enable reranking (default: enabled)
    --no-rerank        Disable reranking
  ask <question>       Ask a question (RAG + LLM)
    --rerank           Enable reranking (default: enabled)
    --no-rerank        Disable reranking
  list                 List all indexed documents
  delete <id>          Delete a document by ID
  stats                Show server statistics
  help                 Show this help message

MCP Server:
  node dist/mcp/server.js
        `);
        break;
      }
    }
  } finally {
    client.close();
  }
}

// Run CLI if this is the main module
const isMain = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMain) {
  cli().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
