/**
 * Tests for PPTX Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock officeparser
const mockParseOffice = vi.fn();
vi.mock('officeparser', () => ({
  default: {
    parseOffice: (...args: unknown[]) => mockParseOffice(...args),
  },
}));

import { parsePptxFile } from './pptx.js';

describe('PPTX Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parsePptxFile', () => {
    it('should parse PPTX and extract text content', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: 'Slide content' }],
            metadata: { slideNumber: 1 },
          },
        ],
        metadata: {},
        toText: () => 'Full presentation text',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(mockParseOffice).toHaveBeenCalledWith('/path/to/file.pptx');
      expect(result.content).toBe('Full presentation text');
      expect(result.metadata.source).toBe('/path/to/file.pptx');
    });

    it('should extract title from metadata', async () => {
      mockParseOffice.mockResolvedValue({
        content: [],
        metadata: { title: 'Presentation Title' },
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.metadata.title).toBe('Presentation Title');
    });

    it('should create sections for each slide', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: 'Slide 1 text' }],
            metadata: { slideNumber: 1 },
          },
          {
            type: 'slide',
            children: [{ text: 'Slide 2 text' }],
            metadata: { slideNumber: 2 },
          },
        ],
        metadata: {},
        toText: () => 'All slides text',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBe(2);
      expect(result.sections![0].title).toBe('Slide 1');
      expect(result.sections![0].content).toBe('Slide 1 text');
      expect(result.sections![1].title).toBe('Slide 2');
      expect(result.sections![1].content).toBe('Slide 2 text');
    });

    it('should include slide numbers in sections', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: 'Content' }],
            metadata: { slideNumber: 5 },
          },
        ],
        metadata: {},
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections![0].title).toBe('Slide 5');
      expect(result.sections![0].slideNumber).toBe(5);
    });

    it('should use index as fallback slide number', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: 'Content' }],
            metadata: {}, // No slideNumber
          },
        ],
        metadata: {},
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections![0].title).toBe('Slide 1');
      expect(result.sections![0].slideNumber).toBe(1);
    });

    it('should combine text from multiple children in slide', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [
              { text: 'Title text' },
              { text: 'Bullet point 1' },
              { text: 'Bullet point 2' },
            ],
            metadata: { slideNumber: 1 },
          },
        ],
        metadata: {},
        toText: () => 'All text',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections![0].content).toContain('Title text');
      expect(result.sections![0].content).toContain('Bullet point 1');
      expect(result.sections![0].content).toContain('Bullet point 2');
    });

    it('should skip empty slides', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: 'Has content' }],
            metadata: { slideNumber: 1 },
          },
          {
            type: 'slide',
            children: [], // Empty slide
            metadata: { slideNumber: 2 },
          },
          {
            type: 'slide',
            children: [{ text: '' }], // Slide with empty text
            metadata: { slideNumber: 3 },
          },
          {
            type: 'slide',
            children: [{ text: 'Also has content' }],
            metadata: { slideNumber: 4 },
          },
        ],
        metadata: {},
        toText: () => 'All text',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections!.length).toBe(2);
      expect(result.sections![0].title).toBe('Slide 1');
      expect(result.sections![1].title).toBe('Slide 4');
    });

    it('should skip non-slide content nodes', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: 'Slide content' }],
            metadata: { slideNumber: 1 },
          },
          {
            type: 'header',
            children: [{ text: 'Header content' }],
          },
          {
            type: 'footer',
            children: [{ text: 'Footer content' }],
          },
        ],
        metadata: {},
        toText: () => 'All text',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections!.length).toBe(1);
      expect(result.sections![0].title).toBe('Slide 1');
    });
  });

  describe('Content Handling', () => {
    it('should trim slide text', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [{ text: '  Padded content  ' }],
            metadata: { slideNumber: 1 },
          },
        ],
        metadata: {},
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections![0].content).toBe('Padded content');
    });

    it('should trim overall content', async () => {
      mockParseOffice.mockResolvedValue({
        content: [],
        metadata: {},
        toText: () => '  Full content with whitespace  ',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.content).toBe('Full content with whitespace');
    });

    it('should handle null children', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: null,
            metadata: { slideNumber: 1 },
          },
        ],
        metadata: {},
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      // Should not crash, just skip
      expect(result.sections).toEqual([]);
    });

    it('should handle children without text property', async () => {
      mockParseOffice.mockResolvedValue({
        content: [
          {
            type: 'slide',
            children: [
              { text: 'Valid text' },
              { notText: 'Invalid' },
              { text: 'More valid text' },
            ],
            metadata: { slideNumber: 1 },
          },
        ],
        metadata: {},
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections![0].content).toContain('Valid text');
      expect(result.sections![0].content).toContain('More valid text');
      expect(result.sections![0].content).not.toContain('Invalid');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty presentation', async () => {
      mockParseOffice.mockResolvedValue({
        content: [],
        metadata: {},
        toText: () => '',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.content).toBe('');
      expect(result.sections).toEqual([]);
    });

    it('should handle presentation without content array', async () => {
      mockParseOffice.mockResolvedValue({
        metadata: {},
        toText: () => 'Some text',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.content).toBe('Some text');
      expect(result.sections).toEqual([]);
    });

    it('should handle missing metadata', async () => {
      mockParseOffice.mockResolvedValue({
        content: [],
        toText: () => 'Content',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.metadata.title).toBeUndefined();
      expect(result.metadata.source).toBe('/path/to/file.pptx');
    });

    it('should propagate officeparser errors', async () => {
      mockParseOffice.mockRejectedValue(new Error('Invalid PPTX'));

      await expect(parsePptxFile('/path/to/file.pptx')).rejects.toThrow(
        'Invalid PPTX'
      );
    });

    it('should handle large presentations', async () => {
      const slides = Array.from({ length: 100 }, (_, i) => ({
        type: 'slide',
        children: [{ text: `Slide ${i + 1} content` }],
        metadata: { slideNumber: i + 1 },
      }));

      mockParseOffice.mockResolvedValue({
        content: slides,
        metadata: {},
        toText: () => 'All slides',
      });

      const result = await parsePptxFile('/path/to/file.pptx');

      expect(result.sections!.length).toBe(100);
    });
  });
});
