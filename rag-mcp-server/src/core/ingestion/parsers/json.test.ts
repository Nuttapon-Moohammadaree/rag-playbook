/**
 * Tests for JSON Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import { parseJsonFile } from './json.js';

describe('JSON Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseJsonFile', () => {
    it('should parse simple JSON object', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ key: 'value' }));

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('key: value');
      expect(result.metadata.source).toBe('/path/to/file.json');
    });

    it('should throw for invalid JSON', async () => {
      mockReadFile.mockResolvedValue('{ invalid json }');

      await expect(parseJsonFile('/path/to/file.json')).rejects.toThrow(
        /Invalid JSON/
      );
    });

    it('should extract title from common metadata fields', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          title: 'Document Title',
          content: 'Main content',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.title).toBe('Document Title');
    });

    it('should use name field as title fallback', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          name: 'Document Name',
          data: 'Some data',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.title).toBe('Document Name');
    });

    it('should extract author metadata', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          author: 'John Doe',
          content: 'Article content',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.author).toBe('John Doe');
    });

    it('should extract description/summary metadata', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          description: 'A short description',
          body: 'Full content',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.description).toBe('A short description');
    });

    it('should use summary as description fallback', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          summary: 'A summary',
          body: 'Full content',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.description).toBe('A summary');
    });

    it('should extract tags array', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          title: 'Tagged Document',
          tags: ['javascript', 'testing', 'vitest'],
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.tags).toEqual(['javascript', 'testing', 'vitest']);
    });

    it('should use keywords as tags fallback', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          title: 'Document',
          keywords: ['keyword1', 'keyword2'],
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.tags).toEqual(['keyword1', 'keyword2']);
    });

    it('should extract category metadata', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          category: 'Technology',
          content: 'Article',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.category).toBe('Technology');
    });

    it('should use type as category fallback', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          type: 'blog-post',
          content: 'Article',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.category).toBe('blog-post');
    });
  });

  describe('JSON Flattening', () => {
    it('should flatten nested objects', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          user: {
            name: 'John',
            email: 'john@example.com',
          },
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('user.name: John');
      expect(result.content).toContain('user.email: john@example.com');
    });

    it('should handle deeply nested objects', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          level1: {
            level2: {
              level3: {
                value: 'deep',
              },
            },
          },
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('level1.level2.level3.value: deep');
    });

    it('should flatten arrays of primitives', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          colors: ['red', 'green', 'blue'],
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('colors: red, green, blue');
    });

    it('should flatten arrays of objects', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          users: [
            { name: 'Alice' },
            { name: 'Bob' },
          ],
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('users[0].name: Alice');
      expect(result.content).toContain('users[1].name: Bob');
    });

    it('should handle boolean values', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          active: true,
          deleted: false,
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('active: true');
      expect(result.content).toContain('deleted: false');
    });

    it('should handle number values', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          count: 42,
          price: 19.99,
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('count: 42');
      expect(result.content).toContain('price: 19.99');
    });

    it('should handle null values', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          value: null,
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('value: null');
    });

    it('should handle empty arrays', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          items: [],
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('items: []');
    });

    it('should handle max depth limit', async () => {
      // Create deeply nested structure
      let deep: Record<string, unknown> = { value: 'end' };
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep };
      }
      mockReadFile.mockResolvedValue(JSON.stringify(deep));

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('[max depth reached]');
    });
  });

  describe('Section Extraction', () => {
    it('should create sections from top-level keys', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          introduction: 'Intro text',
          body: 'Main body',
          conclusion: 'Closing text',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.sections).toBeDefined();
      expect(result.sections!.some(s => s.title === 'introduction')).toBe(true);
      expect(result.sections!.some(s => s.title === 'body')).toBe(true);
      expect(result.sections!.some(s => s.title === 'conclusion')).toBe(true);
    });

    it('should skip common metadata fields from sections', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          title: 'Doc Title',
          author: 'Author Name',
          description: 'Description',
          content: 'Main content',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      // title, author, description should not be sections
      expect(result.sections!.some(s => s.title === 'title')).toBe(false);
      expect(result.sections!.some(s => s.title === 'author')).toBe(false);
      expect(result.sections!.some(s => s.title === 'description')).toBe(false);
      // content should be a section
      expect(result.sections!.some(s => s.title === 'content')).toBe(true);
    });

    it('should create sections for array items', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify([
          { name: 'Item 1', value: 'First' },
          { name: 'Item 2', value: 'Second' },
        ])
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.sections).toBeDefined();
      expect(result.sections!.some(s => s.title === 'Item 1')).toBe(true);
      expect(result.sections!.some(s => s.title === 'Item 2')).toBe(true);
    });

    it('should skip empty sections', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          empty: '',
          hasContent: 'actual content',
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      // All sections should have content
      if (result.sections) {
        expect(result.sections.every(s => s.content.trim().length > 0)).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle root-level string', async () => {
      mockReadFile.mockResolvedValue('"just a string"');

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toBe('just a string');
    });

    it('should handle root-level number', async () => {
      mockReadFile.mockResolvedValue('42');

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toBe('42');
    });

    it('should handle root-level array of primitives', async () => {
      mockReadFile.mockResolvedValue('["a", "b", "c"]');

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.content).toContain('a, b, c');
    });

    it('should filter non-string tags', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          tags: ['valid', 123, null, 'also-valid'],
        })
      );

      const result = await parseJsonFile('/path/to/file.json');

      expect(result.metadata.tags).toEqual(['valid', 'also-valid']);
    });
  });
});
