/**
 * Text chunking service with overlap support
 */

import { config } from '../../config/index.js';
import type { ChunkMetadata } from '../../types/index.js';

export interface ChunkResult {
  content: string;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  metadata: ChunkMetadata;
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  minChunkSize?: number;
  preserveParagraphs?: boolean;
}

export class ChunkingService {
  private defaultChunkSize: number;
  private defaultOverlap: number;
  private minChunkSize: number;

  constructor() {
    this.defaultChunkSize = config.chunking.defaultSize;
    this.defaultOverlap = config.chunking.defaultOverlap;
    this.minChunkSize = config.chunking.minChunkSize;
  }

  /**
   * Split text into chunks with overlap
   */
  chunk(text: string, options: ChunkingOptions = {}): ChunkResult[] {
    const chunkSize = options.chunkSize ?? this.defaultChunkSize;
    const overlap = options.chunkOverlap ?? this.defaultOverlap;
    const minSize = options.minChunkSize ?? this.minChunkSize;
    const preserveParagraphs = options.preserveParagraphs ?? true;

    if (!text || text.trim().length === 0) {
      return [];
    }

    // Clean and normalize text
    const cleanedText = this.normalizeText(text);

    if (preserveParagraphs) {
      return this.chunkByParagraphs(cleanedText, chunkSize, overlap, minSize);
    }

    return this.chunkByTokens(cleanedText, chunkSize, overlap, minSize);
  }

  /**
   * Chunk text while trying to preserve paragraph boundaries
   */
  private chunkByParagraphs(
    text: string,
    chunkSize: number,
    overlap: number,
    minSize: number
  ): ChunkResult[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: ChunkResult[] = [];
    let currentChunk = '';
    let currentStartOffset = 0;
    let textPosition = 0;

    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (!trimmedPara) {
        textPosition += paragraph.length + 2; // Account for \n\n
        continue;
      }

      const paraTokens = this.estimateTokens(trimmedPara);
      const currentTokens = this.estimateTokens(currentChunk);

      // If adding this paragraph would exceed chunk size
      if (currentChunk && currentTokens + paraTokens > chunkSize) {
        // Save current chunk if it meets minimum size
        if (currentTokens >= minSize) {
          chunks.push(this.createChunkResult(currentChunk, currentStartOffset));
        }

        // Start new chunk with overlap from previous
        const overlapText = this.getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + (overlapText ? '\n\n' : '') + trimmedPara;
        currentStartOffset = textPosition - overlapText.length;
      } else {
        // Add paragraph to current chunk
        currentChunk = currentChunk
          ? currentChunk + '\n\n' + trimmedPara
          : trimmedPara;
        if (!currentChunk || currentChunk === trimmedPara) {
          currentStartOffset = textPosition;
        }
      }

      textPosition += paragraph.length + 2;
    }

    // Don't forget the last chunk
    if (currentChunk && this.estimateTokens(currentChunk) >= minSize) {
      chunks.push(this.createChunkResult(currentChunk, currentStartOffset));
    }

    return chunks;
  }

  /**
   * Simple token-based chunking (fallback)
   */
  private chunkByTokens(
    text: string,
    chunkSize: number,
    overlap: number,
    minSize: number
  ): ChunkResult[] {
    const words = text.split(/\s+/);
    const chunks: ChunkResult[] = [];

    // Estimate words per chunk (rough: 1.3 words per token)
    const wordsPerChunk = Math.floor(chunkSize * 1.3);
    const overlapWords = Math.floor(overlap * 1.3);

    let startIdx = 0;
    let textPosition = 0;

    while (startIdx < words.length) {
      const endIdx = Math.min(startIdx + wordsPerChunk, words.length);
      const chunkWords = words.slice(startIdx, endIdx);
      const content = chunkWords.join(' ');

      if (this.estimateTokens(content) >= minSize) {
        chunks.push(this.createChunkResult(content, textPosition));
      }

      // Move forward with overlap
      startIdx = endIdx - overlapWords;
      if (startIdx <= chunks.length * (wordsPerChunk - overlapWords)) {
        startIdx = endIdx; // Prevent infinite loop
      }

      // Update text position (approximate)
      textPosition += content.length - (overlapWords > 0 ? this.getOverlapText(content, overlap).length : 0);
    }

    return chunks;
  }

  /**
   * Get overlap text from the end of content
   */
  private getOverlapText(content: string, overlapTokens: number): string {
    if (overlapTokens <= 0) return '';

    const words = content.split(/\s+/);
    const overlapWords = Math.floor(overlapTokens * 1.3);
    const startIdx = Math.max(0, words.length - overlapWords);

    return words.slice(startIdx).join(' ');
  }

  /**
   * Create a chunk result object
   */
  private createChunkResult(content: string, startOffset: number): ChunkResult {
    return {
      content,
      startOffset,
      endOffset: startOffset + content.length,
      tokenCount: this.estimateTokens(content),
      metadata: {},
    };
  }

  /**
   * Normalize text: fix whitespace, remove excessive newlines
   */
  private normalizeText(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive whitespace within lines
      .replace(/[ \t]+/g, ' ')
      // Normalize multiple newlines to double newline (paragraph break)
      .replace(/\n{3,}/g, '\n\n')
      // Trim
      .trim();
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

// Singleton instance
let chunkingService: ChunkingService | null = null;

export function getChunkingService(): ChunkingService {
  if (!chunkingService) {
    chunkingService = new ChunkingService();
  }
  return chunkingService;
}
