import { Router, Response } from "express";
import { Quiz } from "../models/Quiz.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";
import { Types } from "mongoose";

const router = Router();

// Public quizzes require authentication (public !== anonymous)
router.use(requireAuth);

type QuizDoc = {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  questions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
    source?: { documentId?: string; chunkId?: string; pageNumber?: number } | null;
  }[];
  createdBy: Types.ObjectId;
  sourceType?: string;
  sourceMetadata?: Record<string, unknown> | null;
  visibility?: string;
  shareId: string;
  createdAt: Date;
};


function serializePublicQuiz(q: QuizDoc) {
  return {
    id: String(q._id),
    title: q.title,
    description: q.description ?? "",
    questions: q.questions,
    createdBy: String(q.createdBy),
    sourceType: q.sourceType ?? "manual",
    sourceMetadata: q.sourceMetadata ?? null,
    visibility: q.visibility ?? "public",
    shareId: q.shareId,
    createdAt: q.createdAt ? q.createdAt.toISOString() : new Date().toISOString(),
  };
}

// ─── GET /api/public/quizzes/:shareId ────────────────────────────────────────
// Retrieve a public quiz by its cryptographically random shareId
router.get("/:shareId", async (req: AuthRequest, res: Response) => {
  const shareId = req.params["shareId"] as string;
  if (!shareId || typeof shareId !== "string" || shareId.trim().length === 0) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  // Set Cache-Control header to prevent inadvertent shared caching
  res.set("Cache-Control", "private, no-store");

  const quiz = await Quiz.findOne({
    shareId: shareId.trim(),
    visibility: "public",
  }).lean<QuizDoc>();

  if (!quiz) {
    // Avoid leaking whether a private quiz exists with this shareId
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  res.json(serializePublicQuiz(quiz));
});

export default router;
