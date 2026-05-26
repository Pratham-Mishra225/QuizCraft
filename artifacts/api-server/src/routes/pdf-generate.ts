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
import { ai } from "@workspace/integrations-gemini-ai";
import { Quiz } from "../models/Quiz.js";
import { pdfAiLimiter } from "../middlewares/rateLimit.js";

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

const PdfGenerateBody = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  numberOfQuestions: z.coerce
    .number()
    .refine((n: number) => [5, 10, 15, 20].includes(n), {
      message: "numberOfQuestions must be 5, 10, 15, or 20",
    }),
});

const PdfGeneratedQuestion = z.object({
  question: z.string(),
  options: z.array(z.string()).min(4).max(4),
  correctAnswer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string(),
  sourceTopic: z.string().optional(),
});

type PdfQuestion = z.infer<typeof PdfGeneratedQuestion>;

const PdfGenerateResponse = z.array(PdfGeneratedQuestion);

const correctAnswerIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

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

    const prompt = `You are a quiz generator. Based on the following document content, generate ${numberOfQuestions} multiple-choice questions at ${difficulty} difficulty.

Document content:
${cleanedText}

Return strictly in JSON format:
[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "A",
    "explanation": "...",
    "sourceTopic": "..."
  }
]

Rules:
- Each question must have exactly 4 options.
- correctAnswer must be exactly "A", "B", "C", or "D" indicating which option is correct.
- sourceTopic should be a brief label for the topic the question covers.
- Do not include extra text. No markdown. Only JSON.`;

    let geminiRaw: unknown;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      });
      const rawText = response.text ?? "";
      geminiRaw = JSON.parse(rawText);
    } catch (err) {
      req.log.error({ err }, "Gemini PDF generation error");
      res.status(500).json({ message: "AI failed to generate questions from the PDF. Please try again." });
      return;
    }

    const validated = PdfGenerateResponse.safeParse(geminiRaw);
    if (!validated.success) {
      req.log.error({ errors: validated.error.errors }, "Gemini PDF response failed schema validation");
      res.status(500).json({ message: "AI response did not match expected format. Please try again." });
      return;
    }

    const unique = validated.data.filter(
      (q: PdfQuestion, idx: number, arr: PdfQuestion[]) =>
        arr.findIndex(
          (other: PdfQuestion) =>
            other.question.trim().toLowerCase() === q.question.trim().toLowerCase()
        ) === idx
    );

    if (unique.length === 0) {
      res.status(500).json({ message: "AI failed to generate valid questions. Please try again." });
      return;
    }

    try {
      const quiz = await Quiz.create({
        title: `PDF Quiz — ${originalName.replace(/\.pdf$/i, "")}`,
        description: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} difficulty quiz generated from "${originalName}".`,
        questions: unique.map((q: PdfQuestion) => ({
          question: q.question,
          options: q.options,
          correctAnswer: correctAnswerIndex[q.correctAnswer] ?? 0,
          explanation: q.explanation ?? "",
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
