/**
 * SQLite storage for document metadata
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config/index.js';
import type { Document, DocumentStatus, FileType, DocumentMetadata } from '../types/index.js';
import { safeJsonParse } from '../utils/security.js';

let db: Database.Database | null = null;

const SCHEMA = `
-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  document_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  metadata TEXT NOT NULL DEFAULT '{}',
  summary TEXT,
  tags TEXT DEFAULT '[]',
  collection_id TEXT,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
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

-- Query logs table for analytics
CREATE TABLE IF NOT EXISTS query_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  query_type TEXT NOT NULL DEFAULT 'search',
  source TEXT DEFAULT 'api',
  result_count INTEGER DEFAULT 0,
  top_score REAL,
  latency_ms INTEGER,
  user_id TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_filepath ON documents(filepath);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chunk_index ON chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_query_logs_query_type ON query_logs(query_type);
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

  // Run migrations for existing databases
  runMigrations(db);

  return db;
}

function runMigrations(database: Database.Database): void {
  // Check if columns exist in documents table
  const columns = database.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
  const columnNames = columns.map(c => c.name);

  // Add summary column if it doesn't exist
  if (!columnNames.includes('summary')) {
    database.exec('ALTER TABLE documents ADD COLUMN summary TEXT');
  }

  // Add tags column if it doesn't exist
  if (!columnNames.includes('tags')) {
    database.exec("ALTER TABLE documents ADD COLUMN tags TEXT DEFAULT '[]'");
  }

  // Add collection_id column if it doesn't exist
  if (!columnNames.includes('collection_id')) {
    database.exec('ALTER TABLE documents ADD COLUMN collection_id TEXT');
  }

  // Check if collections table exists
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collections'").get();
  if (!tables) {
    database.exec(`
      CREATE TABLE collections (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#6366f1',
        document_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Check if query_logs table exists
  const queryLogsTable = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='query_logs'").get();
  if (!queryLogsTable) {
    database.exec(`
      CREATE TABLE query_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        query_type TEXT NOT NULL DEFAULT 'search',
        source TEXT DEFAULT 'api',
        result_count INTEGER DEFAULT 0,
        top_score REAL,
        latency_ms INTEGER,
        user_id TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_query_logs_query_type ON query_logs(query_type);
    `);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Execute a function within a database transaction
 * Rolls back on error and re-throws
 */
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase();
  const transaction = database.transaction(fn);
  return transaction();
}

/**
 * Get documents by multiple paths in a single query (batch query)
 * Returns a Map of filepath -> Document for quick lookup
 */
export function getDocumentsByPaths(filepaths: string[]): Map<string, Document> {
  if (filepaths.length === 0) {
    return new Map();
  }

  const database = getDatabase();
  const placeholders = filepaths.map(() => '?').join(', ');
  const rows = database.prepare(
    `SELECT * FROM documents WHERE filepath IN (${placeholders})`
  ).all(...filepaths) as DocumentRow[];

  const result = new Map<string, Document>();
  for (const row of rows) {
    result.set(row.filepath, rowToDocument(row));
  }
  return result;
}

