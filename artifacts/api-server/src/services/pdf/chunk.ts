import crypto from "node:crypto";
import type { CleanedPage } from "./clean.js";
import { env } from "../../config/env.js";

export interface DocumentChunkData {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  text: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Splits text into paragraphs and sentences respecting natural text boundaries.
 */
function splitIntoSentences(text: string): string[] {
  // Split on double newlines (paragraphs) or sentence delimiters (. ! ?)
  const paragraphs = text.split(/\n\n+/);
  const segments: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Split paragraph into sentences where practical
    const sentences = trimmed.split(/(?<=[.?!])\s+/);
    for (const s of sentences) {
      const sentenceTrimmed = s.trim();
      if (sentenceTrimmed) {
        segments.push(sentenceTrimmed);
      }
    }
  }

  return segments;
}

/**
 * Creates sliding-window chunks from cleaned pages preserving page boundaries and metadata.
 */
export function chunkPages(
  pages: CleanedPage[],
  documentId: string,
  options?: ChunkingOptions
): DocumentChunkData[] {
  const targetChunkSize = options?.chunkSize ?? env.RAG_CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? env.RAG_CHUNK_OVERLAP;

  const allChunks: DocumentChunkData[] = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const segments = splitIntoSentences(page.text);
    if (segments.length === 0) continue;

    let currentChunkSentences: string[] = [];
    let currentChunkLength = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const segmentLength = segment.length;

      // If single segment is extraordinarily large, split by character window
      if (segmentLength > targetChunkSize) {
        // First flush any accumulated text
        if (currentChunkSentences.length > 0) {
          const chunkText = currentChunkSentences.join(" ");
          const chunkId = `chk_${documentId.slice(-6)}_p${page.pageNumber}_${globalChunkIndex++}_${crypto.randomBytes(3).toString("hex")}`;
          allChunks.push({
            chunkId,
            documentId,
            pageNumber: page.pageNumber,
            text: chunkText,
            chunkIndex: allChunks.length,
          });
          currentChunkSentences = [];
          currentChunkLength = 0;
        }

        // Chunk large segment in slices
        let start = 0;
        while (start < segment.length) {
          const end = Math.min(start + targetChunkSize, segment.length);
          const chunkText = segment.slice(start, end).trim();
          if (chunkText) {
            const chunkId = `chk_${documentId.slice(-6)}_p${page.pageNumber}_${globalChunkIndex++}_${crypto.randomBytes(3).toString("hex")}`;
            allChunks.push({
              chunkId,
              documentId,
              pageNumber: page.pageNumber,
              text: chunkText,
              chunkIndex: allChunks.length,
            });
          }
          if (end === segment.length) break;
          start += targetChunkSize - chunkOverlap;
        }
        continue;
      }

      // Check if adding this segment would exceed target size
      if (currentChunkLength + segmentLength > targetChunkSize && currentChunkSentences.length > 0) {
        const chunkText = currentChunkSentences.join(" ");
        const chunkId = `chk_${documentId.slice(-6)}_p${page.pageNumber}_${globalChunkIndex++}_${crypto.randomBytes(3).toString("hex")}`;
        allChunks.push({
          chunkId,
          documentId,
          pageNumber: page.pageNumber,
          text: chunkText,
          chunkIndex: allChunks.length,
        });

        // Compute overlap by retaining trailing sentences that fit within chunkOverlap
        const overlapSentences: string[] = [];
        let overlapLength = 0;
        for (let j = currentChunkSentences.length - 1; j >= 0; j--) {
          const s = currentChunkSentences[j]!;
          if (overlapLength + s.length <= chunkOverlap) {
            overlapSentences.unshift(s);
            overlapLength += s.length;
          } else {
            break;
          }
        }

        currentChunkSentences = [...overlapSentences, segment];
        currentChunkLength = currentChunkSentences.reduce((acc, s) => acc + s.length, 0);
      } else {
        currentChunkSentences.push(segment);
        currentChunkLength += segmentLength;
      }
    }

    // Flush remainder of page
    if (currentChunkSentences.length > 0) {
      const chunkText = currentChunkSentences.join(" ");
      const chunkId = `chk_${documentId.slice(-6)}_p${page.pageNumber}_${globalChunkIndex++}_${crypto.randomBytes(3).toString("hex")}`;
      allChunks.push({
        chunkId,
        documentId,
        pageNumber: page.pageNumber,
        text: chunkText,
        chunkIndex: allChunks.length,
      });
    }
  }

  return allChunks;
}
