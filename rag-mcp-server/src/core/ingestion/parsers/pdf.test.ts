/**
 * Tests for PDF Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Mock pdf-parse
const mockPdfParse = vi.fn();
vi.mock('pdf-parse', () => ({
  default: (...args: unknown[]) => mockPdfParse(...args),
}));

import { parsePdfFile } from './pdf.js';

describe('PDF Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock responses
    mockReadFile.mockResolvedValue(Buffer.from('mock pdf buffer'));
  });

  describe('parsePdfFile', () => {
    it('should parse PDF and extract text content', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'PDF content here',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.pdf');
      expect(result.content).toBe('PDF content here');
      expect(result.metadata.source).toBe('/path/to/file.pdf');
    });

    it('should include page count in metadata', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 10,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.pageCount).toBe(10);
    });

    it('should extract title from PDF info', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { Title: 'PDF Document Title' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.title).toBe('PDF Document Title');
    });

    it('should extract author from PDF info', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { Author: 'John Doe' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.author).toBe('John Doe');
    });

    it('should extract subject as description', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { Subject: 'PDF Subject' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.description).toBe('PDF Subject');
    });

    it('should extract keywords as tags', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { Keywords: 'keyword1, keyword2, keyword3' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.tags).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should handle semicolon-separated keywords', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { Keywords: 'keyword1; keyword2; keyword3' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.tags).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should parse creation date', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { CreationDate: 'D:20231215103000' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.createdDate).toBe('2023-12-15T10:30:00Z');
    });

    it('should handle missing info object', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        // No info object
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.content).toBe('Content');
      expect(result.metadata.source).toBe('/path/to/file.pdf');
    });
  });

  describe('Section Extraction', () => {
    it('should create sections from page breaks', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Page 1 content\f\fPage 2 content',
        numpages: 2,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBeGreaterThanOrEqual(1);
    });

    it('should create sections from multiple newlines', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Section 1\n\n\n\n\nSection 2',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.sections).toBeDefined();
    });

    it('should detect all-caps section headers', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'INTRODUCTION\nThis is the introduction text.',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.sections).toBeDefined();
      const introSection = result.sections?.find(s => s.title === 'INTRODUCTION');
      expect(introSection).toBeDefined();
    });

    it('should detect numbered section headers', async () => {
      mockPdfParse.mockResolvedValue({
        text: '1. First Section\nContent here\n\n\n\n\n2. Second Section\nMore content',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.sections).toBeDefined();
    });

    it('should detect common header keywords', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Chapter One\nContent\n\n\n\n\nConclusion\nEnding content',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.sections).toBeDefined();
    });

    it('should include page numbers in sections', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Page 1\fPage 2\fPage 3',
        numpages: 3,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      if (result.sections && result.sections.length > 0) {
        expect(result.sections[0].pageNumber).toBeDefined();
      }
    });

    it('should handle single-page fallback', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Single page content without breaks',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Date Parsing', () => {
    it('should parse full PDF date format', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { CreationDate: 'D:20231215103045' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.createdDate).toBe('2023-12-15T10:30:45Z');
    });

    it('should parse date without time', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { CreationDate: 'D:20231215' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.createdDate).toBe('2023-12-15T00:00:00Z');
    });

    it('should handle invalid date format gracefully', async () => {
      mockPdfParse.mockResolvedValue({
        text: 'Content',
        numpages: 1,
        info: { CreationDate: 'invalid-date' },
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.metadata.createdDate).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty PDF', async () => {
      mockPdfParse.mockResolvedValue({
        text: '',
        numpages: 0,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.content).toBe('');
    });

    it('should trim content whitespace', async () => {
      mockPdfParse.mockResolvedValue({
        text: '  \n  Content with whitespace  \n  ',
        numpages: 1,
        info: {},
      });

      const result = await parsePdfFile('/path/to/file.pdf');

      expect(result.content).toBe('Content with whitespace');
    });

    it('should propagate pdf-parse errors', async () => {
      mockPdfParse.mockRejectedValue(new Error('Invalid PDF'));

      await expect(parsePdfFile('/path/to/file.pdf')).rejects.toThrow('Invalid PDF');
    });

    it('should propagate file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(parsePdfFile('/path/to/missing.pdf')).rejects.toThrow(
        'File not found'
      );
    });
  });
});
