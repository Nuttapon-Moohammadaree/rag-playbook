/**
 * Tests for AskService - source deduplication, score normalization, usage tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create shared mock function for retrieval
const mockSearchWithMetadata = vi.fn();

// Mock dependencies
vi.mock('../retrieval/service.js', () => ({
  getRetrievalService: () => ({
    searchWithMetadata: mockSearchWithMetadata,
  }),
}));

vi.mock('../../config/index.js', () => ({
  config: {
    litellm: {
      apiKey: 'test-api-key',
      baseUrl: 'http://localhost:4000',
    },
  },
}));

// Import after mocks
import { AskService } from './service.js';

describe('AskService', () => {
  let service: AskService;

  beforeEach(() => {
    service = new AskService();
    vi.clearAllMocks();

    // Setup default retrieval mock
    mockSearchWithMetadata.mockResolvedValue({
      results: [
        {
          chunkId: 'chunk1',
          documentId: 'doc1',
          content: 'Content from document 1 chunk A',
          score: 0.85,
          document: { filename: 'file1.txt', filepath: '/path/file1.txt' },
        },
        {
          chunkId: 'chunk2',
          documentId: 'doc1',
          content: 'Content from document 1 chunk B',
          score: 0.75,
          document: { filename: 'file1.txt', filepath: '/path/file1.txt' }, // Same file
        },
        {
          chunkId: 'chunk3',
          documentId: 'doc2',
          content: 'Content from document 2',
          score: 0.70,
          document: { filename: 'file2.txt', filepath: '/path/file2.txt' },
        },
      ],
      metadata: {
        rerankUsed: true,
        hydeUsed: false,
        queryExpanded: true,
        originalQuery: 'test question',
      },
    });

    // Setup default successful LLM response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'This is the answer based on the context.',
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: 'gpt-oss-120b',
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Source Deduplication', () => {
    it('should deduplicate sources by filepath, keeping highest score', async () => {
      const response = await service.ask({
        question: 'test question',
      });

      // Should have 2 unique files, not 3 chunks
      expect(response.sources).toHaveLength(2);

      // file1.txt should have the higher score (0.85, not 0.75)
      const file1Source = response.sources.find(s => s.filepath === '/path/file1.txt');
      expect(file1Source).toBeDefined();
      expect(file1Source!.score).toBe(0.85);
    });

    it('should sort deduplicated sources by score descending', async () => {
      const response = await service.ask({
        question: 'test question',
      });

      // First source should have higher score
      expect(response.sources[0].score).toBeGreaterThanOrEqual(response.sources[1].score);
    });
  });

  describe('Score Normalization', () => {
    it('should normalize scores to [0,1] range', async () => {
      const response = await service.ask({
        question: 'test question',
      });

      for (const source of response.sources) {
        expect(source.score).toBeGreaterThanOrEqual(0);
        expect(source.score).toBeLessThanOrEqual(1);
      }
    });

    it('should clamp scores above 1 to 1', async () => {
      mockSearchWithMetadata.mockResolvedValue({
        results: [
          {
            chunkId: 'chunk1',
            documentId: 'doc1',
            content: 'Content',
            score: 1.5, // Above 1
            document: { filename: 'file1.txt', filepath: '/path/file1.txt' },
          },
        ],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'test',
        },
      });

      const response = await service.ask({
        question: 'test question',
      });

      expect(response.sources[0].score).toBe(1);
    });

    it('should clamp negative scores to 0', async () => {
      mockSearchWithMetadata.mockResolvedValue({
        results: [
          {
            chunkId: 'chunk1',
            documentId: 'doc1',
            content: 'Content',
            score: -0.5, // Negative
            document: { filename: 'file1.txt', filepath: '/path/file1.txt' },
          },
        ],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'test',
        },
      });

      const response = await service.ask({
        question: 'test question',
      });

      expect(response.sources[0].score).toBe(0);
    });

    it('should round scores to 3 decimal places', async () => {
      mockSearchWithMetadata.mockResolvedValue({
        results: [
          {
            chunkId: 'chunk1',
            documentId: 'doc1',
            content: 'Content',
            score: 0.8567891, // Many decimals
            document: { filename: 'file1.txt', filepath: '/path/file1.txt' },
          },
        ],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'test',
        },
      });

      const response = await service.ask({
        question: 'test question',
      });

      expect(response.sources[0].score).toBe(0.857);
    });
  });

  describe('Usage Tracking', () => {
    it('should include nested LLM usage in response', async () => {
      const response = await service.ask({
        question: 'test question',
      });

      expect(response.usage).toBeDefined();
      expect(response.usage!.llm).toBeDefined();
      expect(response.usage!.llm.promptTokens).toBe(100);
      expect(response.usage!.llm.completionTokens).toBe(50);
      expect(response.usage!.llm.totalTokens).toBe(150);
    });

    it('should include search metadata in response', async () => {
      const response = await service.ask({
        question: 'test question',
      });

      expect(response.metadata).toBeDefined();
      expect(response.metadata!.rerankUsed).toBe(true);
      expect(response.metadata!.queryExpanded).toBe(true);
      expect(response.metadata!.originalQuery).toBe('test question');
    });

    it('should handle missing usage in LLM response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Answer without usage stats.',
                role: 'assistant',
              },
              finish_reason: 'stop',
            },
          ],
          model: 'gpt-oss-120b',
          // No usage field
        }),
      });

      const response = await service.ask({
        question: 'test question',
      });

      expect(response.usage).toBeUndefined();
    });
  });

  describe('No Results Handling', () => {
    it('should return appropriate message when no results found', async () => {
      mockSearchWithMetadata.mockResolvedValue({
        results: [],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'unknown query',
        },
      });

      const response = await service.ask({
        question: 'unknown query',
      });

      expect(response.sources).toHaveLength(0);
      expect(response.answer).toContain('No relevant information found');
    });

    it('should return Thai message for Thai queries with no results', async () => {
      mockSearchWithMetadata.mockResolvedValue({
        results: [],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'คำถามที่ไม่พบข้อมูล',
        },
      });

      const response = await service.ask({
        question: 'คำถามที่ไม่พบข้อมูล',
      });

      expect(response.answer).toContain('ไม่พบข้อมูล');
    });
  });

  describe('LLM Error Handling', () => {
    it('should throw error for failed LLM API call', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(service.ask({
        question: 'test question',
      })).rejects.toThrow('LLM API error (500)');
    });

    it('should throw error for invalid LLM response structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          // Missing choices array
          model: 'gpt-oss-120b',
        }),
      });

      await expect(service.ask({
        question: 'test question',
      })).rejects.toThrow('missing or empty choices array');
    });

    it('should throw error for empty message content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                // Missing content
                role: 'assistant',
              },
              finish_reason: 'stop',
            },
          ],
          model: 'gpt-oss-120b',
        }),
      });

      await expect(service.ask({
        question: 'test question',
      })).rejects.toThrow('missing message content');
    });
  });

  describe('Content Truncation', () => {
    it('should truncate source content to 200 characters with ellipsis', async () => {
      const longContent = 'A'.repeat(300);
      mockSearchWithMetadata.mockResolvedValue({
        results: [
          {
            chunkId: 'chunk1',
            documentId: 'doc1',
            content: longContent,
            score: 0.9,
            document: { filename: 'file1.txt', filepath: '/path/file1.txt' },
          },
        ],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: 'test',
        },
      });

      const response = await service.ask({
        question: 'test question',
      });

      // 200 chars + '...'
      expect(response.sources[0].content.length).toBe(203);
      expect(response.sources[0].content.endsWith('...')).toBe(true);
    });
  });
});
