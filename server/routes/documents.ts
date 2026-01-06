import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import db from '../db/index.js';
import { processDocument } from '../services/documentProcessor.js';
import { searchRelevantChunks } from '../services/vectorSearchService.js';

const router = Router();

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'image/jpeg',
  'image/png',
];

const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800', 10); // 50MB default

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const chatId = req.params.chatId;
    const uploadDir = path.join(process.cwd(), 'uploads', chatId);

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const documentId = uuidv4();
    const ext = path.extname(file.originalname);
    req.body.documentId = documentId; // Store for later use
    cb(null, `${documentId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// Types
interface Document {
  id: string;
  chatId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  errorMessage?: string;
  createdAt: number;
  processedAt?: number;
  nodeId?: string;
}

// POST /api/documents/upload/:chatId
router.post('/upload/:chatId', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const chatId = req.params.chatId;
    const nodeId = req.body.nodeId || null; // Optional node association
    const embeddingConfig = req.body.embeddingConfig ? JSON.parse(req.body.embeddingConfig) : undefined;
    const documentId = req.body.documentId;
    const now = Date.now();

    // Verify chat exists
    const chat = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId);
    if (!chat) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Chat not found' });
    }

    // If nodeId provided, verify it exists and belongs to chat
    if (nodeId) {
      const node = db.prepare('SELECT id FROM conversation_nodes WHERE id = ? AND chat_id = ?').get(nodeId, chatId);
      if (!node) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Node not found or does not belong to chat' });
      }
    }

    // Insert document record
    db.prepare(`
      INSERT INTO documents (id, chat_id, file_name, mime_type, file_size, file_path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(documentId, chatId, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, now);

    // Create association
    console.log(`[UPLOAD DEBUG] Saving document ${documentId} with nodeId: ${nodeId || 'NULL'}`);
    db.prepare(`
      INSERT INTO document_associations (document_id, chat_id, node_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(documentId, chatId, nodeId, now);

    const document: Document = {
      id: documentId,
      chatId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      filePath: req.file.path,
      status: 'pending',
      createdAt: now,
      nodeId: nodeId || undefined
    };

    // Trigger background processing (fire and forget)
    processDocument(documentId, embeddingConfig).catch((err) => {
      console.error(`Background processing failed for ${documentId}:`, err);
    });

    res.json({ document });
  } catch (error) {
    console.error('Error uploading document:', error);

    // Clean up file if it was uploaded
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/chat/:chatId
router.get('/chat/:chatId', (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId;
    const nodeId = req.query.nodeId as string | undefined;

    let query = `
      SELECT d.id, d.chat_id as chatId, d.file_name as fileName,
             d.mime_type as mimeType, d.file_size as fileSize, d.file_path as filePath,
             d.status, d.error_message as errorMessage,
             d.created_at as createdAt, d.processed_at as processedAt,
             da.node_id as nodeId
      FROM documents d
      INNER JOIN document_associations da ON d.id = da.document_id
      WHERE da.chat_id = ?
    `;

    const params: any[] = [chatId];

    if (nodeId) {
      query += ' AND da.node_id = ?';
      params.push(nodeId);
    }
    // If no nodeId specified, return ALL documents for this chat

    query += ' ORDER BY d.created_at DESC';

    const documents = db.prepare(query).all(...params);

    res.json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// DELETE /api/documents/:documentId
router.delete('/:documentId', (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId;

    // Get document info to delete file
    const doc = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(documentId) as { file_path: string } | undefined;

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from database (associations and chunks will cascade)
    db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);

    // Delete file from disk
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// POST /api/documents/:documentId/process - Manually trigger processing
router.post('/:documentId/process', async (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId;
    const embeddingConfig = req.body.embeddingConfig;

    // Verify document exists
    const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Trigger processing
    await processDocument(documentId, embeddingConfig);

    res.json({ success: true, message: 'Document processed successfully' });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({
      error: 'Failed to process document',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/documents/search - Search for relevant chunks
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { chatId, query, topK, maxTokens, minScore, embeddingConfig, nodeId } = req.body;

    if (!chatId || !query) {
      return res.status(400).json({ error: 'chatId and query are required' });
    }

    // Only pass options that are actually provided (avoid undefined overriding defaults)
    const searchOptions: any = {};
    if (topK !== undefined) searchOptions.topK = topK;
    if (maxTokens !== undefined) searchOptions.maxTokens = maxTokens;
    if (minScore !== undefined) searchOptions.minScore = minScore;

    const results = await searchRelevantChunks(chatId, query, searchOptions, embeddingConfig, nodeId);

    res.json({ results, count: results.length });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// GET /api/documents/:documentId/chunks - Get chunks for a document
router.get('/:documentId/chunks', (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId;

    const chunks = db.prepare(`
      SELECT id, chunk_index as chunkIndex, content, token_count as tokenCount,
             page_number as pageNumber, created_at as createdAt
      FROM document_chunks
      WHERE document_id = ?
      ORDER BY chunk_index
    `).all(documentId);

    res.json({ chunks });
  } catch (error) {
    console.error('Error fetching document chunks:', error);
    res.status(500).json({ error: 'Failed to fetch document chunks' });
  }
});

// PATCH /api/documents/:documentId/associate - Update document's node association
router.patch('/:documentId/associate', (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId;
    const { nodeId } = req.body;

    // Verify document exists
    const doc = db.prepare('SELECT chat_id FROM documents WHERE id = ?').get(documentId) as { chat_id: string } | undefined;
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If nodeId provided, verify it exists and belongs to chat
    if (nodeId) {
      const node = db.prepare('SELECT id FROM conversation_nodes WHERE id = ? AND chat_id = ?').get(nodeId, doc.chat_id);
      if (!node) {
        return res.status(404).json({ error: 'Node not found or does not belong to chat' });
      }
    }

    console.log(`[REASSOCIATE DEBUG] Moving document ${documentId} to nodeId: ${nodeId || 'NULL'}`);

    // Update the document association
    db.prepare(`
      UPDATE document_associations
      SET node_id = ?
      WHERE document_id = ?
    `).run(nodeId, documentId);

    res.json({ success: true, documentId, nodeId });
  } catch (error) {
    console.error('Error updating document association:', error);
    res.status(500).json({ error: 'Failed to update document association' });
  }
});

// GET /api/documents/:documentId/download
router.get('/:documentId/download', (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId;

    const doc = db.prepare('SELECT file_path, file_name, mime_type FROM documents WHERE id = ?').get(documentId) as
      { file_path: string; file_name: string; mime_type: string } | undefined;

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
    res.sendFile(path.resolve(doc.file_path));
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

export default router;
