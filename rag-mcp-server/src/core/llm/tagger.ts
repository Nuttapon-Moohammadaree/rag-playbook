/**
 * Automatic document tagging using LLM
 */

import { getLLMService, type LLMService } from './service.js';

const TAG_SYSTEM_PROMPT = `You are a document classification assistant. Your task is to generate relevant tags that categorize and describe documents.

Guidelines:
- Generate 3-7 tags that accurately describe the content
- Tags should be lowercase, using hyphens for multi-word tags
- Include both broad category tags and specific topic tags
- If content is in Thai, include both Thai and English tags
- For technical documents, include relevant technology/tool names
- Output ONLY the tags as a JSON array, nothing else

Example output format: ["network", "cisco", "wlc", "wireless", "configuration", "การตั้งค่า"]`;

export class Tagger {
  private llmService: LLMService;

  constructor() {
    this.llmService = getLLMService();
  }

  /**
   * Generate tags for document content
   */
  async generateTags(content: string, title?: string): Promise<string[]> {
    if (!content || content.trim().length === 0) {
      return [];
    }

    // Use only first portion of content for tagging
    const sampleContent = content.substring(0, 5000);
    const titleContext = title ? `Document Title: ${title}\n\n` : '';

    const prompt = `Generate classification tags for this document:

${titleContext}Content:
${sampleContent}

Output only a JSON array of tags.`;

    try {
      const response = await this.llmService.complete({
        prompt,
        systemPrompt: TAG_SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 200,
      });

      // Parse JSON array from response
      const responseContent = response.content.trim();

      // Try to extract JSON array from response
      const jsonMatch = responseContent.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('Failed to parse tags JSON:', jsonMatch[0]);
          return [];
        }

        // Validate parsed result is an array
        if (!Array.isArray(parsed)) {
          console.error('Tags response is not an array:', typeof parsed);
          return [];
        }

        // Validate and normalize tags
        return parsed
          .filter((tag): tag is string => typeof tag === 'string')
          .map(tag => tag.toLowerCase().trim())
          .filter(tag => tag.length > 0 && tag.length < 50)
          .slice(0, 10);
      }

      return [];
    } catch (error) {
      console.error('Failed to generate tags:', error);
      return [];
    }
  }
}

// Singleton instance
let tagger: Tagger | null = null;

export function getTagger(): Tagger {
  if (!tagger) {
    tagger = new Tagger();
  }
  return tagger;
}
