import { Router, Request, Response } from 'express';

const router = Router();

// SECURITY: Searxng endpoint is configured server-side only (not from client)
// This prevents SSRF attacks where malicious clients could probe internal networks
const SEARXNG_ENDPOINT = process.env.SEARXNG_ENDPOINT || '';

interface SearxngResult {
  title: string;
  url: string;
  content: string;
  engine: string;
}

interface SearxngResponse {
  results: SearxngResult[];
  query: string;
}

// GET /api/search/config - Get search configuration status (not the actual endpoint)
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    enabled: !!SEARXNG_ENDPOINT,
    provider: 'searxng',
  });
});

// POST /api/search - Execute search query via Searxng
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!SEARXNG_ENDPOINT) {
      return res.status(503).json({ error: 'Search not configured on server' });
    }

    const { query, maxResults = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    // Validate maxResults bounds
    const safeMaxResults = Math.min(Math.max(1, Number(maxResults) || 5), 10);

    // Validate query length
    if (query.length > 500) {
      return res.status(400).json({ error: 'Query too long (max 500 chars)' });
    }

    // Build Searxng API URL using server-configured endpoint
    const searxngUrl = new URL('/search', SEARXNG_ENDPOINT);
    searxngUrl.searchParams.set('q', query);
    searxngUrl.searchParams.set('format', 'json');
    searxngUrl.searchParams.set('categories', 'general');

    const response = await fetch(searxngUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`Searxng error: ${response.status}`);
    }

    const data: SearxngResponse = await response.json();

    // Map to our SearchResult format
    const results = data.results.slice(0, safeMaxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || '',
      source: r.engine,
    }));

    res.json({
      query: data.query || query,
      results,
      timestamp: Date.now(),
      provider: 'searxng',
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Search failed',
    });
  }
});

// GET /api/search/test - Test search endpoint connectivity
router.get('/test', async (_req: Request, res: Response) => {
  if (!SEARXNG_ENDPOINT) {
    return res.json({
      success: false,
      error: 'SEARXNG_ENDPOINT not configured on server',
    });
  }

  try {
    const testUrl = new URL('/search', SEARXNG_ENDPOINT);
    testUrl.searchParams.set('q', 'test');
    testUrl.searchParams.set('format', 'json');

    const response = await fetch(testUrl.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    res.json({
      success: response.ok,
      status: response.status,
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  }
});

export default router;
