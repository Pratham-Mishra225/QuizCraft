import { z } from "zod";
import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";
import type { ScoredChunk } from "../retrieval/vectorStore.js";
import { logger } from "../../lib/logger.js";

// ─── Canonical Question & Source Schemas ─────────────────────────────────────
export const GeneratedQuestionSourceSchema = z.object({
  documentId: z.string().optional(),
  chunkId: z.string().min(1, "chunkId is required"),
  pageNumber: z.number().int().min(1).optional(),
});

export const GeneratedQuestionSchema = z.object({
  question: z.string().min(1, "Question text must not be empty"),
  options: z
    .array(z.string().min(1, "Option text must not be empty"))
    .length(4, "Exactly 4 options are required"),
  correctAnswer: z
    .number()
    .int()
    .min(0)
    .max(3, "correctAnswer must be 0, 1, 2, or 3"),
  explanation: z.string().min(1, "Explanation must not be empty"),
  source: GeneratedQuestionSourceSchema.optional().nullable(),
});

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

const GeneratedQuestionsResponseSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1),
});

// ─── Gemini JSON Schema for Structured Output ─────────────────────────────────
const geminiRagResponseSchema = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          question: { type: "string" as const },
          options: {
            type: "array" as const,
            items: { type: "string" as const },
            minItems: 4,
            maxItems: 4,
          },
          correctAnswer: {
            type: "integer" as const,
            minimum: 0,
            maximum: 3,
          },
          explanation: { type: "string" as const },
          source: {
            type: "object" as const,
            properties: {
              chunkId: { type: "string" as const },
              pageNumber: { type: "integer" as const },
            },
            required: ["chunkId"],
          },
        },
        required: ["question", "options", "correctAnswer", "explanation", "source"],
      },
    },
  },
  required: ["questions"],
};

/**
 * Builds context text from retrieved chunks with source tags.
 */
export function formatRetrievedContext(chunks: ScoredChunk[]): string {
  return chunks
    .map(
      (c, idx) =>
        `[SOURCE CHUNK #${idx + 1} | ChunkID: ${c.chunkId} | Page: ${c.pageNumber}]\n${c.text}`
    )
    .join("\n\n---\n\n");
}

export interface GenerateFromContextOptions {
  numberOfQuestions: number;
  difficulty: "easy" | "medium" | "hard";
  fileName: string;
}

/**
 * Generates grounded quiz questions from retrieved document context using Gemini.
 */
export async function generateQuizFromContext(
  chunks: ScoredChunk[],
  options: GenerateFromContextOptions
): Promise<GeneratedQuestion[]> {
  if (chunks.length === 0) {
    throw new Error("No relevant context chunks available for quiz generation");
  }

  const formattedContext = formatRetrievedContext(chunks);
  const chunkMap = new Map<string, ScoredChunk>();
  for (const c of chunks) {
    chunkMap.set(c.chunkId, c);
  }

  const prompt = `You are an expert educational quiz generator.
Based ONLY on the provided source chunks from "${options.fileName}", generate exactly ${options.numberOfQuestions} multiple-choice questions at ${options.difficulty} difficulty.

SOURCE CONTEXT:
${formattedContext}

STRICT GROUNDING & CITATION RULES:
1. Ground every single question ONLY in the provided source chunks. Do NOT invent facts or use external knowledge.
2. For each question, cite the exact "chunkId" of the source chunk from which the question and answer were derived.
3. Each question must have exactly 4 distinct, non-empty options.
4. "correctAnswer" must be the ZERO-BASED integer index (0, 1, 2, or 3) of the correct option.
5. "explanation" must be non-empty and clearly explain why the answer is correct referencing the text.
6. Return ONLY valid JSON adhering to the provided structured schema.`;

  let rawText = "";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: geminiRagResponseSchema,
        maxOutputTokens: 8192,
      },
    });
    rawText = response.text ?? "";
  } catch (err: any) {
    const errorDetails = formatGeminiError(err, "gemini-3.1-flash-lite");
    logger.error(
      { model: "gemini-3.1-flash-lite", status: errorDetails.status, details: errorDetails.details },
      "Gemini generation error during RAG quiz creation"
    );
    throw new Error(`AI generation service error: ${errorDetails.message}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    logger.error({ rawText }, "Gemini returned non-JSON output for RAG quiz");
    throw new Error("AI returned invalid JSON response");
  }

  const validated = GeneratedQuestionsResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    logger.error({ errors: validated.error.errors, parsedJson }, "RAG response schema validation failed");
    throw new Error("AI response failed schema validation");
  }

  // ── Authoritative Source Mapping & Grounding Validation ──
  const validQuestions: GeneratedQuestion[] = [];
  const seenQuestions = new Set<string>();

  for (const q of validated.data.questions) {
    const questionText = q.question.trim().toLowerCase();
    if (seenQuestions.has(questionText)) continue;

    // Validate options count and uniqueness
    const uniqueOpts = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (uniqueOpts.size !== 4) continue;

    if (q.correctAnswer < 0 || q.correctAnswer > 3) continue;

    // Map source chunk authoritatively
    let authorativeSource = q.source;
    if (q.source && q.source.chunkId) {
      const matchedChunk = chunkMap.get(q.source.chunkId);
      if (matchedChunk) {
        authorativeSource = {
          documentId: matchedChunk.documentId,
          chunkId: matchedChunk.chunkId,
          pageNumber: matchedChunk.pageNumber, // Authoritative page number from retrieved chunk
        };
      } else {
        // If LLM returned a slightly mismatched chunkId, pick the first retrieved chunk as fallback
        const firstChunk = chunks[0]!;
        authorativeSource = {
          documentId: firstChunk.documentId,
          chunkId: firstChunk.chunkId,
          pageNumber: firstChunk.pageNumber,
        };
      }
    } else {
      const firstChunk = chunks[0]!;
      authorativeSource = {
        documentId: firstChunk.documentId,
        chunkId: firstChunk.chunkId,
        pageNumber: firstChunk.pageNumber,
      };
    }

    seenQuestions.add(questionText);
    validQuestions.push({
      ...q,
      source: authorativeSource,
    });
  }

  if (validQuestions.length === 0) {
    throw new Error("AI failed to generate valid grounded questions from context");
  }

  return validQuestions;
}
