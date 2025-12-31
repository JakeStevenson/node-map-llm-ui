// LLM Configuration Types
export interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface LLMModel {
  id: string;
  name: string;
  owned_by?: string;
}

// Message Types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

// Conversation Node for tree structure
export interface ConversationNode {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  treeId: string;
}

// Streaming Types
export interface StreamChunk {
  content: string;
  done: boolean;
}

// API Response Types
export interface ModelsResponse {
  data: Array<{
    id: string;
    object: string;
    owned_by: string;
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  stream: boolean;
}

// Error Types
export interface LLMError {
  type: 'network' | 'api' | 'auth' | 'rate_limit' | 'unknown';
  message: string;
  status?: number;
}
