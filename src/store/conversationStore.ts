import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, ConversationNode, BranchSummary } from '../types';

// Chat type for managing multiple conversations
interface Chat {
  id: string;
  name: string;
  nodes: ConversationNode[];
  activeNodeId: string | null;
  createdAt: number;
}

interface ConversationState {
  // Multi-chat management
  chats: Chat[];
  activeChatId: string | null;

  // Current chat state (derived from active chat)
  nodes: ConversationNode[];
  activeNodeId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];  // Multi-select for merge feature
  messages: Message[];
  chatName: string;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  streamingParentId: string | null;

  // Error state
  error: string | null;

  // Chat management actions
  createChat: (name?: string) => void;
  switchChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  renameChat: (name: string) => void;

  // Tree Actions
  addNode: (role: 'user' | 'assistant', content: string, parentId: string | null) => string;
  createMergeNode: (parentIds: string[], branchSummaries?: BranchSummary[]) => string | null;  // Create node with multiple parents
  selectNode: (nodeId: string | null) => void;
  toggleNodeSelection: (nodeId: string) => void;  // For shift-click multi-select
  clearNodeSelection: () => void;
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
  getMessagesForLLM: () => Message[];  // Full context including all merge branches
  getMessagesForNode: (nodeId: string) => Message[];  // Get messages for a specific node path
  validateMerge: (nodeIds: string[]) => { valid: boolean; error?: string };  // Validate merge before attempting
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
// For regular nodes (single parent), follows the first parent
// For merge nodes, this returns path to first parent only - full context building handled separately
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
      // Use first parent (regular nodes have one, merge nodes have multiple)
      currentId = node.parentIds.length > 0 ? node.parentIds[0] : null;
    } else {
      break;
    }
  }

  return path;
};

// Helper to get ALL ancestor nodes for a node (handles DAG/merge nodes)
// Collects from all parent paths, deduplicates, sorts chronologically
const getAllAncestorNodes = (
  nodeId: string,
  nodes: ConversationNode[]
): ConversationNode[] => {
  const collected = new Map<string, ConversationNode>();
  const toVisit: string[] = [nodeId];

  while (toVisit.length > 0) {
    const currentId = toVisit.pop()!;
    if (collected.has(currentId)) continue;

    const node = nodes.find((n) => n.id === currentId);
    if (node) {
      collected.set(currentId, node);
      // Add all parents to visit (handles merge nodes with multiple parents)
      toVisit.push(...node.parentIds);
    }
  }

  // Sort by createdAt for chronological order
  return Array.from(collected.values()).sort((a, b) => a.createdAt - b.createdAt);
};

// Build messages for LLM context (uses full DAG traversal for merge nodes)
const buildMessagesForLLM = (
  nodeId: string,
  nodes: ConversationNode[]
): Message[] => {
  const ancestorNodes = getAllAncestorNodes(nodeId, nodes);
  // Filter out empty content nodes (like merge point placeholders)
  return ancestorNodes
    .filter((node) => node.content.trim() !== '')
    .map((node) => ({
      id: node.id,
      role: node.role,
      content: node.content,
      createdAt: node.createdAt,
    }));
};

// Helper to check if nodeA is an ancestor of nodeB
const isAncestor = (
  ancestorId: string,
  descendantId: string,
  nodes: ConversationNode[]
): boolean => {
  const ancestors = getAllAncestorNodes(descendantId, nodes);
  return ancestors.some((n) => n.id === ancestorId);
};

// Validate merge: no node should be an ancestor of another
const validateMergeNodes = (
  nodeIds: string[],
  nodes: ConversationNode[]
): { valid: boolean; error?: string } => {
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = 0; j < nodeIds.length; j++) {
      if (i !== j && isAncestor(nodeIds[i], nodeIds[j], nodes)) {
        return {
          valid: false,
          error: 'Cannot merge a node with its own ancestor (would duplicate context)',
        };
      }
    }
  }
  return { valid: true };
};

// Helper to create a new chat
const createNewChat = (name: string = 'Untitled'): Chat => ({
  id: generateId(),
  name,
  nodes: [],
  activeNodeId: null,
  createdAt: Date.now(),
});

