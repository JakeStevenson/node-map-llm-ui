import { create } from 'zustand';
import type { Message, ConversationNode, BranchSummary, SearchMetadata, ContextStatus, SyncState, SyncError, Document } from '../types';
import * as api from '../services/apiService';
import { calculatePathContext, estimateTokens } from '../services/contextService';
import { useSettingsStore } from './settingsStore';

// Chat type for managing multiple conversations
interface Chat {
  id: string;
  name: string;
  systemPrompt?: string;
  customSummaryPrompt?: string;  // User's custom summarization guidance
  nodes: ConversationNode[];
  activeNodeId: string | null;
  createdAt: number;
}

interface ConversationState {
  // Loading state
  isInitialized: boolean;
  isLoading: boolean;

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
  chatSystemPrompt: string | undefined;
  customSummaryPrompt: string | undefined;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  streamingParentId: string | null;

  // Search state
  isSearching: boolean;
  searchQuery: string | null;

  // Document state
  documents: Document[];

  // Error state
  error: string | null;
  syncState: SyncState;

  // Initialization
  initFromApi: () => Promise<void>;

  // Chat management actions
  createChat: (name?: string, systemPrompt?: string) => void;
  switchChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  renameChat: (name: string) => void;
  updateSystemPrompt: (systemPrompt: string) => void;
  setCustomSummaryPrompt: (prompt: string) => void;

  // Tree Actions
  addNode: (role: 'user' | 'assistant', content: string, parentId: string | null, searchMetadata?: SearchMetadata) => string;
  createMergeNode: (parentIds: string[], branchSummaries?: BranchSummary[]) => string | null;
  createSummaryNode: (nodeId: string, summaryContent?: string) => Promise<string | null>;
  updateNodeContent: (nodeId: string, newContent: string) => Promise<void>;
  editNodeAndBranch: (nodeId: string, newContent: string, shouldBranch: boolean) => string | null;
  deleteNode: (nodeId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  toggleNodeSelection: (nodeId: string) => void;
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
  finalizeStreamingWithSearch: (searchMetadata?: SearchMetadata) => void;
  setIsSearching: (searching: boolean, query?: string) => void;
  setError: (error: string | null) => void;
  clearSyncErrors: () => void;

  // Document actions
  uploadDocument: (file: File, nodeId?: string) => Promise<Document>;
  loadDocuments: (chatId?: string) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  getConversationDocuments: () => Document[];
  getNodeDocuments: (nodeId: string) => Document[];

  // Computed helpers
  getPathToNode: (nodeId: string) => ConversationNode[];
  getActivePath: () => ConversationNode[];
  getMessagesForLLM: () => Message[];
  getMessagesForNode: (nodeId: string) => Message[];
  getContextStatus: () => ContextStatus;
  validateMerge: (nodeIds: string[]) => { valid: boolean; error?: string };
}

// Node sync status tracking
enum NodeSyncStatus {
  UNSYNCED = 'unsynced',   // Created locally, not sent to server yet
  SYNCING = 'syncing',     // Currently being sent to server
  SYNCED = 'synced',       // Confirmed on server
  FAILED = 'failed'        // Sync failed after retries
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
      currentId = node.parentIds.length > 0 ? node.parentIds[0] : null;
    } else {
      break;
    }
  }

  return path;
};

// Helper to get ALL ancestor nodes for a node (handles DAG/merge nodes)
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

      // Stop at summary nodes - they replace all ancestor context
      // If this is a summary node, don't traverse to its parents
      if (!node.isSummary) {
        toVisit.push(...node.parentIds);
      }
    }
  }

  return Array.from(collected.values()).sort((a, b) => a.createdAt - b.createdAt);
};

