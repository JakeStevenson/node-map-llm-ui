import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, ConversationNode } from '../types';

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
          parentId,
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
    }),
    {
      name: 'node-map-conversation',
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

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
