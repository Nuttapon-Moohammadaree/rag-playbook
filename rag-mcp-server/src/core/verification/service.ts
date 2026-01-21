/**
 * VerificationService - Coordinator for LLM verification pipeline
 *
 * Orchestrates:
 * 1. Relevance filtering - filter out irrelevant chunks
 * 2. Grounding verification - verify answer is grounded in context
 */

import type { SearchResult } from '../../types/index.js';
import { RelevanceFilter } from './relevance-filter.js';
import { GroundingVerifier } from './grounding-verifier.js';
import type {
  VerificationConfig,
  VerificationResult,
  RelevanceFilterResult,
  GroundingResult,
  ScoredChunk,
} from './types.js';

/**
 * Default verification configuration
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  enabled: false,
  relevanceThreshold: 0.6,
  groundingThreshold: 0.7,
  maxParallelCalls: 3,
  cacheResults: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Input for verification pipeline
 */
export interface VerifyPipelineInput {
  /** User's question */
  question: string;
  /** Search results to filter */
  searchResults: SearchResult[];
  /** Generated answer to verify */
  answer: string;
}

/**
 * Output from verification pipeline
 */
export interface VerifyPipelineOutput {
  /** Filtered and scored chunks */
  filteredChunks: ScoredChunk[];
  /** Full verification result */
  verification: VerificationResult;
}

export class VerificationService {
  private config: VerificationConfig;
  private relevanceFilter: RelevanceFilter;
  private groundingVerifier: GroundingVerifier;

  constructor(config: Partial<VerificationConfig> = {}) {
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...config };
    this.relevanceFilter = new RelevanceFilter(this.config);
    this.groundingVerifier = new GroundingVerifier(this.config);
  }

  /**
   * Check if verification is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): VerificationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VerificationConfig>): void {
    this.config = { ...this.config, ...config };
    // Recreate filters with new config
    this.relevanceFilter = new RelevanceFilter(this.config);
    this.groundingVerifier = new GroundingVerifier(this.config);
  }

  /**
   * Run relevance filtering on search results
   */
  async filterByRelevance(
    question: string,
    searchResults: SearchResult[]
  ): Promise<RelevanceFilterResult> {
    if (!this.config.enabled || searchResults.length === 0) {
      // Return all chunks as-is if disabled
      return {
        relevantChunks: searchResults.map((result) => ({
          searchResult: result,
          relevanceScore: result.score,
        })),
        filteredCount: 0,
        filterTimeMs: 0,
      };
    }

    return this.relevanceFilter.filterByRelevance(question, searchResults);
  }

  /**
   * Verify answer grounding
   */
  async verifyGrounding(
    question: string,
    answer: string,
    chunks: ScoredChunk[]
  ): Promise<GroundingResult> {
    if (!this.config.enabled || chunks.length === 0) {
      return {
        groundingScore: 1.0,
        isGrounded: true,
        unsupportedClaims: [],
        supportedClaims: [],
        citations: [],
        verificationTimeMs: 0,
      };
    }

    return this.groundingVerifier.verify(question, answer, chunks);
  }

  /**
   * Run full verification pipeline
   *
   * Pipeline:
   * 1. Filter chunks by relevance
   * 2. Verify answer grounding against filtered chunks
   */
  async runPipeline(input: VerifyPipelineInput): Promise<VerifyPipelineOutput> {
    const startTime = Date.now();

    // Step 1: Filter by relevance
    const filterResult = await this.filterByRelevance(
      input.question,
      input.searchResults
    );

    // Step 2: Verify grounding
    const groundingResult = await this.verifyGrounding(
      input.question,
      input.answer,
      filterResult.relevantChunks
    );

    const totalTimeMs = Date.now() - startTime;

    return {
      filteredChunks: filterResult.relevantChunks,
      verification: {
        enabled: this.config.enabled,
        groundingScore: groundingResult.groundingScore,
        isGrounded: groundingResult.isGrounded,
        unsupportedClaims: groundingResult.unsupportedClaims,
        citations: groundingResult.citations,
        chunksFiltered: filterResult.filteredCount,
        verificationTimeMs: totalTimeMs,
      },
    };
  }

  /**
   * Quick verification - only verify grounding, skip relevance filtering
   * Use when you want faster verification with pre-filtered chunks
   */
  async quickVerify(
    question: string,
    answer: string,
    searchResults: SearchResult[]
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    // Convert search results to scored chunks (using existing scores)
    const chunks: ScoredChunk[] = searchResults.map((result) => ({
      searchResult: result,
      relevanceScore: result.score,
    }));

    // Only verify grounding
    const groundingResult = await this.groundingVerifier.verify(
      question,
      answer,
      chunks
    );

    return {
      enabled: this.config.enabled,
      groundingScore: groundingResult.groundingScore,
      isGrounded: groundingResult.isGrounded,
      unsupportedClaims: groundingResult.unsupportedClaims,
      citations: groundingResult.citations,
      chunksFiltered: 0,
      verificationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Clear relevance filter cache
   */
  clearCache(): void {
    this.relevanceFilter.clearCache();
  }
}

// Singleton instance
let verificationService: VerificationService | null = null;

export function getVerificationService(): VerificationService {
  if (!verificationService) {
    verificationService = new VerificationService();
  }
  return verificationService;
}

/**
 * Create a new verification service with custom config
 */
export function createVerificationService(
  config: Partial<VerificationConfig>
): VerificationService {
  return new VerificationService(config);
}
