import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import quizzesRouter from "./quizzes.js";
import attemptsRouter from "./attempts.js";
import generateRouter from "./generate.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/quizzes", quizzesRouter);
router.use("/attempts", attemptsRouter);
router.use(generateRouter);

export default router;
