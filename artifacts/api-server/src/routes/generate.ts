import { Router } from "express";
import { z } from "zod";
import { GenerateQuizBody } from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";
import { aiLimiter } from "../middlewares/rateLimit.js";

const router = Router();

// ─── Canonical Question Schema ────────────────────────────────────────────────
// This is the single authoritative schema for a quiz question used by:
//   - AI generation (this file)
//   - PDF generation (pdf-generate.ts)
//   - Manual creation (via CreateQuizBody from @workspace/api-zod)
//   - Database storage (Mongoose Quiz model)
const CanonicalQuestion = z.object({
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
});

export type CanonicalQuestionType = z.infer<typeof CanonicalQuestion>;

const CanonicalGenerateResponse = z.object({
  questions: z
    .array(CanonicalQuestion)
    .min(1, "At least one question required"),
});

// ─── Gemini JSON Schema for Structured Output ────────────────────────────────
// Using responseSchema enforces the structure at the model level,
// not just via prompt engineering.
const geminiResponseSchema = {
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
        },
        required: ["question", "options", "correctAnswer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

// ─── Validation Helpers ───────────────────────────────────────────────────────
function validateAndFilterQuestions(questions: CanonicalQuestionType[]): {
  valid: CanonicalQuestionType[];
  invalidCount: number;
} {
  const seen = new Set<string>();
  const valid: CanonicalQuestionType[] = [];
  let invalidCount = 0;

  for (const q of questions) {
    // Reject if correctAnswer is out of range
    if (q.correctAnswer < 0 || q.correctAnswer > 3) {
      invalidCount++;
      continue;
    }
    // Reject if options contain duplicates
    const uniqueOptions = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (uniqueOptions.size !== 4) {
      invalidCount++;
      continue;
    }
    // Deduplicate questions by text
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    valid.push(q);
  }

  return { valid, invalidCount };
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.post("/generate-quiz", requireAuth, aiLimiter, async (req: AuthRequest, res) => {
  const parsed = GenerateQuizBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { topic, difficulty, numberOfQuestions } = parsed.data;

  const prompt = `You are a quiz generator. Generate exactly ${numberOfQuestions} multiple-choice questions about "${topic}" at ${difficulty} difficulty level.

IMPORTANT REQUIREMENTS:
- Return ONLY a single valid JSON object. No markdown, no code fences, no extra text.
- The root must be an object with a "questions" array.
- Each question must have exactly 4 distinct options.
- correctAnswer must be the ZERO-BASED index (0, 1, 2, or 3) of the correct option in the options array.
- explanation must be a non-empty string explaining why the correct answer is right.

Example output:
{
  "questions": [
    {
      "question": "What is the time complexity of binary search?",
      "options": ["O(n)", "O(log n)", "O(n²)", "O(1)"],
      "correctAnswer": 1,
      "explanation": "Binary search halves the search space each step, giving O(log n) time complexity."
    }
  ]
}`;

  let rawText = "";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
        maxOutputTokens: 8192,
      },
    });

    rawText = response.text ?? "";
  } catch (err: any) {
    const errorDetails = formatGeminiError(err, "gemini-3.1-flash-lite");
    req.log.error(
      { model: "gemini-3.1-flash-lite", endpoint: errorDetails.endpoint, status: errorDetails.status, details: errorDetails.details },
      "Gemini API error during quiz generation"
    );

    if (errorDetails.status === 401 || errorDetails.status === 403) {
      res.status(errorDetails.status).json({ message: "Gemini API authentication failed. Please check your API key." });
    } else if (errorDetails.status === 429) {
      res.status(429).json({ message: "Gemini API rate limit or quota exceeded. Please try again later." });
    } else if (errorDetails.status === 404) {
      res.status(503).json({ message: "AI model unavailable. Please try again later." });
    } else {
      res.status(503).json({ message: "AI service temporarily unavailable. Please try again." });
    }
    return;
  }

  // ─── Parse JSON ─────────────────────────────────────────────────────────────
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    req.log.error(
      { model: "gemini-3.1-flash-lite", rawTextLength: rawText.length, rawTextPreview: rawText.slice(0, 200) },
      "Gemini returned non-JSON output"
    );
    res.status(500).json({ message: "AI returned an invalid response. Please try again." });
    return;
  }

  // ─── Schema Validation ───────────────────────────────────────────────────────
  const validated = CanonicalGenerateResponse.safeParse(parsedJson);
  if (!validated.success) {
    req.log.error(
      { model: "gemini-3.1-flash-lite", errors: validated.error.errors, parsedJson },
      "Gemini response failed schema validation"
    );
    res.status(500).json({ message: "AI response did not match expected format. Please try again." });
    return;
  }

  // ─── Strengthen: filter invalid/duplicate questions ──────────────────────────
  const { valid, invalidCount } = validateAndFilterQuestions(validated.data.questions);
  if (invalidCount > 0) {
    req.log.warn({ invalidCount, model: "gemini-3.1-flash-lite" }, "Filtered invalid questions from Gemini response");
  }

  if (valid.length === 0) {
    req.log.error({ model: "gemini-3.1-flash-lite", rawResponse: parsedJson }, "All questions were invalid after filtering");
    res.status(500).json({ message: "AI failed to generate valid questions. Please try again." });
    return;
  }

  res.json({ questions: valid });
});

export default router;
