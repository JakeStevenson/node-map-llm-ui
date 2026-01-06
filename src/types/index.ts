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
  // Context management fields
  isSummary?: boolean;                 // Flag for summary nodes
  summarizedNodeIds?: string[];        // Original nodes this summary replaces
  excludeFromContext?: boolean;        // Skip when building LLM context
  estimatedTokens?: number;            // Cached token count
  ragTokens?: number;                  // RAG context tokens used for this response
  isVariation?: boolean;               // Flag for variation branches (edited and branched)
  originalNodeId?: string;             // Reference to the original node this is a variation of
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

// Sync Error Types
export interface SyncError {
  type: 'network' | 'server' | 'timeout';
  message: string;
  nodeId?: string;
  chatId?: string;
  timestamp: number;
  retryCount: number;
}

export interface SyncState {
  pending: string[];        // IDs of items being synced
  failed: SyncError[];      // Failed syncs with retry info
  lastError: SyncError | null;
}

// Context Management Types
export interface ModelContextConfig {
  contextWindow: number;      // Total tokens the model can handle
  reservedTokens: number;     // Reserve for system prompt + completion
  warningThreshold: number;   // Show warning at this % (e.g., 0.8 = 80%)
  criticalThreshold: number;  // Show critical warning at this % (e.g., 0.95 = 95%)
}

export interface ContextStatus {
  currentTokens: number;      // Current token usage
  maxTokens: number;          // Maximum available (contextWindow - reserved)
  percentage: number;         // Usage percentage (0-1)
  state: 'normal' | 'warning' | 'critical';
  availableTokens: number;    // Remaining tokens available
}

// Document Types
export interface Document {
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
  nodeId?: string;  // null = conversation-level, string = node-level
}
