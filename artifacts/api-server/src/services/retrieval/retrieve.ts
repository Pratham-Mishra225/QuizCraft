import { embedText } from "../embeddings/embed.js";
import { searchSimilarChunks, type ScoredChunk } from "./vectorStore.js";
import { env } from "../../config/env.js";

export interface RetrievalOptions {
  topK?: number;
  diversifyPages?: boolean;
}

/**
 * Diversifies retrieved chunks across different pages to prevent clustering on a single section.
 */
export function diversifyChunks(chunks: ScoredChunk[], limit: number): ScoredChunk[] {
  if (chunks.length <= limit) return chunks;

  const pageBuckets = new Map<number, ScoredChunk[]>();
  for (const chunk of chunks) {
    const bucket = pageBuckets.get(chunk.pageNumber) || [];
    bucket.push(chunk);
    pageBuckets.set(chunk.pageNumber, bucket);
  }

  const result: ScoredChunk[] = [];
  const seenChunkIds = new Set<string>();

  // Round-robin selection across page buckets
  let added = true;
  while (result.length < limit && added) {
    added = false;
    for (const [, bucket] of pageBuckets.entries()) {
      if (bucket.length > 0 && result.length < limit) {
        const next = bucket.shift()!;
        if (!seenChunkIds.has(next.chunkId)) {
          seenChunkIds.add(next.chunkId);
          result.push(next);
          added = true;
        }
      }
    }
  }

  // If still room, fill with remaining highest scored
  if (result.length < limit) {
    for (const chunk of chunks) {
      if (!seenChunkIds.has(chunk.chunkId)) {
        seenChunkIds.add(chunk.chunkId);
        result.push(chunk);
        if (result.length === limit) break;
      }
    }
  }

  return result;
}

/**
 * Retrieves relevant context chunks for a query from a user's document.
 */
export async function retrieveContextForQuery(
  documentId: string,
  userId: string,
  query: string,
  options?: RetrievalOptions
): Promise<ScoredChunk[]> {
  const topK = options?.topK ?? env.RAG_TOP_K;

  // 1. Generate embedding for user query
  const queryEmbedding = await embedText(query);

  // 2. Perform vector similarity search (fetch up to 2x topK for diversification)
  const candidateChunks = await searchSimilarChunks(
    documentId,
    userId,
    queryEmbedding,
    topK * 2
  );

  if (candidateChunks.length === 0) {
    return [];
  }

  // 3. Diversify across pages if requested (default: true)
  const diversify = options?.diversifyPages ?? true;
  if (diversify) {
    return diversifyChunks(candidateChunks, topK);
  }

  return candidateChunks.slice(0, topK);
}
