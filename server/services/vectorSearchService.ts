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
 * Get all node IDs in the path from root to the given node (including the node itself)
 * Walks up the tree through parent relationships
 */
function getPathNodeIds(chatId: string, nodeId: string): string[] {
  const pathNodes: string[] = [];
  const visited = new Set<string>();
  const queue = [nodeId];

  // BFS to collect all ancestors (handles multiple parents from merges)
  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    pathNodes.push(currentId);

    // Get parent IDs for this node from node_parents table
    const parents = db.prepare(`
      SELECT parent_id FROM node_parents
      WHERE node_id = ?
    `).all(currentId) as Array<{ parent_id: string }>;

    parents.forEach(({ parent_id }) => {
      if (!visited.has(parent_id)) {
        queue.push(parent_id);
      }
    });
  }

  return pathNodes;
}

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
 * Supports both conversation-level and node-level documents with path inheritance
 */
export async function searchRelevantChunks(
  chatId: string,
  query: string,
  options: SearchOptions = {},
  embeddingConfig?: EmbeddingConfig,
  nodeId?: string
): Promise<SearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log(`Searching for: "${query}" (chatId: ${chatId}, nodeId: ${nodeId || 'none'})`);

  // Generate query embedding
  const queryEmbedding = await embeddingService.generateEmbedding(query, embeddingConfig);

  // Get applicable document IDs
  let documentIds: Array<{ document_id: string }>;

  if (nodeId) {
    // Get all nodes in the path (current node + all ancestors)
    const pathNodeIds = getPathNodeIds(chatId, nodeId);
    console.log(`[RAG DEBUG] Current node: ${nodeId}`);
    console.log(`[RAG DEBUG] Path nodes: [${pathNodeIds.join(', ')}]`);

    // Get documents from all nodes in path (node-scoped only)
    const placeholders = pathNodeIds.map(() => '?').join(',');
    const query = `
      SELECT DISTINCT da.document_id, da.node_id, d.file_name
      FROM document_associations da
      JOIN documents d ON da.document_id = d.id
      WHERE da.chat_id = ? AND da.node_id IN (${placeholders})
    `;
    const docsWithNodes = db.prepare(query).all(chatId, ...pathNodeIds) as Array<{
      document_id: string;
      node_id: string;
      file_name: string
    }>;

    console.log(`[RAG DEBUG] Found documents:`, JSON.stringify(docsWithNodes, null, 2));

    documentIds = docsWithNodes.map(d => ({ document_id: d.document_id }));
  } else {
    // No active node - no documents available (all documents are node-scoped)
    documentIds = [];
  }

  if (documentIds.length === 0) {
    console.log('No documents found for this chat/node');
    return [];
  }

  const docIdList = documentIds.map((d) => d.document_id);
  console.log(`Searching ${docIdList.length} documents`);

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
