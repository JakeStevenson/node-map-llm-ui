import type { LLMConfig, LLMModel, LLMError, Message, SearchMetadata, WebSearchConfig } from '../types';
import { executeSearch, formatSearchResultsForLLM } from './searchService';

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

      const rawChunk = decoder.decode(value, { stream: true });
      buffer += rawChunk;
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
            // Ignore malformed JSON chunks
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

// Regex to detect search tags
const SEARCH_TAG_REGEX = /<search>([\s\S]*?)<\/search>/;

// Options for search-aware streaming
export interface StreamWithSearchOptions {
  config: LLMConfig;
  messages: Message[];
  webSearchConfig: WebSearchConfig | null;
  searchQuery?: string;  // Explicit search query (user-provided)
  onChunk: (content: string) => void;
  onSearchStart: (query: string) => void;
  onSearchComplete: (metadata: SearchMetadata) => void;
  onDone: (searchMetadata?: SearchMetadata) => void;
  onError: (error: LLMError) => void;
  abortSignal?: AbortSignal;
}

// Send a message with search capability
export async function sendMessageWithSearch(options: StreamWithSearchOptions): Promise<void> {
  const {
    config,
    messages,
    webSearchConfig,
    searchQuery: explicitSearchQuery,
    onChunk,
    onSearchStart,
    onSearchComplete,
    onDone,
    onError,
    abortSignal,
  } = options;

  let accumulatedContent = '';
  let searchMetadata: SearchMetadata | undefined;
  let searchExecuted = false;

  let effectiveMessages = [...messages];

  // If user explicitly requested search, do it
  if (explicitSearchQuery && webSearchConfig?.enabled) {
    onSearchStart(explicitSearchQuery);

    try {
      searchMetadata = await executeSearch({
        query: explicitSearchQuery,
        maxResults: webSearchConfig.maxResults,
      });
      onSearchComplete(searchMetadata);

      // Append search results to user's message (avoid system role which breaks some models)
      const searchContext = formatSearchResultsForLLM(searchMetadata);
      const lastIdx = messages.length - 1;
      effectiveMessages = messages.map((m, i) =>
        i === lastIdx
          ? { ...m, content: `${m.content}\n\n---\nWeb search results for "${explicitSearchQuery}":\n${searchContext}\n---\n\nPlease use the search results above to answer my question.` }
          : m
      );
    } catch {
      // Search failed, continue without results
    }
  }

  // Track what content we've already emitted
  let emittedLength = 0;

  // First streaming pass
  try {
    await new Promise<void>((resolve, reject) => {
      sendMessage(
        config,
        effectiveMessages,
        (chunk) => {
          accumulatedContent += chunk;

          // Check for search tag
          if (webSearchConfig?.enabled && !searchExecuted) {
            const match = accumulatedContent.match(SEARCH_TAG_REGEX);
            if (match) {
              // Found complete search tag - emit content before the tag
              const tagStart = accumulatedContent.indexOf('<search>');
              if (emittedLength < tagStart) {
                onChunk(accumulatedContent.substring(emittedLength, tagStart));
                emittedLength = tagStart;
              }
              return; // Don't emit the search tag or content after it yet
            }

            // If we see the start of a search tag, buffer it
            if (accumulatedContent.includes('<search>') && !accumulatedContent.includes('</search>')) {
              const tagStart = accumulatedContent.indexOf('<search>');
              if (emittedLength < tagStart) {
                onChunk(accumulatedContent.substring(emittedLength, tagStart));
                emittedLength = tagStart;
              }
              return;
            }
          }

          // Normal chunk - emit it
          onChunk(chunk);
          emittedLength = accumulatedContent.length;
        },
        () => resolve(),
        (err) => reject(err),
        abortSignal
      );
    });
  } catch (err) {
    if (!abortSignal?.aborted) {
      onError(isLLMError(err) ? err : createError('unknown', 'Streaming failed'));
    }
    onDone(undefined);
    return;
  }

  // Handle incomplete search tag (LLM started <search> but didn't close it)
  if (accumulatedContent.includes('<search>') && !accumulatedContent.includes('</search>')) {
    // Emit the buffered content as-is since search tag wasn't completed
    const tagStart = accumulatedContent.indexOf('<search>');
    if (emittedLength <= tagStart) {
      onChunk(accumulatedContent.substring(emittedLength));
    }
    onDone(undefined);
    return;
  }

  // Check if we found a search tag
  const searchMatch = accumulatedContent.match(SEARCH_TAG_REGEX);

  if (searchMatch && webSearchConfig?.enabled && !searchExecuted) {
    const query = searchMatch[1].trim();
    searchExecuted = true;

    onSearchStart(query);

    try {
      // Execute the search
      searchMetadata = await executeSearch({
        query,
        maxResults: webSearchConfig.maxResults,
      });
      onSearchComplete(searchMetadata);

      // Get content before the search tag
      const contentBeforeTag = accumulatedContent.substring(0, accumulatedContent.indexOf('<search>'));

      // Build continuation messages with search results
      const searchResultsText = formatSearchResultsForLLM(searchMetadata);
      const continuationMessages: Message[] = [
        ...effectiveMessages,
        {
          id: 'search-partial',
          role: 'assistant',
          content: contentBeforeTag + `\n\n[Searched for: "${query}"]`,
          createdAt: Date.now(),
        },
        {
          id: 'search-results',
          role: 'system',
          content: searchResultsText,
          createdAt: Date.now(),
        },
      ];

      // Reset and continue generation with search results
      accumulatedContent = contentBeforeTag;

      await new Promise<void>((resolve, reject) => {
        sendMessage(
          config,
          continuationMessages,
          (chunk) => {
            accumulatedContent += chunk;
            onChunk(chunk);
          },
          () => resolve(),
          (err) => reject(err),
          abortSignal
        );
      }).catch((err) => {
        if (!abortSignal?.aborted) {
          onError(isLLMError(err) ? err : createError('unknown', 'Continuation failed'));
        }
      });

    } catch (searchError) {
      // Search failed - let the model continue without results
      console.error('Search failed:', searchError);
      onChunk(`\n\n[Search failed: ${searchError instanceof Error ? searchError.message : 'Unknown error'}]\n\n`);
    }
  }

  onDone(searchMetadata);
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

// Generate a summary of a conversation branch (non-streaming)
export async function generateBranchSummary(
  config: LLMConfig,
  messages: Message[]
): Promise<string> {
  const { endpoint, apiKey, model } = config;

  // Helper to create fallback summary from messages
  const getFallbackSummary = (): string => {
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser && firstUser.content.trim()) {
      const content = firstUser.content.trim();
      return content.length > 100 ? content.substring(0, 97) + '...' : content;
    }
    return 'Conversation branch';
  };

  if (!endpoint || !model || messages.length === 0) {
    return getFallbackSummary();
  }

  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Build conversation context for summary
  const conversationText = messages
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  if (!conversationText) {
    return getFallbackSummary();
  }

  const summaryPrompt = {
    role: 'user',
    content: `Summarize this conversation in 1-2 short sentences (max 150 characters total). Focus on the main topic. Be very concise.

${conversationText}

Summary:`,
  };

  const requestBody = {
    model,
    messages: [summaryPrompt],
    stream: false,
    max_tokens: 200,
    // Disable reasoning/thinking for efficiency (simple summarization task)
    reasoning_effort: 'none',      // OpenAI o1/o3
    enable_thinking: false,        // DeepSeek
    think: false,                  // Alternative DeepSeek param
  };

  const body = JSON.stringify(requestBody);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      return getFallbackSummary();
    }

    const data = await response.json();

    // Handle multiple response formats (OpenAI, Ollama, LM Studio, reasoning models, etc.)
    let summary: string | undefined;
    const message = data.choices?.[0]?.message;

    // OpenAI format: data.choices[0].message.content
    if (message?.content) {
      summary = message.content.trim();
    }
    // Reasoning models (DeepSeek R1, etc.): content may be empty, summary might be in reasoning
    // Try to extract the actual summary from the reasoning text
    else if (message?.reasoning) {
      // Look for patterns like "Summary:" or quoted text in reasoning
      const reasoning = message.reasoning as string;
      // Try to find a quoted summary
      const quotedMatch = reasoning.match(/"([^"]{10,150})"/);
      if (quotedMatch) {
        summary = quotedMatch[1].trim();
      } else {
        // Use last sentence-like chunk as fallback (often the conclusion)
        const sentences = reasoning.split(/[.!?]\s+/);
        const lastMeaningful = sentences.filter(s => s.length > 20).pop();
        if (lastMeaningful) {
          summary = lastMeaningful.trim().substring(0, 150);
        }
      }
    }
    // Ollama format: data.message.content
    else if (data.message?.content) {
      summary = data.message.content.trim();
    }
    // Alternative: data.content
    else if (data.content) {
      summary = (typeof data.content === 'string' ? data.content : String(data.content)).trim();
    }
    // Ollama generate format: data.response
    else if (data.response) {
      summary = data.response.trim();
    }

    // If we got a valid summary, use it (truncated if needed)
    if (summary && summary.length > 0) {
      return summary.length > 150 ? summary.substring(0, 147) + '...' : summary;
    }

    // Empty response from API, use fallback
    return getFallbackSummary();
  } catch {
    return getFallbackSummary();
  }
}

