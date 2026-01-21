/**
 * Tests for MCP ask tool - Zod validation, tool execution, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the ask service before importing
const mockAsk = vi.fn();
vi.mock('../../core/ask/service.js', () => ({
  getAskService: () => ({
    ask: mockAsk,
  }),
}));

// Import after mock
import { ask, askSchema } from './ask.js';

describe('Ask Tool', () => {
  beforeEach(() => {
    mockAsk.mockReset();
    // Default successful response
    mockAsk.mockResolvedValue({
      answer: 'This is the AI-generated answer based on retrieved context.',
      sources: [
        {
          filename: 'document.md',
          filepath: '/docs/document.md',
          content: 'Relevant source content',
          score: 0.92,
        },
      ],
      model: 'gpt-oss-120b',
      usage: {
        llm: {
          promptTokens: 150,
          completionTokens: 100,
          totalTokens: 250,
        },
      },
      metadata: {
        rerankUsed: true,
        hydeUsed: false,
        queryExpanded: true,
        originalQuery: 'test question',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod Schema Validation', () => {
    it('should accept valid params with required fields only', () => {
      const result = askSchema.safeParse({ question: 'What is RAG?' });
      expect(result.success).toBe(true);
    });

    it('should accept valid params with all optional fields', () => {
      const result = askSchema.safeParse({
        question: 'What is RAG?',
        limit: 10,
        threshold: 0.6,
        model: 'custom-model',
        rerank: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing question', () => {
      const result = askSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid limit (below min)', () => {
      const result = askSchema.safeParse({ question: 'test', limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid limit (above max)', () => {
      const result = askSchema.safeParse({ question: 'test', limit: 21 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid threshold (below min)', () => {
      const result = askSchema.safeParse({ question: 'test', threshold: -0.1 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid threshold (above max)', () => {
      const result = askSchema.safeParse({ question: 'test', threshold: 1.1 });
      expect(result.success).toBe(false);
    });

    it('should accept boundary values for limit', () => {
      const minResult = askSchema.safeParse({ question: 'test', limit: 1 });
      const maxResult = askSchema.safeParse({ question: 'test', limit: 20 });
      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('should accept boundary values for threshold', () => {
      const minResult = askSchema.safeParse({ question: 'test', threshold: 0 });
      const maxResult = askSchema.safeParse({ question: 'test', threshold: 1 });
      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    it('should return success with full result data', async () => {
      const result = await ask({ question: 'What is RAG?' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.answer).toBe('This is the AI-generated answer based on retrieved context.');
      expect(result.data!.model).toBe('gpt-oss-120b');
      expect(result.data!.sources).toHaveLength(1);
    });

    it('should include usage statistics', async () => {
      const result = await ask({ question: 'What is RAG?' });

      expect(result.data!.usage).toBeDefined();
      expect(result.data!.usage!.llm.promptTokens).toBe(150);
      expect(result.data!.usage!.llm.completionTokens).toBe(100);
      expect(result.data!.usage!.llm.totalTokens).toBe(250);
    });

    it('should include metadata about processing', async () => {
      const result = await ask({ question: 'What is RAG?' });

      expect(result.data!.metadata).toBeDefined();
      expect(result.data!.metadata!.rerankUsed).toBe(true);
      expect(result.data!.metadata!.hydeUsed).toBe(false);
      expect(result.data!.metadata!.queryExpanded).toBe(true);
    });

    it('should pass all params to ask service', async () => {
      await ask({
        question: 'What is RAG?',
        limit: 8,
        threshold: 0.7,
        model: 'gpt-4',
        rerank: false,
      });

      expect(mockAsk).toHaveBeenCalledWith({
        question: 'What is RAG?',
        limit: 8,
        threshold: 0.7,
        model: 'gpt-4',
        rerank: false,
      });
    });

    it('should handle response without optional usage', async () => {
      mockAsk.mockResolvedValue({
        answer: 'Answer without usage stats',
        sources: [],
        model: 'test-model',
      });

      const result = await ask({ question: 'test' });

      expect(result.success).toBe(true);
      expect(result.data!.usage).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should return error response when service throws Error', async () => {
      mockAsk.mockRejectedValue(new Error('LLM API unavailable'));

      const result = await ask({ question: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM API unavailable');
    });

    it('should handle non-Error throws', async () => {
      mockAsk.mockRejectedValue({ code: 'TIMEOUT' });

      const result = await ask({ question: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('[object Object]');
    });

    it('should handle null/undefined throws', async () => {
      mockAsk.mockRejectedValue(null);

      const result = await ask({ question: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('null');
    });
  });
});
