import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAnswer {
  questionIndex: number;
  selectedOption: number;
}

export interface IAttempt extends Document {
  quizId: Types.ObjectId;
  quizTitle: string;
  userId: Types.ObjectId;
  answers: IAnswer[];
  score: number;
  totalQuestions: number;
  completedAt: Date;
}

const AnswerSchema = new Schema<IAnswer>(
  {
    questionIndex: { type: Number, required: true },
    selectedOption: { type: Number, required: true },
  },
  { _id: false }
);

const AttemptSchema = new Schema<IAttempt>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    quizTitle: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answers: { type: [AnswerSchema], required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Attempt = mongoose.model<IAttempt>("Attempt", AttemptSchema);
