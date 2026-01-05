import fs from 'fs/promises';
import mammoth from 'mammoth';
import type { ExtractedContent } from './textExtractor.js';

/**
 * Extract text from Word (.docx) files
 */
export async function extractDOCX(filePath: string): Promise<ExtractedContent> {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
  };
}
