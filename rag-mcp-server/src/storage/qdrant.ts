/**
 * Qdrant vector database client
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/index.js';
import type { SearchResult, SearchFilters, DocumentSummary, ChunkMetadata } from '../types/index.js';

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (client) return client;

  client = new QdrantClient({
    url: config.qdrant.url,
  });

  return client;
}

export async function ensureCollection(): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = config.qdrant.collectionName;

  try {
    await qdrant.getCollection(collectionName);
  } catch {
    // Collection doesn't exist, create it
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: config.qdrant.vectorSize,
        distance: 'Cosine',
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Create payload indexes for filtering
    await qdrant.createPayloadIndex(collectionName, {
      field_name: 'document_id',
      field_schema: 'keyword',
    });

    await qdrant.createPayloadIndex(collectionName, {
      field_name: 'file_type',
      field_schema: 'keyword',
    });
  }
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    chunk_id: string;
    document_id: string;
    content: string;
    chunk_index: number;
    filename: string;
    filepath: string;
    file_type: string;
    metadata: ChunkMetadata;
  };
}

export async function upsertVectors(points: VectorPoint[]): Promise<void> {
  const qdrant = getQdrantClient();

  await qdrant.upsert(config.qdrant.collectionName, {
    wait: true,
    points: points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

export async function deleteVectorsByDocumentId(documentId: string): Promise<void> {
  const qdrant = getQdrantClient();

  await qdrant.delete(config.qdrant.collectionName, {
    wait: true,
    filter: {
      must: [
        {
          key: 'document_id',
          match: { value: documentId },
        },
      ],
    },
  });
}

export async function searchVectors(
  queryVector: number[],
  limit: number,
  threshold: number,
  filters?: SearchFilters
): Promise<SearchResult[]> {
  const qdrant = getQdrantClient();

  // Build filter conditions
  const must: Array<{
    key: string;
    match?: { value: string } | { any: string[] };
  }> = [];

  if (filters?.documentIds && filters.documentIds.length > 0) {
    must.push({
      key: 'document_id',
      match: { any: filters.documentIds },
    });
  }

  if (filters?.fileTypes && filters.fileTypes.length > 0) {
    must.push({
      key: 'file_type',
      match: { any: filters.fileTypes },
    });
  }

  const searchParams: Parameters<typeof qdrant.search>[1] = {
    vector: queryVector,
    limit,
    score_threshold: threshold,
    with_payload: true,
    with_vector: false,
  };

  if (must.length > 0) {
    searchParams.filter = { must };
  }

  const results = await qdrant.search(config.qdrant.collectionName, searchParams);

  return results.map(result => {
    const payload = result.payload as VectorPoint['payload'];
    return {
      chunkId: payload.chunk_id,
      documentId: payload.document_id,
      content: payload.content,
      score: result.score,
      document: {
        id: payload.document_id,
        filename: payload.filename,
        filepath: payload.filepath,
        fileType: payload.file_type,
      } as DocumentSummary,
      metadata: payload.metadata,
    };
  });
}

export async function getCollectionInfo(): Promise<{
  vectorCount: number;
  status: string;
}> {
  const qdrant = getQdrantClient();

  try {
    const info = await qdrant.getCollection(config.qdrant.collectionName);
    return {
      vectorCount: info.points_count ?? 0,
      status: info.status,
    };
  } catch {
    return {
      vectorCount: 0,
      status: 'not_initialized',
    };
  }
}
