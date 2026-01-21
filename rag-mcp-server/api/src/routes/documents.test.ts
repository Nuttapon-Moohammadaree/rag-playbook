/**
 * Integration tests for documents routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import documents from './documents.js';

// Mock the core services
vi.mock('../../../src/core/ingestion/service.js', () => ({
  getIngestionService: () => ({
    indexDocument: vi.fn().mockResolvedValue({
      documentId: 'test-doc-123',
      filename: 'test.pdf',
      status: 'success',
      chunkCount: 5,
    }),
    deleteDocument: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../../src/storage/sqlite.js', () => ({
  getAllDocuments: vi.fn().mockReturnValue([
    {
      id: 'doc-1',
      filename: 'test.pdf',
      filepath: '/path/to/test.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      status: 'indexed',
      chunkCount: 5,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      indexedAt: new Date('2025-01-01'),
      metadata: {},
    },
  ]),
  getDocumentById: vi.fn().mockImplementation((id: string) => {
    if (id === 'doc-1') {
      return {
        id: 'doc-1',
        filename: 'test.pdf',
        filepath: '/path/to/test.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        status: 'indexed',
        chunkCount: 5,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        indexedAt: new Date('2025-01-01'),
        metadata: {},
      };
    }
    return null;
  }),
}));

describe('Documents Routes', () => {
  const app = new Hono().route('/documents', documents);

  describe('POST /documents/upload', () => {
    it('should index a document successfully', async () => {
      const res = await app.request('/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: '/path/to/test.pdf' }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.documentId).toBe('test-doc-123');
      expect(data.data.status).toBe('success');
    });

    it('should reject invalid request without filepath', async () => {
      const res = await app.request('/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should accept optional chunking parameters', async () => {
      const res = await app.request('/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath: '/path/to/test.pdf',
          chunkSize: 500,
          chunkOverlap: 50,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /documents', () => {
    it('should list all documents', async () => {
      const res = await app.request('/documents');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.documents).toHaveLength(1);
      expect(data.data.documents[0].filename).toBe('test.pdf');
    });

    it('should support pagination parameters', async () => {
      const res = await app.request('/documents?limit=10&offset=0');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.pagination).toBeDefined();
      expect(data.data.pagination.limit).toBe(10);
      expect(data.data.pagination.offset).toBe(0);
    });
  });

  describe('GET /documents/:id', () => {
    it('should return a document by id', async () => {
      const res = await app.request('/documents/doc-1');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('doc-1');
      expect(data.data.filename).toBe('test.pdf');
    });

    it('should return 404 for non-existent document', async () => {
      const res = await app.request('/documents/non-existent');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /documents/:id', () => {
    it('should delete a document', async () => {
      const res = await app.request('/documents/doc-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.documentId).toBe('doc-1');
    });

    it('should return 404 for non-existent document', async () => {
      const res = await app.request('/documents/non-existent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });
});
