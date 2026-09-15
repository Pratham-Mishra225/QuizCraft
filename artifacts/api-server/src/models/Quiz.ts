import mongoose, { Document, Schema, Types } from "mongoose";
import crypto from "node:crypto";

export interface IQuestionSource {
  documentId?: string;
  chunkId?: string;
  pageNumber?: number;
}

export interface IQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  source?: IQuestionSource | null;
}

export type QuizSourceType = "manual" | "topic-ai" | "pdf-ai";
export type QuizVisibility = "private" | "public";

export function generateShareId(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export interface IQuiz extends Document {
  title: string;
  description?: string;
  questions: IQuestion[];
  createdBy: Types.ObjectId;
  sourceType: QuizSourceType;
  sourceMetadata?: Record<string, unknown> | null;
  visibility: QuizVisibility;
  shareId: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSourceSchema = new Schema<IQuestionSource>(
  {
    documentId: { type: String, default: "" },
    chunkId: { type: String, default: "" },
    pageNumber: { type: Number, default: 0 },
  },
  { _id: false }
);

const QuestionSchema = new Schema<IQuestion>(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: Number, required: true },
    explanation: { type: String, default: "" },
    source: { type: QuestionSourceSchema, default: null },
  },
  { _id: false }
);


const QuizSchema = new Schema<IQuiz>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    questions: { type: [QuestionSchema], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sourceType: {
      type: String,
      enum: ["manual", "topic-ai", "pdf-ai"],
      default: "manual",
      required: true,
    },
    sourceMetadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
      required: true,
    },
    shareId: {
      type: String,
      unique: true,
      required: true,
      default: () => generateShareId(),
    },
  },
  { timestamps: true }
);

// Supports: GET /api/quizzes — creator dashboard sorted newest first
QuizSchema.index({ createdBy: 1, createdAt: -1 }, { name: "quiz_creator_createdAt" });

export const Quiz = mongoose.model<IQuiz>("Quiz", QuizSchema);


