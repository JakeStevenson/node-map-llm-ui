import type { SearchMetadata, ServerSearchConfig } from '../types';

const API_BASE = '/api';

export interface SearchRequest {
  query: string;
  maxResults?: number;
}

// Execute a web search via the backend
export async function executeSearch(request: SearchRequest): Promise<SearchMetadata> {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(error.error || 'Search failed');
  }

  return res.json();
}

// Get server search configuration
export async function getServerSearchConfig(): Promise<ServerSearchConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/search/config`);
    if (res.ok) {
      return res.json();
    }
    return null;
  } catch {
    return null;
  }
}

// Test if the server's Searxng endpoint is reachable
export async function testSearchEndpoint(): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/search/test`);
  return res.json();
}

// Format search results for injection into LLM context
export function formatSearchResultsForLLM(metadata: SearchMetadata): string {
  if (!metadata.results.length) {
    return `[Web search for "${metadata.query}" returned no results]`;
  }

  const resultsText = metadata.results
    .map((r, i) => {
      const snippet = r.snippet.length > 300 ? r.snippet.substring(0, 297) + '...' : r.snippet;
      return `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${snippet}`;
    })
    .join('\n\n');

  return `[Web Search Results for "${metadata.query}"]\n\n${resultsText}\n\n[End of search results. Use these to answer the user's question. Cite sources when relevant.]`;
}
