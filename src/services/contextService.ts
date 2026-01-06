import type { ConversationNode, ContextStatus, ModelContextConfig } from '../types';

/**
 * Estimate token count from text using character-based approximation
 * Uses ~3.5 chars per token (conservative estimate for various models)
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim() === '') return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Calculate total token count for a path of conversation nodes
 * Includes both the content tokens and any RAG context tokens
 */
export function calculatePathTokens(nodes: ConversationNode[]): number {
  return nodes.reduce((total, node) => {
    // Use cached token count if available, otherwise calculate
    const contentTokens = node.estimatedTokens ?? estimateTokens(node.content);
    // Add RAG tokens if this node used RAG context
    const ragTokens = node.ragTokens ?? 0;
    return total + contentTokens + ragTokens;
  }, 0);
}

/**
 * Calculate context status given current usage and limits
 */
export function getContextStatus(
  currentTokens: number,
  config: ModelContextConfig
): ContextStatus {
  const maxTokens = config.contextWindow - config.reservedTokens;
  const percentage = maxTokens > 0 ? currentTokens / maxTokens : 0;

  let state: 'normal' | 'warning' | 'critical' = 'normal';
  if (percentage >= config.criticalThreshold) {
    state = 'critical';
  } else if (percentage >= config.warningThreshold) {
    state = 'warning';
  }

  return {
    currentTokens,
    maxTokens,
    percentage,
    state,
    availableTokens: Math.max(0, maxTokens - currentTokens),
  };
}

/**
 * Calculate context status for a given path of nodes
 */
export function calculatePathContext(
  nodes: ConversationNode[],
  config: ModelContextConfig
): ContextStatus {
  const currentTokens = calculatePathTokens(nodes);
  return getContextStatus(currentTokens, config);
}

/**
 * Default model configurations for common local models
 */
export const DEFAULT_MODEL_CONFIGS: Record<string, ModelContextConfig> = {
  default: {
    contextWindow: 4096,
    reservedTokens: 512,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'llama3': {
    contextWindow: 8192,
    reservedTokens: 512,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'llama3:8b': {
    contextWindow: 8192,
    reservedTokens: 512,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'llama3:70b': {
    contextWindow: 8192,
    reservedTokens: 512,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'mistral': {
    contextWindow: 8192,
    reservedTokens: 512,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'mixtral': {
    contextWindow: 32768,
    reservedTokens: 1024,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'qwen': {
    contextWindow: 32768,
    reservedTokens: 1024,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'qwen2': {
    contextWindow: 32768,
    reservedTokens: 1024,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'codellama': {
    contextWindow: 16384,
    reservedTokens: 1024,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
  'phi': {
    contextWindow: 4096,
    reservedTokens: 512,
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
  },
};

/**
 * Get model config by model name (with fallback to default)
 */
export function getModelConfig(modelName: string): ModelContextConfig {
  // Try exact match first
  if (DEFAULT_MODEL_CONFIGS[modelName]) {
    return DEFAULT_MODEL_CONFIGS[modelName];
  }

  // Try to find by prefix (e.g., "llama3:8b-instruct-q4" matches "llama3")
  const modelPrefix = modelName.split(':')[0].toLowerCase();
  if (DEFAULT_MODEL_CONFIGS[modelPrefix]) {
    return DEFAULT_MODEL_CONFIGS[modelPrefix];
  }

  // Fallback to default
  return DEFAULT_MODEL_CONFIGS.default;
}
