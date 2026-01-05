import { ConversationNode, BranchSummary, SearchMetadata } from '../types';

const API_BASE = '/api';

// Types for API responses
export interface ChatSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
}

export interface ChatDetail {
  id: string;
  name: string;
  activeNodeId: string | null;
  createdAt: number;
  updatedAt: number;
  nodes: ConversationNode[];
}

export interface CreateNodeRequest {
  id?: string;  // Optional - if provided, server will use this ID
  role: 'user' | 'assistant';
  content: string;
  parentIds: string[];
  treeId?: string;
  branchSummaries?: BranchSummary[];
  searchMetadata?: SearchMetadata;
  isSummary?: boolean;
  summarizedNodeIds?: string[];
}

// Fetch all chats (lightweight list without nodes)
export async function fetchChats(): Promise<ChatSummary[]> {
  const res = await fetch(`${API_BASE}/chats`);
  if (!res.ok) {
    throw new Error(`Failed to fetch chats: ${res.status}`);
  }
  const data = await res.json();
  return data.chats;
}

// Fetch a single chat with all its nodes
export async function fetchChat(id: string): Promise<ChatDetail> {
  const res = await fetch(`${API_BASE}/chats/${id}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Chat not found');
    }
    throw new Error(`Failed to fetch chat: ${res.status}`);
  }
  return res.json();
}

// Create a new chat
export async function createChat(name?: string): Promise<ChatDetail> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create chat: ${res.status}`);
  }
  return res.json();
}

// Update a chat (name and/or activeNodeId)
export async function updateChat(
  id: string,
  data: { name?: string; activeNodeId?: string | null }
): Promise<void> {
  const res = await fetch(`${API_BASE}/chats/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to update chat: ${res.status}`);
  }
}

// Delete a chat
export async function deleteChat(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chats/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete chat: ${res.status}`);
  }
}

// Create a new node in a chat
export async function createNode(
  chatId: string,
  node: CreateNodeRequest
): Promise<ConversationNode> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(node),
  });
  if (!res.ok) {
    throw new Error(`Failed to create node: ${res.status}`);
  }
  return res.json();
}

// Delete a node
export async function deleteNode(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chats/nodes/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete node: ${res.status}`);
  }
}

// Update node content
export async function updateNodeContent(
  chatId: string,
  nodeId: string,
  content: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/nodes/${nodeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update node content: ${res.status}`);
  }
}

// Clear all nodes from a chat (but keep the chat)
export async function clearChatNodes(chatId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/nodes`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to clear chat nodes: ${res.status}`);
  }
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
