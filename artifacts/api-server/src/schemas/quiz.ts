import { z } from "zod";

export const SourceTypeEnum = z.enum(["manual", "topic-ai", "pdf-ai"]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const VisibilityEnum = z.enum(["private", "public"]);
export type Visibility = z.infer<typeof VisibilityEnum>;

export const SourceMetadataSchema = z
  .record(z.string(), z.unknown())
  .refine((obj) => JSON.stringify(obj).length <= 4096, {
    message: "sourceMetadata must not exceed 4096 characters when serialized",
  })
  .nullable()
  .optional();

export const QuestionSourceSchema = z
  .object({
    documentId: z.string().optional(),
    chunkId: z.string().optional(),
    pageNumber: z.number().int().min(1).optional(),
  })
  .optional()
  .nullable();

export type QuestionSource = z.infer<typeof QuestionSourceSchema>;

/**
 * Question validation schema for manual creation & updates.
 * Guarantees:
 * - Non-empty question text (max 1000 chars)
 * - Exactly 4 options, all trimmed and non-empty (max 500 chars)
 * - 4 distinct options (case-insensitive deduplication)
 * - Integer correctAnswer in range 0..3
 * - Optional explanation string (max 2000 chars)
 * - Optional source citation
 */
export const QuestionSchema = z.object({
  question: z
    .string({ required_error: "Question text is required" })
    .trim()
    .min(1, "Question text cannot be empty")
    .max(1000, "Question text must not exceed 1000 characters"),
  options: z
    .array(
      z
        .string({ required_error: "Option text is required" })
        .trim()
        .min(1, "Option text cannot be empty")
        .max(500, "Option text must not exceed 500 characters")
    )
    .length(4, "Exactly 4 options are required")
    .refine(
      (opts) => new Set(opts.map((o) => o.toLowerCase())).size === 4,
      { message: "All 4 options must be distinct" }
    ),
  correctAnswer: z
    .number({ required_error: "correctAnswer is required" })
    .int("correctAnswer must be an integer")
    .min(0, "correctAnswer must be between 0 and 3")
    .max(3, "correctAnswer must be between 0 and 3"),
  explanation: z
    .string()
    .max(2000, "Explanation must not exceed 2000 characters")
    .optional()
    .default(""),
  source: QuestionSourceSchema.default(null),
});

export type ValidatedQuestion = z.infer<typeof QuestionSchema>;


/**
 * Schema for creating a new quiz.
 * Strictly whitelists allowed input fields, preventing mass assignment.
 */
export const CreateQuizSchema = z.object({
  title: z
    .string({ required_error: "Quiz title is required" })
    .trim()
    .min(1, "Quiz title cannot be empty")
    .max(200, "Quiz title must not exceed 200 characters"),
  description: z
    .string()
    .max(2000, "Description must not exceed 2000 characters")
    .optional()
    .default(""),
  questions: z
    .array(QuestionSchema)
    .min(1, "Quiz must contain at least 1 question")
    .max(100, "Quiz cannot contain more than 100 questions"),
  sourceType: SourceTypeEnum.optional().default("manual"),
  sourceMetadata: SourceMetadataSchema.default(null),
  visibility: VisibilityEnum.optional().default("private"),
});

export type CreateQuizInput = z.infer<typeof CreateQuizSchema>;

/**
 * Schema for updating an existing quiz.
 */
export const UpdateQuizSchema = z.object({
  title: z
    .string({ required_error: "Quiz title is required" })
    .trim()
    .min(1, "Quiz title cannot be empty")
    .max(200, "Quiz title must not exceed 200 characters"),
  description: z
    .string()
    .max(2000, "Description must not exceed 2000 characters")
    .optional()
    .default(""),
  questions: z
    .array(QuestionSchema)
    .min(1, "Quiz must contain at least 1 question")
    .max(100, "Quiz cannot contain more than 100 questions"),
  sourceType: SourceTypeEnum.optional(),
  sourceMetadata: SourceMetadataSchema,
  visibility: VisibilityEnum.optional(),
});

export type UpdateQuizInput = z.infer<typeof UpdateQuizSchema>;

/**
 * Schema for updating quiz visibility.
 */
export const UpdateQuizVisibilitySchema = z.object({
  visibility: VisibilityEnum,
});

export type UpdateQuizVisibilityInput = z.infer<typeof UpdateQuizVisibilitySchema>;


/**
 * Answer item schema in a quiz submission.
 */
export const SubmissionAnswerSchema = z.object({
  questionIndex: z
    .number({ required_error: "questionIndex is required" })
    .int("questionIndex must be an integer")
    .min(0, "questionIndex cannot be negative"),
  selectedOption: z
    .number({ required_error: "selectedOption is required" })
    .int("selectedOption must be an integer")
    .min(0, "selectedOption cannot be negative")
    .max(3, "selectedOption must be between 0 and 3"),
});

/**
 * Schema for submitting quiz answers.
 * Note: Structural validation (exact question count, duplicate index rejection,
 * and complete [0..N-1] index coverage) is enforced server-side against the stored quiz.
 */
export const SubmitQuizSchema = z.object({
  answers: z
    .array(SubmissionAnswerSchema)
    .min(1, "At least one answer must be submitted"),
});

export type SubmitQuizInput = z.infer<typeof SubmitQuizSchema>;

/**
 * Schema for historical question snapshot in an Attempt.
 */
export const QuestionSnapshotSchema = z.object({
  questionIndex: z.number().int().min(0),
  question: z.string().min(1),
  options: z.array(z.string()).length(4),
  correctAnswer: z.number().int().min(0).max(3),
  explanation: z.string().optional().default(""),
  source: QuestionSourceSchema.default(null),
});

export type QuestionSnapshot = z.infer<typeof QuestionSnapshotSchema>;

