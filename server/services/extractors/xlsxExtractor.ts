import fs from 'fs/promises';
import * as XLSX from 'xlsx';
import type { ExtractedContent } from './textExtractor.js';

/**
 * Extract text from Excel (.xlsx) files
 */
export async function extractXLSX(filePath: string): Promise<ExtractedContent> {
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  let text = '';

  // Process each sheet
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    text += `\n\n=== Sheet: ${sheetName} ===\n\n`;

    // Convert sheet to CSV format (preserves structure better than JSON)
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += csv;
  });

  return { text: text.trim() };
}
