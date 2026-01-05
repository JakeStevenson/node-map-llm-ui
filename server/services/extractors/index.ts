import { extractText } from './textExtractor.js';
import { extractPDF } from './pdfExtractor.js';
import { extractDOCX } from './docxExtractor.js';
import { extractXLSX } from './xlsxExtractor.js';
import type { ExtractedContent } from './textExtractor.js';

export { ExtractedContent };

/**
 * Route to appropriate extractor based on MIME type
 */
export async function extractContent(filePath: string, mimeType: string): Promise<ExtractedContent> {
  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
      return extractText(filePath);

    case 'application/pdf':
      return extractPDF(filePath);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractDOCX(filePath);

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return extractXLSX(filePath);

    case 'image/jpeg':
    case 'image/png':
      // For Phase 2, images are not processed (would need OCR or vision model)
      return { text: '[Image content - OCR not yet implemented]' };

    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}
