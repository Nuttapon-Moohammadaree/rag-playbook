/**
 * CSV file parser
 * Converts tabular data to searchable text format
 */

import { readFile } from 'fs/promises';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse CSV file and convert to searchable text
 */
export async function parseCsvFile(filepath: string): Promise<ParsedDocument> {
  const raw = await readFile(filepath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    return {
      content: '',
      metadata: { source: filepath },
    };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);

  // Parse data rows and convert to text format
  const textRows: string[] = [];
  const sections: ParsedSection[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const rowText = headers
      .map((header, idx) => `${header}: ${values[idx] ?? ''}`)
      .join('\n');

    textRows.push(rowText);

    // Create section for each row (useful for chunking)
    sections.push({
      title: `Row ${i}`,
      content: rowText,
    });
  }

  const content = textRows.join('\n\n');

  return {
    content,
    metadata: {
      source: filepath,
      columns: headers,
      rowCount: lines.length - 1,
    },
    sections,
  };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Don't forget the last field
  result.push(current.trim());

  return result;
}