// Document operations
export function insertDocument(doc: Omit<Document, 'createdAt' | 'updatedAt'>): Document {
  const database = getDatabase();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO documents (id, filename, filepath, file_type, file_size, mime_type, checksum, status, chunk_count, metadata, indexed_at, created_at, updated_at, summary, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    now,
    doc.summary ?? null,
    JSON.stringify(doc.tags ?? [])
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
  if (updates.summary !== undefined) {
    fields.push('summary = ?');
    values.push(updates.summary);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
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
  summary: string | null;
  tags: string;
  collection_id: string | null;
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
    // Use safe JSON parsing with fallback to empty object
    metadata: safeJsonParse<DocumentMetadata>(row.metadata, {}),
    summary: row.summary ?? undefined,
    // Use safe JSON parsing with fallback to undefined
    tags: row.tags ? safeJsonParse<string[]>(row.tags, []) : undefined,
    collectionId: row.collection_id ?? undefined,
  };
}

// Collection types and operations
export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color,
    documentCount: row.document_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function insertCollection(collection: Omit<Collection, 'documentCount' | 'createdAt' | 'updatedAt'>): Collection {
  const database = getDatabase();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO collections (id, name, description, color, document_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `);

  stmt.run(collection.id, collection.name, collection.description ?? null, collection.color, now, now);

  return {
    ...collection,
    documentCount: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function updateCollection(id: string, updates: Partial<Pick<Collection, 'name' | 'description' | 'color'>>): void {
  const database = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = database.prepare(`UPDATE collections SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function getCollectionById(id: string): Collection | null {
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow | undefined;
  return row ? rowToCollection(row) : null;
}

export function getCollectionByName(name: string): Collection | null {
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM collections WHERE name = ?').get(name) as CollectionRow | undefined;
  return row ? rowToCollection(row) : null;
}

export function getAllCollections(): Collection[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT * FROM collections ORDER BY created_at DESC').all() as CollectionRow[];
  return rows.map(rowToCollection);
}

export function deleteCollection(id: string): boolean {
  const database = getDatabase();

  // First, unassign all documents from this collection
  database.prepare('UPDATE documents SET collection_id = NULL WHERE collection_id = ?').run(id);

  const result = database.prepare('DELETE FROM collections WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateCollectionDocumentCount(collectionId: string): void {
  const database = getDatabase();
  const count = database.prepare(
    "SELECT COUNT(*) as count FROM documents WHERE collection_id = ? AND status = 'indexed'"
  ).get(collectionId) as { count: number };

  database.prepare('UPDATE collections SET document_count = ?, updated_at = ? WHERE id = ?')
    .run(count.count, new Date().toISOString(), collectionId);
}

export function assignDocumentToCollection(documentId: string, collectionId: string | null): void {
  const database = getDatabase();
  const doc = getDocumentById(documentId);
  if (!doc) return;

  const oldCollectionId = doc.collectionId;

  database.prepare('UPDATE documents SET collection_id = ?, updated_at = ? WHERE id = ?')
    .run(collectionId, new Date().toISOString(), documentId);

  // Update counts for both old and new collections
  if (oldCollectionId) {
    updateCollectionDocumentCount(oldCollectionId);
  }
  if (collectionId) {
    updateCollectionDocumentCount(collectionId);
  }
}

export function getDocumentsByCollectionId(collectionId: string): Document[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT * FROM documents WHERE collection_id = ? ORDER BY created_at DESC').all(collectionId) as DocumentRow[];
  return rows.map(rowToDocument);
}

// Query log types and operations
export interface QueryLog {
  id: number;
  query: string;
  queryType: 'search' | 'ask';
  source: string;
  resultCount: number;
  topScore: number | null;
  latencyMs: number | null;
  userId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface QueryLogRow {
  id: number;
  query: string;
  query_type: string;
  source: string;
  result_count: number;
  top_score: number | null;
  latency_ms: number | null;
  user_id: string | null;
  metadata: string;
  created_at: string;
}

function rowToQueryLog(row: QueryLogRow): QueryLog {
  return {
    id: row.id,
    query: row.query,
    queryType: row.query_type as 'search' | 'ask',
    source: row.source,
    resultCount: row.result_count,
    topScore: row.top_score,
    latencyMs: row.latency_ms,
    userId: row.user_id ?? undefined,
    metadata: safeJsonParse<Record<string, unknown>>(row.metadata, {}),
    createdAt: new Date(row.created_at),
  };
}

export function insertQueryLog(log: Omit<QueryLog, 'id' | 'createdAt'>): number {
  const database = getDatabase();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO query_logs (query, query_type, source, result_count, top_score, latency_ms, user_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    log.query,
    log.queryType,
    log.source,
    log.resultCount,
    log.topScore ?? null,
    log.latencyMs ?? null,
    log.userId ?? null,
    JSON.stringify(log.metadata),
    now
  );

  return result.lastInsertRowid as number;
}

export function getRecentQueryLogs(limit: number = 100, queryType?: 'search' | 'ask'): QueryLog[] {
  const database = getDatabase();
  let sql = 'SELECT * FROM query_logs';
  const params: unknown[] = [];

  if (queryType) {
    sql += ' WHERE query_type = ?';
    params.push(queryType);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = database.prepare(sql).all(...params) as QueryLogRow[];
  return rows.map(rowToQueryLog);
}

export interface QueryStats {
  totalQueries: number;
  searchQueries: number;
  askQueries: number;
  avgLatencyMs: number;
  avgResultCount: number;
  queriesLast24h: number;
  queriesLast7d: number;
}

export function getQueryStats(): QueryStats {
  const database = getDatabase();

  const total = database.prepare('SELECT COUNT(*) as count FROM query_logs').get() as { count: number };
  const search = database.prepare("SELECT COUNT(*) as count FROM query_logs WHERE query_type = 'search'").get() as { count: number };
  const ask = database.prepare("SELECT COUNT(*) as count FROM query_logs WHERE query_type = 'ask'").get() as { count: number };

  const avgStats = database.prepare(`
    SELECT AVG(latency_ms) as avg_latency, AVG(result_count) as avg_results
    FROM query_logs WHERE latency_ms IS NOT NULL
  `).get() as { avg_latency: number | null; avg_results: number | null };

  const last24h = database.prepare(`
    SELECT COUNT(*) as count FROM query_logs
    WHERE created_at >= datetime('now', '-1 day')
  `).get() as { count: number };

  const last7d = database.prepare(`
    SELECT COUNT(*) as count FROM query_logs
    WHERE created_at >= datetime('now', '-7 days')
  `).get() as { count: number };

  return {
    totalQueries: total.count,
    searchQueries: search.count,
    askQueries: ask.count,
    avgLatencyMs: Math.round(avgStats.avg_latency ?? 0),
    avgResultCount: Math.round((avgStats.avg_results ?? 0) * 10) / 10,
    queriesLast24h: last24h.count,
    queriesLast7d: last7d.count,
  };
}

export interface QueryTrend {
  date: string;
  searchCount: number;
  askCount: number;
  totalCount: number;
}

export function getQueryTrends(days: number = 7): QueryTrend[] {
  const database = getDatabase();

  const rows = database.prepare(`
    SELECT
      date(created_at) as date,
      SUM(CASE WHEN query_type = 'search' THEN 1 ELSE 0 END) as search_count,
      SUM(CASE WHEN query_type = 'ask' THEN 1 ELSE 0 END) as ask_count,
      COUNT(*) as total_count
    FROM query_logs
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(days) as Array<{ date: string; search_count: number; ask_count: number; total_count: number }>;

  return rows.map(row => ({
    date: row.date,
    searchCount: row.search_count,
    askCount: row.ask_count,
    totalCount: row.total_count,
  }));
}

export interface TopQuery {
  query: string;
  count: number;
  avgLatencyMs: number;
  lastUsed: Date;
}

export function getTopQueries(limit: number = 10, queryType?: 'search' | 'ask'): TopQuery[] {
  const database = getDatabase();
  let sql = `
    SELECT
      query,
      COUNT(*) as count,
      AVG(latency_ms) as avg_latency,
      MAX(created_at) as last_used
    FROM query_logs
  `;
  const params: unknown[] = [];

  if (queryType) {
    sql += ' WHERE query_type = ?';
    params.push(queryType);
  }

  sql += ' GROUP BY query ORDER BY count DESC LIMIT ?';
  params.push(limit);

  const rows = database.prepare(sql).all(...params) as Array<{
    query: string;
    count: number;
    avg_latency: number | null;
    last_used: string;
  }>;

  return rows.map(row => ({
    query: row.query,
    count: row.count,
    avgLatencyMs: Math.round(row.avg_latency ?? 0),
    lastUsed: new Date(row.last_used),
  }));
}