// Build messages for LLM context
const buildMessagesForLLM = (
  nodeId: string,
  nodes: ConversationNode[]
): Message[] => {
  const ancestorNodes = getAllAncestorNodes(nodeId, nodes);
  return ancestorNodes
    .filter((node) => node.content.trim() !== '' && !node.excludeFromContext)
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

// Helper to create a new chat locally
const createNewChatLocal = (name: string = 'Untitled', systemPrompt?: string): Chat => ({
  id: generateId(),
  name,
  systemPrompt,
  nodes: [],
  activeNodeId: null,
  createdAt: Date.now(),
});

// Sync configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 3000, 5000]; // Exponential backoff in milliseconds
const SYNC_TIMEOUT = 10000; // 10 seconds

// Track failed syncs separately from pending
const failedNodeSyncs = new Map<string, SyncError>();
const retryTimeouts = new Map<string, NodeJS.Timeout>();

// Enhanced sync with retry and error tracking
const syncWithRetry = async (
  id: string,
  type: 'node' | 'chat',
  action: () => Promise<unknown>,
  retryCount = 0
): Promise<void> => {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Sync timeout')), SYNC_TIMEOUT)
  );

  try {
    await Promise.race([action(), timeoutPromise]);

    // Success: cleanup
    if (type === 'node') {
      failedNodeSyncs.delete(id);
      syncedNodes.add(id);
      nodeSyncStatus.set(id, NodeSyncStatus.SYNCED);
      pendingNodeSyncs.delete(id);
    }

    // Update store to clear error for this ID
    const state = useConversationStore.getState();
    useConversationStore.setState({
      syncState: {
        ...state.syncState,
        pending: state.syncState.pending.filter((pid) => pid !== id),
        failed: state.syncState.failed.filter((f) => f.nodeId !== id && f.chatId !== id),
      },
    });
  } catch (error) {
    const err = error as Error;
    const isNetworkError = error instanceof TypeError || err.message === 'Sync timeout';
    const errorType: SyncError['type'] =
      err.message === 'Sync timeout' ? 'timeout' : isNetworkError ? 'network' : 'server';

    const syncError: SyncError = {
      type: errorType,
      message: error instanceof Error ? error.message : 'Unknown error',
      nodeId: type === 'node' ? id : undefined,
      chatId: type === 'chat' ? id : undefined,
      timestamp: Date.now(),
      retryCount,
    };

    if (retryCount < MAX_RETRY_ATTEMPTS) {
      // Schedule retry with exponential backoff
      const delay = RETRY_DELAYS[retryCount];
      console.warn(
        `Sync failed for ${id}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`
      );

      const timeout = setTimeout(() => {
        retryTimeouts.delete(id);
        syncWithRetry(id, type, action, retryCount + 1);
      }, delay);

      retryTimeouts.set(id, timeout);
    } else {
      // Max retries exceeded
      console.error(`Sync permanently failed for ${id} after ${MAX_RETRY_ATTEMPTS} attempts:`, error);

      if (type === 'node') {
        failedNodeSyncs.set(id, syncError);
        nodeSyncStatus.set(id, NodeSyncStatus.FAILED);
        pendingNodeSyncs.delete(id);
      }

      // Update store with error
      const state = useConversationStore.getState();
      useConversationStore.setState({
        syncState: {
          pending: state.syncState.pending.filter((pid) => pid !== id),
          failed: [...state.syncState.failed, syncError],
          lastError: syncError,
        },
      });
    }
  }
};

// Background sync helper - now uses syncWithRetry
const syncInBackground = (id: string, type: 'node' | 'chat', action: () => Promise<unknown>) => {
  syncWithRetry(id, type, action).catch(() => {
    // Already handled in syncWithRetry
  });
};

// Track local-to-server chat ID mappings and pending syncs
const chatIdMap = new Map<string, string>(); // localId -> serverId
const pendingChatSyncs = new Map<string, Promise<string>>();
const knownServerChats = new Set<string>(); // IDs known to exist on server

// Track node syncs to ensure parent nodes are synced before children
const pendingNodeSyncs = new Map<string, Promise<void>>();
const syncedNodes = new Set<string>(); // Node IDs known to exist on server
const nodeSyncStatus = new Map<string, NodeSyncStatus>(); // Track sync status of each node

// Check if there are any pending syncs (chat or node)
export const hasPendingSyncs = (): boolean => {
  return pendingChatSyncs.size > 0 || pendingNodeSyncs.size > 0;
};

// Wait for all pending syncs to complete
export const waitForAllSyncs = async (): Promise<void> => {
  const allPromises: Promise<unknown>[] = [
    ...Array.from(pendingChatSyncs.values()),
    ...Array.from(pendingNodeSyncs.values()),
  ];
  if (allPromises.length > 0) {
    await Promise.all(allPromises);
  }
};

// Mark a chat ID as known to exist on server (called after loading from API)
const markChatAsSynced = (chatId: string) => {
  knownServerChats.add(chatId);
};

// Mark node IDs as synced (called when loading nodes from API)
const markNodeAsSynced = (nodeId: string) => {
  syncedNodes.add(nodeId);
  nodeSyncStatus.set(nodeId, NodeSyncStatus.SYNCED);
};

// Wait for a node to be synced to the server (returns sync status)
const waitForNodeSync = async (nodeId: string | null, timeoutMs = 30000): Promise<NodeSyncStatus> => {
  if (!nodeId) return NodeSyncStatus.SYNCED;

  // Check status first
  const status = nodeSyncStatus.get(nodeId);
  if (status === NodeSyncStatus.SYNCED) return NodeSyncStatus.SYNCED;
  if (status === NodeSyncStatus.FAILED) return NodeSyncStatus.FAILED;

  const pending = pendingNodeSyncs.get(nodeId);
  if (!pending) {
    // Not in pending map but not synced = probably never synced
    return NodeSyncStatus.UNSYNCED;
  }

  // Wait for sync with timeout
  const timeoutPromise = new Promise<NodeSyncStatus>((resolve) =>
    setTimeout(() => {
      console.warn(`Sync timeout for node ${nodeId}`);
      nodeSyncStatus.set(nodeId, NodeSyncStatus.FAILED);
      resolve(NodeSyncStatus.FAILED);
    }, timeoutMs)
  );

  const syncPromise = pending.then(() => {
    return nodeSyncStatus.get(nodeId) || NodeSyncStatus.SYNCED;
  });

  return Promise.race([syncPromise, timeoutPromise]);
};

