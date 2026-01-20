/**
 * Plain text and Markdown parser
 */

import { readFile } from 'fs/promises';
import type { ParsedDocument } from '../../../types/index.js';

/**
 * Parse plain text file (.txt)
 */
export async function parseTextFile(filepath: string): Promise<ParsedDocument> {
  const content = await readFile(filepath, 'utf-8');

  return {
    content: content.trim(),
    metadata: {
      source: filepath,
    },
  };
}

/**
 * Parse Markdown file (.md)
 * Extracts title from first heading and preserves structure
 */
export async function parseMarkdownFile(filepath: string): Promise<ParsedDocument> {
  const content = await readFile(filepath, 'utf-8');

  // Try to extract title from first H1 heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Extract sections based on headings
  const sections = extractMarkdownSections(content);

  return {
    content: content.trim(),
    metadata: {
      title,
      source: filepath,
    },
    sections,
  };
}

/**
 * Extract sections from Markdown content
 */
function extractMarkdownSections(content: string): Array<{ title?: string; content: string }> {
  const lines = content.split('\n');
  const sections: Array<{ title?: string; content: string }> = [];

  let currentSection: { title?: string; content: string[] } = { content: [] };

  for (const line of lines) {
    // Check for heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section if it has content
      if (currentSection.content.length > 0) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join('\n').trim(),
        });
      }

      // Start new section
      currentSection = {
        title: headingMatch[2].trim(),
        content: [],
      };
    } else {
      currentSection.content.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection.content.length > 0) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.length > 0);
}
