import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

/**
 * Generates an embedding vector for a single text query or passage.
 */
export async function embedText(text: string, model: string = env.EMBEDDING_MODEL): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  try {
    const response = await ai.models.embedContent({
      model,
      contents: [{ parts: [{ text }] }],
    });

    const values =
      (response as any).embedding?.values ||
      (response as any).embeddings?.[0]?.values ||
      (response as any).values;

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`Embedding model returned invalid vector: ${JSON.stringify(response)}`);
    }

    return values as number[];
  } catch (err: any) {
    const errorDetails = formatGeminiError(err, model);
    logger.error(
      { model, status: errorDetails.status, details: errorDetails.details },
      "Gemini embedding generation failed"
    );
    throw new Error(`Embedding generation failed: ${errorDetails.message}`);
  }
}

/**
 * Generates embeddings for a batch of chunk texts.
 * Batches requests sequentially or in small parallel groups to avoid rate-limiting.
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
      embedText(t, model).then((vec) => {
        results[i + idx] = vec;
      })
    );
    await Promise.all(promises);
  }

  return results;
}
