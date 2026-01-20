/**
 * XLSX (Excel) document parser using SheetJS
 */

import * as XLSX from 'xlsx';
import { readFile } from 'fs/promises';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse XLSX file and extract text content
 * Each sheet becomes a separate section
 */
export async function parseXlsxFile(filepath: string): Promise<ParsedDocument> {
  const buffer = await readFile(filepath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sections: ParsedSection[] = [];
  let fullContent = '';

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const text = XLSX.utils.sheet_to_txt(sheet);
    if (text.trim()) {
      sections.push({
        title: sheetName,
        content: text.trim(),
      });
      fullContent += `[Sheet: ${sheetName}]\n${text}\n\n`;
    }
  });

  return {
    content: fullContent.trim(),
    metadata: {
      source: filepath,
    },
    sections,
  };
}
