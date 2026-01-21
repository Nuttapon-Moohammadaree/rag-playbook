/**
 * Tests for VerificationService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VerificationService,
  getVerificationService,
  createVerificationService,
  DEFAULT_VERIFICATION_CONFIG,
} from './service.js';
import type { SearchResult } from '../../types/index.js';

// Mock the config
vi.mock('../../config/index.js', () => ({
  config: {
    litellm: {
      apiKey: 'test-api-key',
      baseUrl: 'http://localhost:4000/v1',
      timeout: 30000,
    },
    llm: {
      model: 'test-model',
    },
  },
}));

// Mock fetch for LLM calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('VerificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_VERIFICATION_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_VERIFICATION_CONFIG).toEqual({
        enabled: false,
        relevanceThreshold: 0.6,
        groundingThreshold: 0.7,
        maxParallelCalls: 3,
        cacheResults: true,
        cacheTtlMs: 5 * 60 * 1000,
      });
    });
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const service = new VerificationService();
      expect(service.isEnabled()).toBe(false);
      expect(service.getConfig()).toEqual(DEFAULT_VERIFICATION_CONFIG);
    });

    it('should merge custom config with defaults', () => {
      const service = new VerificationService({
        enabled: true,
        relevanceThreshold: 0.8,
      });
      expect(service.isEnabled()).toBe(true);
      expect(service.getConfig().relevanceThreshold).toBe(0.8);
      expect(service.getConfig().groundingThreshold).toBe(0.7); // default
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const service = new VerificationService();
      expect(service.isEnabled()).toBe(false);

      service.updateConfig({ enabled: true });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('filterByRelevance', () => {
    const mockSearchResults: SearchResult[] = [
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        content: 'This is relevant content about Docker containers.',
        score: 0.9,
        document: {
          id: 'doc-1',
          filename: 'docker-guide.md',
          filepath: '/docs/docker-guide.md',
          fileType: 'md',
        },
        metadata: {},
      },
      {
        chunkId: 'chunk-2',
        documentId: 'doc-2',
        content: 'This is about unrelated topic like cooking recipes.',
        score: 0.7,
        document: {
          id: 'doc-2',
          filename: 'recipes.txt',
          filepath: '/docs/recipes.txt',
          fileType: 'txt',
        },
        metadata: {},
      },
    ];

    it('should return all chunks when disabled', async () => {
      const service = new VerificationService({ enabled: false });

      const result = await service.filterByRelevance('What is Docker?', mockSearchResults);

      expect(result.relevantChunks).toHaveLength(2);
      expect(result.filteredCount).toBe(0);
      expect(result.filterTimeMs).toBe(0);
    });

    it('should call LLM when enabled', async () => {
      const service = new VerificationService({
        enabled: true,
        relevanceThreshold: 0.5,
      });

      // Mock successful LLM responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ score: 0.9, explanation: 'Very relevant' }),
            },
          }],
        }),
      });

      const result = await service.filterByRelevance('What is Docker?', mockSearchResults);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.relevantChunks.length).toBeGreaterThan(0);
    });
  });

  describe('verifyGrounding', () => {
    const mockChunks = [
      {
        searchResult: {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'Docker is a containerization platform.',
          score: 0.9,
          document: {
            id: 'doc-1',
            filename: 'docker-guide.md',
            filepath: '/docs/docker-guide.md',
            fileType: 'md' as const,
          },
          metadata: {},
        },
        relevanceScore: 0.9,
      },
    ];

    it('should return default result when disabled', async () => {
      const service = new VerificationService({ enabled: false });

      const result = await service.verifyGrounding(
        'What is Docker?',
        'Docker is a containerization platform.',
        mockChunks
      );

      expect(result.groundingScore).toBe(1.0);
      expect(result.isGrounded).toBe(true);
      expect(result.verificationTimeMs).toBe(0);
    });

    it('should call LLM when enabled', async () => {
      const service = new VerificationService({ enabled: true });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                groundingScore: 0.95,
                isGrounded: true,
                supportedClaims: ['Docker is a containerization platform'],
                unsupportedClaims: [],
                citations: [{ chunkIndex: 0, quote: 'Docker is a containerization platform', relevanceScore: 0.95 }],
              }),
            },
          }],
        }),
      });

      const result = await service.verifyGrounding(
        'What is Docker?',
        'Docker is a containerization platform.',
        mockChunks
      );

      expect(mockFetch).toHaveBeenCalled();
      expect(result.groundingScore).toBe(0.95);
      expect(result.isGrounded).toBe(true);
    });
  });

  describe('runPipeline', () => {
    it('should run full verification pipeline', async () => {
      const service = new VerificationService({
        enabled: true,
        relevanceThreshold: 0.5,
      });

      // Mock both relevance and grounding LLM calls
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({ score: 0.9, explanation: 'Relevant' }),
              },
            }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  groundingScore: 0.85,
                  isGrounded: true,
                  supportedClaims: ['Test claim'],
                  unsupportedClaims: [],
                  citations: [],
                }),
              },
            }],
          }),
        });

      const result = await service.runPipeline({
        question: 'What is Docker?',
        searchResults: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            content: 'Docker is a containerization platform.',
            score: 0.9,
            document: {
              id: 'doc-1',
              filename: 'docker-guide.md',
              filepath: '/docs/docker-guide.md',
              fileType: 'md',
            },
            metadata: {},
          },
        ],
        answer: 'Docker is a containerization platform.',
      });

      expect(result.verification.enabled).toBe(true);
      expect(result.filteredChunks.length).toBeGreaterThan(0);
    });
  });

  describe('quickVerify', () => {
    it('should skip relevance filtering', async () => {
      const service = new VerificationService({ enabled: true });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                groundingScore: 0.9,
                isGrounded: true,
                supportedClaims: ['Test'],
                unsupportedClaims: [],
                citations: [],
              }),
            },
          }],
        }),
      });

      const result = await service.quickVerify(
        'What is Docker?',
        'Docker is a containerization platform.',
        [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            content: 'Docker is a containerization platform.',
            score: 0.9,
            document: {
              id: 'doc-1',
              filename: 'docker-guide.md',
              filepath: '/docs/docker-guide.md',
              fileType: 'md',
            },
            metadata: {},
          },
        ]
      );

      expect(result.chunksFiltered).toBe(0);
      expect(result.groundingScore).toBe(0.9);
    });
  });

  describe('getVerificationService', () => {
    it('should return singleton instance', () => {
      const service1 = getVerificationService();
      const service2 = getVerificationService();
      expect(service1).toBe(service2);
    });
  });

  describe('createVerificationService', () => {
    it('should create new instance with custom config', () => {
      const service = createVerificationService({
        enabled: true,
        relevanceThreshold: 0.9,
      });

      expect(service.isEnabled()).toBe(true);
      expect(service.getConfig().relevanceThreshold).toBe(0.9);
    });
  });
});
