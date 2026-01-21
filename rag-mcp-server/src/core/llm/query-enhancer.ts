/**
 * Query expansion using LLM
 * Expands short queries with related terms for better recall
 */

import { getLLMService, type LLMService } from './service.js';

const EXPANSION_SYSTEM_PROMPT = `You are a query expansion assistant. Your task is to expand short search queries into more comprehensive versions that include related terms, synonyms, and context.

Rules:
1. Keep the original query meaning intact
2. Add relevant technical terms, synonyms, and variations
3. Include common abbreviations and their full forms
4. Keep the expanded query concise (max 50 words)
5. Output ONLY the expanded query, nothing else
6. If query is in Thai, expand with both Thai and English terms
7. If query contains technical/IT terms, add related networking/infrastructure terms`;

const EXPANSION_EXAMPLES = `
Examples:
- "WLC upgrade" → "Cisco WLC wireless LAN controller upgrade firmware update procedure steps การอัพเกรด WLC"
- "firewall config" → "firewall configuration setup rules policy Cisco ASA Palo Alto network security การตั้งค่า firewall"
- "switch VLAN" → "network switch VLAN configuration tagging trunk access port Cisco Catalyst การตั้งค่า VLAN switch"
- "VPN troubleshoot" → "VPN troubleshooting connection issues IPSec SSL tunnel debug connectivity problems แก้ปัญหา VPN"
`;

export class QueryEnhancer {
  private llmService: LLMService;
  private enabled: boolean;
  private cache: Map<string, string>;
  private cacheMaxSize: number;

  constructor(enabled: boolean = true) {
    this.llmService = getLLMService();
    this.enabled = enabled;
    this.cache = new Map();
    this.cacheMaxSize = 1000;
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
   * Expand a query with related terms
   */
  async expand(query: string): Promise<string> {
    // Skip expansion if disabled or query is empty
    if (!this.enabled || !query || query.trim().length === 0) {
      return query;
    }

    // Sanitize input
    const sanitizedQuery = this.sanitizeQuery(query);
    if (sanitizedQuery.length === 0) {
      return query;
    }

    // Skip expansion if query is already long enough
    if (sanitizedQuery.length > 100) {
      return sanitizedQuery;
    }

    // Check cache first
    const cached = this.cache.get(sanitizedQuery);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.llmService.complete({
        prompt: `Expand this search query: "${sanitizedQuery}"`,
        systemPrompt: EXPANSION_SYSTEM_PROMPT + '\n' + EXPANSION_EXAMPLES,
        temperature: 0.2,
        maxTokens: 100,
      });

      const expanded = response.content.trim();

      // Validate the expansion - should be reasonable length and contain original terms
      if (expanded && expanded.length > sanitizedQuery.length && expanded.length < 500) {
        this.addToCache(sanitizedQuery, expanded);
        return expanded;
      }

      return sanitizedQuery;
    } catch (error) {
      // On error, return original query (graceful degradation)
      console.error('Query expansion failed:', error);
      return query;
    }
  }

  /**
   * Check if query expansion is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable query expansion
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Add to cache with LRU-like behavior
   */
  private addToCache(query: string, expanded: string): void {
    if (this.cache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(query, expanded);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let queryEnhancer: QueryEnhancer | null = null;

export function getQueryEnhancer(enabled?: boolean): QueryEnhancer {
  if (!queryEnhancer) {
    queryEnhancer = new QueryEnhancer(enabled ?? true);
  }
  return queryEnhancer;
}
