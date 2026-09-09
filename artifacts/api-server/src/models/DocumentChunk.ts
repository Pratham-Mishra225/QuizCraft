import mongoose, { Document, Schema, Types } from "mongoose";

export interface IDocumentChunk extends Document {
  documentId: Types.ObjectId;
  userId: Types.ObjectId;
  chunkId: string;
  pageNumber: number;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentChunkSchema = new Schema<IDocumentChunk>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chunkId: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// Indexes: lookup chunks for a document scoped to user
DocumentChunkSchema.index({ documentId: 1, userId: 1 });
DocumentChunkSchema.index({ userId: 1 });

export const DocumentChunk = mongoose.model<IDocumentChunk>(
  "DocumentChunk",
  DocumentChunkSchema
);
