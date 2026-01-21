/**
 * Query expansion using LLM
 * Expands short queries with related terms for better recall
 */

import { getLLMService, type LLMService } from './service.js';
import { sanitizeQueryInput } from '../../utils/security.js';
import { LRUCache } from '../../utils/lru-cache.js';

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
  private cache: LRUCache<string, string>;

  constructor(enabled: boolean = true) {
    this.llmService = getLLMService();
    this.enabled = enabled;
    this.cache = new LRUCache(1000);
  }

  /**
   * Expand a query with related terms
   */
  async expand(query: string): Promise<string> {
    // Skip expansion if disabled or query is empty
    if (!this.enabled || !query || query.trim().length === 0) {
      return query;
    }

    // Sanitize input using Unicode-aware sanitization
    const sanitizedQuery = sanitizeQueryInput(query, 500);
    if (sanitizedQuery.length === 0) {
      // Return empty string if query was entirely filtered out (potential injection)
      return '';
    }

    // Skip expansion if query is already long enough
    if (sanitizedQuery.length > 100) {
      return sanitizedQuery;
    }

    // Check cache first (LRU cache automatically updates access order)
    const cached = this.cache.get(sanitizedQuery);
    if (cached !== undefined) {
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
        this.cache.set(sanitizedQuery, expanded);
        return expanded;
      }

      return sanitizedQuery;
    } catch (error) {
      // On error, return sanitized query (graceful degradation, maintain security)
      console.error('Query expansion failed:', error);
      return sanitizedQuery;
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
