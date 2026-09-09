import { Types } from "mongoose";
import { DocumentChunk, type IDocumentChunk } from "../../models/DocumentChunk.js";

export interface ScoredChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Stores document chunks with their embeddings in MongoDB.
 */
export async function storeChunks(
  documentId: string | Types.ObjectId,
  userId: string | Types.ObjectId,
  chunks: Array<{
    chunkId: string;
    pageNumber: number;
    text: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>
): Promise<IDocumentChunk[]> {
  const docId = typeof documentId === "string" ? new Types.ObjectId(documentId) : documentId;
  const uId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  const docsToInsert = chunks.map((c) => ({
    documentId: docId,
    userId: uId,
    chunkId: c.chunkId,
    pageNumber: c.pageNumber,
    text: c.text,
    embedding: c.embedding,
    metadata: c.metadata ?? null,
  }));

  return await DocumentChunk.insertMany(docsToInsert) as unknown as IDocumentChunk[];
}

/**
 * Performs vector similarity search scoped strictly to the authenticated user and document.
 */
export async function searchSimilarChunks(
  documentId: string | Types.ObjectId,
  userId: string | Types.ObjectId,
  queryEmbedding: number[],
  topK: number = 5
): Promise<ScoredChunk[]> {
  const docId = typeof documentId === "string" ? new Types.ObjectId(documentId) : documentId;
  const uId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  // Retrieve chunks scoped strictly to the document and authenticated user
  const chunks = await DocumentChunk.find({
    documentId: docId,
    userId: uId,
  }).lean<IDocumentChunk[]>();

  if (chunks.length === 0) {
    return [];
  }

  // Calculate similarity scores
  const scoredChunks: ScoredChunk[] = chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentId: String(chunk.documentId),
    pageNumber: chunk.pageNumber,
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
    metadata: chunk.metadata as Record<string, unknown> | undefined,
  }));

  // Sort descending by similarity score and return topK
  scoredChunks.sort((a, b) => b.score - a.score);

  return scoredChunks.slice(0, topK);
}
