/**
 * Verification module exports
 *
 * LLM-based verification pipeline for RAG responses:
 * - RelevanceFilter: Filter chunks by LLM-assessed relevance
 * - GroundingVerifier: Verify answer is grounded in context
 * - VerificationService: Coordinator for the pipeline
 */

// Types
export type {
  VerificationConfig,
  Citation,
  RelevanceFilterResult,
  ScoredChunk,
  GroundingResult,
  VerificationResult,
  RelevanceScoreRequest,
  RelevanceScoreResponse,
  GroundingVerifyRequest,
  LLMRelevanceResponse,
  LLMGroundingResponse,
} from './types.js';

// Classes
export { RelevanceFilter } from './relevance-filter.js';
export { GroundingVerifier } from './grounding-verifier.js';
export {
  VerificationService,
  getVerificationService,
  createVerificationService,
  DEFAULT_VERIFICATION_CONFIG,
} from './service.js';
export type { VerifyPipelineInput, VerifyPipelineOutput } from './service.js';
