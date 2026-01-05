import { Router, Request, Response } from 'express';
import db from '../db/index.js';

const router = Router();

// Types matching frontend
interface SearchMetadata {
  query: string;
  results: Array<{ title: string; url: string; snippet: string; source?: string }>;
  timestamp: number;
  provider: 'searxng';
}

interface ConversationNode {
  id: string;
  parentIds: string[];
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  treeId: string;
  branchSummaries?: Array<{ nodeId: string; summary: string }>;
  searchMetadata?: SearchMetadata;
  isSummary?: boolean;
  summarizedNodeIds?: string[];
}

interface DbChatRow {
  id: string;
  name: string;
  activeNodeId: string | null;
  systemPrompt: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DbNodeRow {
  id: string;
  role: string;
  content: string;
  treeId: string;
  createdAt: number;
  searchMetadata: string | null;
  isSummary: number;
  summarizedNodeIds: string | null;
}

// Helper to generate IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// GET /api/chats - List all chats (without nodes, for sidebar)
router.get('/', (_req: Request, res: Response) => {
  try {
    const chats = db.prepare(`
      SELECT c.id, c.name, c.created_at as createdAt, c.updated_at as updatedAt,
             COUNT(n.id) as nodeCount
      FROM chats c
      LEFT JOIN conversation_nodes n ON n.chat_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `).all();

    res.json({ chats });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// GET /api/chats/:id - Get single chat with all nodes
router.get('/:id', (req: Request, res: Response) => {
  try {
    const chat = db.prepare(`
      SELECT id, name, active_node_id as activeNodeId,
             system_prompt as systemPrompt,
             created_at as createdAt, updated_at as updatedAt
      FROM chats WHERE id = ?
    `).get(req.params.id) as DbChatRow | undefined;

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Get nodes
    const nodes = db.prepare(`
      SELECT id, role, content, tree_id as treeId, created_at as createdAt,
             search_metadata as searchMetadata, is_summary as isSummary,
             summarized_node_ids as summarizedNodeIds
      FROM conversation_nodes WHERE chat_id = ?
      ORDER BY created_at
    `).all(req.params.id) as DbNodeRow[];

    // Get parent relationships
    const parents = db.prepare(`
      SELECT node_id, parent_id FROM node_parents
      WHERE node_id IN (SELECT id FROM conversation_nodes WHERE chat_id = ?)
      ORDER BY position
    `).all(req.params.id) as Array<{ node_id: string; parent_id: string }>;

    // Build parentIds arrays
    const parentMap = new Map<string, string[]>();
    for (const p of parents) {
      if (!parentMap.has(p.node_id)) {
        parentMap.set(p.node_id, []);
      }
      parentMap.get(p.node_id)!.push(p.parent_id);
    }

    // Get branch summaries
    const summaries = db.prepare(`
      SELECT node_id, source_node_id as nodeId, summary
      FROM branch_summaries
      WHERE node_id IN (SELECT id FROM conversation_nodes WHERE chat_id = ?)
    `).all(req.params.id) as Array<{ node_id: string; nodeId: string; summary: string }>;

    const summaryMap = new Map<string, Array<{ nodeId: string; summary: string }>>();
    for (const s of summaries) {
      if (!summaryMap.has(s.node_id)) {
        summaryMap.set(s.node_id, []);
      }
      summaryMap.get(s.node_id)!.push({ nodeId: s.nodeId, summary: s.summary });
    }

    // Assemble nodes with parentIds, branchSummaries, searchMetadata, and summary fields
    const assembledNodes: ConversationNode[] = nodes.map((n) => ({
      id: n.id,
      role: n.role as 'user' | 'assistant',
      content: n.content,
      treeId: n.treeId,
      createdAt: n.createdAt,
      parentIds: parentMap.get(n.id) || [],
      branchSummaries: summaryMap.get(n.id),
      searchMetadata: n.searchMetadata ? JSON.parse(n.searchMetadata) : undefined,
      isSummary: n.isSummary === 1,
      summarizedNodeIds: n.summarizedNodeIds ? JSON.parse(n.summarizedNodeIds) : undefined,
    }));

    res.json({
      id: chat.id,
      name: chat.name,
      activeNodeId: chat.activeNodeId,
      systemPrompt: chat.systemPrompt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      nodes: assembledNodes,
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// POST /api/chats - Create new chat
router.post('/', (req: Request, res: Response) => {
  try {
    const { name = 'Untitled', systemPrompt = null } = req.body;
    const id = generateId();
    const now = Date.now();

    db.prepare(`
      INSERT INTO chats (id, name, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, systemPrompt, now, now);

    res.status(201).json({
      id,
      name,
      activeNodeId: null,
      systemPrompt,
      createdAt: now,
      updatedAt: now,
      nodes: [],
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// PUT /api/chats/:id - Update chat (name, activeNodeId, systemPrompt)
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, activeNodeId, systemPrompt } = req.body;
    const now = Date.now();

    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (activeNodeId !== undefined) {
      updates.push('active_node_id = ?');
      params.push(activeNodeId);
    }
    if (systemPrompt !== undefined) {
      updates.push('system_prompt = ?');
      params.push(systemPrompt);
    }

    params.push(req.params.id);

    const result = db.prepare(`
      UPDATE chats SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

// DELETE /api/chats/:id - Delete chat and all nodes (cascade)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM chats WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// POST /api/chats/:chatId/nodes - Add node to chat
router.post('/:chatId/nodes', (req: Request, res: Response) => {
  try {
    const { id: providedId, role, content, parentIds = [], branchSummaries, treeId = 'main', searchMetadata, isSummary, summarizedNodeIds } = req.body;
    const chatId = req.params.chatId;
    // Use provided ID if given (allows frontend to maintain ID consistency)
    const id = providedId || generateId();
    const now = Date.now();

    // Verify chat exists
    const chat = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const insertNode = db.transaction(() => {
      // Insert node
      db.prepare(`
        INSERT INTO conversation_nodes (id, chat_id, role, content, tree_id, created_at, search_metadata, is_summary, summarized_node_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        chatId,
        role,
        content,
        treeId,
        now,
        searchMetadata ? JSON.stringify(searchMetadata) : null,
        isSummary ? 1 : 0,
        summarizedNodeIds ? JSON.stringify(summarizedNodeIds) : null
      );

      // Insert parent relationships
      for (let i = 0; i < parentIds.length; i++) {
        db.prepare(`
          INSERT INTO node_parents (node_id, parent_id, position)
          VALUES (?, ?, ?)
        `).run(id, parentIds[i], i);
      }

      // Insert branch summaries if present
      if (branchSummaries && Array.isArray(branchSummaries)) {
        for (const bs of branchSummaries) {
          db.prepare(`
            INSERT INTO branch_summaries (node_id, source_node_id, summary)
            VALUES (?, ?, ?)
          `).run(id, bs.nodeId, bs.summary);
        }
      }

      // Update chat timestamp
      db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);
    });

    insertNode();

    const node: ConversationNode = {
      id,
      role,
      content,
      parentIds,
      createdAt: now,
      treeId,
      branchSummaries,
      searchMetadata,
      isSummary,
      summarizedNodeIds,
    };

    res.status(201).json(node);
  } catch (error) {
    console.error('Error creating node:', error);
    res.status(500).json({ error: 'Failed to create node' });
  }
});

// PUT /api/chats/:chatId/nodes/:nodeId - Update node content
router.put('/:chatId/nodes/:nodeId', (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const { chatId, nodeId } = req.params;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Verify node exists and belongs to this chat
    const node = db.prepare(`
      SELECT id FROM conversation_nodes WHERE id = ? AND chat_id = ?
    `).get(nodeId, chatId);

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Update node content
    const now = Date.now();
    db.prepare(`
      UPDATE conversation_nodes SET content = ? WHERE id = ?
    `).run(content, nodeId);

    // Update chat timestamp
    db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating node:', error);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

// DELETE /api/nodes/:id - Delete a specific node
router.delete('/nodes/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM conversation_nodes WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting node:', error);
    res.status(500).json({ error: 'Failed to delete node' });
  }
});

// DELETE /api/chats/:chatId/nodes - Clear all nodes from a chat
router.delete('/:chatId/nodes', (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId;

    // Verify chat exists
    const chat = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const clearNodes = db.transaction(() => {
      // Delete all nodes for this chat (cascade will handle node_parents and branch_summaries)
      db.prepare('DELETE FROM conversation_nodes WHERE chat_id = ?').run(chatId);

      // Reset active node and update timestamp
      const now = Date.now();
      db.prepare('UPDATE chats SET active_node_id = NULL, updated_at = ? WHERE id = ?').run(now, chatId);
    });

    clearNodes();

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat nodes:', error);
    res.status(500).json({ error: 'Failed to clear chat nodes' });
  }
});

export default router;
