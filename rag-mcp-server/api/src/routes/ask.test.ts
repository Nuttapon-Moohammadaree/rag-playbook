/**
 * Integration tests for ask routes
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import ask from './ask.js';

// Mock the ask service
vi.mock('../../../src/core/ask/service.js', () => ({
  getAskService: () => ({
    ask: vi.fn().mockImplementation(async (params: { verify?: boolean }) => {
      const baseResponse = {
        answer: 'RAG (Retrieval-Augmented Generation) is a technique that combines information retrieval with language models.',
        sources: [
          {
            filename: 'rag-guide.pdf',
            filepath: '/docs/rag-guide.pdf',
            content: 'RAG combines retrieval with generation...',
            score: 0.92,
            originalScore: 0.92,
          },
        ],
        model: 'gpt-oss-120b',
        usage: {
          llm: {
            promptTokens: 150,
            completionTokens: 50,
            totalTokens: 200,
          },
        },
        metadata: {
          rerankUsed: true,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'What is RAG?',
        },
      };

      if (params.verify) {
        return {
          ...baseResponse,
          verification: {
            enabled: true,
            groundingScore: 0.95,
            isGrounded: true,
            unsupportedClaims: [],
            citations: [
              {
                chunkId: 'chunk-1',
                filename: 'rag-guide.pdf',
                quote: 'RAG combines retrieval with generation',
                relevanceScore: 0.92,
              },
            ],
            chunksFiltered: 0,
            verificationTimeMs: 250,
          },
          confidence: 0.95,
        };
      }

      return baseResponse;
    }),
  }),
}));

describe('Ask Routes', () => {
  const app = new Hono().route('/ask', ask);

  describe('POST /ask', () => {
    it('should answer a question', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'What is RAG?' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.answer).toContain('RAG');
      expect(data.data.sources).toHaveLength(1);
      expect(data.data.model).toBe('gpt-oss-120b');
    });

    it('should include verification when verify=true', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'What is RAG?',
          verify: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.verification).toBeDefined();
      expect(data.data.verification.enabled).toBe(true);
      expect(data.data.verification.groundingScore).toBe(0.95);
      expect(data.data.confidence).toBe(0.95);
    });

    it('should not include verification when verify=false', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'What is RAG?',
          verify: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.verification).toBeUndefined();
    });

    it('should accept optional parameters', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'What is RAG?',
          limit: 5,
          threshold: 0.7,
          rerank: false,
          model: 'custom-model',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should reject empty question', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing question', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should validate question length', async () => {
      const longQuestion = 'a'.repeat(2001); // exceeds max of 2000
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: longQuestion }),
      });

      expect(res.status).toBe(400);
    });

    it('should validate limit parameter', async () => {
      const res = await app.request('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'test',
          limit: 25, // exceeds max of 20
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
