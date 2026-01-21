/**
 * GroundingVerifier - Verify answer is grounded in context
 *
 * Uses LLM to check if each claim in the answer is supported
 * by the provided context chunks.
 */

import { config } from '../../config/index.js';
import type {
  VerificationConfig,
  GroundingResult,
  ScoredChunk,
  Citation,
  LLMGroundingResponse,
} from './types.js';

const GROUNDING_SYSTEM_PROMPT = `You are a grounding verification assistant. Your job is to verify whether an answer is factually supported by the provided context.

For each claim in the answer, check if it is directly supported by the context. A claim is "supported" if there is clear evidence in the context for it.

Respond ONLY with valid JSON in this exact format:
{
  "groundingScore": 0.85,
  "isGrounded": true,
  "supportedClaims": ["claim 1 that is supported", "claim 2 that is supported"],
  "unsupportedClaims": ["claim that has no evidence in context"],
  "citations": [
    {"chunkIndex": 0, "quote": "relevant quote from chunk", "relevanceScore": 0.9}
  ]
}

Guidelines:
- groundingScore: 0.0-1.0 representing what portion of claims are supported
- isGrounded: true if groundingScore >= 0.7 and no major unsupported claims
- supportedClaims: list each factual claim that IS supported by context
- unsupportedClaims: list claims that are NOT supported or contradict context
- citations: for each supported claim, cite the chunk index and a brief quote`;

export class GroundingVerifier {
  private apiKey: string;
  private baseUrl: string;
  private config: VerificationConfig;

  constructor(verificationConfig: VerificationConfig) {
    this.apiKey = config.litellm.apiKey;
    this.baseUrl = config.litellm.baseUrl;
    this.config = verificationConfig;
  }

  /**
   * Verify that the answer is grounded in the context chunks
   */
  async verify(
    question: string,
    answer: string,
    chunks: ScoredChunk[]
  ): Promise<GroundingResult> {
    const startTime = Date.now();

    try {
      const llmResponse = await this.callLLM(question, answer, chunks);

      // Build citations with chunk metadata
      const citations = this.buildCitations(llmResponse, chunks);

      return {
        groundingScore: llmResponse.groundingScore,
        isGrounded: llmResponse.isGrounded && llmResponse.groundingScore >= this.config.groundingThreshold,
        unsupportedClaims: llmResponse.unsupportedClaims,
        supportedClaims: llmResponse.supportedClaims,
        citations,
        verificationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Grounding verification failed:', error);
      // On error, return conservative result
      return {
        groundingScore: 0.5,
        isGrounded: false,
        unsupportedClaims: ['Verification failed - unable to verify grounding'],
        supportedClaims: [],
        citations: [],
        verificationTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Call LLM to verify grounding
   */
  private async callLLM(
    question: string,
    answer: string,
    chunks: ScoredChunk[]
  ): Promise<LLMGroundingResponse> {
    // Build context from chunks
    const contextParts = chunks.map((chunk, index) => {
      return `[Chunk ${index}] (from: ${chunk.searchResult.document.filename})
${chunk.searchResult.content}`;
    });

    const userPrompt = `Question: ${question}

Context:
${contextParts.join('\n\n---\n\n')}

Answer to verify:
${answer}

Verify if this answer is grounded in the context. Check each claim and provide citations. Respond with JSON only.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.litellm.timeout * 2); // Double timeout for grounding

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: config.llm.model,
          messages: [
            { role: 'system', content: GROUNDING_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      const content = data.choices[0]?.message?.content ?? '';
      return this.parseGroundingResponse(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse LLM response to grounding result
   */
  private parseGroundingResponse(content: string): LLMGroundingResponse {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      // Validate and extract fields
      const groundingScore = typeof parsed.groundingScore === 'number'
        ? Math.max(0, Math.min(1, parsed.groundingScore))
        : 0.5;

      const isGrounded = typeof parsed.isGrounded === 'boolean'
        ? parsed.isGrounded
        : groundingScore >= this.config.groundingThreshold;

      const supportedClaims = Array.isArray(parsed.supportedClaims)
        ? parsed.supportedClaims.filter((c): c is string => typeof c === 'string')
        : [];

      const unsupportedClaims = Array.isArray(parsed.unsupportedClaims)
        ? parsed.unsupportedClaims.filter((c): c is string => typeof c === 'string')
        : [];

      const citations = Array.isArray(parsed.citations)
        ? parsed.citations.map((c: unknown) => {
            const citation = c as Record<string, unknown>;
            return {
              chunkIndex: typeof citation.chunkIndex === 'number' ? citation.chunkIndex : 0,
              quote: typeof citation.quote === 'string' ? citation.quote : '',
              relevanceScore: typeof citation.relevanceScore === 'number'
                ? Math.max(0, Math.min(1, citation.relevanceScore))
                : 0.5,
            };
          })
        : [];

      return {
        groundingScore,
        isGrounded,
        supportedClaims,
        unsupportedClaims,
        citations,
      };
    } catch {
      // Fallback on parse error
      return {
        groundingScore: 0.5,
        isGrounded: false,
        supportedClaims: [],
        unsupportedClaims: ['Failed to parse grounding verification response'],
        citations: [],
      };
    }
  }

  /**
   * Build citations with full chunk metadata
   */
  private buildCitations(
    llmResponse: LLMGroundingResponse,
    chunks: ScoredChunk[]
  ): Citation[] {
    return llmResponse.citations
      .filter((c) => c.chunkIndex >= 0 && c.chunkIndex < chunks.length)
      .map((c) => {
        const chunk = chunks[c.chunkIndex];
        return {
          chunkId: chunk.searchResult.chunkId,
          filename: chunk.searchResult.document.filename,
          quote: c.quote,
          relevanceScore: c.relevanceScore,
        };
      });
  }
}
