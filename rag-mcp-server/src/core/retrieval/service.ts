/**
 * Retrieval service - vector search with optional reranking
 */

import { getEmbeddingService } from '../embedding/service.js';
import { getRerankingService } from '../reranking/service.js';
import { searchVectors, ensureCollection } from '../../storage/qdrant.js';
import { config } from '../../config/index.js';
import type { SearchRequest, SearchResult, SearchFilters } from '../../types/index.js';

export class RetrievalService {
  private embeddingService = getEmbeddingService();
  private rerankingService = getRerankingService();
  private initialized = false;

  /**
   * Initialize storage backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await ensureCollection();
    this.initialized = true;
  }

  /**
   * Search for relevant chunks with optional reranking
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    await this.initialize();

    const {
      query,
      limit = config.search.defaultLimit,
      threshold = config.search.defaultThreshold,
      filters,
      rerank,
    } = request;

    if (!query || query.trim().length === 0) {
      return [];
    }

    // Determine if reranking should be used
    const useRerank = rerank ?? this.rerankingService.isEnabled();

    // Calculate candidate limit - fetch more if reranking
    const candidateLimit = useRerank
      ? limit * this.rerankingService.getCandidateMultiplier()
      : limit;

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embedSingle(query);

    // Search vectors with expanded limit for reranking candidates
    const candidates = await searchVectors(queryEmbedding, candidateLimit, threshold, filters);

    // Apply reranking if enabled and we have more candidates than final limit
    if (useRerank && candidates.length > limit) {
      const reranked = await this.rerankingService.rerank({
        query,
        documents: candidates.map(c => c.content),
        topN: limit,
      });

      // Reorder results by rerank scores
      const rerankedResults = reranked.map(r => ({
        ...candidates[r.index],
        score: r.relevanceScore, // Replace vector similarity with rerank score
      }));

      return rerankedResults;
    }

    return candidates.slice(0, limit);
  }

  /**
   * Search with pre-computed query embedding
   */
  async searchWithEmbedding(
    queryEmbedding: number[],
    limit: number = config.search.defaultLimit,
    threshold: number = config.search.defaultThreshold,
    filters?: SearchFilters
  ): Promise<SearchResult[]> {
    await this.initialize();
    return searchVectors(queryEmbedding, limit, threshold, filters);
  }

  /**
   * Get similar chunks to a specific chunk
   */
  async findSimilar(
    chunkContent: string,
    limit: number = 5,
    excludeDocumentId?: string
  ): Promise<SearchResult[]> {
    await this.initialize();

    const embedding = await this.embeddingService.embedSingle(chunkContent);

    const filters: SearchFilters | undefined = excludeDocumentId
      ? { documentIds: [] } // Will need custom filter logic
      : undefined;

    // Note: Qdrant doesn't have a simple "exclude" filter,
    // so we fetch extra and filter client-side
    const results = await searchVectors(
      embedding,
      limit + (excludeDocumentId ? 10 : 0),
      0.5,
      filters
    );

    if (excludeDocumentId) {
      return results
        .filter(r => r.documentId !== excludeDocumentId)
        .slice(0, limit);
    }

    return results;
  }
}

// Singleton instance
let retrievalService: RetrievalService | null = null;

export function getRetrievalService(): RetrievalService {
  if (!retrievalService) {
    retrievalService = new RetrievalService();
  }
  return retrievalService;
}
