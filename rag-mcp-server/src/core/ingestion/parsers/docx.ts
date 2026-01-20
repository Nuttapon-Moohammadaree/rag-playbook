/**
 * DOCX document parser using mammoth
 */

import mammoth from 'mammoth';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse DOCX file and extract text content
 */
export async function parseDocxFile(filepath: string): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ path: filepath });
  const content = result.value;

  // Try to extract metadata from the document
  const metadata = await extractDocxMetadata(filepath);

  // Extract sections based on apparent structure
  const sections = extractSections(content);

  return {
    content: content.trim(),
    metadata: {
      ...metadata,
      source: filepath,
    },
    sections,
  };
}

/**
 * Extract metadata from DOCX file
 */
async function extractDocxMetadata(filepath: string): Promise<Record<string, unknown>> {
  const metadata: Record<string, unknown> = {};

  try {
    // Use mammoth to get HTML which may contain more structure info
    const htmlResult = await mammoth.convertToHtml({ path: filepath });

    // Try to extract title from first heading
    const titleMatch = htmlResult.value.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    // Log any conversion warnings
    if (htmlResult.messages.length > 0) {
      metadata.conversionWarnings = htmlResult.messages.map(m => m.message);
    }
  } catch {
    // Metadata extraction failed, continue without it
  }

  return metadata;
}

/**
 * Extract sections from document content
 * Looks for patterns that indicate section breaks
 */
function extractSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];

  let currentSection: { title?: string; content: string[] } = { content: [] };
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const trimmedLine = line.trim();

    // Skip empty lines at the start of sections
    if (!trimmedLine && currentSection.content.length === 0) {
      continue;
    }

    // Detect potential section headers
    // Common patterns: ALL CAPS, numbered sections, short lines followed by content
    const isLikelyHeader = isHeaderLine(trimmedLine, lines, lineNumber - 1);

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
function isHeaderLine(line: string, allLines: string[], currentIndex: number): boolean {
  if (!line || line.length > 100) return false;

  // Check if line is all caps (common for headers)
  const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);

  // Check if line starts with a number/letter followed by period (e.g., "1. Introduction")
  const isNumbered = /^(\d+\.|\d+\)|[A-Z]\.)\s+\S/.test(line);

  // Check if line is short and followed by longer content
  const nextLine = allLines[currentIndex + 1]?.trim() || '';
  const isShortBeforeLong = line.length < 50 && nextLine.length > line.length;

  // Check for common header patterns
  const hasHeaderKeywords = /^(chapter|section|part|introduction|conclusion|summary|overview|appendix)/i.test(line);

  return (isAllCaps && line.length > 3) || isNumbered || hasHeaderKeywords || (isShortBeforeLong && line.length < 30);
}
