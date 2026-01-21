/**
 * Tests for SQLite storage - Document CRUD, Chunk operations, Transactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to create mocks that can be used in module factory
const {
  mockPrepare,
  mockExec,
  mockPragma,
  mockClose,
  mockTransaction,
  mockRun,
  mockGet,
  mockAll,
  MockDatabase,
} = vi.hoisted(() => {
  const mockRun = vi.fn().mockReturnValue({ changes: 1 });
  const mockGet = vi.fn();
  const mockAll = vi.fn().mockReturnValue([]);

  const mockPrepare = vi.fn().mockReturnValue({
    run: mockRun,
    get: mockGet,
    all: mockAll,
  });
  const mockExec = vi.fn();
  const mockPragma = vi.fn();
  const mockClose = vi.fn();
  const mockTransaction = vi.fn((fn) => fn);

  // Create a constructor function that returns the mock object
  function MockDatabase() {
    return {
      prepare: mockPrepare,
      exec: mockExec,
      pragma: mockPragma,
      close: mockClose,
      transaction: mockTransaction,
    };
  }

  return {
    mockPrepare,
    mockExec,
    mockPragma,
    mockClose,
    mockTransaction,
    mockRun,
    mockGet,
    mockAll,
    MockDatabase,
  };
});

// Mock better-sqlite3 with hoisted mock
vi.mock('better-sqlite3', () => ({
  default: MockDatabase,
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  config: {
    sqlite: {
      path: '/tmp/test.db',
    },
  },
}));

// Import after mocks
import {
  getDatabase,
  closeDatabase,
  insertDocument,
  updateDocument,
  getDocumentById,
  getDocumentByPath,
  getAllDocuments,
  deleteDocument,
  insertChunks,
  getChunksByDocumentId,
  getChunkById,
  deleteChunksByDocumentId,
  withTransaction,
  getDocumentsByPaths,
} from './sqlite.js';

describe('SQLite Storage', () => {
  beforeEach(() => {
    // Reset mock return values
    mockRun.mockReturnValue({ changes: 1 });
    mockGet.mockReturnValue(undefined);
    mockAll.mockReturnValue([]);
    mockPrepare.mockReturnValue({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    });
    mockTransaction.mockImplementation((fn) => fn);

    // Reinitialize database singleton for each test
    closeDatabase();
  });

  afterEach(() => {
    vi.clearAllMocks();
    closeDatabase();
  });

  describe('getDatabase', () => {
    it('should create database with WAL mode and foreign keys', () => {
      getDatabase();

      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockPragma).toHaveBeenCalledWith('foreign_keys = ON');
    });

    it('should execute schema creation', () => {
      getDatabase();

      expect(mockExec).toHaveBeenCalled();
      const schemaCall = mockExec.mock.calls[0][0];
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS documents');
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS chunks');
    });

    it('should return same instance on subsequent calls', () => {
      const db1 = getDatabase();
      const db2 = getDatabase();

      expect(db1).toBe(db2);
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection', () => {
      getDatabase();
      closeDatabase();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should allow getting new database after close', () => {
      getDatabase();
      closeDatabase();
      getDatabase();

      // Pragma should be called twice (once per getDatabase call)
      expect(mockPragma).toHaveBeenCalledTimes(4); // 2 calls per getDatabase
    });
  });

  describe('Document Operations', () => {
    describe('insertDocument', () => {
      it('should insert document with all fields', () => {
        const doc = {
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          fileType: 'md' as const,
          fileSize: 1024,
          mimeType: 'text/markdown',
          checksum: 'abc123',
          status: 'pending' as const,
          chunkCount: 0,
          metadata: { title: 'Test' },
          indexedAt: null,
          summary: 'Test summary',
          tags: ['test', 'docs'],
        };

        const result = insertDocument(doc);

        expect(mockRun).toHaveBeenCalled();
        expect(result.id).toBe('doc-123');
        expect(result.filename).toBe('test.md');
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
      });

      it('should serialize metadata to JSON', () => {
        const doc = {
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          fileType: 'md' as const,
          fileSize: 1024,
          mimeType: 'text/markdown',
          checksum: 'abc123',
          status: 'pending' as const,
          chunkCount: 0,
          metadata: { custom: 'value' },
          indexedAt: null,
        };

        insertDocument(doc);

        const runArgs = mockRun.mock.calls[0];
        // Metadata is JSON stringified
        expect(runArgs).toContainEqual(JSON.stringify({ custom: 'value' }));
      });

      it('should serialize tags to JSON', () => {
        const doc = {
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          fileType: 'md' as const,
          fileSize: 1024,
          mimeType: 'text/markdown',
          checksum: 'abc123',
          status: 'pending' as const,
          chunkCount: 0,
          metadata: {},
          indexedAt: null,
          tags: ['tag1', 'tag2'],
        };

        insertDocument(doc);

        const runArgs = mockRun.mock.calls[0];
        expect(runArgs).toContainEqual(JSON.stringify(['tag1', 'tag2']));
      });
    });

    describe('updateDocument', () => {
      it('should update status field', () => {
        updateDocument('doc-123', { status: 'indexed' });

        expect(mockRun).toHaveBeenCalled();
        const runArgs = mockRun.mock.calls[0];
        expect(runArgs).toContain('indexed');
      });

      it('should update chunk count', () => {
        updateDocument('doc-123', { chunkCount: 5 });

        expect(mockRun).toHaveBeenCalled();
      });

      it('should update indexedAt timestamp', () => {
        const indexedAt = new Date();
        updateDocument('doc-123', { indexedAt });

        expect(mockRun).toHaveBeenCalled();
      });

      it('should update metadata as JSON', () => {
        updateDocument('doc-123', { metadata: { updated: true } });

        const runArgs = mockRun.mock.calls[0];
        expect(runArgs).toContainEqual(JSON.stringify({ updated: true }));
      });

      it('should update summary', () => {
        updateDocument('doc-123', { summary: 'New summary' });

        expect(mockRun).toHaveBeenCalled();
      });

      it('should update tags as JSON', () => {
        updateDocument('doc-123', { tags: ['new', 'tags'] });

        const runArgs = mockRun.mock.calls[0];
        expect(runArgs).toContainEqual(JSON.stringify(['new', 'tags']));
      });

      it('should not execute query when no updates provided', () => {
        updateDocument('doc-123', {});

        // Only prepare for migrations, not for update
        expect(mockRun).not.toHaveBeenCalled();
      });
    });

    describe('getDocumentById', () => {
      it('should return document when found', () => {
        mockGet.mockReturnValue({
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          file_type: 'md',
          file_size: 1024,
          mime_type: 'text/markdown',
          checksum: 'abc123',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          indexed_at: null,
          status: 'indexed',
          chunk_count: 3,
          metadata: '{"title":"Test"}',
          summary: null,
          tags: '[]',
        });

        const result = getDocumentById('doc-123');

        expect(result).not.toBeNull();
        expect(result!.id).toBe('doc-123');
        expect(result!.filename).toBe('test.md');
        expect(result!.metadata).toEqual({ title: 'Test' });
      });

      it('should return null when not found', () => {
        mockGet.mockReturnValue(undefined);

        const result = getDocumentById('nonexistent');

        expect(result).toBeNull();
      });

      it('should parse dates correctly', () => {
        mockGet.mockReturnValue({
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          file_type: 'md',
          file_size: 1024,
          mime_type: 'text/markdown',
          checksum: 'abc123',
          created_at: '2024-01-01T10:00:00.000Z',
          updated_at: '2024-01-02T10:00:00.000Z',
          indexed_at: '2024-01-02T12:00:00.000Z',
          status: 'indexed',
          chunk_count: 3,
          metadata: '{}',
          summary: null,
          tags: '[]',
        });

        const result = getDocumentById('doc-123');

        expect(result!.createdAt).toBeInstanceOf(Date);
        expect(result!.updatedAt).toBeInstanceOf(Date);
        expect(result!.indexedAt).toBeInstanceOf(Date);
      });
    });

    describe('getDocumentByPath', () => {
      it('should query by filepath', () => {
        mockGet.mockReturnValue({
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          file_type: 'md',
          file_size: 1024,
          mime_type: 'text/markdown',
          checksum: 'abc123',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          indexed_at: null,
          status: 'indexed',
          chunk_count: 0,
          metadata: '{}',
          summary: null,
          tags: '[]',
        });

        const result = getDocumentByPath('/docs/test.md');

        expect(result).not.toBeNull();
        expect(mockPrepare).toHaveBeenCalledWith(
          'SELECT * FROM documents WHERE filepath = ?'
        );
      });
    });

    describe('getAllDocuments', () => {
      it('should return all documents sorted by created_at DESC', () => {
        mockAll.mockReturnValue([
          {
            id: 'doc-1',
            filename: 'a.md',
            filepath: '/a.md',
            file_type: 'md',
            file_size: 100,
            mime_type: 'text/markdown',
            checksum: 'abc',
            created_at: '2024-01-02T00:00:00.000Z',
            updated_at: '2024-01-02T00:00:00.000Z',
            indexed_at: null,
            status: 'indexed',
            chunk_count: 1,
            metadata: '{}',
            summary: null,
            tags: '[]',
          },
          {
            id: 'doc-2',
            filename: 'b.md',
            filepath: '/b.md',
            file_type: 'md',
            file_size: 200,
            mime_type: 'text/markdown',
            checksum: 'def',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            indexed_at: null,
            status: 'pending',
            chunk_count: 0,
            metadata: '{}',
            summary: null,
            tags: '[]',
          },
        ]);

        const result = getAllDocuments();

        expect(result).toHaveLength(2);
        expect(mockPrepare).toHaveBeenCalledWith(
          'SELECT * FROM documents ORDER BY created_at DESC'
        );
      });

      it('should return empty array when no documents', () => {
        mockAll.mockReturnValue([]);

        const result = getAllDocuments();

        expect(result).toEqual([]);
      });
    });

    describe('deleteDocument', () => {
      it('should return true when document deleted', () => {
        mockRun.mockReturnValue({ changes: 1 });

        const result = deleteDocument('doc-123');

        expect(result).toBe(true);
      });

      it('should return false when document not found', () => {
        mockRun.mockReturnValue({ changes: 0 });

        const result = deleteDocument('nonexistent');

        expect(result).toBe(false);
      });
    });

    describe('getDocumentsByPaths', () => {
      it('should return empty map for empty input', () => {
        const result = getDocumentsByPaths([]);

        expect(result.size).toBe(0);
      });

      it('should return map of filepath to document', () => {
        mockAll.mockReturnValue([
          {
            id: 'doc-1',
            filename: 'a.md',
            filepath: '/docs/a.md',
            file_type: 'md',
            file_size: 100,
            mime_type: 'text/markdown',
            checksum: 'abc',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            indexed_at: null,
            status: 'indexed',
            chunk_count: 1,
            metadata: '{}',
            summary: null,
            tags: '[]',
          },
        ]);

        const result = getDocumentsByPaths(['/docs/a.md', '/docs/b.md']);

        expect(result.size).toBe(1);
        expect(result.has('/docs/a.md')).toBe(true);
        expect(result.get('/docs/a.md')!.id).toBe('doc-1');
      });
    });
  });

  describe('Chunk Operations', () => {
    describe('insertChunks', () => {
      it('should insert multiple chunks in transaction', () => {
        const chunks = [
          {
            id: 'chunk-1',
            documentId: 'doc-123',
            content: 'First chunk',
            chunkIndex: 0,
            startOffset: 0,
            endOffset: 11,
            tokenCount: 3,
            metadata: {},
          },
          {
            id: 'chunk-2',
            documentId: 'doc-123',
            content: 'Second chunk',
            chunkIndex: 1,
            startOffset: 12,
            endOffset: 24,
            tokenCount: 3,
            metadata: { section: 'intro' },
          },
        ];

        insertChunks(chunks);

        expect(mockTransaction).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalledTimes(2);
      });

      it('should serialize chunk metadata to JSON', () => {
        insertChunks([
          {
            id: 'chunk-1',
            documentId: 'doc-123',
            content: 'Content',
            chunkIndex: 0,
            startOffset: 0,
            endOffset: 7,
            tokenCount: 2,
            metadata: { key: 'value' },
          },
        ]);

        const runArgs = mockRun.mock.calls[0];
        expect(runArgs).toContainEqual(JSON.stringify({ key: 'value' }));
      });
    });

    describe('getChunksByDocumentId', () => {
      it('should return chunks sorted by chunk_index', () => {
        mockAll.mockReturnValue([
          { id: 'chunk-1', document_id: 'doc-123', content: 'First', chunk_index: 0, start_offset: 0, end_offset: 5, token_count: 2, metadata: '{}' },
          { id: 'chunk-2', document_id: 'doc-123', content: 'Second', chunk_index: 1, start_offset: 6, end_offset: 12, token_count: 2, metadata: '{}' },
        ]);

        const result = getChunksByDocumentId('doc-123');

        expect(result).toHaveLength(2);
        expect(mockPrepare).toHaveBeenCalledWith(
          'SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index'
        );
      });

      it('should return empty array when no chunks', () => {
        mockAll.mockReturnValue([]);

        const result = getChunksByDocumentId('doc-123');

        expect(result).toEqual([]);
      });
    });

    describe('getChunkById', () => {
      it('should return chunk when found', () => {
        mockGet.mockReturnValue({
          id: 'chunk-1',
          document_id: 'doc-123',
          content: 'Chunk content',
          chunk_index: 0,
          start_offset: 0,
          end_offset: 13,
          token_count: 3,
          metadata: '{}',
        });

        const result = getChunkById('chunk-1');

        expect(result).not.toBeNull();
        expect(result!.id).toBe('chunk-1');
      });

      it('should return null when not found', () => {
        mockGet.mockReturnValue(undefined);

        const result = getChunkById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('deleteChunksByDocumentId', () => {
      it('should delete all chunks for document', () => {
        deleteChunksByDocumentId('doc-123');

        expect(mockRun).toHaveBeenCalled();
        expect(mockPrepare).toHaveBeenCalledWith(
          'DELETE FROM chunks WHERE document_id = ?'
        );
      });
    });
  });

  describe('Transactions', () => {
    describe('withTransaction', () => {
      it('should execute function within transaction', () => {
        const fn = vi.fn().mockReturnValue('result');
        mockTransaction.mockImplementation((f) => f);

        const result = withTransaction(fn);

        expect(mockTransaction).toHaveBeenCalled();
        expect(fn).toHaveBeenCalled();
        expect(result).toBe('result');
      });

      it('should propagate errors from transaction', () => {
        mockTransaction.mockImplementation(() => {
          throw new Error('Transaction failed');
        });

        expect(() => withTransaction(() => 'value')).toThrow('Transaction failed');
      });
    });
  });
});
