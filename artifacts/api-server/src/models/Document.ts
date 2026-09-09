import mongoose, { Document, Schema, Types } from "mongoose";

export type DocumentStatus = "processing" | "ready" | "failed";

export interface IDocument extends Document {
  userId: Types.ObjectId;
  fileName: string;
  pageCount: number;
  status: DocumentStatus;
  error?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true, trim: true },
    pageCount: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
      required: true,
    },
    error: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// Indexes: lookup user documents sorted by newest first
DocumentSchema.index({ userId: 1, createdAt: -1 });

export const DocumentModel = mongoose.model<IDocument>("Document", DocumentSchema);
