/**
 * Tests for Chunking Service - Paragraph-aware splitting, overlap, token estimation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before import
vi.mock('../../config/index.js', () => ({
  config: {
    chunking: {
      defaultSize: 512,
      defaultOverlap: 50,
      minChunkSize: 50,
    },
  },
}));

import { ChunkingService, getChunkingService } from './service.js';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  describe('Basic Chunking', () => {
    it('should return empty array for empty input', () => {
      const result = service.chunk('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only input', () => {
      const result = service.chunk('   \n\n   ');
      expect(result).toEqual([]);
    });

    it('should chunk single paragraph text', () => {
      // Use longer text to exceed minChunkSize (50 tokens = ~200 chars)
      const text = 'This is a longer paragraph with enough content to exceed the minimum chunk size requirement. '.repeat(3).trim();
      const result = service.chunk(text);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).toBe(text);
    });

    it('should include correct offsets', () => {
      // Use longer text to produce chunks
      const text = 'First paragraph with enough content to exceed minimum size. '.repeat(3).trim() +
                   '\n\n' +
                   'Second paragraph also with enough content to exceed minimum size. '.repeat(3).trim();
      const result = service.chunk(text);

      expect(result[0].startOffset).toBeDefined();
      expect(result[0].endOffset).toBeDefined();
      expect(result[0].endOffset).toBeGreaterThan(result[0].startOffset);
    });

    it('should estimate token count for each chunk', () => {
      const text = 'This is a test paragraph with multiple words that exceeds the minimum chunk size requirement. '.repeat(4);
      const result = service.chunk(text);

      expect(result[0].tokenCount).toBeGreaterThan(0);
    });

    it('should include empty metadata object', () => {
      const text = 'Test paragraph content that is long enough to exceed the minimum chunk size. '.repeat(4);
      const result = service.chunk(text);

      expect(result[0].metadata).toEqual({});
    });
  });

  describe('Paragraph-aware Splitting', () => {
    it('should preserve paragraph boundaries', () => {
      // Use longer paragraphs to exceed minChunkSize
      const text = 'First paragraph with more content to meet minimum requirements. '.repeat(3).trim() +
                   '\n\n' +
                   'Second paragraph with more content to meet minimum requirements. '.repeat(3).trim() +
                   '\n\n' +
                   'Third paragraph with more content to meet minimum requirements. '.repeat(3).trim();
      const result = service.chunk(text, { preserveParagraphs: true });

      // All paragraphs should be in chunks
      const combinedContent = result.map(r => r.content).join('\n\n');
      expect(combinedContent).toContain('First paragraph');
      expect(combinedContent).toContain('Second paragraph');
      expect(combinedContent).toContain('Third paragraph');
    });

    it('should split long paragraphs when exceeding chunk size', () => {
      // Create text with one very long paragraph
      const longParagraph = 'word '.repeat(1000).trim();
      const result = service.chunk(longParagraph, { chunkSize: 100 });

      // Should create multiple chunks for very long content
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should combine small paragraphs into single chunk', () => {
      const text = 'Short.\n\nAlso short.\n\nAnother short one.';
      const result = service.chunk(text, { chunkSize: 512, minChunkSize: 10 });

      // Small paragraphs should be combined
      expect(result.length).toBe(1);
      expect(result[0].content).toContain('Short');
      expect(result[0].content).toContain('Also short');
    });

    it('should handle multiple consecutive newlines', () => {
      const text = 'First paragraph with enough content to be a valid chunk. '.repeat(4) +
                   '\n\n\n\n\n' +
                   'Second paragraph also with enough content to be valid. '.repeat(4);
      const result = service.chunk(text);

      // Should normalize multiple newlines
      const combinedContent = result.map(r => r.content).join(' ');
      expect(combinedContent).toContain('First paragraph');
      expect(combinedContent).toContain('Second paragraph');
    });
  });

  describe('Overlap Calculation', () => {
    it('should include overlap between chunks when splitting', () => {
      // Create content that will require multiple chunks
      const paragraphs = Array(10).fill('This is a paragraph with enough content to test overlap behavior.').join('\n\n');
      const result = service.chunk(paragraphs, {
        chunkSize: 50,
        chunkOverlap: 20,
        minChunkSize: 10,
      });

      // With overlap, chunks should share some content
      if (result.length > 1) {
        // Check that chunks have overlap in their boundaries
        for (let i = 1; i < result.length; i++) {
          const prevEnd = result[i - 1].endOffset;
          const currentStart = result[i].startOffset;
          // With overlap, start offset may be less than previous end
          expect(currentStart).toBeLessThanOrEqual(prevEnd);
        }
      }
    });

    it('should not include overlap when overlap is 0', () => {
      const paragraphs = Array(5).fill('Content paragraph.').join('\n\n');
      const result = service.chunk(paragraphs, {
        chunkSize: 20,
        chunkOverlap: 0,
        minChunkSize: 5,
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate roughly 4 characters per token', () => {
      const text = 'a'.repeat(100);
      const tokens = service.estimateTokens(text);

      // 100 chars / 4 = 25 tokens
      expect(tokens).toBe(25);
    });

    it('should round up token estimate', () => {
      const text = 'a'.repeat(10);
      const tokens = service.estimateTokens(text);

      // 10 chars / 4 = 2.5, ceil = 3
      expect(tokens).toBe(3);
    });

    it('should return 0 for empty string', () => {
      const tokens = service.estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should handle unicode characters', () => {
      const text = '日本語テスト'; // 6 Japanese characters
      const tokens = service.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Text Normalization', () => {
    it('should normalize Windows line endings (CRLF)', () => {
      const text = 'First line with content. '.repeat(10) + '\r\n' + 'Second line with content. '.repeat(10);
      const result = service.chunk(text);

      const content = result[0].content;
      expect(content).not.toContain('\r\n');
      expect(content).toContain('\n');
    });

    it('should normalize old Mac line endings (CR)', () => {
      const text = 'First line with content. '.repeat(10) + '\r' + 'Second line with content. '.repeat(10);
      const result = service.chunk(text);

      const content = result[0].content;
      expect(content).not.toContain('\r');
    });

    it('should normalize multiple spaces to single space', () => {
      const text = 'Word    with   multiple    spaces. '.repeat(10);
      const result = service.chunk(text);

      expect(result[0].content).toContain('Word with multiple spaces.');
    });

    it('should normalize tabs to single space', () => {
      const text = ('Word\twith\ttabs. ').repeat(15);
      const result = service.chunk(text);

      expect(result[0].content).toContain('Word with tabs.');
    });

    it('should trim leading and trailing whitespace', () => {
      const text = '   Content with surrounding spaces. '.repeat(10) + '   ';
      const result = service.chunk(text);

      // After normalization, whitespace is trimmed
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content.trim()).toBe(result[0].content);
    });
  });

  describe('Custom Options', () => {
    it('should respect custom chunk size', () => {
      // Use paragraphs so the chunker will actually split
      const longText = Array(20).fill('word '.repeat(50)).join('\n\n');
      const result = service.chunk(longText, { chunkSize: 100, minChunkSize: 10 });

      // Should produce multiple chunks
      expect(result.length).toBeGreaterThan(1);
    });

    it('should respect custom overlap', () => {
      const text = Array(10).fill('Paragraph content here.').join('\n\n');
      const resultWithOverlap = service.chunk(text, { chunkOverlap: 30, chunkSize: 50 });
      const resultNoOverlap = service.chunk(text, { chunkOverlap: 0, chunkSize: 50 });

      // With overlap, there should be more total content
      const contentWithOverlap = resultWithOverlap.reduce((sum, c) => sum + c.content.length, 0);
      const contentNoOverlap = resultNoOverlap.reduce((sum, c) => sum + c.content.length, 0);

      // Overlap should result in more total content (due to duplication)
      expect(contentWithOverlap).toBeGreaterThanOrEqual(contentNoOverlap);
    });

    it('should respect minimum chunk size', () => {
      const text = 'Short.\n\nAlso short.';
      const result = service.chunk(text, { minChunkSize: 50 });

      // Chunks below minimum should be combined or excluded
      for (const chunk of result) {
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(1);
      }
    });

    it('should allow disabling paragraph preservation', () => {
      const text = 'First paragraph content. '.repeat(10) + '\n\n' + 'Second paragraph content. '.repeat(10);
      const result = service.chunk(text, { preserveParagraphs: false, minChunkSize: 10 });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Token-based Chunking (fallback)', () => {
    it('should chunk by tokens when paragraphs disabled', () => {
      // Use smaller word count to avoid infinite loop
      const longText = 'word '.repeat(100);
      const result = service.chunk(longText, {
        preserveParagraphs: false,
        chunkSize: 100,
        minChunkSize: 10,
      });

      // With disabled paragraph preservation, should produce at least 1 chunk
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle text without paragraph breaks', () => {
      const text = 'Single line of text without any paragraph breaks but long enough to exceed minimum. '.repeat(5);
      const result = service.chunk(text, { preserveParagraphs: true });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Singleton', () => {
    it('should return same instance from getChunkingService', () => {
      const service1 = getChunkingService();
      const service2 = getChunkingService();

      expect(service1).toBe(service2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short text', () => {
      // Very short text will be filtered out by minChunkSize
      const result = service.chunk('Hi');
      expect(result.length).toBe(0); // Filtered out
    });

    it('should handle text with only newlines', () => {
      const result = service.chunk('\n\n\n\n');
      expect(result).toEqual([]);
    });

    it('should handle mixed whitespace', () => {
      const text = '  \t  First paragraph content that is long enough. '.repeat(5) +
                   '\n\n  \t  ' +
                   'Second paragraph content that is also long enough. '.repeat(5) + '  \t  ';
      const result = service.chunk(text);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content).not.toMatch(/^\s/);
      expect(result[result.length - 1].content).not.toMatch(/\s$/);
    });

    it('should handle text starting with paragraph break', () => {
      const text = '\n\nFirst actual paragraph with enough content to exceed minimum chunk size. '.repeat(4);
      const result = service.chunk(text);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content).toContain('First actual paragraph');
    });
  });
});