/**
 * Generate a summary of a conversation path for context compression
 * Used by summary nodes to replace full conversation history
 */
export async function generatePathSummary(
  config: LLMConfig,
  messages: Message[]
): Promise<string> {
  const { endpoint, apiKey, model } = config;

  // Helper to create fallback summary from messages
  const getFallbackSummary = (): string => {
    const userCount = messages.filter((m) => m.role === 'user').length;
    const assistantCount = messages.filter((m) => m.role === 'assistant').length;
    return `Summary of ${messages.length} messages (${userCount} user, ${assistantCount} assistant)`;
  };

  if (!endpoint || !model || messages.length === 0) {
    console.warn('generatePathSummary: Missing required config or no messages', {
      hasEndpoint: !!endpoint,
      hasModel: !!model,
      messageCount: messages.length
    });
    return getFallbackSummary();
  }

  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Build conversation context for summary
  const conversationText = messages
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  if (!conversationText) {
    return getFallbackSummary();
  }

  const summaryPrompt = {
    role: 'user',
    content: `You are creating a detailed summary that will replace the full conversation history for future messages in this thread. This summary is critical - any information you omit will be lost forever.

Analyze this conversation and create a comprehensive summary that preserves:

CONTEXT & PURPOSE:
- What was the user trying to accomplish or explore?
- What was the starting situation, challenge, or question?
- What were the main goals or desired outcomes?

KEY CONTENT:
- Main topics, themes, or areas explored
- Important questions asked and their answers
- Specific details: names, numbers, examples, references
- Ideas, approaches, or options discussed
- Any frameworks, models, or structures proposed

IMPORTANT DETAILS:
- Specific methods, tools, or resources mentioned
- Design decisions, patterns, or approaches considered
- Problems or challenges identified and how they were addressed
- Reasoning behind key choices or recommendations

OUTCOMES & NEXT STEPS:
- Conclusions, decisions, or agreements reached
- Plans, action items, or recommendations
- What was learned or discovered
- Any remaining questions or areas to explore further

Write a thorough, detailed summary using multiple paragraphs. Include specific details - don't generalize. Aim for 1500-2000 characters to ensure nothing important is lost.

CONVERSATION:
${conversationText}

DETAILED SUMMARY:`,
  };

  const requestBody = {
    model,
    messages: [summaryPrompt],
    stream: false,
    max_tokens: 2000,
  };

  const body = JSON.stringify(requestBody);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('generatePathSummary: LLM request failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return getFallbackSummary();
    }

    const data = await response.json();

    // Handle multiple response formats
    let summary: string | undefined;
    const message = data.choices?.[0]?.message;

    // OpenAI format
    if (message?.content) {
      summary = message.content.trim();
    }
    // Reasoning models
    else if (message?.reasoning) {
      const reasoning = message.reasoning as string;
      const quotedMatch = reasoning.match(/"([^"]{10,200})"/);
      if (quotedMatch) {
        summary = quotedMatch[1].trim();
      } else {
        const sentences = reasoning.split(/[.!?]\s+/);
        const lastMeaningful = sentences.filter(s => s.length > 20).pop();
        if (lastMeaningful) {
          summary = lastMeaningful.trim().substring(0, 200);
        }
      }
    }
    // Ollama format
    else if (data.message?.content) {
      summary = data.message.content.trim();
    }
    // Alternative formats
    else if (data.content) {
      summary = (typeof data.content === 'string' ? data.content : String(data.content)).trim();
    }
    else if (data.response) {
      summary = data.response.trim();
    }

    // Return summary (no truncation - preserve all context)
    if (summary && summary.length > 0) {
      return summary;
    }

    console.warn('generatePathSummary: Could not extract summary from response', { data });
    return getFallbackSummary();
  } catch (error) {
    console.error('generatePathSummary: Exception occurred', error);
    return getFallbackSummary();
  }
}