// Helper to save current state back to chats array
const saveCurrentChatToChats = (
  chats: Chat[],
  activeChatId: string | null,
  nodes: ConversationNode[],
  activeNodeId: string | null,
  chatName: string
): Chat[] => {
  if (!activeChatId) return chats;

  return chats.map((chat) =>
    chat.id === activeChatId
      ? { ...chat, nodes, activeNodeId, name: chatName }
      : chat
  );
};

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      // Initialize with one default chat
      chats: [],
      activeChatId: null,
      nodes: [],
      activeNodeId: null,
      selectedNodeId: null,
      selectedNodeIds: [],
      messages: [],
      chatName: 'Untitled',
      isStreaming: false,
      streamingContent: '',
      streamingParentId: null,
      error: null,

      // Create a new chat
      createChat: (name = 'Untitled') => {
        const { chats, activeChatId, nodes, activeNodeId, chatName } = get();

        // Save current chat first
        const updatedChats = saveCurrentChatToChats(chats, activeChatId, nodes, activeNodeId, chatName);

        // Create new chat
        const newChat = createNewChat(name);

        set({
          chats: [...updatedChats, newChat],
          activeChatId: newChat.id,
          nodes: [],
          activeNodeId: null,
          selectedNodeId: null,
          selectedNodeIds: [],
          messages: [],
          chatName: name,
          error: null,
        });
      },

      // Switch to a different chat
      switchChat: (chatId) => {
        const { chats, activeChatId, nodes, activeNodeId, chatName } = get();

        const targetChat = chats.find((c) => c.id === chatId);
        if (!targetChat) return;

        // Save current chat first
        const updatedChats = saveCurrentChatToChats(chats, activeChatId, nodes, activeNodeId, chatName);

        // Load target chat
        const path = targetChat.activeNodeId
          ? getPathToNodeHelper(targetChat.activeNodeId, targetChat.nodes)
          : [];

        set({
          chats: updatedChats,
          activeChatId: chatId,
          nodes: targetChat.nodes,
          activeNodeId: targetChat.activeNodeId,
          selectedNodeId: targetChat.activeNodeId,
          selectedNodeIds: [],
          messages: buildMessagesFromPath(path),
          chatName: targetChat.name,
          error: null,
        });
      },

      // Delete a chat
      deleteChat: (chatId) => {
        const { chats, activeChatId } = get();

        const updatedChats = chats.filter((c) => c.id !== chatId);

        // If deleting active chat, switch to another or create new
        if (chatId === activeChatId) {
          if (updatedChats.length > 0) {
            const newActive = updatedChats[0];
            const path = newActive.activeNodeId
              ? getPathToNodeHelper(newActive.activeNodeId, newActive.nodes)
              : [];

            set({
              chats: updatedChats,
              activeChatId: newActive.id,
              nodes: newActive.nodes,
              activeNodeId: newActive.activeNodeId,
              selectedNodeId: newActive.activeNodeId,
              selectedNodeIds: [],
              messages: buildMessagesFromPath(path),
              chatName: newActive.name,
            });
          } else {
            // No chats left, create a new one
            const newChat = createNewChat();
            set({
              chats: [newChat],
              activeChatId: newChat.id,
              nodes: [],
              activeNodeId: null,
              selectedNodeId: null,
              selectedNodeIds: [],
              messages: [],
              chatName: 'Untitled',
            });
          }
        } else {
          set({ chats: updatedChats });
        }
      },

      // Rename current chat
      renameChat: (name) => {
        const { chats, activeChatId } = get();

        const updatedChats = chats.map((chat) =>
          chat.id === activeChatId ? { ...chat, name } : chat
        );

        set({ chats: updatedChats, chatName: name });
      },

      // Add a node to the tree
      addNode: (role, content, parentId) => {
        const id = generateId();
        const node: ConversationNode = {
          id,
          parentIds: parentId ? [parentId] : [],
          role,
          content,
          createdAt: Date.now(),
          treeId: 'main',
        };

        const { nodes, chats, activeChatId, chatName } = get();

        // If no active chat, create one
        if (!activeChatId) {
          const newChat = createNewChat();
          newChat.nodes = [node];
          newChat.activeNodeId = id;

          const path = getPathToNodeHelper(id, [node]);

          set({
            chats: [newChat],
            activeChatId: newChat.id,
            nodes: [node],
            activeNodeId: id,
            selectedNodeId: id,
            selectedNodeIds: [],
            messages: buildMessagesFromPath(path),
            chatName: newChat.name,
            error: null,
          });

          return id;
        }

        const newNodes = [...nodes, node];
        const path = getPathToNodeHelper(id, newNodes);

        // Update chats array with new node
        const updatedChats = chats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, nodes: newNodes, activeNodeId: id, name: chatName }
            : chat
        );

        set({
          chats: updatedChats,
          nodes: newNodes,
          activeNodeId: id,
          selectedNodeId: id,
          selectedNodeIds: [],
          messages: buildMessagesFromPath(path),
          error: null,
        });

        return id;
      },

      // Create a merge node with multiple parents
      createMergeNode: (parentIds, branchSummaries) => {
        if (parentIds.length < 2) return null;

        const { nodes, chats, activeChatId, chatName } = get();

        // Validate all parent nodes exist
        const validParents = parentIds.filter((pid) => nodes.some((n) => n.id === pid));
        if (validParents.length < 2) return null;

        const id = generateId();
        const mergeNode: ConversationNode = {
          id,
          parentIds: validParents,
          role: 'user',  // Merge point is a user action
          content: '',   // Empty - user will type synthesis prompt as next message
          createdAt: Date.now(),
          treeId: 'main',
          branchSummaries,  // Store summaries for each parent branch
        };

        const newNodes = [...nodes, mergeNode];
        const path = getPathToNodeHelper(id, newNodes);

        // Update chats array
        const updatedChats = chats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, nodes: newNodes, activeNodeId: id, name: chatName }
            : chat
        );

        set({
          chats: updatedChats,
          nodes: newNodes,
          activeNodeId: id,
          selectedNodeId: id,
          selectedNodeIds: [],  // Clear multi-select after merge
          messages: buildMessagesFromPath(path),
          error: null,
        });

        return id;
      },

      // Select a node (for canvas highlighting) - clears multi-select
      selectNode: (nodeId) => {
        set({ selectedNodeId: nodeId, selectedNodeIds: [] });
      },

      // Toggle node in multi-selection (for shift-click)
      toggleNodeSelection: (nodeId) => {
        const { selectedNodeIds } = get();
        if (selectedNodeIds.includes(nodeId)) {
          // Remove from selection
          set({ selectedNodeIds: selectedNodeIds.filter((id) => id !== nodeId) });
        } else {
          // Add to selection
          set({ selectedNodeIds: [...selectedNodeIds, nodeId] });
        }
      },

      // Clear all multi-selection
      clearNodeSelection: () => {
        set({ selectedNodeIds: [] });
      },

      // Navigate to a node (change active conversation path)
      navigateToNode: (nodeId) => {
        const { nodes, chats, activeChatId, chatName } = get();
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const path = getPathToNodeHelper(nodeId, nodes);

        // Update chats array
        const updatedChats = chats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, activeNodeId: nodeId, name: chatName }
            : chat
        );

        set({
          chats: updatedChats,
          activeNodeId: nodeId,
          selectedNodeId: nodeId,
          messages: buildMessagesFromPath(path),
        });
      },

      // Clear the entire tree (current chat only)
      clearTree: () => {
        const { chats, activeChatId, chatName } = get();

        const updatedChats = chats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, nodes: [], activeNodeId: null, name: chatName }
            : chat
        );

        set({
          chats: updatedChats,
          nodes: [],
          activeNodeId: null,
          selectedNodeId: null,
          selectedNodeIds: [],
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

          // Update in chats
          const chats = state.chats.map((chat) =>
            chat.id === state.activeChatId
              ? { ...chat, nodes }
              : chat
          );

          return { messages, nodes, chats };
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

      // Get messages for LLM (full context from all branches for merge nodes)
      getMessagesForLLM: () => {
        const { activeNodeId, nodes } = get();
        if (!activeNodeId) return [];
        return buildMessagesForLLM(activeNodeId, nodes);
      },

      // Get messages for a specific node path (single parent path)
      getMessagesForNode: (nodeId) => {
        const { nodes } = get();
        const path = getPathToNodeHelper(nodeId, nodes);
        return buildMessagesFromPath(path);
      },

      // Validate merge before attempting
      validateMerge: (nodeIds) => {
        const { nodes } = get();
        return validateMergeNodes(nodeIds, nodes);
      },
    }),
    {
      name: 'node-map-conversation',
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Migrate nodes from old parentId to new parentIds format
        const migrateNode = (node: ConversationNode & { parentId?: string | null }): ConversationNode => {
          // If node already has parentIds, it's already migrated
          if (Array.isArray(node.parentIds)) {
            return node;
          }
          // Migrate from old parentId format
          const { parentId, ...rest } = node;
          return {
            ...rest,
            parentIds: parentId ? [parentId] : [],
          } as ConversationNode;
        };

        // Migrate all nodes in all chats
        state.chats = state.chats.map((chat) => ({
          ...chat,
          nodes: chat.nodes.map(migrateNode),
        }));

        // If no chats, create default one
        if (state.chats.length === 0) {
          const newChat = createNewChat();
          state.chats = [newChat];
          state.activeChatId = newChat.id;
          state.chatName = 'Untitled';
          return;
        }

        // Load active chat
        const activeChat = state.chats.find((c) => c.id === state.activeChatId);
        if (activeChat) {
          state.nodes = activeChat.nodes;
          state.activeNodeId = activeChat.activeNodeId;
          state.selectedNodeId = activeChat.activeNodeId;
          state.chatName = activeChat.name;

          if (activeChat.activeNodeId) {
            const path = getPathToNodeHelper(activeChat.activeNodeId, activeChat.nodes);
            state.messages = buildMessagesFromPath(path);
          }
        } else if (state.chats.length > 0) {
          // Active chat not found, use first chat
          const firstChat = state.chats[0];
          state.activeChatId = firstChat.id;
          state.nodes = firstChat.nodes;
          state.activeNodeId = firstChat.activeNodeId;
          state.selectedNodeId = firstChat.activeNodeId;
          state.chatName = firstChat.name;

          if (firstChat.activeNodeId) {
            const path = getPathToNodeHelper(firstChat.activeNodeId, firstChat.nodes);
            state.messages = buildMessagesFromPath(path);
          }
        }
      },
    }
  )
);

// Helper to create a user message
export const createUserMessage = (content: string): Message => ({
  id: generateId(),
  role: 'user',
  content,
  createdAt: Date.now(),
});
