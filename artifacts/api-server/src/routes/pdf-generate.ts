import { Router } from "express";
import multer from "multer";
// Import from the lib path to avoid pdf-parse reading test files at startup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { ai, formatGeminiError } from "@workspace/integrations-gemini-ai";
import { Quiz } from "../models/Quiz.js";
import { pdfAiLimiter } from "../middlewares/rateLimit.js";
import type { CanonicalQuestionType } from "./generate.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// ─── Request body schema ──────────────────────────────────────────────────────
const PdfGenerateBody = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  numberOfQuestions: z.coerce
    .number()
    .refine((n: number) => [5, 10, 15, 20].includes(n), {
      message: "numberOfQuestions must be 5, 10, 15, or 20",
    }),
});

// ─── Canonical Question Schema (shared with generate.ts) ─────────────────────
// correctAnswer is ALWAYS a zero-based integer 0–3.
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

const CanonicalGenerateResponse = z.object({
  questions: z.array(CanonicalQuestion).min(1),
});

// ─── Gemini JSON Schema for Structured Output ─────────────────────────────────
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

// ─── Validation Helper ────────────────────────────────────────────────────────
function validateAndFilterQuestions(questions: CanonicalQuestionType[]): {
  valid: CanonicalQuestionType[];
  invalidCount: number;
} {
  const seen = new Set<string>();
  const valid: CanonicalQuestionType[] = [];
  let invalidCount = 0;

  for (const q of questions) {
    if (q.correctAnswer < 0 || q.correctAnswer > 3) {
      invalidCount++;
      continue;
    }
    const uniqueOptions = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (uniqueOptions.size !== 4) {
      invalidCount++;
      continue;
    }
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(q);
  }

  return { valid, invalidCount };
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.post(
  "/quiz/generate-from-pdf",
  requireAuth,
  pdfAiLimiter,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ message: "File too large. Maximum size is 5 MB." });
        return;
      }
      if (err) {
        res.status(400).json({ message: (err as Error).message ?? "File upload error." });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ message: "A PDF file is required." });
      return;
    }

    const parsed = PdfGenerateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      return;
    }

    const { difficulty, numberOfQuestions } = parsed.data;
    const originalName = req.file.originalname;

    // ─── Extract PDF text ────────────────────────────────────────────────────
    let extractedText: string;
    try {
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text;
    } catch (err) {
      req.log.error({ err }, "pdf-parse failed");
      res.status(400).json({ message: "Could not read the PDF. Make sure it contains selectable text." });
      return;
    }

    const cleanedText = extractedText
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n")
      .slice(0, 15000);

    if (cleanedText.length < 100) {
      res.status(400).json({ message: "The PDF does not contain enough readable text to generate questions." });
      return;
    }

    // ─── Build Gemini prompt ─────────────────────────────────────────────────
    const prompt = `You are a quiz generator. Based on the following document content, generate exactly ${numberOfQuestions} multiple-choice questions at ${difficulty} difficulty.

Document content:
${cleanedText}

IMPORTANT REQUIREMENTS:
- Return ONLY a single valid JSON object. No markdown, no code fences, no extra text.
- The root must be an object with a "questions" array.
- Each question must be directly answerable from the document content.
- Each question must have exactly 4 distinct, non-empty options.
- correctAnswer must be the ZERO-BASED index (0, 1, 2, or 3) of the correct option in the options array.
- explanation must be a non-empty string explaining why the correct answer is right, referencing the document.

Example output:
{
  "questions": [
    {
      "question": "According to the document, what is the primary goal of the system?",
      "options": ["Performance", "Security", "Scalability", "Availability"],
      "correctAnswer": 2,
      "explanation": "The document states in section 2 that the primary goal is scalability to handle growing workloads."
    }
  ]
}`;

    // ─── Call Gemini ─────────────────────────────────────────────────────────
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
        { model: "gemini-3.1-flash-lite", status: errorDetails.status, details: errorDetails.details },
        "Gemini API error during PDF quiz generation"
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

    // ─── Parse JSON ──────────────────────────────────────────────────────────
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      req.log.error(
        { rawTextLength: rawText.length, rawTextPreview: rawText.slice(0, 200) },
        "Gemini returned non-JSON output during PDF generation"
      );
      res.status(500).json({ message: "AI returned an invalid response. Please try again." });
      return;
    }

    // ─── Schema Validation ───────────────────────────────────────────────────
    const validated = CanonicalGenerateResponse.safeParse(parsedJson);
    if (!validated.success) {
      req.log.error(
        { errors: validated.error.errors, parsedJson },
        "Gemini PDF response failed schema validation"
      );
      res.status(500).json({ message: "AI response did not match expected format. Please try again." });
      return;
    }

    // ─── Strengthen: filter invalid/duplicate questions ───────────────────────
    const { valid, invalidCount } = validateAndFilterQuestions(validated.data.questions);
    if (invalidCount > 0) {
      req.log.warn({ invalidCount }, "Filtered invalid questions from Gemini PDF response");
    }

    if (valid.length === 0) {
      res.status(500).json({ message: "AI failed to generate valid questions. Please try again." });
      return;
    }

    // ─── Persist to Database ─────────────────────────────────────────────────
    try {
      const quiz = await Quiz.create({
        title: `PDF Quiz — ${originalName.replace(/\.pdf$/i, "")}`,
        description: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} difficulty quiz generated from "${originalName}".`,
        questions: valid.map((q) => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer, // already a numeric 0–3 index
          explanation: q.explanation,
        })),
        createdBy: req.userId,
        quizType: "pdf",
        sourceFileName: originalName,
      });

      res.status(201).json({ id: (quiz._id as object).toString(), title: quiz.title });
    } catch (err) {
      req.log.error({ err }, "Failed to save PDF quiz");
      res.status(500).json({ message: "Failed to save the generated quiz." });
    }
  }
);

export default router;
