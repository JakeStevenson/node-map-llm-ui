/**
 * Embedding service using OpenAI-compatible API (Ollama, Groq, etc.)
 * Generates embeddings via API calls to configured endpoint
 */
class EmbeddingService {
  private endpoint: string;
  private apiKey: string | undefined;
  private modelName: string;
  private dimensions: number | null = null;

  constructor() {
    // Get configuration from environment
    this.endpoint = process.env.EMBEDDING_ENDPOINT || process.env.OPENAI_ENDPOINT || 'http://localhost:11434/v1';
    this.apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
    this.modelName = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

    console.log(`Embedding service configured: ${this.endpoint} using model ${this.modelName}`);
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    // Normalize text
    const normalizedText = text.trim();

    const url = `${this.endpoint.replace(/\/$/, '')}/embeddings`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body = JSON.stringify({
      model: this.modelName,
      input: normalizedText,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // Extract embedding from OpenAI-compatible response
      // Format: { data: [{ embedding: [0.1, 0.2, ...] }] }
      const embedding = data.data?.[0]?.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response format');
      }

      // Cache dimensions on first call
      if (this.dimensions === null) {
        this.dimensions = embedding.length;
        console.log(`Detected embedding dimensions: ${this.dimensions}`);
      }

      return new Float32Array(embedding);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * OpenAI API supports batching, but we'll process sequentially for compatibility
   */
  async generateBatch(texts: string[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Process batch in parallel
      const batchEmbeddings = await Promise.all(
        batch.map((text) => this.generateEmbedding(text))
      );

      embeddings.push(...batchEmbeddings);

      console.log(`Generated embeddings for ${i + batch.length}/${texts.length} texts`);
    }

    return embeddings;
  }

  /**
   * Get embedding dimensions (returns null until first embedding is generated)
   */
  getDimensions(): number | null {
    return this.dimensions;
  }
}

// Singleton instance
const embeddingService = new EmbeddingService();

export default embeddingService;
