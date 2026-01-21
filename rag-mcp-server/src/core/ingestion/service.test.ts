/**
 * Tests for Ingestion Service - document processing pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for mocks
const {
  mockStat,
  mockCreateReadStream,
  mockParseDocument,
  mockGetFileType,
  mockGetMimeType,
  mockIsSupportedFile,
  mockChunk,
  mockEmbed,
  mockEnsureCollection,
  mockUpsertVectors,
  mockDeleteVectorsByDocumentId,
  mockInsertDocument,
  mockUpdateDocument,
  mockGetDocumentByPath,
  mockDeleteDocument,
  mockInsertChunks,
  mockDeleteChunksByDocumentId,
  mockWithTransaction,
  mockGenerateBriefSummary,
  mockGenerateTags,
} = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockCreateReadStream: vi.fn(),
  mockParseDocument: vi.fn(),
  mockGetFileType: vi.fn(),
  mockGetMimeType: vi.fn(),
  mockIsSupportedFile: vi.fn(),
  mockChunk: vi.fn(),
  mockEmbed: vi.fn(),
  mockEnsureCollection: vi.fn(),
  mockUpsertVectors: vi.fn(),
  mockDeleteVectorsByDocumentId: vi.fn(),
  mockInsertDocument: vi.fn(),
  mockUpdateDocument: vi.fn(),
  mockGetDocumentByPath: vi.fn(),
  mockDeleteDocument: vi.fn(),
  mockInsertChunks: vi.fn(),
  mockDeleteChunksByDocumentId: vi.fn(),
  mockWithTransaction: vi.fn(),
  mockGenerateBriefSummary: vi.fn(),
  mockGenerateTags: vi.fn(),
}));

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    llm: {
      autoSummary: false,
      autoTags: false,
    },
  },
}));

// Mock fs/promises and fs
vi.mock('fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

vi.mock('fs', () => ({
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

// Mock parsers
vi.mock('./parsers/index.js', () => ({
  parseDocument: (...args: unknown[]) => mockParseDocument(...args),
  getFileType: (...args: unknown[]) => mockGetFileType(...args),
  getMimeType: (...args: unknown[]) => mockGetMimeType(...args),
  isSupportedFile: (...args: unknown[]) => mockIsSupportedFile(...args),
}));

// Mock chunking service
vi.mock('../chunking/service.js', () => ({
  getChunkingService: () => ({
    chunk: (...args: unknown[]) => mockChunk(...args),
  }),
}));

// Mock embedding service
vi.mock('../embedding/service.js', () => ({
  getEmbeddingService: () => ({
    embed: (...args: unknown[]) => mockEmbed(...args),
  }),
}));

// Mock summarizer
vi.mock('../llm/summarizer.js', () => ({
  getSummarizer: () => ({
    generateBriefSummary: (...args: unknown[]) => mockGenerateBriefSummary(...args),
  }),
}));

// Mock tagger
vi.mock('../llm/tagger.js', () => ({
  getTagger: () => ({
    generateTags: (...args: unknown[]) => mockGenerateTags(...args),
  }),
}));

// Mock storage
vi.mock('../../storage/sqlite.js', () => ({
  insertDocument: (...args: unknown[]) => mockInsertDocument(...args),
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
  getDocumentByPath: (...args: unknown[]) => mockGetDocumentByPath(...args),
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
  insertChunks: (...args: unknown[]) => mockInsertChunks(...args),
  deleteChunksByDocumentId: (...args: unknown[]) => mockDeleteChunksByDocumentId(...args),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

vi.mock('../../storage/qdrant.js', () => ({
  ensureCollection: (...args: unknown[]) => mockEnsureCollection(...args),
  upsertVectors: (...args: unknown[]) => mockUpsertVectors(...args),
  deleteVectorsByDocumentId: (...args: unknown[]) => mockDeleteVectorsByDocumentId(...args),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));

import { IngestionService, getIngestionService } from './service.js';

describe('IngestionService', () => {
  let service: IngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IngestionService();

    // Default mock setup
    mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
    mockIsSupportedFile.mockReturnValue(true);
    mockGetFileType.mockReturnValue('txt');
    mockGetMimeType.mockReturnValue('text/plain');
    mockEnsureCollection.mockResolvedValue(undefined);
    mockGetDocumentByPath.mockReturnValue(null);
    mockParseDocument.mockResolvedValue({
      content: 'Parsed content',
      metadata: { source: '/path/to/file.txt' },
    });
    mockChunk.mockReturnValue([
      {
        content: 'Chunk 1',
        startOffset: 0,
        endOffset: 10,
        tokenCount: 5,
        metadata: {},
      },
    ]);
    mockEmbed.mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
    });
    mockUpsertVectors.mockResolvedValue(undefined);
    mockInsertDocument.mockReturnValue(undefined);
    mockInsertChunks.mockReturnValue(undefined);
    mockUpdateDocument.mockReturnValue(undefined);
    mockWithTransaction.mockImplementation((fn: () => unknown) => fn());

    // Mock createReadStream for checksum calculation
    const mockStream = {
      on: vi.fn().mockImplementation(function (this: { on: typeof vi.fn }, event: string, callback: (data?: unknown) => void) {
        if (event === 'data') {
          callback(Buffer.from('file content'));
        } else if (event === 'end') {
          callback();
        }
        return this;
      }),
    };
    mockCreateReadStream.mockReturnValue(mockStream);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize Qdrant collection', async () => {
      await service.initialize();

      expect(mockEnsureCollection).toHaveBeenCalled();
    });

    it('should only initialize once', async () => {
      await service.initialize();
      await service.initialize();
      await service.initialize();

      expect(mockEnsureCollection).toHaveBeenCalledTimes(1);
    });
  });

  describe('indexDocument', () => {
    it('should reject unsupported file types', async () => {
      mockIsSupportedFile.mockReturnValue(false);

      const result = await service.indexDocument('/path/to/file.exe');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unsupported file type');
    });

    it('should reject non-file paths', async () => {
      mockStat.mockResolvedValue({ isFile: () => false, size: 0 });

      const result = await service.indexDocument('/path/to/directory');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Not a file');
    });

    it('should skip already indexed files with same checksum', async () => {
      mockWithTransaction.mockImplementation(() => ({
        type: 'existing',
        documentId: 'existing-doc-id',
        chunkCount: 5,
      }));

      const result = await service.indexDocument('/path/to/file.txt');

      expect(result.status).toBe('success');
      expect(result.documentId).toBe('existing-doc-id');
      expect(result.chunkCount).toBe(5);
      // Should not call parse or embed for existing docs
      expect(mockParseDocument).not.toHaveBeenCalled();
    });

    it('should process new documents through full pipeline', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn(); // Execute the transaction logic
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });

      const result = await service.indexDocument('/path/to/file.txt');

      expect(result.status).toBe('success');
      expect(mockParseDocument).toHaveBeenCalledWith('/path/to/file.txt');
      expect(mockChunk).toHaveBeenCalled();
      expect(mockEmbed).toHaveBeenCalled();
      expect(mockInsertChunks).toHaveBeenCalled();
      expect(mockUpsertVectors).toHaveBeenCalled();
      expect(mockUpdateDocument).toHaveBeenCalled();
    });

    it('should return chunk count on success', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });
      mockChunk.mockReturnValue([
        { content: 'Chunk 1', startOffset: 0, endOffset: 10, tokenCount: 5, metadata: {} },
        { content: 'Chunk 2', startOffset: 10, endOffset: 20, tokenCount: 5, metadata: {} },
        { content: 'Chunk 3', startOffset: 20, endOffset: 30, tokenCount: 5, metadata: {} },
      ]);
      mockEmbed.mockResolvedValue({
        embeddings: [[0.1], [0.2], [0.3]],
      });

      const result = await service.indexDocument('/path/to/file.txt');

      expect(result.chunkCount).toBe(3);
    });

    it('should update document metadata from parsed content', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });
      mockParseDocument.mockResolvedValue({
        content: 'Content',
        metadata: { title: 'Doc Title', author: 'Author' },
      });

      await service.indexDocument('/path/to/file.txt');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        'mock-uuid-1234',
        expect.objectContaining({
          metadata: expect.objectContaining({ title: 'Doc Title' }),
        })
      );
    });

    it('should handle empty content error', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });
      mockChunk.mockReturnValue([]);

      const result = await service.indexDocument('/path/to/file.txt');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No content to index');
    });

    it('should handle embedding count mismatch', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });
      mockChunk.mockReturnValue([
        { content: 'Chunk 1', startOffset: 0, endOffset: 10, tokenCount: 5, metadata: {} },
        { content: 'Chunk 2', startOffset: 10, endOffset: 20, tokenCount: 5, metadata: {} },
      ]);
      mockEmbed.mockResolvedValue({
        embeddings: [[0.1]], // Only 1 embedding for 2 chunks
      });

      const result = await service.indexDocument('/path/to/file.txt');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Embedding count mismatch');
    });

    it('should mark document as failed on error', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });
      mockParseDocument.mockRejectedValue(new Error('Parse error'));

      await service.indexDocument('/path/to/file.txt');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        'mock-uuid-1234',
        expect.objectContaining({
          status: 'failed',
          metadata: expect.objectContaining({ error: 'Parse error' }),
        })
      );
    });

    it('should use custom chunk options', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });

      await service.indexDocument('/path/to/file.txt', {
        chunkSize: 256,
        chunkOverlap: 25,
      });

      expect(mockChunk).toHaveBeenCalledWith(
        'Parsed content',
        expect.objectContaining({
          chunkSize: 256,
          chunkOverlap: 25,
        })
      );
    });

    it('should force reindex when option is set', async () => {
      // First call returns reindex type, second call should process normally
      mockWithTransaction
        .mockImplementationOnce(() => ({
          type: 'reindex',
          existingId: 'old-doc-id',
        }))
        .mockImplementationOnce((fn: () => unknown) => {
          fn();
          return { type: 'new', documentId: 'mock-uuid-1234' };
        });

      mockDeleteVectorsByDocumentId.mockResolvedValue(undefined);
      mockDeleteDocument.mockReturnValue(true);

      const result = await service.indexDocument('/path/to/file.txt', {
        forceReindex: true,
      });

      expect(mockDeleteVectorsByDocumentId).toHaveBeenCalledWith('old-doc-id');
      expect(result.status).toBe('success');
    });
  });

  describe('indexText', () => {
    it('should index raw text content', async () => {
      const result = await service.indexText('Test content', 'Test Title');

      expect(result.status).toBe('success');
      expect(mockInsertDocument).toHaveBeenCalled();
      expect(mockChunk).toHaveBeenCalled();
      expect(mockEmbed).toHaveBeenCalled();
    });

    it('should reject empty content', async () => {
      const result = await service.indexText('', 'Title');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Content cannot be empty');
    });

    it('should reject whitespace-only content', async () => {
      const result = await service.indexText('   \n\t  ', 'Title');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Content cannot be empty');
    });

    it('should use memory:// filepath for text content', async () => {
      await service.indexText('Content', 'Title');

      expect(mockInsertDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: 'memory://mock-uuid-1234',
        })
      );
    });

    it('should include custom metadata', async () => {
      await service.indexText('Content', 'Title', { author: 'Test Author' });

      expect(mockInsertDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            author: 'Test Author',
            title: 'Title',
            source: 'text',
          }),
        })
      );
    });

    it('should handle chunking failure', async () => {
      mockChunk.mockReturnValue([]);

      const result = await service.indexText('Content', 'Title');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No content to index');
    });
  });

  describe('deleteDocument', () => {
    it('should delete document from all storage backends', async () => {
      mockDeleteDocument.mockReturnValue(true);
      mockDeleteVectorsByDocumentId.mockResolvedValue(undefined);

      const result = await service.deleteDocument('doc-123');

      expect(mockDeleteVectorsByDocumentId).toHaveBeenCalledWith('doc-123');
      expect(mockDeleteChunksByDocumentId).toHaveBeenCalledWith('doc-123');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc-123');
      expect(result).toBe(true);
    });

    it('should return false when document not found', async () => {
      mockDeleteDocument.mockReturnValue(false);

      const result = await service.deleteDocument('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('Singleton', () => {
    it('should return same instance from getIngestionService', () => {
      const service1 = getIngestionService();
      const service2 = getIngestionService();

      expect(service1).toBe(service2);
    });
  });

  describe('Vector Storage Integration', () => {
    it('should store vectors with correct payload', async () => {
      mockWithTransaction.mockImplementation((fn: () => unknown) => {
        fn();
        return { type: 'new', documentId: 'mock-uuid-1234' };
      });

      await service.indexDocument('/path/to/file.txt');

      expect(mockUpsertVectors).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            vector: [0.1, 0.2, 0.3],
            payload: expect.objectContaining({
              document_id: 'mock-uuid-1234',
              filename: 'file.txt',
              filepath: '/path/to/file.txt',
              file_type: 'txt',
            }),
          }),
        ])
      );
    });
  });
});
