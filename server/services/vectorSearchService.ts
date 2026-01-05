import db from '../db/index.js';
import embeddingService, { type EmbeddingConfig } from './embeddingService.js';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  fileName: string;
  content: string;
  score: number;       // Cosine similarity (0-1)
  tokenCount: number;
  chunkIndex: number;
}

export interface SearchOptions {
  topK?: number;           // Number of results to return (default: 5)
  maxTokens?: number;      // Token budget for retrieved chunks (default: 2000)
  minScore?: number;       // Minimum similarity threshold (default: 0.5)
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  topK: 5,
  maxTokens: 2000,
  minScore: 0.3,  // Adjusted for typical embedding similarity scores
};

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for relevant document chunks based on query
 */
export async function searchRelevantChunks(
  chatId: string,
  query: string,
  options: SearchOptions = {},
  embeddingConfig?: EmbeddingConfig
): Promise<SearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log(`Searching for: "${query}" (chatId: ${chatId})`);

  // Generate query embedding
  const queryEmbedding = await embeddingService.generateEmbedding(query, embeddingConfig);

  // Get all document IDs for this chat (conversation-level only for now)
  const documentIds = db.prepare(`
    SELECT DISTINCT document_id
    FROM document_associations
    WHERE chat_id = ? AND node_id IS NULL
  `).all(chatId) as Array<{ document_id: string }>;

  if (documentIds.length === 0) {
    console.log('No documents found for this chat');
    return [];
  }

  const docIdList = documentIds.map((d) => d.document_id);

  // Get all chunks and embeddings for these documents
  const placeholders = docIdList.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      c.id as chunkId,
      c.document_id as documentId,
      c.chunk_index as chunkIndex,
      c.content,
      c.token_count as tokenCount,
      d.file_name as fileName,
      e.embedding
    FROM document_chunks c
    INNER JOIN documents d ON c.document_id = d.id
    INNER JOIN document_embeddings e ON c.id = e.chunk_id
    WHERE c.document_id IN (${placeholders})
    ORDER BY c.document_id, c.chunk_index
  `).all(...docIdList) as Array<{
    chunkId: string;
    documentId: string;
    chunkIndex: number;
    content: string;
    tokenCount: number;
    fileName: string;
    embedding: Buffer;
  }>;

  console.log(`Found ${rows.length} chunks to search`);

  // Calculate similarity scores
  const results: SearchResult[] = rows.map((row) => {
    const embedding = new Float32Array(row.embedding.buffer);
    const score = cosineSimilarity(queryEmbedding, embedding);

    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      fileName: row.fileName,
      content: row.content,
      score,
      tokenCount: row.tokenCount,
      chunkIndex: row.chunkIndex,
    };
  });

  // Filter by minimum score
  const filtered = results.filter((r) => r.score >= opts.minScore);

  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);

  // Apply top-k limit and token budget
  const topResults: SearchResult[] = [];
  let totalTokens = 0;

  for (const result of filtered) {
    if (topResults.length >= opts.topK) {
      break;
    }

    if (totalTokens + result.tokenCount <= opts.maxTokens) {
      topResults.push(result);
      totalTokens += result.tokenCount;
    }
  }

  console.log(`Returning ${topResults.length} results (${totalTokens} tokens)`);

  return topResults;
}
