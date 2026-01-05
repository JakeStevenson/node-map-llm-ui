import fs from 'fs/promises';

export interface ExtractedContent {
  text: string;
  pageCount?: number;
}

/**
 * Extract text from plain text and markdown files
 */
export async function extractText(filePath: string): Promise<ExtractedContent> {
  const text = await fs.readFile(filePath, 'utf-8');
  return { text };
}
