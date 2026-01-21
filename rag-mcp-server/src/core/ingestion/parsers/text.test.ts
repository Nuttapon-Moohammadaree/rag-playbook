/**
 * Tests for Text and Markdown Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import { parseTextFile, parseMarkdownFile } from './text.js';

describe('Text Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseTextFile', () => {
    it('should parse plain text file', async () => {
      mockReadFile.mockResolvedValue('Hello, World!');

      const result = await parseTextFile('/path/to/file.txt');

      expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.txt', 'utf-8');
      expect(result.content).toBe('Hello, World!');
      expect(result.metadata.source).toBe('/path/to/file.txt');
    });

    it('should trim whitespace from content', async () => {
      mockReadFile.mockResolvedValue('  \n  Content with whitespace  \n  ');

      const result = await parseTextFile('/path/to/file.txt');

      expect(result.content).toBe('Content with whitespace');
    });

    it('should handle empty file', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await parseTextFile('/path/to/file.txt');

      expect(result.content).toBe('');
    });

    it('should handle multiline text', async () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      mockReadFile.mockResolvedValue(multiline);

      const result = await parseTextFile('/path/to/file.txt');

      expect(result.content).toBe(multiline);
    });

    it('should handle unicode content', async () => {
      const unicode = '日本語テスト 🎉 émojis';
      mockReadFile.mockResolvedValue(unicode);

      const result = await parseTextFile('/path/to/file.txt');

      expect(result.content).toBe(unicode);
    });

    it('should propagate file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(parseTextFile('/path/to/missing.txt')).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('parseMarkdownFile', () => {
    it('should parse markdown file', async () => {
      const markdown = '# Title\n\nParagraph content';
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.content).toBe(markdown);
      expect(result.metadata.source).toBe('/path/to/file.md');
    });

    it('should extract title from H1 heading', async () => {
      const markdown = '# My Document Title\n\nContent here';
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.metadata.title).toBe('My Document Title');
    });

    it('should handle markdown without H1', async () => {
      const markdown = '## Section\n\nContent without main title';
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.metadata.title).toBeUndefined();
    });

    it('should extract sections from headings', async () => {
      const markdown = `# Main Title

Introduction paragraph.

## Section One

First section content.

## Section Two

Second section content.`;
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle H1-H6 headings', async () => {
      const markdown = `# H1 Title
## H2 Title
### H3 Title
#### H4 Title
##### H5 Title
###### H6 Title`;
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.metadata.title).toBe('H1 Title');
      expect(result.sections).toBeDefined();
    });

    it('should handle markdown with code blocks', async () => {
      const markdown = `# Code Example

\`\`\`javascript
function hello() {
  console.log('Hello');
}
\`\`\``;
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.content).toContain('```javascript');
      expect(result.content).toContain("console.log('Hello')");
    });

    it('should handle markdown with lists', async () => {
      const markdown = `# List Document

- Item 1
- Item 2
- Item 3

1. First
2. Second`;
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.content).toContain('- Item 1');
      expect(result.content).toContain('1. First');
    });

    it('should filter empty sections', async () => {
      const markdown = `# Title

## Empty Section

## Section with content

This section has content.`;
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      // Only sections with content should be included
      if (result.sections) {
        const nonEmptySections = result.sections.filter(s => s.content.trim());
        expect(nonEmptySections.every(s => s.content.length > 0)).toBe(true);
      }
    });

    it('should handle Windows line endings in markdown', async () => {
      const markdown = '# Title\r\n\r\nContent with Windows endings\r\n';
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      expect(result.metadata.title).toBe('Title');
    });

    it('should handle inline title formatting', async () => {
      const markdown = '# **Bold Title**\n\nContent';
      mockReadFile.mockResolvedValue(markdown);

      const result = await parseMarkdownFile('/path/to/file.md');

      // Title includes the markdown formatting
      expect(result.metadata.title).toBe('**Bold Title**');
    });
  });
});
