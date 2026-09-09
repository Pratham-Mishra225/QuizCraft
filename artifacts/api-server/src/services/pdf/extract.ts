// Import from the lib path to avoid pdf-parse reading test files at startup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;

import { env } from "../../config/env.js";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  totalPages: number;
  info?: Record<string, unknown>;
}

/**
 * Page-aware PDF extractor that preserves page numbers and text content.
 * Enforces max page limits and avoids silent truncation.
 */
export async function extractPagesFromPdf(
  buffer: Buffer,
  maxPages: number = env.PDF_MAX_PAGES
): Promise<ExtractionResult> {
  const pages: ExtractedPage[] = [];
  let currentPageIndex = 0;

  const renderPage = (pageData: {
    getTextContent: (options?: Record<string, unknown>) => Promise<{
      items: Array<{ str: string; transform: number[] }>;
    }>;
  }) => {
    currentPageIndex++;
    const pageNumber = currentPageIndex;

    return pageData.getTextContent().then((textContent) => {
      let lastY: number | undefined;
      let text = "";

      for (const item of textContent.items) {
        if (lastY === item.transform[5] || lastY === undefined) {
          text += item.str;
        } else {
          text += "\n" + item.str;
        }
        lastY = item.transform[5];
      }

      pages.push({
        pageNumber,
        text,
      });

      return text;
    });
  };

  const pdfData = await pdfParse(buffer, {
    pagerender: renderPage,
  });

  const totalPages = pdfData.numpages || pages.length;

  if (totalPages > maxPages) {
    throw new Error(
      `PDF contains ${totalPages} pages, exceeding the maximum allowed limit of ${maxPages} pages.`
    );
  }

  // Ensure deterministic page ordering
  pages.sort((a, b) => a.pageNumber - b.pageNumber);

  return {
    pages,
    totalPages,
    info: pdfData.info,
  };
}
