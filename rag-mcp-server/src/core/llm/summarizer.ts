/**
 * Document summarization using LLM
 */

import { getLLMService, type LLMService } from './service.js';

export type SummaryStyle = 'brief' | 'detailed' | 'bullet_points';

const STYLE_PROMPTS: Record<SummaryStyle, string> = {
  brief: `Summarize this document in 2-3 sentences. Focus on the main topic and key takeaway.`,
  detailed: `Provide a comprehensive summary of this document. Include:
- Main topic and purpose
- Key points and findings
- Important details and context
- Any conclusions or recommendations

Keep the summary concise but thorough (150-300 words).`,
  bullet_points: `Summarize this document as bullet points:
- Start with a one-line overview
- List 5-10 key points
- Include specific details, numbers, or names where relevant
- End with the main conclusion or takeaway`,
};

const SYSTEM_PROMPT = `You are a document summarization assistant. Your task is to create clear, accurate summaries that capture the essential information from documents.

Guidelines:
- Be accurate and faithful to the source content
- Focus on the most important information
- Use clear, professional language
- If the document is in Thai, respond in Thai
- If the document is technical, preserve key technical terms
- Do not add information not present in the document`;

export class Summarizer {
  private llmService: LLMService;

  constructor() {
    this.llmService = getLLMService();
  }

  /**
   * Summarize document content
   */
  async summarize(
    content: string,
    style: SummaryStyle = 'brief',
    title?: string
  ): Promise<string> {
    if (!content || content.trim().length === 0) {
      throw new Error('Content cannot be empty');
    }

    // Truncate very long content to avoid token limits
    const maxContentLength = 30000;
    const truncatedContent = content.length > maxContentLength
      ? content.substring(0, maxContentLength) + '\n\n[Content truncated due to length...]'
      : content;

    const titleContext = title ? `Document Title: ${title}\n\n` : '';
    const stylePrompt = STYLE_PROMPTS[style];

    const prompt = `${stylePrompt}

${titleContext}Document Content:
${truncatedContent}`;

    const response = await this.llmService.complete({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: style === 'detailed' ? 800 : 400,
    });

    return response.content.trim();
  }

  /**
   * Generate a brief one-line summary (useful for auto-summary during indexing)
   */
  async generateBriefSummary(content: string): Promise<string> {
    if (!content || content.trim().length === 0) {
      return '';
    }

    // Use only first portion of content for brief summary
    const sampleContent = content.substring(0, 5000);

    const prompt = `Generate a single-sentence summary (max 100 words) of this content:

${sampleContent}`;

    try {
      const response = await this.llmService.complete({
        prompt,
        systemPrompt: 'You are a summarization assistant. Output only the summary, nothing else.',
        temperature: 0.2,
        maxTokens: 150,
      });

      return response.content.trim();
    } catch (error) {
      console.error('Failed to generate brief summary:', error);
      return '';
    }
  }
}

// Singleton instance
let summarizer: Summarizer | null = null;

export function getSummarizer(): Summarizer {
  if (!summarizer) {
    summarizer = new Summarizer();
  }
  return summarizer;
}
