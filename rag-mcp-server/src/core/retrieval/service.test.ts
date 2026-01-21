/**
 * Tests for RetrievalService - score preservation, metadata tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create shared mock functions using vi.hoisted() to ensure they're available when vi.mock runs
const {
  mockEmbedSingle,
  mockRerankIsEnabled,
  mockGetCandidateMultiplier,
  mockRerank,
  mockEnhancerIsEnabled,
  mockExpand,
  mockHydeIsEnabled,
  mockShouldUseHyDE,
  mockGenerateHypotheticalDocument,
  mockSearchVectors,
} = vi.hoisted(() => ({
  mockEmbedSingle: vi.fn(),
  mockRerankIsEnabled: vi.fn(),
  mockGetCandidateMultiplier: vi.fn(),
  mockRerank: vi.fn(),
  mockEnhancerIsEnabled: vi.fn(),
  mockExpand: vi.fn(),
  mockHydeIsEnabled: vi.fn(),
  mockShouldUseHyDE: vi.fn(),
  mockGenerateHypotheticalDocument: vi.fn(),
  mockSearchVectors: vi.fn(),
}));

// Mock all dependencies before importing
vi.mock('../embedding/service.js', () => ({
  getEmbeddingService: () => ({
    embedSingle: mockEmbedSingle,
  }),
}));

vi.mock('../reranking/service.js', () => ({
  getRerankingService: () => ({
    isEnabled: mockRerankIsEnabled,
    getCandidateMultiplier: mockGetCandidateMultiplier,
    rerank: mockRerank,
  }),
}));

vi.mock('../llm/query-enhancer.js', () => ({
  getQueryEnhancer: () => ({
    isEnabled: mockEnhancerIsEnabled,
    expand: mockExpand,
  }),
}));

vi.mock('../llm/hyde.js', () => ({
  getHyDE: () => ({
    isEnabled: mockHydeIsEnabled,
    shouldUseHyDE: mockShouldUseHyDE,
    generateHypotheticalDocument: mockGenerateHypotheticalDocument,
  }),
}));

vi.mock('../../storage/qdrant.js', () => ({
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  searchVectors: mockSearchVectors,
}));

vi.mock('../../config/index.js', () => ({
  config: {
    search: {
      defaultLimit: 10,
      defaultThreshold: 0.5,
    },
    llm: {
      queryExpansion: false,
      hyde: false,
    },
  },
}));

// Import after mocks
import { RetrievalService } from './service.js';

describe('RetrievalService', () => {
  let service: RetrievalService;

  beforeEach(() => {
    service = new RetrievalService();
    vi.clearAllMocks();

    // Reset to default mock values
    mockEmbedSingle.mockResolvedValue([0.1, 0.2, 0.3]);
    mockRerankIsEnabled.mockReturnValue(true);
    mockGetCandidateMultiplier.mockReturnValue(3);
    mockRerank.mockResolvedValue([
      { index: 0, relevanceScore: 0.95 },
      { index: 1, relevanceScore: 0.85 },
    ]);
    mockEnhancerIsEnabled.mockReturnValue(false);
    mockExpand.mockImplementation((q) => Promise.resolve(q));
    mockHydeIsEnabled.mockReturnValue(false);
    mockShouldUseHyDE.mockReturnValue(false);
    mockGenerateHypotheticalDocument.mockImplementation((q) => Promise.resolve(q));
    mockSearchVectors.mockResolvedValue([
      {
        chunkId: 'chunk1',
        documentId: 'doc1',
        content: 'Content 1',
        score: 0.8,
        document: { filename: 'file1.txt', filepath: '/path/file1.txt' },
      },
      {
        chunkId: 'chunk2',
        documentId: 'doc2',
        content: 'Content 2',
        score: 0.7,
        document: { filename: 'file2.txt', filepath: '/path/file2.txt' },
      },
      {
        chunkId: 'chunk3',
        documentId: 'doc3',
        content: 'Content 3',
        score: 0.6,
        document: { filename: 'file3.txt', filepath: '/path/file3.txt' },
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchWithMetadata', () => {
    it('should return results with metadata', async () => {
      const result = await service.searchWithMetadata({
        query: 'test query',
        limit: 2,
      });

      expect(result.results).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.originalQuery).toBe('test query');
    });

    it('should track when reranking is used', async () => {
      mockRerankIsEnabled.mockReturnValue(true);

      const result = await service.searchWithMetadata({
        query: 'test query',
        limit: 2,
        rerank: true,
      });

      expect(result.metadata.rerankUsed).toBe(true);
    });

    it('should track when query expansion is used', async () => {
      mockEnhancerIsEnabled.mockReturnValue(true);
      mockExpand.mockResolvedValue('expanded test query with more terms');

      const result = await service.searchWithMetadata({
        query: 'test query',
        expand: true,
      });

      expect(result.metadata.queryExpanded).toBe(true);
    });

    it('should track when HyDE is used', async () => {
      mockHydeIsEnabled.mockReturnValue(true);
      mockShouldUseHyDE.mockReturnValue(true);
      mockGenerateHypotheticalDocument.mockResolvedValue(
        'This is a hypothetical document about the query topic.'
      );

      const result = await service.searchWithMetadata({
        query: 'how to configure firewall',
        hyde: true,
      });

      expect(result.metadata.hydeUsed).toBe(true);
    });

    it('should return empty results for empty query', async () => {
      const result = await service.searchWithMetadata({
        query: '',
      });

      expect(result.results).toHaveLength(0);
      expect(result.metadata.rerankUsed).toBe(false);
      expect(result.metadata.hydeUsed).toBe(false);
      expect(result.metadata.queryExpanded).toBe(false);
    });
  });

  describe('Score Preservation', () => {
    it('should preserve vector score when reranking score is negative (fallback)', async () => {
      mockRerankIsEnabled.mockReturnValue(true);
      // Simulate reranking failure with negative scores
      mockRerank.mockResolvedValue([
        { index: 0, relevanceScore: -1 }, // Sentinel for skipped/failed
        { index: 1, relevanceScore: 0.85 },
      ]);

      const result = await service.searchWithMetadata({
        query: 'test query',
        limit: 2,
        rerank: true,
      });

      // First result should preserve original vector score (0.8)
      expect(result.results[0].score).toBe(0.8);
      // Second result should use rerank score
      expect(result.results[1].score).toBe(0.85);
    });

    it('should use rerank scores when all are valid (>=0)', async () => {
      mockRerankIsEnabled.mockReturnValue(true);
      mockRerank.mockResolvedValue([
        { index: 0, relevanceScore: 0.95 },
        { index: 1, relevanceScore: 0.85 },
      ]);

      const result = await service.searchWithMetadata({
        query: 'test query',
        limit: 2,
        rerank: true,
      });

      expect(result.results[0].score).toBe(0.95);
      expect(result.results[1].score).toBe(0.85);
    });
  });

  describe('HyDE and Query Expansion Mutual Exclusivity', () => {
    it('should skip query expansion when HyDE is used', async () => {
      mockHydeIsEnabled.mockReturnValue(true);
      mockShouldUseHyDE.mockReturnValue(true);
      mockGenerateHypotheticalDocument.mockResolvedValue(
        'Hypothetical document content here.'
      );
      mockEnhancerIsEnabled.mockReturnValue(true);

      const result = await service.searchWithMetadata({
        query: 'how to configure firewall',
        hyde: true,
        expand: true, // Both requested
      });

      // HyDE takes precedence
      expect(result.metadata.hydeUsed).toBe(true);
      expect(result.metadata.queryExpanded).toBe(false);
    });
  });

  describe('search (simple API)', () => {
    it('should return only results array without metadata', async () => {
      const results = await service.search({
        query: 'test query',
        limit: 2,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
