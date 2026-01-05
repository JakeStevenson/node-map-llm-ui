import fs from 'fs/promises';
import * as pdfParse from 'pdf-parse';
import type { ExtractedContent } from './textExtractor.js';

/**
 * Extract text from PDF files
 */
export async function extractPDF(filePath: string): Promise<ExtractedContent> {
  const dataBuffer = await fs.readFile(filePath);
  // @ts-ignore - pdf-parse has quirky ESM exports
  const data = await pdfParse.default(dataBuffer);

  return {
    text: data.text,
    pageCount: data.numpages,
  };
}
