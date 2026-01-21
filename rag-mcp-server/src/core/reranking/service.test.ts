/**
 * Tests for Reranking Service - Reranking, fallback, score handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before import
vi.mock('../../config/index.js', () => ({
  config: {
    litellm: {
      apiKey: 'test-api-key',
      baseUrl: 'http://localhost:4000',
    },
    reranking: {
      model: 'bge-reranker-v2-m3',
      enabled: true,
      topN: 5,
      candidateMultiplier: 3,
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { RerankingService, getRerankingService } from './service.js';

describe('RerankingService', () => {
  let service: RerankingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RerankingService();

    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.85 },
          { index: 1, relevance_score: 0.75 },
        ],
        model: 'bge-reranker-v2-m3',
        usage: { total_tokens: 100 },
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rerank', () => {
    it('should return empty array for empty documents', async () => {
      const result = await service.rerank({
        query: 'test query',
        documents: [],
      });

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip reranking when documents <= topN', async () => {
      const result = await service.rerank({
        query: 'test query',
        documents: ['doc1', 'doc2', 'doc3'],
        topN: 5,
      });

      // Should return original indices with -1 score indicating skipped
      expect(result).toHaveLength(3);
      expect(result[0].index).toBe(0);
      expect(result[0].relevanceScore).toBe(-1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call API for reranking when documents > topN', async () => {
      const result = await service.rerank({
        query: 'test query',
        documents: ['doc1', 'doc2', 'doc3', 'doc4', 'doc5', 'doc6', 'doc7'],
        topN: 5,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3); // API returns 3 results
    });

    it('should call API with correct parameters', async () => {
      await service.rerank({
        query: 'search query',
        documents: ['first doc', 'second doc', 'third doc', 'fourth', 'fifth', 'sixth'],
        topN: 3,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/rerank',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
          body: JSON.stringify({
            model: 'bge-reranker-v2-m3',
            query: 'search query',
            documents: ['first doc', 'second doc', 'third doc', 'fourth', 'fifth', 'sixth'],
            top_n: 3,
          }),
        })
      );
    });

    it('should return reranked results with relevance scores', async () => {
      const result = await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 3,
      });

      expect(result[0].relevanceScore).toBe(0.95);
      expect(result[0].index).toBe(2);
      expect(result[1].relevanceScore).toBe(0.85);
      expect(result[1].index).toBe(0);
    });

    it('should use default topN from config', async () => {
      await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        // No topN specified, should use config default of 5
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.top_n).toBe(5);
    });
  });

  describe('Error Handling and Fallback', () => {
    it('should return fallback results on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 3,
      });

      // Should return first topN documents with -1 scores
      expect(result).toHaveLength(3);
      expect(result[0].index).toBe(0);
      expect(result[0].relevanceScore).toBe(-1);
      expect(result[1].index).toBe(1);
      expect(result[2].index).toBe(2);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return fallback results on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 3,
      });

      expect(result).toHaveLength(3);
      expect(result.every(r => r.relevanceScore === -1)).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should log error message on failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 3,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Reranking failed, using original order:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Score Handling', () => {
    it('should preserve relevance scores from API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, relevance_score: 0.999 },
            { index: 1, relevance_score: 0.001 },
          ],
        }),
      });

      const result = await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 2,
      });

      expect(result[0].relevanceScore).toBe(0.999);
      expect(result[1].relevanceScore).toBe(0.001);
    });

    it('should use -1 score as sentinel for skipped/failed reranking', async () => {
      // Skipped case
      const skippedResult = await service.rerank({
        query: 'test',
        documents: ['doc1', 'doc2'],
        topN: 5,
      });

      expect(skippedResult.every(r => r.relevanceScore === -1)).toBe(true);

      // Failed case
      mockFetch.mockRejectedValue(new Error('Failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const failedResult = await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 3,
      });

      expect(failedResult.every(r => r.relevanceScore === -1)).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Methods', () => {
    it('should return enabled status from config', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return candidate multiplier from config', () => {
      expect(service.getCandidateMultiplier()).toBe(3);
    });
  });

  describe('Singleton', () => {
    it('should return same instance from getRerankingService', () => {
      const service1 = getRerankingService();
      const service2 = getRerankingService();

      expect(service1).toBe(service2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle topN = 1', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ index: 5, relevance_score: 0.99 }],
        }),
      });

      const result = await service.rerank({
        query: 'test',
        documents: Array(10).fill('doc'),
        topN: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(5);
    });

    it('should handle documents with varied lengths', async () => {
      const documents = [
        'Short doc',
        'A much longer document with many words that goes on for quite a while.',
        'Medium length document here.',
        'Another short one.',
        'Very long document '.repeat(100),
        'Final doc.',
      ];

      await service.rerank({
        query: 'test',
        documents,
        topN: 3,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.documents).toEqual(documents);
    });

    it('should handle query with special characters', async () => {
      await service.rerank({
        query: 'test "query" with \'special\' chars & symbols <> {}',
        documents: Array(10).fill('doc'),
        topN: 3,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe('test "query" with \'special\' chars & symbols <> {}');
    });

    it('should handle exact topN boundary', async () => {
      // When documents.length === topN, should skip reranking
      const result = await service.rerank({
        query: 'test',
        documents: Array(5).fill('doc'),
        topN: 5,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toHaveLength(5);
      expect(result.every(r => r.relevanceScore === -1)).toBe(true);
    });

    it('should handle documents.length = topN + 1 (minimum for actual reranking)', async () => {
      await service.rerank({
        query: 'test',
        documents: Array(6).fill('doc'),
        topN: 5,
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
