/**
 * Tests for Embedding Service - Single/batch embedding, API handling, error cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before import
vi.mock('../../config/index.js', () => ({
  config: {
    litellm: {
      apiKey: 'test-api-key',
      baseUrl: 'http://localhost:4000',
      embeddingModel: 'bge-m3',
      timeout: 30000,
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { EmbeddingService, getEmbeddingService } from './service.js';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    service = new EmbeddingService();

    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' },
        ],
        model: 'bge-m3',
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('embed', () => {
    it('should return empty response for empty input', async () => {
      const result = await service.embed([]);

      expect(result.embeddings).toEqual([]);
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should embed single text', async () => {
      const result = await service.embed(['test text']);

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('bge-m3');
    });

    it('should call API with correct parameters', async () => {
      await service.embed(['test text']);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
          body: JSON.stringify({
            model: 'bge-m3',
            input: ['test text'],
            encoding_format: 'float',
          }),
        })
      );
    });

    it('should return usage statistics', async () => {
      const result = await service.embed(['text']);

      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.totalTokens).toBe(10);
    });

    it('should handle missing usage in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1], index: 0 }],
          model: 'bge-m3',
          // No usage field
        }),
      });

      const result = await service.embed(['text']);

      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });

    it('should sort embeddings by index', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.2], index: 1 },
            { embedding: [0.1], index: 0 },
            { embedding: [0.3], index: 2 },
          ],
          model: 'bge-m3',
          usage: { prompt_tokens: 30, total_tokens: 30 },
        }),
      });

      const result = await service.embed(['text1', 'text2', 'text3']);

      expect(result.embeddings[0]).toEqual([0.1]);
      expect(result.embeddings[1]).toEqual([0.2]);
      expect(result.embeddings[2]).toEqual([0.3]);
    });
  });

  describe('embedSingle', () => {
    it('should return single embedding vector', async () => {
      const result = await service.embedSingle('test text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should throw error when API returns empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          model: 'bge-m3',
        }),
      });

      await expect(service.embedSingle('text')).rejects.toThrow(
        'Embedding API returned empty embeddings array'
      );
    });
  });

  describe('Batch Processing', () => {
    it('should process small batch in single request', async () => {
      await service.embed(['text1', 'text2', 'text3']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should split large batches (>32 texts)', async () => {
      const texts = Array(50).fill('text');

      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          data: Array(32).fill(null).map((_, i) => ({
            embedding: [0.1],
            index: i,
          })),
          model: 'bge-m3',
          usage: { prompt_tokens: 100, total_tokens: 100 },
        }),
      }));

      await service.embed(texts);

      // Should split into 2 batches: 32 + 18
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should combine results from multiple batches', async () => {
      const texts = Array(40).fill('text');
      let callCount = 0;

      mockFetch.mockImplementation(async () => {
        callCount++;
        const size = callCount === 1 ? 32 : 8;
        return {
          ok: true,
          json: async () => ({
            data: Array(size).fill(null).map((_, i) => ({
              embedding: [callCount, i],
              index: i,
            })),
            model: 'bge-m3',
            usage: { prompt_tokens: size * 3, total_tokens: size * 3 },
          }),
        };
      });

      const result = await service.embed(texts);

      expect(result.embeddings).toHaveLength(40);
    });

    it('should aggregate usage across batches', async () => {
      const texts = Array(40).fill('text');

      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          data: Array(32).fill(null).map((_, i) => ({
            embedding: [0.1],
            index: i,
          })),
          model: 'bge-m3',
          usage: { prompt_tokens: 100, total_tokens: 100 },
        }),
      }));

      const result = await service.embed(texts);

      // Should aggregate usage from both batches
      expect(result.usage.promptTokens).toBe(200);
      expect(result.usage.totalTokens).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should throw on API error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(service.embed(['text'])).rejects.toThrow(
        'Embedding API error (500): Internal Server Error'
      );
    });

    it('should throw on rate limit error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(service.embed(['text'])).rejects.toThrow(
        'Embedding API error (429): Rate limit exceeded'
      );
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.embed(['text'])).rejects.toThrow('Network error');
    });

    it('should handle timeout via AbortController', async () => {
      mockFetch.mockImplementation(async (url, options) => {
        // Check that signal is provided
        expect(options.signal).toBeDefined();
        return {
          ok: true,
          json: async () => ({
            data: [{ embedding: [0.1], index: 0 }],
            model: 'bge-m3',
          }),
        };
      });

      await service.embed(['text']);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate ~4 characters per token', () => {
      const text = 'a'.repeat(100);
      const estimate = service.estimateTokens(text);

      expect(estimate).toBe(25); // 100 / 4
    });

    it('should round up estimates', () => {
      const text = 'a'.repeat(10);
      const estimate = service.estimateTokens(text);

      expect(estimate).toBe(3); // ceil(10/4) = 3
    });

    it('should return 0 for empty string', () => {
      expect(service.estimateTokens('')).toBe(0);
    });
  });

  describe('Singleton', () => {
    it('should return same instance from getEmbeddingService', () => {
      const service1 = getEmbeddingService();
      const service2 = getEmbeddingService();

      expect(service1).toBe(service2);
    });
  });
});
