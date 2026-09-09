import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["src/**/__tests__/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      MONGODB_URI:
        process.env.MONGODB_URI ||
        "mongodb+srv://prathammishra225_db_user:PrathamM123@cluster0.sntczkf.mongodb.net/?appName=Cluster0",
      JWT_SECRET: "test-secret-key-that-is-at-least-32-chars-long-for-testing",
      AI_INTEGRATIONS_GEMINI_API_KEY: "test-gemini-api-key",
      AI_INTEGRATIONS_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com",
      FRONTEND_URL: "http://localhost:5173",
      LOG_LEVEL: "silent",
    },
  },
});
