import mongoose, { Document, Schema, Types } from "mongoose";

export interface IQuestionSnapshot {
  questionIndex: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface IAnswer {
  questionIndex: number;
  selectedOption: number;
  isCorrect: boolean;
}

export interface IAttempt extends Document {
  quizId: Types.ObjectId;
  quizTitle: string;
  userId: Types.ObjectId;
  questionSnapshot: IQuestionSnapshot[];
  answers: IAnswer[];
  score: number;
  totalQuestions: number;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSnapshotSchema = new Schema<IQuestionSnapshot>(
  {
    questionIndex: { type: Number, required: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: Number, required: true },
    explanation: { type: String, default: "" },
  },
  { _id: false }
);

const AnswerSchema = new Schema<IAnswer>(
  {
    questionIndex: { type: Number, required: true },
    selectedOption: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const AttemptSchema = new Schema<IAttempt>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    quizTitle: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    questionSnapshot: {
      type: [QuestionSnapshotSchema],
      required: true,
      default: [],
    },
    answers: { type: [AnswerSchema], required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes: user attempt history sorted by completedAt desc; quiz lookup
AttemptSchema.index({ userId: 1, completedAt: -1 });
AttemptSchema.index({ quizId: 1 });

export const Attempt = mongoose.model<IAttempt>("Attempt", AttemptSchema);
