/**
 * SQLite storage for document metadata
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config/index.js';
import type { Document, DocumentStatus, FileType, DocumentMetadata } from '../types/index.js';

let db: Database.Database | null = null;

const SCHEMA = `
-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  indexed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}'
);

-- Chunks table
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_filepath ON documents(filepath);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chunk_index ON chunks(document_id, chunk_index);
`;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = config.sqlite.path;
  const dbDir = dirname(dbPath);

  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Document operations
export function insertDocument(doc: Omit<Document, 'createdAt' | 'updatedAt'>): Document {
  const database = getDatabase();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO documents (id, filename, filepath, file_type, file_size, mime_type, checksum, status, chunk_count, metadata, indexed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    doc.id,
    doc.filename,
    doc.filepath,
    doc.fileType,
    doc.fileSize,
    doc.mimeType,
    doc.checksum,
    doc.status,
    doc.chunkCount,
    JSON.stringify(doc.metadata),
    doc.indexedAt?.toISOString() ?? null,
    now,
    now
  );

  return {
    ...doc,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function updateDocument(id: string, updates: Partial<Document>): void {
  const database = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.chunkCount !== undefined) {
    fields.push('chunk_count = ?');
    values.push(updates.chunkCount);
  }
  if (updates.indexedAt !== undefined) {
    fields.push('indexed_at = ?');
    values.push(updates.indexedAt?.toISOString() ?? null);
  }
  if (updates.metadata !== undefined) {
    fields.push('metadata = ?');
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = database.prepare(`
    UPDATE documents SET ${fields.join(', ')} WHERE id = ?
  `);
  stmt.run(...values);
}

export function getDocumentById(id: string): Document | null {
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : null;
}

export function getDocumentByPath(filepath: string): Document | null {
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM documents WHERE filepath = ?').get(filepath) as DocumentRow | undefined;
  return row ? rowToDocument(row) : null;
}

export function getAllDocuments(): Document[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT * FROM documents ORDER BY created_at DESC').all() as DocumentRow[];
  return rows.map(rowToDocument);
}

export function deleteDocument(id: string): boolean {
  const database = getDatabase();
  const result = database.prepare('DELETE FROM documents WHERE id = ?').run(id);
  return result.changes > 0;
}

// Chunk operations
export interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
  token_count: number;
  metadata: string;
}

export function insertChunks(chunks: Array<{
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
}>): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    INSERT INTO chunks (id, document_id, content, chunk_index, start_offset, end_offset, token_count, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = database.transaction((items: typeof chunks) => {
    for (const chunk of items) {
      stmt.run(
        chunk.id,
        chunk.documentId,
        chunk.content,
        chunk.chunkIndex,
        chunk.startOffset,
        chunk.endOffset,
        chunk.tokenCount,
        JSON.stringify(chunk.metadata)
      );
    }
  });

  insertMany(chunks);
}

export function getChunksByDocumentId(documentId: string): ChunkRow[] {
  const database = getDatabase();
  return database.prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index').all(documentId) as ChunkRow[];
}

export function getChunkById(id: string): ChunkRow | null {
  const database = getDatabase();
  return database.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as ChunkRow | undefined ?? null;
}

export function deleteChunksByDocumentId(documentId: string): void {
  const database = getDatabase();
  database.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
}

// Helper types and functions
interface DocumentRow {
  id: string;
  filename: string;
  filepath: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  checksum: string;
  created_at: string;
  updated_at: string;
  indexed_at: string | null;
  status: string;
  chunk_count: number;
  metadata: string;
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    filename: row.filename,
    filepath: row.filepath,
    fileType: row.file_type as FileType,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    checksum: row.checksum,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    indexedAt: row.indexed_at ? new Date(row.indexed_at) : null,
    status: row.status as DocumentStatus,
    chunkCount: row.chunk_count,
    metadata: JSON.parse(row.metadata) as DocumentMetadata,
  };
}
