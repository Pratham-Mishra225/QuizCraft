import { Router, Response } from "express";
import { Quiz } from "../models/Quiz.js";
import { Attempt } from "../models/Attempt.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";
import {
  CreateQuizSchema,
  UpdateQuizSchema,
  SubmitQuizSchema,
} from "../schemas/quiz.js";
import { Types } from "mongoose";

const router = Router();

router.use(requireAuth);

type QuizDoc = {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  questions: { question: string; options: string[]; correctAnswer: number; explanation?: string }[];
  createdBy: Types.ObjectId;
  createdAt: Date;
};

function serializeQuiz(q: QuizDoc) {
  return {
    id: String(q._id),
    title: q.title,
    description: q.description ?? "",
    questions: q.questions,
    createdBy: String(q.createdBy),
    createdAt: q.createdAt ? q.createdAt.toISOString() : new Date().toISOString(),
  };
}

// ─── GET /api/quizzes ────────────────────────────────────────────────────────
// Retrieve all quizzes owned by the authenticated user
router.get("/", async (req: AuthRequest, res: Response) => {
  const quizzes = await Quiz.find({ createdBy: req.userId })
    .sort({ createdAt: -1 })
    .lean<QuizDoc[]>();
  res.json(quizzes.map(serializeQuiz));
});

// ─── POST /api/quizzes ───────────────────────────────────────────────────────
// Create a new quiz with server-side validation and enforced ownership
router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = CreateQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const { title, description, questions } = parsed.data;

  const quiz = await Quiz.create({
    title,
    description,
    questions,
    createdBy: req.userId,
    quizType: "manual",
  });

  res.status(201).json(serializeQuiz(quiz.toObject() as QuizDoc));
});

// ─── GET /api/quizzes/:id ────────────────────────────────────────────────────
// Retrieve a single quiz by ID (strictly owner-scoped)
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"] as string;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const quiz = await Quiz.findOne({ _id: id, createdBy: req.userId }).lean<QuizDoc>();
  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }
  res.json(serializeQuiz(quiz));
});

// ─── PUT /api/quizzes/:id ────────────────────────────────────────────────────
// Update an existing quiz (strictly owner-scoped, mass-assignment protected)
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"] as string;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const parsed = UpdateQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const { title, description, questions } = parsed.data;

  const quiz = await Quiz.findOneAndUpdate(
    { _id: id, createdBy: req.userId },
    { $set: { title, description, questions } },
    { returnDocument: "after" }
  ).lean<QuizDoc>();

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  res.json(serializeQuiz(quiz));
});

// ─── DELETE /api/quizzes/:id ─────────────────────────────────────────────────
// Delete an existing quiz (strictly owner-scoped)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"] as string;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const quiz = await Quiz.findOneAndDelete({
    _id: id,
    createdBy: req.userId,
  }).lean<QuizDoc>();

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  res.json({ message: "Quiz deleted successfully" });
});

// ─── POST /api/quizzes/:id/submit ────────────────────────────────────────────
// Submit answers for scoring (hardened validation & server-authoritative scoring)
router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"] as string;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const parsed = SubmitQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const quiz = await Quiz.findOne({ _id: id, createdBy: req.userId }).lean<QuizDoc>();
  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const { answers } = parsed.data;
  const totalQuestions = quiz.questions.length;

  // 1. Enforce exact question answer count (reject partial or extra submissions)
  if (answers.length !== totalQuestions) {
    res.status(400).json({
      message: `Invalid submission: expected ${totalQuestions} answers, but received ${answers.length}.`,
    });
    return;
  }

  // 2. Validate duplicate prevention, index bounds, and valid option ranges
  const seenIndices = new Set<number>();
  for (const answer of answers) {
    if (answer.questionIndex < 0 || answer.questionIndex >= totalQuestions) {
      res.status(400).json({
        message: `Invalid questionIndex: ${answer.questionIndex}. Must be between 0 and ${totalQuestions - 1}.`,
      });
      return;
    }

    if (seenIndices.has(answer.questionIndex)) {
      res.status(400).json({
        message: `Duplicate answer received for questionIndex ${answer.questionIndex}.`,
      });
      return;
    }
    seenIndices.add(answer.questionIndex);

    const question = quiz.questions[answer.questionIndex];
    if (!question || answer.selectedOption < 0 || answer.selectedOption >= question.options.length) {
      res.status(400).json({
        message: `Invalid selectedOption ${answer.selectedOption} for question ${answer.questionIndex}.`,
      });
      return;
    }
  }

  // Guarantee all indices [0..totalQuestions-1] are present
  if (seenIndices.size !== totalQuestions) {
    res.status(400).json({
      message: "Incomplete submission: not all quiz questions were answered.",
    });
    return;
  }

  // 3. Server-authoritative scoring: client-supplied score/totals are never trusted
  let score = 0;
  for (const answer of answers) {
    const question = quiz.questions[answer.questionIndex];
    if (question && question.correctAnswer === answer.selectedOption) {
      score++;
    }
  }

  // 4. Persist attempt scoped to authenticated user
  const sanitizedAnswers = answers.map((a) => ({
    questionIndex: a.questionIndex,
    selectedOption: a.selectedOption,
  }));

  const attempt = await Attempt.create({
    quizId: quiz._id,
    quizTitle: quiz.title,
    userId: req.userId,
    answers: sanitizedAnswers,
    score,
    totalQuestions,
    completedAt: new Date(),
  });

  res.status(201).json({
    id: String(attempt._id),
    quizId: String(attempt.quizId),
    quizTitle: attempt.quizTitle,
    userId: String(attempt.userId),
    answers: attempt.answers,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    completedAt:
      attempt.completedAt instanceof Date
        ? attempt.completedAt.toISOString()
        : String(attempt.completedAt),
  });
});

export default router;
