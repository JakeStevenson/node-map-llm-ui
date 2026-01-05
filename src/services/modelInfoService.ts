/**
 * Service for fetching model information from LLM providers
 */

interface OllamaModelInfo {
  parameters?: {
    num_ctx?: number;
  };
}

interface GroqModelInfo {
  id: string;
  context_window?: number;
  max_completion_tokens?: number;
}

interface GroqModelsResponse {
  data: GroqModelInfo[];
}

interface ModelInfo {
  contextWindow: number;
  source: 'api' | 'default';
}

/**
 * Fetch model context window from Ollama
 */
async function fetchOllamaModelInfo(endpoint: string, modelName: string): Promise<number | null> {
  try {
    // Remove /v1 or /api suffix if present
    const baseUrl = endpoint.replace(/\/(v1|api)\/?$/, '');

    const response = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      console.warn(`Failed to fetch Ollama model info: ${response.status}`);
      return null;
    }

    const data: OllamaModelInfo = await response.json();
    const contextWindow = data.parameters?.num_ctx;

    if (contextWindow && contextWindow > 0) {
      console.log(`Ollama model ${modelName}: ${contextWindow} context window`);
      return contextWindow;
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch Ollama model info:', error);
    return null;
  }
}

/**
 * Fetch model context window from Groq
 */
async function fetchGroqModelInfo(endpoint: string, modelName: string, apiKey?: string): Promise<number | null> {
  try {
    // Ensure we're using the correct base URL
    const baseUrl = endpoint.includes('groq.com')
      ? endpoint.replace(/\/chat\/completions.*$/, '')
      : endpoint;

    const modelsUrl = `${baseUrl}/models`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(modelsUrl, { headers });

    if (!response.ok) {
      console.warn(`Failed to fetch Groq models: ${response.status}`);
      return null;
    }

    const data: GroqModelsResponse = await response.json();
    const model = data.data.find((m) => m.id === modelName);

    if (model?.context_window && model.context_window > 0) {
      console.log(`Groq model ${modelName}: ${model.context_window} context window`);
      return model.context_window;
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch Groq model info:', error);
    return null;
  }
}

/**
 * Known context windows for popular models
 */
const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,

  // Anthropic
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-2.1': 200000,

  // Groq (using Llama models)
  'llama-3.1-405b-reasoning': 131072,
  'llama-3.1-70b-versatile': 131072,
  'llama-3.1-8b-instant': 131072,
  'llama3-70b-8192': 8192,
  'llama3-8b-8192': 8192,
  'mixtral-8x7b-32768': 32768,
  'gemma-7b-it': 8192,
  'llama-3.3-70b-versatile': 131072,
  'llama-3.3-70b-specdec': 8192,

  // Custom/OSS models (conservative estimates)
  'gpt-oss:120b': 32768,  // Estimate - user should verify actual context size
  'openai/gpt-oss-120b': 32768,  // Estimate - user should verify actual context size

  // Common local models (Ollama defaults)
  'llama3': 8192,
  'llama3.1': 131072,
  'llama3.2': 131072,
  'mistral': 8192,
  'mixtral': 32768,
  'qwen': 32768,
  'qwen2': 32768,
  'codellama': 16384,
  'phi': 4096,
  'gemma': 8192,
  'neural-chat': 8192,
};

/**
 * Get model context window - tries API first, falls back to known values
 */
export async function getModelContextWindow(
  endpoint: string,
  modelName: string,
  apiKey?: string
): Promise<ModelInfo> {
  // Try Groq API first
  if (endpoint.includes('groq.com')) {
    const contextWindow = await fetchGroqModelInfo(endpoint, modelName, apiKey);
    if (contextWindow) {
      return { contextWindow, source: 'api' };
    }
  }

  // Try Ollama API
  if (endpoint.includes('ollama') || endpoint.includes('11434')) {
    const contextWindow = await fetchOllamaModelInfo(endpoint, modelName);
    if (contextWindow) {
      return { contextWindow, source: 'api' };
    }
  }

  // Check known models (exact match)
  if (KNOWN_CONTEXT_WINDOWS[modelName]) {
    return {
      contextWindow: KNOWN_CONTEXT_WINDOWS[modelName],
      source: 'default',
    };
  }

  // Try prefix match (e.g., "llama3:8b-instruct-q4" matches "llama3")
  const modelPrefix = modelName.split(':')[0].toLowerCase();
  if (KNOWN_CONTEXT_WINDOWS[modelPrefix]) {
    return {
      contextWindow: KNOWN_CONTEXT_WINDOWS[modelPrefix],
      source: 'default',
    };
  }

  // Default fallback
  console.warn(`Unknown model ${modelName}, using default 4096 context window`);
  return {
    contextWindow: 4096,
    source: 'default',
  };
}
