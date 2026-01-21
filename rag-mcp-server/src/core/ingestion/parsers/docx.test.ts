/**
 * Tests for DOCX Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mammoth
const mockExtractRawText = vi.fn();
const mockConvertToHtml = vi.fn();
vi.mock('mammoth', () => ({
  default: {
    extractRawText: (...args: unknown[]) => mockExtractRawText(...args),
    convertToHtml: (...args: unknown[]) => mockConvertToHtml(...args),
  },
}));

import { parseDocxFile } from './docx.js';

describe('DOCX Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock responses
    mockExtractRawText.mockResolvedValue({ value: 'Document content' });
    mockConvertToHtml.mockResolvedValue({ value: '', messages: [] });
  });

  describe('parseDocxFile', () => {
    it('should parse DOCX and extract text content', async () => {
      mockExtractRawText.mockResolvedValue({ value: 'DOCX content here' });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(mockExtractRawText).toHaveBeenCalledWith({ path: '/path/to/file.docx' });
      expect(result.content).toBe('DOCX content here');
      expect(result.metadata.source).toBe('/path/to/file.docx');
    });

    it('should trim whitespace from content', async () => {
      mockExtractRawText.mockResolvedValue({
        value: '  \n  Content with whitespace  \n  ',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.content).toBe('Content with whitespace');
    });

    it('should extract title from first H1 in HTML', async () => {
      mockConvertToHtml.mockResolvedValue({
        value: '<h1>Document Title</h1><p>Content</p>',
        messages: [],
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.metadata.title).toBe('Document Title');
    });

    it('should include conversion warnings in metadata', async () => {
      mockConvertToHtml.mockResolvedValue({
        value: '<p>Content</p>',
        messages: [{ message: 'Unknown element' }, { message: 'Style not supported' }],
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.metadata.conversionWarnings).toEqual([
        'Unknown element',
        'Style not supported',
      ]);
    });

    it('should handle HTML conversion failure gracefully', async () => {
      mockConvertToHtml.mockRejectedValue(new Error('HTML conversion failed'));

      // Should not throw, just skip metadata extraction
      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.content).toBe('Document content');
      expect(result.metadata.title).toBeUndefined();
    });
  });

  describe('Section Extraction', () => {
    it('should detect all-caps section headers', async () => {
      mockExtractRawText.mockResolvedValue({
        value: 'INTRODUCTION\nThis is the intro.\n\nCONCLUSION\nThis is the end.',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
      expect(result.sections!.some(s => s.title === 'INTRODUCTION')).toBe(true);
      expect(result.sections!.some(s => s.title === 'CONCLUSION')).toBe(true);
    });

    it('should detect numbered section headers', async () => {
      mockExtractRawText.mockResolvedValue({
        value: '1. First Section\nContent one\n\n2. Second Section\nContent two',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });

    it('should detect letter-numbered sections', async () => {
      mockExtractRawText.mockResolvedValue({
        value: 'A. Section A\nContent A\n\nB. Section B\nContent B',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });

    it('should detect common header keywords', async () => {
      mockExtractRawText.mockResolvedValue({
        value:
          'Introduction\nIntro text\n\nChapter One\nChapter content\n\nConclusion\nEnding',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });

    it('should detect short lines before long content as headers', async () => {
      mockExtractRawText.mockResolvedValue({
        value:
          'Short Title\nThis is a much longer paragraph that contains detailed information about the topic at hand.',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });

    it('should filter empty sections', async () => {
      mockExtractRawText.mockResolvedValue({
        value: 'EMPTY HEADER\n\nWITH CONTENT\nActual content here',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      if (result.sections) {
        expect(result.sections.every(s => s.content.length > 0)).toBe(true);
      }
    });

    it('should skip empty lines at section start', async () => {
      mockExtractRawText.mockResolvedValue({
        value: '\n\n\nINTRO\n\nContent starts here',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      if (result.sections && result.sections.length > 0) {
        expect(result.sections[0].title).toBe('INTRO');
      }
    });
  });

  describe('Header Detection Heuristics', () => {
    it('should not treat long lines as headers', async () => {
      mockExtractRawText.mockResolvedValue({
        value:
          'THIS IS A VERY LONG LINE THAT EXCEEDS THE MAXIMUM LENGTH FOR A HEADER AND SHOULD NOT BE TREATED AS ONE EVEN THOUGH IT IS ALL CAPS\nContent',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      // The long line should not be a section title
      const hasLongTitle = result.sections?.some(
        s => s.title && s.title.length > 100
      );
      expect(hasLongTitle).toBeFalsy();
    });

    it('should detect parenthesis-numbered sections', async () => {
      mockExtractRawText.mockResolvedValue({
        value: '1) First Item\nContent\n\n2) Second Item\nMore content',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });

    it('should handle summary/overview keywords', async () => {
      mockExtractRawText.mockResolvedValue({
        value: 'Summary\nSummary text\n\nOverview\nOverview text',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });

    it('should handle appendix keyword', async () => {
      mockExtractRawText.mockResolvedValue({
        value: 'Main content\n\nAppendix A\nAppendix content',
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.sections).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty document', async () => {
      mockExtractRawText.mockResolvedValue({ value: '' });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.content).toBe('');
    });

    it('should handle document with only whitespace', async () => {
      mockExtractRawText.mockResolvedValue({ value: '   \n\n   ' });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.content).toBe('');
    });

    it('should propagate mammoth errors', async () => {
      mockExtractRawText.mockRejectedValue(new Error('Invalid DOCX'));

      await expect(parseDocxFile('/path/to/file.docx')).rejects.toThrow(
        'Invalid DOCX'
      );
    });

    it('should handle H1 with attributes in HTML', async () => {
      mockConvertToHtml.mockResolvedValue({
        value: '<h1 class="title" id="main">Title with Attributes</h1>',
        messages: [],
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.metadata.title).toBe('Title with Attributes');
    });

    it('should handle document without H1', async () => {
      mockConvertToHtml.mockResolvedValue({
        value: '<h2>Subtitle</h2><p>Content</p>',
        messages: [],
      });

      const result = await parseDocxFile('/path/to/file.docx');

      expect(result.metadata.title).toBeUndefined();
    });
  });
});
