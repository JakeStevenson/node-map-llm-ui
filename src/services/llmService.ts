import type { LLMConfig, LLMModel, LLMError, Message } from '../types';

// Fetch available models from the endpoint
export async function fetchModels(config: LLMConfig): Promise<LLMModel[]> {
  const { endpoint, apiKey } = config;

  if (!endpoint) {
    throw createError('api', 'No endpoint configured');
  }

  const url = `${endpoint.replace(/\/$/, '')}/models`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw createError('auth', 'Invalid API key');
      }
      throw createError('api', `Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    // Handle OpenAI-compatible response format
    const models: LLMModel[] = (data.data || data.models || []).map(
      (model: { id: string; name?: string; owned_by?: string }) => ({
        id: model.id,
        name: model.name || model.id,
        owned_by: model.owned_by,
      })
    );

    // Sort models alphabetically
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if (isLLMError(error)) {
      throw error;
    }
    throw createError('network', 'Failed to connect to endpoint');
  }
}

// Send a message and stream the response
export async function sendMessage(
  config: LLMConfig,
  messages: Message[],
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: LLMError) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const { endpoint, apiKey, model } = config;

  if (!endpoint || !model) {
    onError(createError('api', 'Endpoint and model must be configured'));
    return;
  }

  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = JSON.stringify({
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: true,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: abortSignal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        onError(createError('auth', 'Invalid API key'));
        return;
      }
      if (response.status === 429) {
        onError(createError('rate_limit', 'Rate limited. Please wait.'));
        return;
      }
      onError(createError('api', `API error: ${response.status}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(createError('api', 'No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onDone();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    if (abortSignal?.aborted) {
      onDone();
      return;
    }
    if (isLLMError(error)) {
      onError(error);
    } else {
      onError(createError('network', 'Connection failed'));
    }
  }
}

// Helper to create typed errors
function createError(
  type: LLMError['type'],
  message: string,
  status?: number
): LLMError {
  return { type, message, status };
}

// Type guard for LLMError
function isLLMError(error: unknown): error is LLMError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'message' in error
  );
}
