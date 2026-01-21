/**
 * HTML file parser using cheerio
 * Extracts text content and preserves document structure
 */

import { readFile } from 'fs/promises';
import * as cheerio from 'cheerio';
import type { ParsedDocument, ParsedSection, DocumentMetadata } from '../../../types/index.js';

/**
 * Parse HTML file and extract text content
 */
export async function parseHtmlFile(filepath: string): Promise<ParsedDocument> {
  const raw = await readFile(filepath, 'utf-8');
  const $ = cheerio.load(raw);

  // Remove script and style elements
  $('script, style, noscript, iframe, svg').remove();

  // Extract metadata from head
  const metadata = extractHtmlMetadata($, filepath);

  // Extract main content
  const content = extractTextContent($);

  // Extract sections based on headings
  const sections = extractHtmlSections($);

  return {
    content: content.trim(),
    metadata,
    sections,
  };
}

/**
 * Extract metadata from HTML head
 */
function extractHtmlMetadata($: cheerio.CheerioAPI, filepath: string): DocumentMetadata {
  const metadata: DocumentMetadata = { source: filepath };

  // Title
  const title = $('title').text().trim();
  if (title) metadata.title = title;

  // Meta tags
  const description = $('meta[name="description"]').attr('content');
  if (description) metadata.description = description;

  const author = $('meta[name="author"]').attr('content');
  if (author) metadata.author = author;

  const keywords = $('meta[name="keywords"]').attr('content');
  if (keywords) {
    metadata.tags = keywords.split(',').map(k => k.trim()).filter(Boolean);
  }

  // OpenGraph metadata
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle && !metadata.title) metadata.title = ogTitle;

  const ogDescription = $('meta[property="og:description"]').attr('content');
  if (ogDescription && !metadata.description) metadata.description = ogDescription;

  return metadata;
}

/**
 * Extract text content from HTML body
 */
function extractTextContent($: cheerio.CheerioAPI): string {
  // Try to find main content area
  const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.main', '#main'];

  for (const selector of mainSelectors) {
    const main = $(selector);
    if (main.length > 0) {
      return normalizeText(main.text());
    }
  }

  // Fall back to body
  const body = $('body');
  if (body.length > 0) {
    return normalizeText(body.text());
  }

  // Last resort: entire document
  return normalizeText($.text());
}

/**
 * Normalize extracted text
 */
function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/\n\s*\n/g, '\n\n')    // Normalize paragraph breaks
    .trim();
}

/**
 * Extract sections based on heading elements
 */
function extractHtmlSections($: cheerio.CheerioAPI): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

  // Find the content container
  const container = $('main, article, [role="main"], .content, #content, body').first();

  if (container.length === 0) {
    return sections;
  }

  // Get all elements in order
  const elements = container.find('*');

  let currentSection: { title?: string; content: string[] } = { content: [] };

  elements.each((_, el) => {
    const $el = $(el);
    const tagName = el.tagName?.toLowerCase();

    // Check if this is a heading
    if (headingLevels.includes(tagName)) {
      const headingText = $el.text().trim();

      // Save previous section if it has content
      if (currentSection.content.length > 0) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join('\n').trim(),
        });
      }

      // Start new section
      currentSection = {
        title: headingText,
        content: [],
      };
    } else if (['p', 'li', 'td', 'th', 'blockquote', 'pre', 'code'].includes(tagName)) {
      // Only collect direct text from these elements
      const text = $el.clone().children().remove().end().text().trim();
      if (text) {
        currentSection.content.push(text);
      }
    }
  });

  // Don't forget the last section
  if (currentSection.content.length > 0 || currentSection.title) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.length > 0);
}
