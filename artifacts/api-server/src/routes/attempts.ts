import { Router, Response } from "express";
import { Attempt } from "../models/Attempt.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res: Response) => {
  const attempts = await Attempt.find({ userId: req.userId })
    .sort({ completedAt: -1 })
    .lean();

  res.json(
    attempts.map((a) => ({
      id: String(a._id),
      quizId: String(a.quizId),
      quizTitle: a.quizTitle,
      userId: String(a.userId),
      answers: a.answers,
      score: a.score,
      totalQuestions: a.totalQuestions,
      completedAt: a.completedAt instanceof Date ? a.completedAt.toISOString() : String(a.completedAt),
    }))
  );
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const attempt = await Attempt.findOne({
    _id: req.params["id"],
    userId: req.userId,
  }).lean();

  if (!attempt) {
    res.status(404).json({ message: "Attempt not found" });
    return;
  }

  res.json({
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
