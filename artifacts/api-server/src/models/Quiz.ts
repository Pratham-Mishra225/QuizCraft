import mongoose, { Document, Schema, Types } from "mongoose";

export interface IQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface IQuiz extends Document {
  title: string;
  description?: string;
  questions: IQuestion[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: Number, required: true },
    explanation: { type: String, default: "" },
  },
  { _id: false }
);

const QuizSchema = new Schema<IQuiz>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    questions: { type: [QuestionSchema], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const Quiz = mongoose.model<IQuiz>("Quiz", QuizSchema);
