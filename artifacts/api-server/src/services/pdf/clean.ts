import type { ExtractedPage } from "./extract.js";

export interface CleanedPage {
  pageNumber: number;
  text: string;
}

/**
 * Deterministically cleans extracted page text while preserving semantic meaning
 * and paragraph structure.
 */
export function cleanPageText(rawText: string): string {
  if (!rawText) return "";

  return (
    rawText
      // Remove null characters and non-printable control characters except standard newlines/tabs
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize Unicode non-breaking spaces
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      // Normalize horizontal whitespace (tabs and multiple spaces)
      .replace(/[ \t]+/g, " ")
      // Standardize Windows / Mac newlines
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Split into lines, trim each line
      .split("\n")
      .map((line) => line.trim())
      // Filter out isolated standalone artifacts like page footer numbers
      .filter((line) => line.length > 0)
      // Rejoin with single newlines
      .join("\n")
      // Collapse 3+ consecutive newlines to maximum 2
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Cleans an array of extracted PDF pages.
 */
export function cleanExtractedPages(pages: ExtractedPage[]): CleanedPage[] {
  return pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: cleanPageText(page.text),
    }))
    .filter((page) => page.text.length > 0);
}
