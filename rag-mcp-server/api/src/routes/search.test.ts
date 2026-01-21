/**
 * Integration tests for search routes
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import search from './search.js';

// Mock the retrieval service
vi.mock('../../../src/core/retrieval/service.js', () => ({
  getRetrievalService: () => ({
    searchWithMetadata: vi.fn().mockResolvedValue({
      results: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'This is a test document about RAG systems.',
          score: 0.85,
          document: {
            id: 'doc-1',
            filename: 'test.pdf',
            filepath: '/path/to/test.pdf',
            fileType: 'pdf',
          },
          metadata: {},
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-1',
          content: 'More content about search and retrieval.',
          score: 0.72,
          document: {
            id: 'doc-1',
            filename: 'test.pdf',
            filepath: '/path/to/test.pdf',
            fileType: 'pdf',
          },
          metadata: {},
        },
      ],
      metadata: {
        rerankUsed: true,
        hydeUsed: false,
        queryExpanded: false,
        originalQuery: 'RAG systems',
      },
    }),
  }),
}));

describe('Search Routes', () => {
  const app = new Hono().route('/search', search);

  describe('POST /search', () => {
    it('should search documents and return results', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'RAG systems' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.results).toHaveLength(2);
      expect(data.data.results[0].score).toBe(0.85);
      expect(data.data.metadata.rerankUsed).toBe(true);
    });

    it('should accept optional search parameters', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test query',
          limit: 5,
          threshold: 0.7,
          rerank: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should reject empty query', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing query', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should validate limit parameter', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          limit: 100, // exceeds max of 50
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should validate threshold parameter', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          threshold: 1.5, // exceeds max of 1
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should accept filters', async () => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test query',
          filters: {
            documentIds: ['doc-1'],
            fileTypes: ['pdf', 'txt'],
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
