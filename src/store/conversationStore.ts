import { create } from 'zustand';
import type { Message } from '../types';

interface ConversationState {
  // Messages in current path (linear view for sidebar)
  messages: Message[];

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;

  // Error state
  error: string | null;

  // Actions
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  finalizeStreaming: () => void;
  setError: (error: string | null) => void;
}

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const useConversationStore = create<ConversationState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  error: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      error: null,
    })),

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
        };
      }
      return { messages };
    }),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [], error: null }),

  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  setStreamingContent: (content) => set({ streamingContent: content }),

  appendStreamingContent: (chunk) =>
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    })),

  finalizeStreaming: () => {
    const { streamingContent, messages } = get();
    if (streamingContent) {
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: streamingContent,
        createdAt: Date.now(),
      };
      set({
        messages: [...messages, assistantMessage],
        streamingContent: '',
        isStreaming: false,
      });
    } else {
      set({ isStreaming: false, streamingContent: '' });
    }
  },

  setError: (error) => set({ error, isStreaming: false }),
}));

// Helper to create a user message
export const createUserMessage = (content: string): Message => ({
  id: generateId(),
  role: 'user',
  content,
  createdAt: Date.now(),
});
