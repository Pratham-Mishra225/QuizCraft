import { z } from "zod";

const portSchema = z
  .string({ required_error: "PORT is required" })
  .min(1, "PORT is required")
  .transform((value, ctx) => {
    const port = Number(value);
    if (!Number.isInteger(port) || port <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PORT must be a positive integer",
      });
      return z.NEVER;
    }
    return port;
  });

const envSchema = z.object({
  PORT: portSchema,
  MONGODB_URI: z
    .string({ required_error: "MONGODB_URI is required" })
    .min(1, "MONGODB_URI is required"),
  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET is required" })
    .min(1, "JWT_SECRET is required"),
  AI_INTEGRATIONS_GEMINI_API_KEY: z
    .string({ required_error: "AI_INTEGRATIONS_GEMINI_API_KEY is required" })
    .min(1, "AI_INTEGRATIONS_GEMINI_API_KEY is required"),
  AI_INTEGRATIONS_GEMINI_BASE_URL: z
    .string({ required_error: "AI_INTEGRATIONS_GEMINI_BASE_URL is required" })
    .min(1, "AI_INTEGRATIONS_GEMINI_BASE_URL is required"),
  FRONTEND_URL: z
    .string({ required_error: "FRONTEND_URL is required" })
    .min(1, "FRONTEND_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production", "staging"], {
    required_error: "NODE_ENV is required",
  }),
  LOG_LEVEL: z.string().optional(),
  /**
   * JWT expiry AND cookie Max-Age, expressed as a vercel/ms string (e.g. "7d", "1h").
   * Both the token and the cookie use this value so they are always in sync.
   */
  AUTH_TOKEN_TTL: z.string().optional().default("7d"),
  /**
   * RAG & PDF pipeline configuration
   */
  EMBEDDING_MODEL: z.string().optional().default("gemini-embedding-001"),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).optional().default(5),
  RAG_CHUNK_SIZE: z.coerce.number().int().min(100).max(4000).optional().default(800),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().min(0).max(1000).optional().default(150),
  PDF_MAX_PAGES: z.coerce.number().int().min(1).max(200).optional().default(50),
});


const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join(".") || "env";
    return `- ${path}: ${issue.message}`;
  });
  throw new Error(`Invalid environment variables:\n${issues.join("\n")}`);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
