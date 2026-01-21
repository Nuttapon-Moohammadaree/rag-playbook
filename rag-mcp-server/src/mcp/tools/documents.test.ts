/**
 * Tests for MCP document tools - CRUD operations, schema validation, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to create mocks that can be used in module factory
const {
  mockIndexDocument,
  mockDeleteDocument,
  mockIndexText,
  mockGetAllDocuments,
  mockGetDocumentById,
} = vi.hoisted(() => ({
  mockIndexDocument: vi.fn(),
  mockDeleteDocument: vi.fn(),
  mockIndexText: vi.fn(),
  mockGetAllDocuments: vi.fn(),
  mockGetDocumentById: vi.fn(),
}));

// Mock the ingestion service
vi.mock('../../core/ingestion/service.js', () => ({
  getIngestionService: () => ({
    indexDocument: mockIndexDocument,
    deleteDocument: mockDeleteDocument,
    indexText: mockIndexText,
  }),
}));

// Mock SQLite storage
vi.mock('../../storage/sqlite.js', () => ({
  getAllDocuments: mockGetAllDocuments,
  getDocumentById: mockGetDocumentById,
}));

// Import after mocks
import {
  indexDocument,
  indexDocumentSchema,
  listDocuments,
  listDocumentsSchema,
  deleteDocument,
  deleteDocumentSchema,
  getDocument,
  getDocumentSchema,
  indexText,
  indexTextSchema,
} from './documents.js';

describe('Document Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('indexDocument', () => {
    describe('Schema Validation', () => {
      it('should accept valid params with path only', () => {
        const result = indexDocumentSchema.safeParse({ path: '/docs/test.md' });
        expect(result.success).toBe(true);
      });

      it('should accept valid params with force option', () => {
        const result = indexDocumentSchema.safeParse({
          path: '/docs/test.md',
          force: true,
        });
        expect(result.success).toBe(true);
      });

      it('should reject missing path', () => {
        const result = indexDocumentSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject non-string path', () => {
        const result = indexDocumentSchema.safeParse({ path: 123 });
        expect(result.success).toBe(false);
      });
    });

    describe('Execution', () => {
      it('should return success with document info on successful index', async () => {
        mockIndexDocument.mockResolvedValue({
          status: 'indexed',
          documentId: 'doc-123',
          chunkCount: 5,
        });

        const result = await indexDocument({ path: '/docs/test.md' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
          documentId: 'doc-123',
          chunkCount: 5,
        });
      });

      it('should pass force option to service', async () => {
        mockIndexDocument.mockResolvedValue({
          status: 'indexed',
          documentId: 'doc-123',
          chunkCount: 3,
        });

        await indexDocument({ path: '/docs/test.md', force: true });

        expect(mockIndexDocument).toHaveBeenCalledWith('/docs/test.md', {
          forceReindex: true,
        });
      });

      it('should return error when indexing fails', async () => {
        mockIndexDocument.mockResolvedValue({
          status: 'failed',
          documentId: '',
          chunkCount: 0,
          error: 'File not found',
        });

        const result = await indexDocument({ path: '/nonexistent.md' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('File not found');
      });

      it('should handle service exception', async () => {
        mockIndexDocument.mockRejectedValue(new Error('Service error'));

        const result = await indexDocument({ path: '/docs/test.md' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Service error');
      });
    });
  });

  describe('listDocuments', () => {
    describe('Schema Validation', () => {
      it('should accept empty params', () => {
        const result = listDocumentsSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should accept valid status filter', () => {
        const validStatuses = ['pending', 'processing', 'indexed', 'failed'];
        for (const status of validStatuses) {
          const result = listDocumentsSchema.safeParse({ status });
          expect(result.success).toBe(true);
        }
      });

      it('should reject invalid status', () => {
        const result = listDocumentsSchema.safeParse({ status: 'unknown' });
        expect(result.success).toBe(false);
      });

      it('should accept valid file type filter', () => {
        const validTypes = ['txt', 'md', 'docx', 'pdf'];
        for (const fileType of validTypes) {
          const result = listDocumentsSchema.safeParse({ fileType });
          expect(result.success).toBe(true);
        }
      });

      it('should reject invalid file type', () => {
        const result = listDocumentsSchema.safeParse({ fileType: 'exe' });
        expect(result.success).toBe(false);
      });
    });

    describe('Execution', () => {
      it('should return all documents when no filters', async () => {
        mockGetAllDocuments.mockReturnValue([
          {
            id: 'doc-1',
            filename: 'test1.md',
            filepath: '/docs/test1.md',
            fileType: 'md',
            status: 'indexed',
            chunkCount: 3,
            indexedAt: new Date('2024-01-01'),
          },
          {
            id: 'doc-2',
            filename: 'test2.pdf',
            filepath: '/docs/test2.pdf',
            fileType: 'pdf',
            status: 'pending',
            chunkCount: 0,
            indexedAt: null,
          },
        ]);

        const result = await listDocuments({});

        expect(result.success).toBe(true);
        expect(result.data!.documents).toHaveLength(2);
        expect(result.data!.total).toBe(2);
      });

      it('should filter by status', async () => {
        mockGetAllDocuments.mockReturnValue([
          { id: 'doc-1', status: 'indexed', filename: 'a.md', filepath: '/a.md', fileType: 'md', chunkCount: 1, indexedAt: null },
          { id: 'doc-2', status: 'pending', filename: 'b.md', filepath: '/b.md', fileType: 'md', chunkCount: 0, indexedAt: null },
        ]);

        const result = await listDocuments({ status: 'indexed' });

        expect(result.data!.documents).toHaveLength(1);
        expect(result.data!.documents[0].id).toBe('doc-1');
      });

      it('should filter by file type', async () => {
        mockGetAllDocuments.mockReturnValue([
          { id: 'doc-1', fileType: 'md', filename: 'a.md', filepath: '/a.md', status: 'indexed', chunkCount: 1, indexedAt: null },
          { id: 'doc-2', fileType: 'pdf', filename: 'b.pdf', filepath: '/b.pdf', status: 'indexed', chunkCount: 2, indexedAt: null },
        ]);

        const result = await listDocuments({ fileType: 'pdf' });

        expect(result.data!.documents).toHaveLength(1);
        expect(result.data!.documents[0].id).toBe('doc-2');
      });

      it('should format document summary correctly', async () => {
        const indexedAt = new Date('2024-01-15T10:30:00Z');
        mockGetAllDocuments.mockReturnValue([
          {
            id: 'doc-1',
            filename: 'test.md',
            filepath: '/docs/test.md',
            fileType: 'md',
            status: 'indexed',
            chunkCount: 5,
            indexedAt,
          },
        ]);

        const result = await listDocuments({});
        const doc = result.data!.documents[0];

        expect(doc.id).toBe('doc-1');
        expect(doc.filename).toBe('test.md');
        expect(doc.filepath).toBe('/docs/test.md');
        expect(doc.fileType).toBe('md');
        expect(doc.status).toBe('indexed');
        expect(doc.chunkCount).toBe(5);
        expect(doc.indexedAt).toBe(indexedAt.toISOString());
      });

      it('should handle exception', async () => {
        mockGetAllDocuments.mockImplementation(() => {
          throw new Error('Database error');
        });

        const result = await listDocuments({});

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database error');
      });
    });
  });

  describe('deleteDocument', () => {
    describe('Schema Validation', () => {
      it('should accept valid documentId', () => {
        const result = deleteDocumentSchema.safeParse({ documentId: 'doc-123' });
        expect(result.success).toBe(true);
      });

      it('should reject missing documentId', () => {
        const result = deleteDocumentSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });

    describe('Execution', () => {
      it('should return success when document deleted', async () => {
        mockDeleteDocument.mockResolvedValue(true);

        const result = await deleteDocument({ documentId: 'doc-123' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ deleted: true });
      });

      it('should return success with deleted=false when not found', async () => {
        mockDeleteDocument.mockResolvedValue(false);

        const result = await deleteDocument({ documentId: 'nonexistent' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ deleted: false });
      });

      it('should handle exception', async () => {
        mockDeleteDocument.mockRejectedValue(new Error('Delete failed'));

        const result = await deleteDocument({ documentId: 'doc-123' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Delete failed');
      });
    });
  });

  describe('getDocument', () => {
    describe('Schema Validation', () => {
      it('should accept valid documentId', () => {
        const result = getDocumentSchema.safeParse({ documentId: 'doc-123' });
        expect(result.success).toBe(true);
      });

      it('should reject missing documentId', () => {
        const result = getDocumentSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });

    describe('Execution', () => {
      it('should return document when found', async () => {
        const doc = {
          id: 'doc-123',
          filename: 'test.md',
          filepath: '/docs/test.md',
          fileType: 'md',
          status: 'indexed',
        };
        mockGetDocumentById.mockReturnValue(doc);

        const result = await getDocument({ documentId: 'doc-123' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(doc);
      });

      it('should return null when not found', async () => {
        mockGetDocumentById.mockReturnValue(null);

        const result = await getDocument({ documentId: 'nonexistent' });

        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
      });

      it('should handle exception', async () => {
        mockGetDocumentById.mockImplementation(() => {
          throw new Error('Query failed');
        });

        const result = await getDocument({ documentId: 'doc-123' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Query failed');
      });
    });
  });

  describe('indexText', () => {
    describe('Schema Validation', () => {
      it('should accept valid content and title', () => {
        const result = indexTextSchema.safeParse({
          content: 'Some text content',
          title: 'My Document',
        });
        expect(result.success).toBe(true);
      });

      it('should accept optional metadata', () => {
        const result = indexTextSchema.safeParse({
          content: 'Some text content',
          title: 'My Document',
          metadata: { author: 'Test', tags: ['test'] },
        });
        expect(result.success).toBe(true);
      });

      it('should reject empty content', () => {
        const result = indexTextSchema.safeParse({
          content: '',
          title: 'Title',
        });
        expect(result.success).toBe(false);
      });

      it('should reject empty title', () => {
        const result = indexTextSchema.safeParse({
          content: 'Content',
          title: '',
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing content', () => {
        const result = indexTextSchema.safeParse({ title: 'Title' });
        expect(result.success).toBe(false);
      });

      it('should reject missing title', () => {
        const result = indexTextSchema.safeParse({ content: 'Content' });
        expect(result.success).toBe(false);
      });
    });

    describe('Execution', () => {
      it('should return success with document info', async () => {
        mockIndexText.mockResolvedValue({
          status: 'indexed',
          documentId: 'txt-doc-123',
          chunkCount: 2,
        });

        const result = await indexText({
          content: 'Test content',
          title: 'Test Title',
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
          documentId: 'txt-doc-123',
          chunkCount: 2,
        });
      });

      it('should pass metadata to service', async () => {
        mockIndexText.mockResolvedValue({
          status: 'indexed',
          documentId: 'txt-doc-123',
          chunkCount: 1,
        });

        const metadata = { author: 'Test Author' };
        await indexText({
          content: 'Content',
          title: 'Title',
          metadata,
        });

        expect(mockIndexText).toHaveBeenCalledWith('Content', 'Title', metadata);
      });

      it('should return error when indexing fails', async () => {
        mockIndexText.mockResolvedValue({
          status: 'failed',
          documentId: '',
          chunkCount: 0,
          error: 'Content too short',
        });

        const result = await indexText({
          content: 'x',
          title: 'Title',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Content too short');
      });

      it('should handle exception', async () => {
        mockIndexText.mockRejectedValue(new Error('Index error'));

        const result = await indexText({
          content: 'Content',
          title: 'Title',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Index error');
      });
    });
  });
});
