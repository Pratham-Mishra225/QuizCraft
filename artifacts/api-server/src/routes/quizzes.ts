import { Router, Response } from "express";
import { Quiz } from "../models/Quiz.js";
import { Attempt } from "../models/Attempt.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";
import { CreateQuizBody, SubmitQuizBody } from "@workspace/api-zod";
import { Types } from "mongoose";

const router = Router();

router.use(requireAuth);

type QuizDoc = {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  questions: { question: string; options: string[]; correctAnswer: number }[];
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

router.get("/", async (req: AuthRequest, res: Response) => {
  const quizzes = await Quiz.find().sort({ createdAt: -1 }).lean<QuizDoc[]>();
  res.json(quizzes.map(serializeQuiz));
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = CreateQuizBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    return;
  }

  const quiz = await Quiz.create({ ...parsed.data, createdBy: req.userId });
  res.status(201).json(serializeQuiz(quiz.toObject() as QuizDoc));
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const quiz = await Quiz.findById(req.params["id"]).lean<QuizDoc>();
  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }
  res.json(serializeQuiz(quiz));
});

router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  const parsed = SubmitQuizBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error" });
    return;
  }

  const quiz = await Quiz.findById(req.params["id"]).lean<QuizDoc>();
  if (!quiz) {
    res.status(404).json({ message: "Quiz not found" });
    return;
  }

  const { answers } = parsed.data;
  let score = 0;
  for (const answer of answers) {
    const q = quiz.questions[answer.questionIndex];
    if (q && q.correctAnswer === answer.selectedOption) {
      score++;
    }
  }

  const attempt = await Attempt.create({
    quizId: quiz._id,
    quizTitle: quiz.title,
    userId: req.userId,
    answers,
    score,
    totalQuestions: quiz.questions.length,
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
    completedAt: attempt.completedAt instanceof Date ? attempt.completedAt.toISOString() : String(attempt.completedAt),
  });
});

export default router;
