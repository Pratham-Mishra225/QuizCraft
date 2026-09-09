import { Router, Response } from "express";
import { Quiz, generateShareId } from "../models/Quiz.js";
import { Attempt } from "../models/Attempt.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";
import {
  CreateQuizSchema,
  UpdateQuizSchema,
  UpdateQuizVisibilitySchema,
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
  sourceType?: string;
  sourceMetadata?: Record<string, unknown> | null;
  visibility?: string;
  shareId: string;
  createdAt: Date;
};

function serializeQuiz(q: QuizDoc) {
  return {
    id: String(q._id),
    title: q.title,
    description: q.description ?? "",
    questions: q.questions,
    createdBy: String(q.createdBy),
    sourceType: q.sourceType ?? "manual",
    sourceMetadata: q.sourceMetadata ?? null,
    visibility: q.visibility ?? "private",
    shareId: q.shareId,
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

  const { title, description, questions, sourceType, sourceMetadata, visibility } = parsed.data;

  let quiz;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      quiz = await Quiz.create({
        title,
        description,
        questions,
        createdBy: req.userId,
        sourceType: sourceType ?? "manual",
        sourceMetadata: sourceMetadata ?? null,
        visibility: visibility ?? "private",
        shareId: generateShareId(),
      });
      break;
    } catch (err: unknown) {
      attempts++;
      // If error is duplicate key on shareId, retry with a fresh shareId
      if (err && typeof err === "object" && "code" in err && err.code === 11000 && attempts < maxAttempts) {
        continue;
      }
      throw err;
    }
  }

  if (!quiz) {
    res.status(500).json({ message: "Failed to create quiz" });
    return;
  }

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

  const { title, description, questions, sourceType, sourceMetadata, visibility } = parsed.data;

  const updateFields: Record<string, unknown> = { title, description, questions };
  if (sourceType !== undefined) updateFields["sourceType"] = sourceType;
  if (sourceMetadata !== undefined) updateFields["sourceMetadata"] = sourceMetadata;
  if (visibility !== undefined) updateFields["visibility"] = visibility;

  const quiz = await Quiz.findOneAndUpdate(
    { _id: id, createdBy: req.userId },
    { $set: updateFields },
    { returnDocument: "after" }
  ).lean<QuizDoc>();

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  res.json(serializeQuiz(quiz));
});

// ─── PATCH /api/quizzes/:id/visibility ──────────────────────────────────────
// Update visibility of a quiz (strictly owner-scoped)
router.patch("/:id/visibility", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"] as string;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const parsed = UpdateQuizVisibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const { visibility } = parsed.data;

  const quiz = await Quiz.findOneAndUpdate(
    { _id: id, createdBy: req.userId },
    { $set: { visibility } },
    { returnDocument: "after" }
  ).lean<QuizDoc>();

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  res.json(serializeQuiz(quiz));
});

// ─── DELETE /api/quizzes/:id ─────────────────────────────────────────────────
// Delete an existing quiz (strictly owner-scoped). Does NOT cascade delete attempts.
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
// Submit answers for scoring (server-authoritative scoring & immutable historical snapshot)
// Allows owner submission for private/public quizzes, and authenticated participant submission for public quizzes.
router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"] as string;

  let quiz: QuizDoc | null = null;
  if (Types.ObjectId.isValid(id)) {
    quiz = await Quiz.findById(id).lean<QuizDoc>();
  } else {
    // If not a valid ObjectId, try finding by shareId
    quiz = await Quiz.findOne({ shareId: id }).lean<QuizDoc>();
  }

  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  // Authorization: allow owner for any visibility, or any authenticated user for public quizzes
  const isOwner = quiz.createdBy.toString() === req.userId;
  const isPublic = quiz.visibility === "public";
  if (!isOwner && !isPublic) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const parsed = SubmitQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
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

  // 3. Server-authoritative scoring & snapshot generation:
  // Client-supplied score, isCorrect, questionSnapshot, quizTitle are never trusted
  let score = 0;
  const evaluatedAnswers = answers.map((answer) => {
    const question = quiz!.questions[answer.questionIndex];
    const isCorrect = Boolean(question && question.correctAnswer === answer.selectedOption);
    if (isCorrect) {
      score++;
    }
    return {
      questionIndex: answer.questionIndex,
      selectedOption: answer.selectedOption,
      isCorrect,
    };
  });

  // Create immutable historical question snapshot at submission time
  const questionSnapshot = quiz.questions.map((q, idx) => ({
    questionIndex: idx,
    question: q.question,
    options: [...q.options],
    correctAnswer: q.correctAnswer,
    explanation: q.explanation ?? "",
  }));

  // 4. Persist attempt strictly scoped to the authenticated participant (req.userId)
  const attempt = await Attempt.create({
    quizId: quiz._id,
    quizTitle: quiz.title,
    userId: req.userId,
    questionSnapshot,
    answers: evaluatedAnswers,
    score,
    totalQuestions,
    completedAt: new Date(),
  });

  res.status(201).json({
    id: String(attempt._id),
    quizId: String(attempt.quizId),
    quizTitle: attempt.quizTitle,
    userId: String(attempt.userId),
    questionSnapshot: attempt.questionSnapshot,
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

