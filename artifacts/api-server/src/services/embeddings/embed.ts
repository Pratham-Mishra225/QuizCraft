import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

// ── Embedding task types ───────────────────────────────────────────────────────
// gemini-embedding-001 supports task-type hints that improve retrieval quality.
// RETRIEVAL_DOCUMENT is used when indexing chunks into the vector store.
// RETRIEVAL_QUERY is used when embedding a user query for retrieval.
export const TASK_TYPE_DOCUMENT = "RETRIEVAL_DOCUMENT";
export const TASK_TYPE_QUERY = "RETRIEVAL_QUERY";

// ── Embedding dimensionality ───────────────────────────────────────────────────
// gemini-embedding-001 supports 768, 1536, and 3072 dimensions.
// We use 768 throughout: stored chunks, vector search, and query embeddings
// MUST all use the same dimensionality.
// WARNING: If you change this value, all existing DocumentChunk embeddings must
// be deleted and re-generated before vector search will work correctly.
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Generates an embedding vector for a single text string.
 *
 * @param text     - Text to embed.
 * @param taskType - RETRIEVAL_DOCUMENT for indexed chunks, RETRIEVAL_QUERY for
 *                   search queries.  Defaults to RETRIEVAL_QUERY.
 * @param model    - Embedding model name.  Defaults to env.EMBEDDING_MODEL.
 */
export async function embedText(
  text: string,
  taskType: string = TASK_TYPE_QUERY,
  model: string = env.EMBEDDING_MODEL
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  try {
    const response = await ai.models.embedContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    // EmbedContentResponse shape: { embeddings: ContentEmbedding[] }
    // ContentEmbedding shape: { values: number[] }
    const values = response?.embeddings?.[0]?.values;

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`Embedding model returned invalid vector: ${JSON.stringify(response)}`);
    }

    return values as number[];
  } catch (err: any) {
    const errorDetails = formatGeminiError(err, model);
    logger.error(
      { model, status: errorDetails.status, details: errorDetails.details },
      errorDetails.status === 404
        ? `Embedding model unavailable: "${model}" returned 404. Check EMBEDDING_MODEL env var.`
        : "Gemini embedding generation failed"
    );
    if (errorDetails.status === 404) {
      throw new Error(
        `Embedding model "${model}" is not available. Update EMBEDDING_MODEL to "gemini-embedding-001".`
      );
    }
    throw new Error(`Embedding generation failed: ${errorDetails.message}`);
  }
}

/**
 * Generates embeddings for a batch of document chunk texts.
 * Uses RETRIEVAL_DOCUMENT task type — appropriate for indexing content.
 *
 * Processes chunks in bounded parallel batches to avoid overwhelming the
 * Gemini API with unbounded concurrency on large documents.
 *
 * @param texts       - Array of chunk texts to embed.
 * @param model       - Embedding model name. Defaults to env.EMBEDDING_MODEL.
 * @param concurrency - Max parallel requests per batch window. Default: 5.
 */
export async function embedBatch(
  texts: string[],
  model: string = env.EMBEDDING_MODEL,
  concurrency: number = 5
): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const promises = batch.map((t, idx) =>
      embedText(t, TASK_TYPE_DOCUMENT, model).then((vec) => {
        results[i + idx] = vec;
      })
    );
    await Promise.all(promises);
  }

  return results;
}