// Ensure chat exists on server, returns the server chat ID
const ensureChatSynced = async (localChatId: string, chatName: string): Promise<string> => {
  // If this chat is known to exist on server, use it directly
  if (knownServerChats.has(localChatId)) {
    return localChatId;
  }

  // If we already have a server ID mapping for this local ID, return it
  const existingServerId = chatIdMap.get(localChatId);
  if (existingServerId) {
    return existingServerId;
  }

  // If there's already a pending sync for this chat, wait for it
  const pending = pendingChatSyncs.get(localChatId);
  if (pending) {
    return pending;
  }

  // Create the chat on the server
  const syncPromise = api.createChat(chatName).then((created) => {
    chatIdMap.set(localChatId, created.id);
    knownServerChats.add(created.id);
    pendingChatSyncs.delete(localChatId);
    return created.id;
  });
  pendingChatSyncs.set(localChatId, syncPromise);
  return syncPromise;
};

export const useConversationStore = create<ConversationState>()((set, get) => ({
  // Initial state
  isInitialized: false,
  isLoading: false,
  chats: [],
  activeChatId: null,
  nodes: [],
  activeNodeId: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  messages: [],
  chatName: 'Untitled',
  chatSystemPrompt: undefined,
  customSummaryPrompt: undefined,
  isStreaming: false,
  streamingContent: '',
  streamingParentId: null,
  isSearching: false,
  searchQuery: null,
  documents: [],
  error: null,
  syncState: {
    pending: [],
    failed: [],
    lastError: null,
  },

  // Initialize from API
  initFromApi: async () => {
    set({ isLoading: true });
    try {
      const chatSummaries = await api.fetchChats();

      if (chatSummaries.length === 0) {
        // No chats exist, create a new one
        const newChat = await api.createChat('Untitled');
        markChatAsSynced(newChat.id); // Mark as known on server
        set({
          chats: [{
            id: newChat.id,
            name: newChat.name,
            systemPrompt: newChat.systemPrompt,
            customSummaryPrompt: newChat.customSummaryPrompt,
            nodes: [],
            activeNodeId: null,
            createdAt: newChat.createdAt,
          }],
          activeChatId: newChat.id,
          nodes: [],
          activeNodeId: null,
          selectedNodeId: null,
          messages: [],
          chatName: 'Untitled',
          chatSystemPrompt: newChat.systemPrompt,
          customSummaryPrompt: newChat.customSummaryPrompt,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        // Mark all chats as known on server
        chatSummaries.forEach(c => markChatAsSynced(c.id));
        // Load the most recent chat
        const mostRecentId = chatSummaries[0].id;
        const chatDetail = await api.fetchChat(mostRecentId);

        // Mark all loaded nodes as synced
        chatDetail.nodes.forEach(n => markNodeAsSynced(n.id));

        // Create lightweight chat list
        const chats: Chat[] = chatSummaries.map((c) => ({
          id: c.id,
          name: c.name,
          systemPrompt: c.id === mostRecentId ? chatDetail.systemPrompt : undefined,
          customSummaryPrompt: c.id === mostRecentId ? chatDetail.customSummaryPrompt : undefined,
          nodes: c.id === mostRecentId ? chatDetail.nodes : [],
          activeNodeId: c.id === mostRecentId ? chatDetail.activeNodeId : null,
          createdAt: c.createdAt,
        }));

        const path = chatDetail.activeNodeId
          ? getPathToNodeHelper(chatDetail.activeNodeId, chatDetail.nodes)
          : [];

        set({
          chats,
          activeChatId: mostRecentId,
          nodes: chatDetail.nodes,
          activeNodeId: chatDetail.activeNodeId,
          selectedNodeId: chatDetail.activeNodeId,
          messages: buildMessagesFromPath(path),
          chatName: chatDetail.name,
          chatSystemPrompt: chatDetail.systemPrompt,
          customSummaryPrompt: chatDetail.customSummaryPrompt,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('Failed to initialize from API:', error);
      // Fallback: create local chat
      const newChat = createNewChatLocal();
      set({
        chats: [newChat],
        activeChatId: newChat.id,
        nodes: [],
        activeNodeId: null,
        selectedNodeId: null,
        messages: [],
        chatName: 'Untitled',
        isLoading: false,
        isInitialized: true,
        error: 'Failed to connect to server. Working in offline mode.',
      });
    }
  },

  // Create a new chat
  createChat: (name = 'Untitled', systemPrompt?: string) => {
    const { chats } = get();
    const newChat = createNewChatLocal(name, systemPrompt);

    set({
      chats: [...chats, newChat],
      activeChatId: newChat.id,
      nodes: [],
      activeNodeId: null,
      selectedNodeId: null,
      selectedNodeIds: [],
      messages: [],
      chatName: name,
      chatSystemPrompt: systemPrompt,
      error: null,
    });

    // Sync to API in background
    syncInBackground(newChat.id, 'chat', async () => {
      const created = await api.createChat(name, systemPrompt);
      // Update local ID with server ID
      set((state) => ({
        chats: state.chats.map((c) =>
          c.id === newChat.id ? { ...c, id: created.id, systemPrompt: created.systemPrompt } : c
        ),
        activeChatId: state.activeChatId === newChat.id ? created.id : state.activeChatId,
      }));
    });
  },

  // Switch to a different chat
  switchChat: async (chatId) => {
    const { chats, activeChatId, nodes, activeNodeId, chatName, chatSystemPrompt, customSummaryPrompt } = get();

    const targetChat = chats.find((c) => c.id === chatId);
    if (!targetChat) return;

    // Save current chat state to chats array
    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId
        ? { ...chat, nodes, activeNodeId, name: chatName, systemPrompt: chatSystemPrompt, customSummaryPrompt }
        : chat
    );

    // If target chat has no nodes loaded, fetch from API
    if (targetChat.nodes.length === 0) {
      set({ isLoading: true });
      try {
        const chatDetail = await api.fetchChat(chatId);
        // Mark all loaded nodes as synced
        chatDetail.nodes.forEach(n => markNodeAsSynced(n.id));

        const path = chatDetail.activeNodeId
          ? getPathToNodeHelper(chatDetail.activeNodeId, chatDetail.nodes)
          : [];

        const chatsWithLoaded = updatedChats.map((c) =>
          c.id === chatId
            ? { ...c, nodes: chatDetail.nodes, activeNodeId: chatDetail.activeNodeId, systemPrompt: chatDetail.systemPrompt, customSummaryPrompt: chatDetail.customSummaryPrompt }
            : c
        );

        set({
          chats: chatsWithLoaded,
          activeChatId: chatId,
          nodes: chatDetail.nodes,
          activeNodeId: chatDetail.activeNodeId,
          selectedNodeId: chatDetail.activeNodeId,
          selectedNodeIds: [],
          messages: buildMessagesFromPath(path),
          chatName: chatDetail.name,
          chatSystemPrompt: chatDetail.systemPrompt,
          customSummaryPrompt: chatDetail.customSummaryPrompt,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        console.error('Failed to load chat:', error);
        set({ isLoading: false, error: 'Failed to load chat' });
      }
    } else {
      // Use cached nodes
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
        chatSystemPrompt: targetChat.systemPrompt,
        customSummaryPrompt: targetChat.customSummaryPrompt,
        error: null,
      });
    }
  },

  // Delete a chat
  deleteChat: (chatId) => {
    const { chats, activeChatId } = get();

    const updatedChats = chats.filter((c) => c.id !== chatId);

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
        const newChat = createNewChatLocal();
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

        // Sync new chat creation
        syncInBackground(newChat.id, 'chat', () => api.createChat('Untitled'));
      }
    } else {
      set({ chats: updatedChats });
    }

    // Sync deletion to API
    syncInBackground(chatId, 'chat', () => api.deleteChat(chatId));
  },

  // Rename current chat
  renameChat: (name) => {
    const { chats, activeChatId } = get();

    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId ? { ...chat, name } : chat
    );

    set({ chats: updatedChats, chatName: name });

    // Sync to API
    if (activeChatId) {
      syncInBackground(activeChatId, 'chat', () => api.updateChat(activeChatId, { name }));
    }
  },

  // Update system prompt for current chat
  updateSystemPrompt: (systemPrompt) => {
    const { chats, activeChatId } = get();

    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId ? { ...chat, systemPrompt } : chat
    );

    set({ chats: updatedChats, chatSystemPrompt: systemPrompt });

    // Sync to API
    if (activeChatId) {
      syncInBackground(activeChatId, 'chat', () => api.updateChat(activeChatId, { systemPrompt }));
    }
  },

  // Set custom summary prompt for current chat
  setCustomSummaryPrompt: (prompt) => {
    const { chats, activeChatId } = get();

    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId ? { ...chat, customSummaryPrompt: prompt } : chat
    );

    set({ chats: updatedChats, customSummaryPrompt: prompt });

    // Sync to API
    if (activeChatId) {
      syncInBackground(activeChatId, 'chat', () => api.updateChat(activeChatId, { customSummaryPrompt: prompt }));
    }
  },

  // Add a node to the tree
  addNode: (role, content, parentId, searchMetadata) => {
    const id = generateId();
    const node: ConversationNode = {
      id,
      parentIds: parentId ? [parentId] : [],
      role,
      content,
      createdAt: Date.now(),
      treeId: 'main',
      searchMetadata,
      estimatedTokens: estimateTokens(content), // Cache token count
    };

    const { nodes, chats, activeChatId, chatName } = get();

    // If no active chat, create one
    if (!activeChatId) {
      const newChat = createNewChatLocal();
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

      // Sync: create chat then add node
      syncInBackground(id, 'node', async () => {
        const created = await api.createChat(newChat.name);

        // Update local state with server ID
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === newChat.id ? { ...c, id: created.id } : c
          ),
          activeChatId: state.activeChatId === newChat.id ? created.id : state.activeChatId,
        }));

        await api.createNode(created.id, {
          id,
          role,
          content,
          parentIds: parentId ? [parentId] : [],
          searchMetadata,
        });
        await api.updateChat(created.id, { activeNodeId: id });
      });

      return id;
    }

    const newNodes = [...nodes, node];
    const path = getPathToNodeHelper(id, newNodes);

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

    // Sync to API in background - ensure chat and parent node exist first
    const nodeSyncPromise = (async () => {
      nodeSyncStatus.set(id, NodeSyncStatus.SYNCING); // Mark as syncing

      const serverChatId = await ensureChatSynced(activeChatId, chatName);

      // Update local state if server assigned a different ID
      if (serverChatId !== activeChatId) {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === activeChatId ? { ...c, id: serverChatId } : c
          ),
          activeChatId: state.activeChatId === activeChatId ? serverChatId : state.activeChatId,
        }));
      }

      // Wait for parent node to be synced first
      await waitForNodeSync(parentId);

      await api.createNode(serverChatId, {
        id,
        role,
        content,
        parentIds: parentId ? [parentId] : [],
        searchMetadata,
      });
      await api.updateChat(serverChatId, { activeNodeId: id });

      // Mark this node as synced
      syncedNodes.add(id);
      nodeSyncStatus.set(id, NodeSyncStatus.SYNCED);
      pendingNodeSyncs.delete(id);
    })();

    pendingNodeSyncs.set(id, nodeSyncPromise);
    syncInBackground(id, 'node', () => nodeSyncPromise);

    return id;
  },

  // Create a merge node with multiple parents
  createMergeNode: (parentIds, branchSummaries) => {
    if (parentIds.length < 2) return null;

    const { nodes, chats, activeChatId, chatName } = get();

    const validParents = parentIds.filter((pid) => nodes.some((n) => n.id === pid));
    if (validParents.length < 2) return null;

    const id = generateId();
    const mergeNode: ConversationNode = {
      id,
      parentIds: validParents,
      role: 'user',
      content: '',
      createdAt: Date.now(),
      treeId: 'main',
      branchSummaries,
      estimatedTokens: 0, // Merge nodes have no content
    };

    const newNodes = [...nodes, mergeNode];
    const path = getPathToNodeHelper(id, newNodes);

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

    // Sync to API - ensure chat and parent nodes exist first
    if (activeChatId) {
      const nodeSyncPromise = (async () => {
        const serverChatId = await ensureChatSynced(activeChatId, chatName);

        if (serverChatId !== activeChatId) {
          set((state) => ({
            chats: state.chats.map((c) =>
              c.id === activeChatId ? { ...c, id: serverChatId } : c
            ),
            activeChatId: state.activeChatId === activeChatId ? serverChatId : state.activeChatId,
          }));
        }

        // Wait for all parent nodes to be synced first
        await Promise.all(validParents.map(pid => waitForNodeSync(pid)));

        await api.createNode(serverChatId, {
          id,
          role: 'user',
          content: '',
          parentIds: validParents,
          branchSummaries,
        });
        await api.updateChat(serverChatId, { activeNodeId: id });

        // Mark this node as synced
        syncedNodes.add(id);
        pendingNodeSyncs.delete(id);
      })();

      pendingNodeSyncs.set(id, nodeSyncPromise);
      syncInBackground(id, 'node', () => nodeSyncPromise);
    }

    return id;
  },

  createSummaryNode: async (nodeId, summaryContent) => {
    const { nodes, chats, activeChatId, chatName } = get();

    // Find the node to summarize up to
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) {
      console.error('Target node not found');
      return null;
    }

    // Get the path from root to this node
    const path = getAllAncestorNodes(nodeId, nodes);
    const summarizedNodeIds = path.map((n) => n.id);

    // Create placeholder summary content if not provided
    const defaultSummary = `Summary of ${path.length} messages (${path.filter(n => n.role === 'user').length} user, ${path.filter(n => n.role === 'assistant').length} assistant)`;
    const content = summaryContent || defaultSummary;

    // Create the summary node
    const id = generateId();
    const summaryNode: ConversationNode = {
      id,
      parentIds: [nodeId],  // Child of the summarized node
      role: 'assistant',    // Summary is from assistant
      content,
      createdAt: Date.now(),
      treeId: 'main',
      isSummary: true,
      summarizedNodeIds,
      estimatedTokens: estimateTokens(content), // Cache token count
    };

    const newNodes = [...nodes, summaryNode];
    const newPath = getPathToNodeHelper(id, newNodes);

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
      messages: buildMessagesFromPath(newPath),
      error: null,
    });

    // Sync to API
    if (activeChatId) {
      const nodeSyncPromise = (async () => {
        const serverChatId = await ensureChatSynced(activeChatId, chatName);

        if (serverChatId !== activeChatId) {
          set((state) => ({
            chats: state.chats.map((c) =>
              c.id === activeChatId ? { ...c, id: serverChatId } : c
            ),
            activeChatId: state.activeChatId === activeChatId ? serverChatId : state.activeChatId,
          }));
        }

        // Wait for parent node to be synced
        await waitForNodeSync(nodeId);

        await api.createNode(serverChatId, {
          id,
          role: 'assistant',
          content,
          parentIds: [nodeId],
          isSummary: true,
          summarizedNodeIds,
        });
        await api.updateChat(serverChatId, { activeNodeId: id });

        // Mark this node as synced
        syncedNodes.add(id);
        pendingNodeSyncs.delete(id);
      })();

      pendingNodeSyncs.set(id, nodeSyncPromise);
      syncInBackground(id, 'node', () => nodeSyncPromise);
    }

    return id;
  },

  updateNodeContent: async (nodeId, newContent) => {
    const { nodes, chats, activeChatId, activeNodeId } = get();

    // Find the node to update
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) {
      console.error('Node not found');
      return;
    }

    // Update the node content locally and recalculate tokens
    const updatedNodes = nodes.map((n) =>
      n.id === nodeId ? { ...n, content: newContent, estimatedTokens: estimateTokens(newContent) } : n
    );

    // Update messages if this affects the active path
    const newMessages = activeNodeId
      ? buildMessagesFromPath(getPathToNodeHelper(activeNodeId, updatedNodes))
      : [];

    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId
        ? { ...chat, nodes: updatedNodes }
        : chat
    );

    set({
      chats: updatedChats,
      nodes: updatedNodes,
      messages: newMessages,
    });

    // Sync to API
    if (activeChatId) {
      const updatePromise = (async () => {
        const serverChatId = await ensureChatSynced(activeChatId, get().chatName);

        // Wait for node to be synced before updating
        await waitForNodeSync(nodeId);

        await api.updateNodeContent(serverChatId, nodeId, newContent);
      })();

      syncInBackground(nodeId, 'node', () => updatePromise);
    }
  },

  editNodeAndBranch: (nodeId, newContent, shouldBranch) => {
    const { nodes } = get();

    // Find the node to edit
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) {
      console.error('Node not found');
      return null;
    }

    if (!shouldBranch) {
      // No descendants - just update in place
      get().updateNodeContent(nodeId, newContent);
      return nodeId;
    }

    // Has descendants - create a new branch
    // Get the parent of the edited node
    const parentId = targetNode.parentIds.length > 0 ? targetNode.parentIds[0] : null;

    // Create a new user node as a sibling (child of same parent)
    const newNodeId = generateId();
    const newNode: ConversationNode = {
      id: newNodeId,
      parentIds: parentId ? [parentId] : [],
      role: 'user',
      content: newContent,
      createdAt: Date.now(),
      treeId: 'main',
      estimatedTokens: estimateTokens(newContent),
      isVariation: true,
      originalNodeId: nodeId,
    };

    const { chats, activeChatId, chatName } = get();
    const newNodes = [...nodes, newNode];
    const path = getPathToNodeHelper(newNodeId, newNodes);

    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId
        ? { ...chat, nodes: newNodes, activeNodeId: newNodeId, name: chatName }
        : chat
    );

    set({
      chats: updatedChats,
      nodes: newNodes,
      activeNodeId: newNodeId,
      selectedNodeId: newNodeId,
      selectedNodeIds: [],
      messages: buildMessagesFromPath(path),
      error: null,
    });

    // Sync to API in background
    const nodeSyncPromise = (async () => {
      nodeSyncStatus.set(newNodeId, NodeSyncStatus.SYNCING);

      const serverChatId = await ensureChatSynced(activeChatId!, chatName);

      if (serverChatId !== activeChatId) {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === activeChatId ? { ...c, id: serverChatId } : c
          ),
          activeChatId: state.activeChatId === activeChatId ? serverChatId : state.activeChatId,
        }));
      }

      // Wait for parent node to be synced first
      await waitForNodeSync(parentId);

      await api.createNode(serverChatId, {
        id: newNodeId,
        role: 'user',
        content: newContent,
        parentIds: parentId ? [parentId] : [],
        isVariation: true,
        originalNodeId: nodeId,
      });
      await api.updateChat(serverChatId, { activeNodeId: newNodeId });

      syncedNodes.add(newNodeId);
      nodeSyncStatus.set(newNodeId, NodeSyncStatus.SYNCED);
      pendingNodeSyncs.delete(newNodeId);
    })();

    pendingNodeSyncs.set(newNodeId, nodeSyncPromise);
    syncInBackground(newNodeId, 'node', () => nodeSyncPromise);

    return newNodeId;
  },

  deleteNode: async (nodeId) => {
    const { nodes, chats, activeChatId, activeNodeId } = get();

    // Find all descendants recursively
    const getAllDescendants = (id: string): string[] => {
      const children = nodes.filter((n) => n.parentIds.includes(id));
      const descendants = [id];
      for (const child of children) {
        descendants.push(...getAllDescendants(child.id));
      }
      return descendants;
    };

    const nodesToDelete = getAllDescendants(nodeId);

    // Remove all nodes in the branch
    const updatedNodes = nodes.filter((n) => !nodesToDelete.includes(n.id));

    // Update active node if it was deleted
    let newActiveNodeId = activeNodeId;
    if (activeNodeId && nodesToDelete.includes(activeNodeId)) {
      // Find a new active node (first available node, or null)
      newActiveNodeId = updatedNodes.length > 0 ? updatedNodes[0].id : null;
    }

    // Update messages
    const newMessages = newActiveNodeId
      ? buildMessagesFromPath(getPathToNodeHelper(newActiveNodeId, updatedNodes))
      : [];

    const updatedChats = chats.map((chat) =>
      chat.id === activeChatId
        ? { ...chat, nodes: updatedNodes, activeNodeId: newActiveNodeId }
        : chat
    );

    set({
      chats: updatedChats,
      nodes: updatedNodes,
      activeNodeId: newActiveNodeId,
      selectedNodeId: newActiveNodeId,
      selectedNodeIds: [],
      messages: newMessages,
    });

    // Sync to API - delete all nodes in the branch
    // Note: UI is already updated above, this is just server cleanup
    if (activeChatId) {
      const deletePromises = nodesToDelete.map(async (id) => {
        try {
          // Check sync status first (5s timeout)
          const status = await waitForNodeSync(id, 5000);

          if (status === NodeSyncStatus.UNSYNCED || status === NodeSyncStatus.FAILED) {
            // Node never made it to server, just clean up local tracking
            console.info(`Node ${id} was never synced to server, skipping delete`);
            pendingNodeSyncs.delete(id);
            nodeSyncStatus.delete(id);
            return;
          }

          // Node is/was synced, try to delete from server
          const result = await api.deleteNode(id);

          if (!result.deleted && result.reason === 'not_found') {
            // Node not found on server (already deleted or race condition)
            console.info(`Node ${id} not found on server, cleaning up local state`);
          }

          // Clean up tracking
          syncedNodes.delete(id);
          nodeSyncStatus.delete(id);
          pendingNodeSyncs.delete(id);
        } catch (error) {
          // Log error but don't fail the whole deletion
          // UI is already updated, this is just cleanup
          console.error(`Failed to delete node ${id} from server:`, error);

          // Still clean up local tracking to prevent future issues
          syncedNodes.delete(id);
          nodeSyncStatus.delete(id);
          pendingNodeSyncs.delete(id);
        }
      });

      // Don't await - fire and forget, UI is already updated
      Promise.all(deletePromises).catch((err) => {
        console.error('Some node deletions failed:', err);
      });

      // Update active node if changed
      if (newActiveNodeId !== activeNodeId) {
        syncInBackground(activeChatId, 'chat', () => api.updateChat(activeChatId, { activeNodeId: newActiveNodeId }));
      }
    }
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId, selectedNodeIds: [] });
  },

  toggleNodeSelection: (nodeId) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.includes(nodeId)) {
      set({ selectedNodeIds: selectedNodeIds.filter((id) => id !== nodeId) });
    } else {
      set({ selectedNodeIds: [...selectedNodeIds, nodeId] });
    }
  },

  clearNodeSelection: () => {
    set({ selectedNodeIds: [] });
  },

  navigateToNode: (nodeId) => {
    const { nodes, chats, activeChatId, chatName } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const path = getPathToNodeHelper(nodeId, nodes);

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

    // Sync activeNodeId to API
    if (activeChatId) {
      syncInBackground(activeChatId, 'chat', () => api.updateChat(activeChatId, { activeNodeId: nodeId }));
    }
  },

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

    // Sync to server - clear all nodes from this chat
    if (activeChatId) {
      syncInBackground(activeChatId, 'chat', () => api.clearChatNodes(activeChatId));
    }
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
      const nodes = [...state.nodes];
      if (state.activeNodeId) {
        const idx = nodes.findIndex((n) => n.id === state.activeNodeId);
        if (idx !== -1) {
          nodes[idx] = { ...nodes[idx], content };
        }
      }

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
        isSearching: false,
        searchQuery: null,
      });
    } else {
      set({ isStreaming: false, streamingContent: '', streamingParentId: null, isSearching: false, searchQuery: null });
    }
  },

  finalizeStreamingWithSearch: (searchMetadata) => {
    const { streamingContent, streamingParentId } = get();
    if (streamingContent) {
      get().addNode('assistant', streamingContent, streamingParentId, searchMetadata);
      set({
        streamingContent: '',
        isStreaming: false,
        streamingParentId: null,
        isSearching: false,
        searchQuery: null,
      });
    } else {
      set({ isStreaming: false, streamingContent: '', streamingParentId: null, isSearching: false, searchQuery: null });
    }
  },

  setIsSearching: (searching, query) => set({ isSearching: searching, searchQuery: query || null }),

  setError: (error) => set({ error, isStreaming: false, isSearching: false, searchQuery: null }),

  clearSyncErrors: () => {
    set((state) => ({
      syncState: {
        ...state.syncState,
        failed: [],
        lastError: null,
      },
    }));
  },

  // Document actions
  uploadDocument: async (file, nodeId) => {
    const { activeChatId } = get();
    if (!activeChatId) {
      throw new Error('No active chat');
    }

    // Get embedding config from settings store
    const { useSettingsStore: settingsStore } = await import('./settingsStore.js');
    const embeddingConfig = settingsStore.getState().getEmbeddingConfig();

    const formData = new FormData();
    formData.append('file', file);
    if (nodeId) {
      formData.append('nodeId', nodeId);
    }
    // Pass embedding config as JSON string
    formData.append('embeddingConfig', JSON.stringify(embeddingConfig));

    const response = await fetch(`/api/documents/upload/${activeChatId}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const { document } = await response.json();

    // Add to local state
    set((state) => ({
      documents: [...state.documents, document],
    }));

    return document;
  },

  loadDocuments: async (chatId) => {
    const { activeChatId } = get();
    const targetChatId = chatId || activeChatId;

    if (!targetChatId) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/chat/${targetChatId}`);
      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const { documents } = await response.json();
      set({ documents });
    } catch (error) {
      console.error('Error loading documents:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to load documents' });
    }
  },

  deleteDocument: async (documentId) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      // Remove from local state
      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== documentId),
      }));
    } catch (error) {
      console.error('Error deleting document:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to delete document' });
    }
  },

  getConversationDocuments: () => {
    const { documents } = get();
    return documents.filter((doc) => !doc.nodeId);
  },

  getNodeDocuments: (nodeId) => {
    const { documents, nodes } = get();

    // Get all ancestor node IDs for the given node
    const ancestorIds = new Set<string>();
    const path = getPathToNodeHelper(nodeId, nodes);
    path.forEach((node) => ancestorIds.add(node.id));

    // Return documents attached to this node or any ancestor
    return documents.filter((doc) => doc.nodeId && ancestorIds.has(doc.nodeId));
  },

  getPathToNode: (nodeId) => {
    const { nodes } = get();
    return getPathToNodeHelper(nodeId, nodes);
  },

  getActivePath: () => {
    const { activeNodeId, nodes } = get();
    if (!activeNodeId) return [];
    return getPathToNodeHelper(activeNodeId, nodes);
  },

  getMessagesForLLM: () => {
    const { activeNodeId, nodes, chatSystemPrompt } = get();
    if (!activeNodeId) return [];

    const messages = buildMessagesForLLM(activeNodeId, nodes);

    // IMPORTANT: Only prepend system message if prompt exists and is non-empty
    // If no system prompt provided, behave exactly as current system (no system message)
    if (chatSystemPrompt && chatSystemPrompt.trim()) {
      return [
        {
          id: 'system-prompt',
          role: 'system' as const,
          content: chatSystemPrompt,
          createdAt: 0,  // Ensure it's first
        },
        ...messages,
      ];
    }

    // No system prompt = return messages as-is (current behavior)
    return messages;
  },

  getMessagesForNode: (nodeId) => {
    const { nodes } = get();
    const path = getPathToNodeHelper(nodeId, nodes);
    return buildMessagesFromPath(path);
  },

  getContextStatus: () => {
    const { activeNodeId, nodes } = get();
    if (!activeNodeId) {
      // Return empty status if no active node
      return {
        currentTokens: 0,
        maxTokens: 4096,
        percentage: 0,
        state: 'normal' as const,
        availableTokens: 4096,
      };
    }

    // Get context config from settings store
    const contextConfig = useSettingsStore.getState().getContextConfig();

    // Get all ancestor nodes (including those excluded from context)
    const ancestorNodes = getAllAncestorNodes(activeNodeId, nodes);

    // Filter to only include nodes that will be sent to LLM
    const includedNodes = ancestorNodes.filter(
      (node) => node.content.trim() !== '' && !node.excludeFromContext
    );

    // Calculate context status
    const status = calculatePathContext(includedNodes, contextConfig);

    // Log warning if over limit
    if (status.state === 'critical') {
      console.warn(
        `Context usage critical: ${status.currentTokens}/${status.maxTokens} tokens (${Math.round(status.percentage * 100)}%)`
      );
    } else if (status.state === 'warning') {
      console.warn(
        `Context usage warning: ${status.currentTokens}/${status.maxTokens} tokens (${Math.round(status.percentage * 100)}%)`
      );
    }

    return status;
  },

  validateMerge: (nodeIds) => {
    const { nodes } = get();
    return validateMergeNodes(nodeIds, nodes);
  },
}));

// Helper to create a user message
export const createUserMessage = (content: string): Message => ({
  id: generateId(),
  role: 'user',
  content,
  createdAt: Date.now(),
});
