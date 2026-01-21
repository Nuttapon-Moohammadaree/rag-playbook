/**
 * Parser factory - routes files to appropriate parsers
 */

import { extname } from 'path';
import { parseTextFile, parseMarkdownFile } from './text.js';
import { parseDocxFile } from './docx.js';
import { parsePdfFile } from './pdf.js';
import { parsePptxFile } from './pptx.js';
import { parseXlsxFile } from './xlsx.js';
import { parseCsvFile } from './csv.js';
import { parseJsonFile } from './json.js';
import { parseRtfFile } from './rtf.js';
import { parseHtmlFile } from './html.js';
import type { ParsedDocument, FileType } from '../../../types/index.js';

/**
 * Supported file extensions and their types
 */
const FILE_TYPE_MAP: Record<string, FileType> = {
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.docx': 'docx',
  '.pdf': 'pdf',
  '.pptx': 'pptx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.csv': 'csv',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.rtf': 'rtf',
};

/**
 * MIME types for each file type
 */
const MIME_TYPE_MAP: Record<FileType, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  html: 'text/html',
  json: 'application/json',
  rtf: 'application/rtf',
};

/**
 * Get file type from file path
 */
export function getFileType(filepath: string): FileType | null {
  const ext = extname(filepath).toLowerCase();
  return FILE_TYPE_MAP[ext] ?? null;
}

/**
 * Get MIME type for file type
 */
export function getMimeType(fileType: FileType): string {
  return MIME_TYPE_MAP[fileType] ?? 'application/octet-stream';
}

/**
 * Check if file type is supported
 */
export function isSupportedFile(filepath: string): boolean {
  return getFileType(filepath) !== null;
}

/**
 * Get list of supported extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(FILE_TYPE_MAP);
}

/**
 * Parse a document based on its file type
 */
export async function parseDocument(filepath: string): Promise<ParsedDocument> {
  const fileType = getFileType(filepath);

  if (!fileType) {
    throw new Error(`Unsupported file type: ${extname(filepath)}`);
  }

  switch (fileType) {
    case 'txt':
      return parseTextFile(filepath);
    case 'md':
      return parseMarkdownFile(filepath);
    case 'docx':
      return parseDocxFile(filepath);
    case 'pdf':
      return parsePdfFile(filepath);
    case 'pptx':
      return parsePptxFile(filepath);
    case 'xlsx':
      return parseXlsxFile(filepath);
    case 'csv':
      return parseCsvFile(filepath);
    case 'json':
      return parseJsonFile(filepath);
    case 'rtf':
      return parseRtfFile(filepath);
    case 'html':
      return parseHtmlFile(filepath);
    default:
      throw new Error(`Parser not implemented for file type: ${fileType}`);
  }
}

export {
  parseTextFile,
  parseMarkdownFile,
  parseDocxFile,
  parsePdfFile,
  parsePptxFile,
  parseXlsxFile,
  parseCsvFile,
  parseJsonFile,
  parseRtfFile,
  parseHtmlFile,
};
