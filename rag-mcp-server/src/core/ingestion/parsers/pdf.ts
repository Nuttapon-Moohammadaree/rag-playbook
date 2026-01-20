/**
 * PDF document parser using pdf-parse
 */

import { readFile } from 'fs/promises';
import pdfParse from 'pdf-parse';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse PDF file and extract text content
 */
export async function parsePdfFile(filepath: string): Promise<ParsedDocument> {
  const buffer = await readFile(filepath);
  const data = await pdfParse(buffer);

  const content = data.text;
  const metadata: Record<string, unknown> = {
    source: filepath,
    pageCount: data.numpages,
  };

  // Extract PDF metadata if available
  if (data.info) {
    if (data.info.Title) metadata.title = data.info.Title;
    if (data.info.Author) metadata.author = data.info.Author;
    if (data.info.Subject) metadata.description = data.info.Subject;
    if (data.info.Keywords) {
      metadata.tags = String(data.info.Keywords).split(/[,;]/).map(k => k.trim()).filter(Boolean);
    }
    if (data.info.CreationDate) {
      metadata.createdDate = parsePdfDate(data.info.CreationDate);
    }
  }

  // Extract sections based on page breaks and content structure
  const sections = extractPdfSections(content, data.numpages);

  return {
    content: content.trim(),
    metadata,
    sections,
  };
}

/**
 * Extract sections from PDF content
 * Uses page breaks and content patterns
 */
function extractPdfSections(content: string, pageCount: number): ParsedSection[] {
  // pdf-parse separates pages with form feed character or multiple newlines
  const pageBreakPattern = /\f|\n{4,}/;
  const pages = content.split(pageBreakPattern);

  const sections: ParsedSection[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageContent = pages[i].trim();
    if (!pageContent) continue;

    // Try to extract a title from the first few lines of the page
    const lines = pageContent.split('\n').filter(l => l.trim());
    let title: string | undefined;

    // Check if first line looks like a section header
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (isLikelySectionHeader(firstLine)) {
        title = firstLine;
      }
    }

    sections.push({
      title,
      content: pageContent,
      pageNumber: i + 1,
    });
  }

  // If we have more pages than expected, some pages might have merged
  // In this case, return as-is since the parsing is best-effort
  if (sections.length === 0 && content.trim()) {
    // Fallback: treat entire content as single section
    sections.push({
      content: content.trim(),
      pageNumber: 1,
    });
  }

  return sections;
}

/**
 * Check if a line looks like a section header
 */
function isLikelySectionHeader(line: string): boolean {
  if (!line || line.length > 100 || line.length < 3) return false;

  // All caps
  if (line === line.toUpperCase() && /[A-Z]{3,}/.test(line)) return true;

  // Numbered section
  if (/^(\d+\.|\d+\)|[IVX]+\.)\s+\S/.test(line)) return true;

  // Common header keywords
  if (/^(chapter|section|part|introduction|conclusion|abstract|summary|references|appendix)/i.test(line)) return true;

  return false;
}

/**
 * Parse PDF date format (D:YYYYMMDDHHmmss)
 */
function parsePdfDate(dateString: string): string | undefined {
  try {
    // PDF date format: D:YYYYMMDDHHmmssOHH'mm'
    const match = dateString.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (match) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    }
  } catch {
    // Failed to parse date
  }
  return undefined;
}
