/**
 * Chunking service for splitting text into overlapping chunks
 */

export interface ChunkOptions {
  maxTokens: number;      // Maximum tokens per chunk (default: 500)
  overlapTokens: number;  // Overlap between chunks (default: 100)
}

export interface Chunk {
  content: string;
  tokenCount: number;
  chunkIndex: number;
  startOffset: number;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxTokens: 500,
  overlapTokens: 100,
};

/**
 * Estimate token count from text (same as frontend: ~3.5 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Split text into sentences (simple heuristic)
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries: . ! ? followed by space/newline
  const sentences = text.split(/([.!?]+\s+|\n+)/);
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const separator = sentences[i + 1] || '';
    if (sentence.trim()) {
      result.push(sentence + separator);
    }
  }

  return result;
}

/**
 * Chunk text with overlap for better context continuity
 */
export function chunkText(text: string, options: Partial<ChunkOptions> = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sentences = splitIntoSentences(text);
  const chunks: Chunk[] = [];

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;
  let charOffset = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);

    // Check if adding this sentence would exceed limit
    if (currentTokens + sentenceTokens > opts.maxTokens && currentChunk.length > 0) {
      // Finalize current chunk
      const chunkContent = currentChunk.join('').trim();
      chunks.push({
        content: chunkContent,
        tokenCount: estimateTokens(chunkContent),
        chunkIndex: chunkIndex++,
        startOffset: charOffset,
      });

      // Calculate overlap: keep last N sentences to maintain context
      const overlapSentences: string[] = [];
      let overlapTokenCount = 0;

      for (let j = currentChunk.length - 1; j >= 0 && overlapTokenCount < opts.overlapTokens; j--) {
        const overlapSentence = currentChunk[j];
        const overlapSentenceTokens = estimateTokens(overlapSentence);

        if (overlapTokenCount + overlapSentenceTokens <= opts.overlapTokens) {
          overlapSentences.unshift(overlapSentence);
          overlapTokenCount += overlapSentenceTokens;
        } else {
          break;
        }
      }

      // Start new chunk with overlap
      charOffset += chunkContent.length - overlapSentences.join('').length;
      currentChunk = overlapSentences;
      currentTokens = overlapTokenCount;
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Add final chunk if there's remaining content
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('').trim();
    chunks.push({
      content: chunkContent,
      tokenCount: estimateTokens(chunkContent),
      chunkIndex: chunkIndex,
      startOffset: charOffset,
    });
  }

  return chunks;
}
