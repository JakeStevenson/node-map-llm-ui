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

// Branch summary for merge nodes
export interface BranchSummary {
  nodeId: string;
  summary: string;
}

// Web Search Types
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;  // e.g., "wikipedia", "stackoverflow"
}

export interface SearchMetadata {
  query: string;
  results: SearchResult[];
  timestamp: number;
  provider: 'searxng';
}

// Client-side web search preferences (endpoint is server-side for security)
export interface WebSearchConfig {
  enabled: boolean;
  provider: 'searxng';
  maxResults: number;
}

// Server-side search config response
export interface ServerSearchConfig {
  enabled: boolean;
  provider: 'searxng';
}

// Conversation Node for DAG structure (supports merge)
export interface ConversationNode {
  id: string;
  parentIds: string[];  // Empty for root, one for regular, multiple for merge nodes
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  treeId: string;
  branchSummaries?: BranchSummary[];  // Only present on merge nodes
  searchMetadata?: SearchMetadata;     // Present when web search was used
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
