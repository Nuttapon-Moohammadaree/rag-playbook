/**
 * Retrieval service - vector search with optional reranking and query expansion
 */

import { getEmbeddingService } from '../embedding/service.js';
import { getRerankingService } from '../reranking/service.js';
import { getQueryEnhancer } from '../llm/query-enhancer.js';
import { getHyDE } from '../llm/hyde.js';
import { searchVectors, ensureCollection } from '../../storage/qdrant.js';
import { config } from '../../config/index.js';
import type { SearchRequest, SearchResult, SearchFilters } from '../../types/index.js';

export interface SearchMetadata {
  rerankUsed: boolean;
  hydeUsed: boolean;
  queryExpanded: boolean;
  originalQuery: string;
}

export interface SearchWithMetadataResult {
  results: SearchResult[];
  metadata: SearchMetadata;
}

export class RetrievalService {
  private embeddingService = getEmbeddingService();
  private rerankingService = getRerankingService();
  private queryEnhancer = getQueryEnhancer(config.llm.queryExpansion);
  private hyde = getHyDE(config.llm.hyde);
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
   * Search for relevant chunks with optional reranking and query expansion
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { results } = await this.searchWithMetadata(request);
    return results;
  }

  /**
   * Search with metadata about which features were used
   */
  async searchWithMetadata(request: SearchRequest): Promise<SearchWithMetadataResult> {
    await this.initialize();

    const {
      query,
      limit = config.search.defaultLimit,
      threshold = config.search.defaultThreshold,
      filters,
      rerank,
      expand,
      hyde,
    } = request;

    if (!query || query.trim().length === 0) {
      return {
        results: [],
        metadata: {
          rerankUsed: false,
          hydeUsed: false,
          queryExpanded: false,
          originalQuery: query,
        },
      };
    }

    // Determine if HyDE should be used
    const useHyDE = hyde ?? this.hyde.shouldUseHyDE(query);

    // Determine if query expansion should be used (skip if using HyDE)
    const useExpand = !useHyDE && (expand ?? this.queryEnhancer.isEnabled());

    // Apply query transformations
    let searchQuery = query;
    let actuallyUsedHyDE = false;
    let actuallyExpandedQuery = false;

    if (useHyDE) {
      // Generate hypothetical document for complex queries
      const hydeResult = await this.hyde.generateHypotheticalDocument(query);
      // HyDE actually used if result is different from input
      actuallyUsedHyDE = hydeResult !== query && hydeResult.length > 0;
      if (actuallyUsedHyDE) {
        searchQuery = hydeResult;
      }
    } else if (useExpand) {
      // Expand query with related terms
      const expandedQuery = await this.queryEnhancer.expand(query);
      // Expansion actually used if result is different from input
      actuallyExpandedQuery = expandedQuery !== query && expandedQuery.length > 0;
      if (actuallyExpandedQuery) {
        searchQuery = expandedQuery;
      }
    }

    // Determine if reranking should be used
    const useRerank = rerank ?? this.rerankingService.isEnabled();

    // Calculate candidate limit - fetch more if reranking
    const candidateLimit = useRerank
      ? limit * this.rerankingService.getCandidateMultiplier()
      : limit;

    // Generate query embedding (use expanded query for embedding)
    const queryEmbedding = await this.embeddingService.embedSingle(searchQuery);

    // Search vectors with expanded limit for reranking candidates
    const candidates = await searchVectors(queryEmbedding, candidateLimit, threshold, filters);

    let actuallyReranked = false;

    // Apply reranking if enabled and we have more candidates than final limit
    if (useRerank && candidates.length > limit) {
      const reranked = await this.rerankingService.rerank({
        query,
        documents: candidates.map(c => c.content),
        topN: limit,
      });

      // Check if reranking actually happened (score >= 0 means it did)
      actuallyReranked = reranked.some(r => r.relevanceScore >= 0);

      // Reorder results by rerank scores
      // If rerank score is -1 (sentinel for skipped/failed), preserve original vector score
      const rerankedResults = reranked.map(r => ({
        ...candidates[r.index],
        score: r.relevanceScore >= 0
          ? r.relevanceScore
          : candidates[r.index].score,
      }));

      return {
        results: rerankedResults,
        metadata: {
          rerankUsed: actuallyReranked,
          hydeUsed: actuallyUsedHyDE,
          queryExpanded: actuallyExpandedQuery,
          originalQuery: query,
        },
      };
    }

    return {
      results: candidates.slice(0, limit),
      metadata: {
        rerankUsed: false,
        hydeUsed: actuallyUsedHyDE,
        queryExpanded: actuallyExpandedQuery,
        originalQuery: query,
      },
    };
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

    // Fetch more results if we need to exclude a document
    // We fetch extra to account for filtered-out results
    const fetchLimit = excludeDocumentId ? limit * 3 + 10 : limit;

    const results = await searchVectors(
      embedding,
      fetchLimit,
      0.5,
      undefined  // Don't use documentIds filter for inclusion
    );

    // Client-side filtering to exclude specific document
    if (excludeDocumentId) {
      return results
        .filter(r => r.documentId !== excludeDocumentId)
        .slice(0, limit);
    }

    return results.slice(0, limit);
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
