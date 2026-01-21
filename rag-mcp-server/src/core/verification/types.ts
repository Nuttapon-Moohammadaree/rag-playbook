/**
 * Types for LLM Verification Pipeline
 */

import type { SearchResult } from '../../types/index.js';

/**
 * Configuration for verification pipeline
 */
export interface VerificationConfig {
  /** Enable/disable verification pipeline */
  enabled: boolean;
  /** Minimum relevance score for chunks (0-1), default 0.6 */
  relevanceThreshold: number;
  /** Minimum grounding score for answer (0-1), default 0.7 */
  groundingThreshold: number;
  /** Maximum parallel LLM calls for relevance filtering */
  maxParallelCalls: number;
  /** Cache verification results */
  cacheResults: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
}

/**
 * Citation linking answer to source chunk
 */
export interface Citation {
  /** Chunk ID that supports this part of the answer */
  chunkId: string;
  /** Document filename */
  filename: string;
  /** Relevant quote from the chunk */
  quote: string;
  /** Relevance score for this citation (0-1) */
  relevanceScore: number;
}

/**
 * Result from relevance filtering
 */
export interface RelevanceFilterResult {
  /** Chunks that passed relevance filter */
  relevantChunks: ScoredChunk[];
  /** Number of chunks that were filtered out */
  filteredCount: number;
  /** Time taken for relevance filtering in ms */
  filterTimeMs: number;
}

/**
 * Chunk with LLM-assigned relevance score
 */
export interface ScoredChunk {
  /** Original search result */
  searchResult: SearchResult;
  /** LLM-assigned relevance score (0-1) */
  relevanceScore: number;
  /** Brief explanation of relevance */
  explanation?: string;
}

/**
 * Result from grounding verification
 */
export interface GroundingResult {
  /** Overall grounding score (0-1) */
  groundingScore: number;
  /** Whether answer is sufficiently grounded */
  isGrounded: boolean;
  /** Claims in the answer that are not supported by context */
  unsupportedClaims: string[];
  /** Claims that are well-supported */
  supportedClaims: string[];
  /** Citations linking answer to sources */
  citations: Citation[];
  /** Time taken for grounding verification in ms */
  verificationTimeMs: number;
}

/**
 * Full verification result
 */
export interface VerificationResult {
  /** Whether verification was enabled and performed */
  enabled: boolean;
  /** Grounding score (0-1) */
  groundingScore: number;
  /** Whether answer meets grounding threshold */
  isGrounded: boolean;
  /** Claims not supported by context */
  unsupportedClaims: string[];
  /** Citations linking answer to sources */
  citations: Citation[];
  /** Number of chunks filtered out by relevance filter */
  chunksFiltered: number;
  /** Total time for verification pipeline in ms */
  verificationTimeMs: number;
}

/**
 * Request to score chunk relevance
 */
export interface RelevanceScoreRequest {
  /** The user's question */
  question: string;
  /** The chunk content to score */
  chunkContent: string;
  /** Document filename for context */
  filename: string;
}

/**
 * Response from relevance scoring
 */
export interface RelevanceScoreResponse {
  /** Relevance score (0-1) */
  score: number;
  /** Brief explanation */
  explanation: string;
}

/**
 * Request to verify answer grounding
 */
export interface GroundingVerifyRequest {
  /** The user's question */
  question: string;
  /** The generated answer to verify */
  answer: string;
  /** Context chunks used to generate answer */
  chunks: ScoredChunk[];
}

/**
 * LLM response for relevance scoring (JSON structure)
 */
export interface LLMRelevanceResponse {
  score: number;
  explanation: string;
}

/**
 * LLM response for grounding verification (JSON structure)
 */
export interface LLMGroundingResponse {
  groundingScore: number;
  isGrounded: boolean;
  supportedClaims: string[];
  unsupportedClaims: string[];
  citations: Array<{
    chunkIndex: number;
    quote: string;
    relevanceScore: number;
  }>;
}
