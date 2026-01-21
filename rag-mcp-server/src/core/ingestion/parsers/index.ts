/**
 * Parser factory - routes files to appropriate parsers
 */

import { extname } from 'path';
import { stat } from 'fs/promises';
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

// Parser configuration
const PARSER_TIMEOUT_MS = 60000; // 60 second timeout per file
const MAX_FILE_SIZE_MB = 100; // 100MB max file size

/**
 * Wrap a parser function with timeout protection
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  filepath: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Parser timeout after ${timeoutMs}ms for file: ${filepath}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

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
 * Includes timeout protection and file size validation
 */
export async function parseDocument(filepath: string): Promise<ParsedDocument> {
  const fileType = getFileType(filepath);

  if (!fileType) {
    throw new Error(`Unsupported file type: ${extname(filepath)}`);
  }

  // Check file size before parsing
  const fileStat = await stat(filepath);
  const fileSizeMB = fileStat.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB exceeds ${MAX_FILE_SIZE_MB}MB limit`);
  }

  // Get the parser promise based on file type
  let parserPromise: Promise<ParsedDocument>;

  switch (fileType) {
    case 'txt':
      parserPromise = parseTextFile(filepath);
      break;
    case 'md':
      parserPromise = parseMarkdownFile(filepath);
      break;
    case 'docx':
      parserPromise = parseDocxFile(filepath);
      break;
    case 'pdf':
      parserPromise = parsePdfFile(filepath);
      break;
    case 'pptx':
      parserPromise = parsePptxFile(filepath);
      break;
    case 'xlsx':
      parserPromise = parseXlsxFile(filepath);
      break;
    case 'csv':
      parserPromise = parseCsvFile(filepath);
      break;
    case 'json':
      parserPromise = parseJsonFile(filepath);
      break;
    case 'rtf':
      parserPromise = parseRtfFile(filepath);
      break;
    case 'html':
      parserPromise = parseHtmlFile(filepath);
      break;
    default:
      throw new Error(`Parser not implemented for file type: ${fileType}`);
  }

  // Wrap with timeout protection
  return withTimeout(parserPromise, PARSER_TIMEOUT_MS, filepath);
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
