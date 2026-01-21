/**
 * HyDE - Hypothetical Document Embedding
 * Generates a hypothetical document from a query, then uses that for search.
 * Improves retrieval for complex or abstract queries.
 */

import { getLLMService, type LLMService } from './service.js';

const HYDE_SYSTEM_PROMPT = `You are a helpful assistant that generates hypothetical document passages.
Given a question, write a passage that would directly answer the question.
The passage should be factual, detailed, and about 100-200 words.
Write as if you are writing documentation or a knowledge base article.
If the question is in Thai, write the passage in Thai.
Do not include phrases like "This document explains..." - just write the content directly.`;

export class HyDE {
  private llmService: LLMService;
  private enabled: boolean;
  private cache: Map<string, string>;
  private cacheMaxSize: number;

  constructor(enabled: boolean = false) {
    this.llmService = getLLMService();
    this.enabled = enabled;
    this.cache = new Map();
    this.cacheMaxSize = 500;
  }

  /**
   * Sanitize query input to prevent prompt injection
   */
  private sanitizeQuery(query: string): string {
    // Trim and limit length
    let sanitized = query.trim().substring(0, 500);
    // Remove potential prompt injection patterns
    sanitized = sanitized
      .replace(/\bignore\s+(previous|above|all)\s+(instructions?|prompts?)\b/gi, '')
      .replace(/\b(system|assistant|user)\s*:/gi, '')
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .trim();
    return sanitized;
  }

  /**
   * Generate a hypothetical document for a query
   */
  async generateHypotheticalDocument(query: string): Promise<string> {
    if (!this.enabled) {
      return query;
    }

    // Validate and sanitize input
    if (!query || query.trim().length === 0) {
      return query;
    }

    const sanitizedQuery = this.sanitizeQuery(query);
    if (sanitizedQuery.length === 0) {
      // Return empty string if query was entirely filtered out (potential injection)
      return '';
    }

    // Check cache first
    const cached = this.cache.get(sanitizedQuery);
    if (cached) {
      return cached;
    }

    try {
      const prompt = `Question: ${sanitizedQuery}

Write a detailed passage that would answer this question:`;

      const response = await this.llmService.complete({
        prompt,
        systemPrompt: HYDE_SYSTEM_PROMPT,
        temperature: 0.5,
        maxTokens: 400,
      });

      const hypotheticalDoc = response.content.trim();

      // Validate - should have some content
      if (hypotheticalDoc && hypotheticalDoc.length > 50) {
        this.addToCache(sanitizedQuery, hypotheticalDoc);
        return hypotheticalDoc;
      }

      return sanitizedQuery;
    } catch (error) {
      // On error, return sanitized query (graceful degradation, maintain security)
      console.error('HyDE generation failed:', error);
      return sanitizedQuery;
    }
  }

  /**
   * Check if HyDE is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable HyDE
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Determine if HyDE should be used for this query
   * HyDE works best for complex, abstract, or how-to queries
   */
  shouldUseHyDE(query: string): boolean {
    if (!this.enabled) return false;

    // Skip very short queries
    if (query.length < 15) return false;

    // Skip simple lookup queries
    const lookupPatterns = [
      /^what is (a |the )?[\w\s]+$/i,
      /^who is [\w\s]+$/i,
      /^where is [\w\s]+$/i,
      /^when (was|did|is) [\w\s]+$/i,
    ];

    for (const pattern of lookupPatterns) {
      if (pattern.test(query)) return false;
    }

    // Use HyDE for complex queries:
    // - Questions with "how to", "why", "explain"
    // - Queries with multiple concepts
    // - Troubleshooting queries
    const complexPatterns = [
      /how (do|to|can|should)/i,
      /why (does|is|do|should|would)/i,
      /explain|describe|compare/i,
      /troubleshoot|fix|solve|resolve/i,
      /best (practice|way)/i,
      /difference between/i,
      /steps to/i,
      /วิธี|ขั้นตอน|แก้ไข|อธิบาย/i, // Thai patterns
    ];

    for (const pattern of complexPatterns) {
      if (pattern.test(query)) return true;
    }

    // Use HyDE for longer queries (likely more complex)
    if (query.split(/\s+/).length > 5) return true;

    return false;
  }

  /**
   * Add to cache with LRU-like behavior
   */
  private addToCache(query: string, doc: string): void {
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(query, doc);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let hyde: HyDE | null = null;

export function getHyDE(enabled?: boolean): HyDE {
  if (!hyde) {
    hyde = new HyDE(enabled ?? false);
  }
  return hyde;
}
