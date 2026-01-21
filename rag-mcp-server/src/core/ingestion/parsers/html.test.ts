/**
 * Tests for HTML Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import { parseHtmlFile } from './html.js';

describe('HTML Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseHtmlFile', () => {
    it('should parse simple HTML', async () => {
      const html = `
        <html>
          <body>
            <p>Hello, World!</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Hello, World!');
      expect(result.metadata.source).toBe('/path/to/file.html');
    });

    it('should extract title from title tag', async () => {
      const html = `
        <html>
          <head>
            <title>Page Title</title>
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.title).toBe('Page Title');
    });

    it('should extract meta description', async () => {
      const html = `
        <html>
          <head>
            <meta name="description" content="A detailed description">
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.description).toBe('A detailed description');
    });

    it('should extract meta author', async () => {
      const html = `
        <html>
          <head>
            <meta name="author" content="John Doe">
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.author).toBe('John Doe');
    });

    it('should extract meta keywords as tags', async () => {
      const html = `
        <html>
          <head>
            <meta name="keywords" content="javascript, testing, html">
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.tags).toEqual(['javascript', 'testing', 'html']);
    });

    it('should extract OpenGraph title', async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="OG Title">
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.title).toBe('OG Title');
    });

    it('should prefer title tag over OG title', async () => {
      const html = `
        <html>
          <head>
            <title>Page Title</title>
            <meta property="og:title" content="OG Title">
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.title).toBe('Page Title');
    });

    it('should extract OpenGraph description', async () => {
      const html = `
        <html>
          <head>
            <meta property="og:description" content="OG Description">
          </head>
          <body>Content</body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.metadata.description).toBe('OG Description');
    });
  });

  describe('Script and Style Removal', () => {
    it('should remove script tags', async () => {
      const html = `
        <html>
          <body>
            <script>alert('hello');</script>
            <p>Visible content</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).not.toContain("alert('hello')");
      expect(result.content).toContain('Visible content');
    });

    it('should remove style tags', async () => {
      const html = `
        <html>
          <head>
            <style>body { color: red; }</style>
          </head>
          <body><p>Content</p></body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).not.toContain('color: red');
    });

    it('should remove noscript tags', async () => {
      const html = `
        <html>
          <body>
            <noscript>JavaScript is disabled</noscript>
            <p>Main content</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).not.toContain('JavaScript is disabled');
    });

    it('should remove iframe tags', async () => {
      const html = `
        <html>
          <body>
            <iframe src="https://example.com">Iframe content</iframe>
            <p>Main content</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).not.toContain('Iframe content');
    });

    it('should remove SVG tags', async () => {
      const html = `
        <html>
          <body>
            <svg><text>SVG text</text></svg>
            <p>Main content</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).not.toContain('SVG text');
    });
  });

  describe('Content Extraction', () => {
    it('should prefer main element content', async () => {
      const html = `
        <html>
          <body>
            <header>Navigation</header>
            <main>Main content here</main>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Main content here');
    });

    it('should prefer article element content', async () => {
      const html = `
        <html>
          <body>
            <article>Article content</article>
            <aside>Sidebar</aside>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Article content');
    });

    it('should use role=main content', async () => {
      const html = `
        <html>
          <body>
            <div role="main">Main role content</div>
            <div>Other content</div>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Main role content');
    });

    it('should use .content class content', async () => {
      const html = `
        <html>
          <body>
            <div class="content">Content div</div>
            <div class="sidebar">Sidebar</div>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Content div');
    });

    it('should fall back to body content', async () => {
      const html = `
        <html>
          <body>
            <div>Body content here</div>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Body content here');
    });

    it('should normalize whitespace', async () => {
      const html = `
        <html>
          <body>
            <p>Multiple    spaces    here</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Multiple spaces here');
    });
  });

  describe('Section Extraction', () => {
    it('should extract sections from headings', async () => {
      const html = `
        <html>
          <body>
            <h1>Main Title</h1>
            <p>Introduction text</p>
            <h2>Section One</h2>
            <p>Section one content</p>
            <h2>Section Two</h2>
            <p>Section two content</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.sections).toBeDefined();
      // Should have sections
      expect(result.sections!.length).toBeGreaterThan(0);
    });

    it('should handle all heading levels', async () => {
      const html = `
        <html>
          <body>
            <h1>H1</h1>
            <h2>H2</h2>
            <h3>H3</h3>
            <h4>H4</h4>
            <h5>H5</h5>
            <h6>H6</h6>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.sections).toBeDefined();
    });

    it('should extract text from paragraphs', async () => {
      const html = `
        <html>
          <body>
            <h1>Title</h1>
            <p>Paragraph content</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      const titleSection = result.sections?.find(s => s.title === 'Title');
      expect(titleSection).toBeDefined();
    });

    it('should filter empty sections', async () => {
      const html = `
        <html>
          <body>
            <h1>Empty Section</h1>
            <h2>Section with content</h2>
            <p>Actual content here</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      if (result.sections) {
        expect(result.sections.every(s => s.content.length > 0)).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle HTML without head', async () => {
      const html = `
        <html>
          <body><p>Content only</p></body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Content only');
    });

    it('should handle HTML without body', async () => {
      const html = '<p>Just a paragraph</p>';
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Just a paragraph');
    });

    it('should handle empty HTML', async () => {
      mockReadFile.mockResolvedValue('<html><body></body></html>');

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toBe('');
    });

    it('should handle deeply nested elements', async () => {
      const html = `
        <html>
          <body>
            <div>
              <div>
                <div>
                  <div>
                    <p>Deep content</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('Deep content');
    });

    it('should handle HTML entities', async () => {
      const html = `
        <html>
          <body>
            <p>&lt;tag&gt; &amp; &quot;quotes&quot;</p>
          </body>
        </html>
      `;
      mockReadFile.mockResolvedValue(html);

      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toContain('<tag>');
      expect(result.content).toContain('&');
      expect(result.content).toContain('"quotes"');
    });

    it('should handle malformed HTML gracefully', async () => {
      const html = '<p>Unclosed paragraph<div>Mixed up tags</p></div>';
      mockReadFile.mockResolvedValue(html);

      // Should not throw
      const result = await parseHtmlFile('/path/to/file.html');

      expect(result.content).toBeDefined();
    });
  });
});
