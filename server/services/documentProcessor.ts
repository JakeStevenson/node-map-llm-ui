import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { extractContent } from './extractors/index.js';
import { chunkText } from './chunkingService.js';
import embeddingService from './embeddingService.js';

/**
 * Process a document: extract text, chunk it, and store chunks
 */
export async function processDocument(documentId: string): Promise<void> {
  try {
    // Get document metadata
    const doc = db.prepare(`
      SELECT id, file_path, mime_type
      FROM documents
      WHERE id = ?
    `).get(documentId) as { id: string; file_path: string; mime_type: string } | undefined;

    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    // Update status to processing
    db.prepare(`
      UPDATE documents
      SET status = 'processing'
      WHERE id = ?
    `).run(documentId);

    console.log(`Processing document ${documentId} (${doc.mime_type})`);

    // Extract text content
    const extracted = await extractContent(doc.file_path, doc.mime_type);

    if (!extracted.text || extracted.text.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    console.log(`Extracted ${extracted.text.length} characters from ${documentId}`);

    // Chunk the text
    const chunks = chunkText(extracted.text, {
      maxTokens: 500,
      overlapTokens: 100,
    });

    console.log(`Created ${chunks.length} chunks for ${documentId}`);

    // Generate embeddings for all chunks
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await embeddingService.generateBatch(chunkTexts);

    console.log(`Generated ${embeddings.length} embeddings`);

    // Store chunks and embeddings in database
    const now = Date.now();
    const insertChunk = db.prepare(`
      INSERT INTO document_chunks (id, document_id, chunk_index, content, token_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertEmbedding = db.prepare(`
      INSERT INTO document_embeddings (chunk_id, embedding, created_at)
      VALUES (?, ?, ?)
    `);

    const transaction = db.transaction((chunksData: typeof chunks, embeddingsData: Float32Array[]) => {
      for (let i = 0; i < chunksData.length; i++) {
        const chunk = chunksData[i];
        const embedding = embeddingsData[i];
        const chunkId = uuidv4();

        // Insert chunk
        insertChunk.run(
          chunkId,
          documentId,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount,
          now
        );

        // Insert embedding
        const embeddingBuffer = Buffer.from(embedding.buffer);
        insertEmbedding.run(chunkId, embeddingBuffer, now);
      }
    });

    transaction(chunks, embeddings);

    // Update document status to ready
    db.prepare(`
      UPDATE documents
      SET status = 'ready', processed_at = ?
      WHERE id = ?
    `).run(now, documentId);

    console.log(`Successfully processed document ${documentId}`);
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);

    // Update document status to failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    db.prepare(`
      UPDATE documents
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `).run(errorMessage, documentId);

    throw error;
  }
}
