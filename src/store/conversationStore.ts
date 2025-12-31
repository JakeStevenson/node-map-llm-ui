import { create } from 'zustand';
import type { Message, ConversationNode } from '../types';

interface ConversationState {
  // Tree structure - all nodes in the conversation tree
  nodes: ConversationNode[];

  // Active node - where we are in the conversation (latest message in current path)
  activeNodeId: string | null;

  // Selected node - for canvas selection (may differ from active)
  selectedNodeId: string | null;

  // Messages in current path (linear view for sidebar, derived from activeNodeId)
  messages: Message[];

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  streamingParentId: string | null;

  // Error state
  error: string | null;

  // Tree Actions
  addNode: (role: 'user' | 'assistant', content: string, parentId: string | null) => string;
  selectNode: (nodeId: string | null) => void;
  navigateToNode: (nodeId: string) => void;
  clearTree: () => void;

  // Legacy actions (still used by sidebar)
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  finalizeStreaming: () => void;
  setError: (error: string | null) => void;

  // Computed helpers
  getPathToNode: (nodeId: string) => ConversationNode[];
  getActivePath: () => ConversationNode[];
}

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Helper to build messages array from path
const buildMessagesFromPath = (path: ConversationNode[]): Message[] => {
  return path.map((node) => ({
    id: node.id,
    role: node.role,
    content: node.content,
    createdAt: node.createdAt,
  }));
};

// Helper to get path from root to a node
const getPathToNodeHelper = (
  nodeId: string,
  nodes: ConversationNode[]
): ConversationNode[] => {
  const path: ConversationNode[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    const node = nodes.find((n) => n.id === currentId);
    if (node) {
      path.unshift(node);
      currentId = node.parentId;
    } else {
      break;
    }
  }

  return path;
};

export const useConversationStore = create<ConversationState>((set, get) => ({
  nodes: [],
  activeNodeId: null,
  selectedNodeId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingParentId: null,
  error: null,

  // Add a node to the tree
  addNode: (role, content, parentId) => {
    const id = generateId();
    const node: ConversationNode = {
      id,
      parentId,
      role,
      content,
      createdAt: Date.now(),
      treeId: 'main', // Single tree for now
    };

    const { nodes } = get();
    const newNodes = [...nodes, node];
    const path = getPathToNodeHelper(id, newNodes);

    set({
      nodes: newNodes,
      activeNodeId: id,
      selectedNodeId: id,
      messages: buildMessagesFromPath(path),
      error: null,
    });

    return id;
  },

  // Select a node (for canvas highlighting)
  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  // Navigate to a node (change active conversation path)
  navigateToNode: (nodeId) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const path = getPathToNodeHelper(nodeId, nodes);
    set({
      activeNodeId: nodeId,
      selectedNodeId: nodeId,
      messages: buildMessagesFromPath(path),
    });
  },

  // Clear the entire tree
  clearTree: () => {
    set({
      nodes: [],
      activeNodeId: null,
      selectedNodeId: null,
      messages: [],
      error: null,
    });
  },

  // Legacy: Add message (creates node in tree)
  addMessage: (message) => {
    const { activeNodeId } = get();
    get().addNode(message.role as 'user' | 'assistant', message.content, activeNodeId);
  },

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
        };
      }
      // Also update the node in tree
      const nodes = [...state.nodes];
      if (state.activeNodeId) {
        const idx = nodes.findIndex((n) => n.id === state.activeNodeId);
        if (idx !== -1) {
          nodes[idx] = { ...nodes[idx], content };
        }
      }
      return { messages, nodes };
    }),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => {
    get().clearTree();
  },

  setIsStreaming: (streaming) => {
    const { activeNodeId } = get();
    set({
      isStreaming: streaming,
      streamingParentId: streaming ? activeNodeId : null,
    });
  },

  setStreamingContent: (content) => set({ streamingContent: content }),

  appendStreamingContent: (chunk) =>
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    })),

  finalizeStreaming: () => {
    const { streamingContent, streamingParentId } = get();
    if (streamingContent) {
      get().addNode('assistant', streamingContent, streamingParentId);
      set({
        streamingContent: '',
        isStreaming: false,
        streamingParentId: null,
      });
    } else {
      set({ isStreaming: false, streamingContent: '', streamingParentId: null });
    }
  },

  setError: (error) => set({ error, isStreaming: false }),

  // Get path from root to any node
  getPathToNode: (nodeId) => {
    const { nodes } = get();
    return getPathToNodeHelper(nodeId, nodes);
  },

  // Get path from root to active node
  getActivePath: () => {
    const { activeNodeId, nodes } = get();
    if (!activeNodeId) return [];
    return getPathToNodeHelper(activeNodeId, nodes);
  },
}));

// Helper to create a user message
export const createUserMessage = (content: string): Message => ({
  id: generateId(),
  role: 'user',
  content,
  createdAt: Date.now(),
});
