import { Router, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { Quiz } from "../models/Quiz.js";
import { DocumentModel } from "../models/Document.js";
import { pdfAiLimiter } from "../middlewares/rateLimit.js";
import { extractPagesFromPdf } from "../services/pdf/extract.js";
import { cleanExtractedPages } from "../services/pdf/clean.js";
import { chunkPages } from "../services/pdf/chunk.js";
import { embedBatch } from "../services/embeddings/embed.js";
import { storeChunks } from "../services/retrieval/vectorStore.js";
import { retrieveContextForQuery } from "../services/retrieval/retrieve.js";
import { generateQuizFromContext } from "../services/quiz/generateFromContext.js";
import { env } from "../config/env.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
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

// ─── POST /api/quiz/generate-from-pdf ─────────────────────────────────────────
router.post(
  "/quiz/generate-from-pdf",
  requireAuth,
  pdfAiLimiter,
  (req, res, next) => {
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "pdf", maxCount: 1 },
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ message: "File too large. Maximum size is 5 MB." });
        return;
      }
      if (err) {
        res.status(400).json({ message: (err as Error).message ?? "File upload error." });
        return;
      }
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      req.file = files?.file?.[0] || files?.pdf?.[0];
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

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
    const originalName = req.file.originalname || "document.pdf";

    // 1. Initialize Document tracker in MongoDB
    const document = await DocumentModel.create({
      userId: userId,
      fileName: originalName,
      pageCount: 0,
      status: "processing",
    });

    try {
      // 2. Page-Aware PDF Extraction
      const extraction = await extractPagesFromPdf(req.file.buffer, env.PDF_MAX_PAGES);
      document.pageCount = extraction.totalPages;
      await document.save();

      // 3. Deterministic Text Cleaning
      const cleanedPages = cleanExtractedPages(extraction.pages);
      const totalCleanedChars = cleanedPages.reduce((acc, p) => acc + p.text.length, 0);

      if (cleanedPages.length === 0 || totalCleanedChars < 100) {
        document.status = "failed";
        document.error = "Insufficient readable text";
        await document.save();

        res.status(400).json({
          message: "The PDF does not contain enough readable text to generate questions.",
        });
        return;
      }

      // 4. Chunking preserving page boundaries
      const chunks = chunkPages(cleanedPages, String(document._id), {
        chunkSize: env.RAG_CHUNK_SIZE,
        chunkOverlap: env.RAG_CHUNK_OVERLAP,
      });

      if (chunks.length === 0) {
        document.status = "failed";
        document.error = "No chunks generated";
        await document.save();

        res.status(400).json({
          message: "Could not segment document content for processing.",
        });
        return;
      }

      // 5. Generate Vector Embeddings for Chunks
      const chunkTexts = chunks.map((c) => c.text);
      const embeddings = await embedBatch(chunkTexts, env.EMBEDDING_MODEL);

      // 6. Persist Chunks in Vector Store
      const chunksWithEmbeddings = chunks.map((c, i) => ({
        chunkId: c.chunkId,
        pageNumber: c.pageNumber,
        text: c.text,
        embedding: embeddings[i]!,
        metadata: { chunkIndex: c.chunkIndex },
      }));

      await storeChunks(document._id, userId, chunksWithEmbeddings);
      document.status = "ready";
      await document.save();

      // 7. Semantic Vector Retrieval & Diversification
      // Retrieve relevant chunks across the document
      const queryPrompt = `Key educational concepts and test questions from ${originalName}`;
      const retrievedChunks = await retrieveContextForQuery(
        String(document._id),
        userId,
        queryPrompt,
        {
          topK: env.RAG_TOP_K,
          diversifyPages: true,
        }
      );

      // 8. Grounded Generation with Gemini Structured Output & Authoritative Source Mapping
      const generatedQuestions = await generateQuizFromContext(retrievedChunks, {
        numberOfQuestions,
        difficulty,
        fileName: originalName,
      });

      // 9. Persist Authoritative Quiz in Database
      const quiz = await Quiz.create({
        title: `PDF Quiz — ${originalName.replace(/\.pdf$/i, "")}`,
        description: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} difficulty quiz generated from "${originalName}".`,
        questions: generatedQuestions.map((q) => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          source: q.source ? {
            documentId: String(document._id),
            chunkId: q.source.chunkId,
            pageNumber: q.source.pageNumber,
          } : null,
        })),
        createdBy: userId,
        sourceType: "pdf-ai",
        sourceMetadata: {
          documentId: String(document._id),
          fileName: originalName,
          pageCount: document.pageCount,
          chunkCount: chunks.length,
        },
        visibility: "private",
      });

      res.status(201).json({
        id: String(quiz._id),
        title: quiz.title,
      });
    } catch (err: any) {
      req.log.error({ err }, "PDF RAG pipeline error");
      document.status = "failed";
      document.error = err.message || "Pipeline failure";
      await document.save().catch(() => {});

      if (err.message && err.message.includes("exceeding the maximum allowed limit")) {
        res.status(400).json({ message: err.message });
        return;
      }

      res.status(500).json({
        message: err.message || "An error occurred while generating the quiz from PDF.",
      });
    }
  }
);

export default router;
