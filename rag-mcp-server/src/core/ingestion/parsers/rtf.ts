/**
 * RTF (Rich Text Format) parser
 * Strips RTF formatting and extracts plain text
 */

import { readFile } from 'fs/promises';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse RTF file and extract plain text
 */
export async function parseRtfFile(filepath: string): Promise<ParsedDocument> {
  const raw = await readFile(filepath, 'utf-8');

  // Extract plain text from RTF
  const content = stripRtf(raw);

  // Extract metadata if available
  const metadata = extractRtfMetadata(raw, filepath);

  // Extract sections based on content structure
  const sections = extractSections(content);

  return {
    content: content.trim(),
    metadata,
    sections,
  };
}

/**
 * Strip RTF formatting and extract plain text
 */
function stripRtf(rtf: string): string {
  // Check if it's actually RTF
  if (!rtf.startsWith('{\\rtf')) {
    // Not RTF, return as-is (might be plain text with .rtf extension)
    return rtf;
  }

  let text = rtf;

  // Remove RTF header and encoding declarations
  text = text.replace(/\{\\rtf[^}]*\}/g, '');

  // Handle special characters first
  const specialChars: Record<string, string> = {
    '\\par': '\n',
    '\\tab': '\t',
    '\\line': '\n',
    '\\page': '\n\n',
    '\\~': ' ',  // Non-breaking space
    '\\_': '-',  // Non-breaking hyphen
    '\\-': '',   // Optional hyphen
    '\\bullet': '\u2022',
    '\\endash': '\u2013',
    '\\emdash': '\u2014',
    '\\lquote': '\u2018',
    '\\rquote': '\u2019',
    '\\ldblquote': '\u201C',
    '\\rdblquote': '\u201D',
  };

  for (const [rtfCode, char] of Object.entries(specialChars)) {
    text = text.split(rtfCode).join(char);
  }

  // Handle unicode characters: \'XX (hex) and \uNNNN (decimal)
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  text = text.replace(/\\u(\d+)\??/g, (_, num) => {
    return String.fromCharCode(parseInt(num, 10));
  });

  // Remove font tables, color tables, and other control groups
  text = text.replace(/\{\\fonttbl[^}]*\}/gi, '');
  text = text.replace(/\{\\colortbl[^}]*\}/gi, '');
  text = text.replace(/\{\\stylesheet[^}]*\}/gi, '');
  text = text.replace(/\{\\info[^}]*\}/gi, '');
  text = text.replace(/\{\\\*\\[^}]*\}/g, ''); // Destinations

  // Remove remaining control words (backslash followed by letters/digits)
  text = text.replace(/\\[a-z]+\d*\s?/gi, '');

  // Remove remaining braces
  text = text.replace(/[{}]/g, '');

  // Clean up whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');

  return text.trim();
}

/**
 * Extract metadata from RTF info block
 */
function extractRtfMetadata(rtf: string, filepath: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = { source: filepath };

  // Try to extract info block
  const infoMatch = rtf.match(/\{\\info([^}]*)\}/i);
  if (infoMatch) {
    const info = infoMatch[1];

    // Extract title
    const titleMatch = info.match(/\{\\title\s*([^}]*)\}/i);
    if (titleMatch) metadata.title = stripRtf(titleMatch[1]);

    // Extract author
    const authorMatch = info.match(/\{\\author\s*([^}]*)\}/i);
    if (authorMatch) metadata.author = stripRtf(authorMatch[1]);

    // Extract subject
    const subjectMatch = info.match(/\{\\subject\s*([^}]*)\}/i);
    if (subjectMatch) metadata.description = stripRtf(subjectMatch[1]);
  }

  return metadata;
}

/**
 * Extract sections from content based on structure patterns
 */
function extractSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];

  let currentSection: { title?: string; content: string[] } = { content: [] };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines at the start of sections
    if (!trimmedLine && currentSection.content.length === 0) {
      continue;
    }

    // Detect potential section headers
    const isLikelyHeader = isHeaderLine(trimmedLine);

    if (isLikelyHeader && currentSection.content.length > 0) {
      // Save previous section
      sections.push({
        title: currentSection.title,
        content: currentSection.content.join('\n').trim(),
      });

      // Start new section
      currentSection = {
        title: trimmedLine,
        content: [],
      };
    } else if (isLikelyHeader && currentSection.content.length === 0 && !currentSection.title) {
      // First header
      currentSection.title = trimmedLine;
    } else {
      currentSection.content.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection.content.length > 0 || currentSection.title) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.length > 0);
}

/**
 * Heuristic to detect if a line is likely a section header
 */
function isHeaderLine(line: string): boolean {
  if (!line || line.length > 100) return false;

  // Check if line is all caps (common for headers)
  const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line) && line.length > 3;

  // Check if line starts with a number/letter followed by period
  const isNumbered = /^(\d+\.|\d+\)|[A-Z]\.)\s+\S/.test(line);

  // Check for common header keywords
  const hasHeaderKeywords = /^(chapter|section|part|introduction|conclusion|summary|overview|appendix)/i.test(line);

  return isAllCaps || isNumbered || hasHeaderKeywords;
}
