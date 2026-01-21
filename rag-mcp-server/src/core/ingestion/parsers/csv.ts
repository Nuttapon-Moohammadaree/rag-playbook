/**
 * CSV file parser
 * Converts tabular data to searchable text format
 * Properly handles quoted fields with embedded newlines and commas
 */

import { readFile } from 'fs/promises';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse CSV file and convert to searchable text
 */
export async function parseCsvFile(filepath: string): Promise<ParsedDocument> {
  const raw = await readFile(filepath, 'utf-8');

  // Parse all rows properly handling quoted fields with newlines
  const rows = parseCSVContent(raw);

  if (rows.length === 0) {
    return {
      content: '',
      metadata: { source: filepath },
    };
  }

  // First row is header
  const headers = rows[0];

  // Parse data rows and convert to text format
  const textRows: string[] = [];
  const sections: ParsedSection[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
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
      rowCount: rows.length - 1,
    },
    sections,
  };
}

/**
 * Parse entire CSV content, properly handling quoted fields with newlines
 */
function parseCSVContent(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote ("") -> single quote
        currentField += '"';
        i += 2;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
        i++;
      } else {
        // Any character inside quotes (including newlines)
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
        i++;
      } else if (char === ',') {
        // Field separator
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r' && nextChar === '\n') {
        // Windows line ending
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i += 2;
      } else if (char === '\n') {
        // Unix line ending
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Don't forget the last field and row
  currentRow.push(currentField.trim());
  if (currentRow.length > 0 && currentRow.some(f => f.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}
