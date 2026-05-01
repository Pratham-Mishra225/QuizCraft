# QuizCraft — Full-Stack Quiz App

## Overview

A full-stack quiz web application where users can register/login, create quizzes, take them, and track their performance over time.

## Stack

- **Frontend**: React + Vite, Tailwind CSS, Wouter routing, TanStack Query, shadcn/ui
- **Backend**: Express 5 (Node.js)
- **Database**: MongoDB via Mongoose
- **Auth**: JWT (Bearer token stored in localStorage as `quiz_token`)
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (CJS bundle for API server)

## Monorepo structure

```
artifacts/
  quiz-app/          # React + Vite frontend (served at /)
  api-server/        # Express REST API (served at /api)
lib/
  api-spec/          # OpenAPI spec + Orval config
  api-client-react/  # Generated React Query hooks
  api-zod/           # Generated Zod validators
```

## Backend modules

- `artifacts/api-server/src/models/` — Mongoose models (User, Quiz, Attempt)
- `artifacts/api-server/src/middlewares/auth.ts` — JWT authentication middleware
- `artifacts/api-server/src/routes/auth.ts` — Register, login, /me endpoints
- `artifacts/api-server/src/routes/quizzes.ts` — CRUD + submit quiz
- `artifacts/api-server/src/routes/attempts.ts` — List and get quiz attempts

## Frontend pages

- `/` — Home (hero, CTAs, quiz listing for logged-in users)
- `/auth` — Login / Register toggle
- `/quiz/setup` — Create a quiz with dynamic questions
- `/quiz/:id` — Take a quiz (one question at a time)
- `/results` — Dashboard of past attempts with scores
- `/results/:id` — Detail view of a single attempt

## Key environment variables

- `MONGODB_URI` (secret) — MongoDB connection string (required for database)
- `JWT_SECRET` (env var) — JWT signing secret (auto-generated)
- `PORT` — assigned automatically per artifact

## Key commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/api-server run build` — build the API server
- `pnpm run typecheck` — full typecheck
