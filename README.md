# Quiz Master Hub

A full-stack quiz platform that lets users create quizzes, take them, and track results, with AI-powered quiz generation from topics or PDFs. Built as a TypeScript monorepo with a React + Vite frontend and an Express API server.

## Features

- Secure auth with JWT and user profiles
- Quiz creation and quiz attempts with scoring
- Public/private quiz sharing with shareable URLs
- AI quiz generation by topic and difficulty
- PDF-to-quiz generation with RAG pipeline (chunking, embeddings, vector retrieval)
- Rate-limited endpoints for auth and AI workloads
- Type-safe API via OpenAPI + Orval + Zod
- React Query powered data fetching and caching

## Architecture

```mermaid
graph TD
  UI[Quiz App - React + Vite] -->|HTTP /api| API[API Server - Express]
  API --> DB[(MongoDB)]
  API --> AI[Gemini AI Integration]
  API --> SPEC[OpenAPI Spec]
  SPEC --> CLIENT[Generated React Query Client]
  SPEC --> ZOD[Generated Zod Schemas]
```

## Monorepo Layout

| Path | Description |
| --- | --- |
| artifacts/api-server | Express API server (builds to dist) |
| artifacts/quiz-app | React frontend (Vite) |
| artifacts/mockup-sandbox | UI prototyping sandbox |
| lib/api-spec | OpenAPI spec and Orval config |
| lib/api-client-react | Generated React Query hooks |
| lib/api-zod | Generated Zod schemas for request validation |
| lib/integrations-gemini-ai | Gemini AI client wrapper |
| scripts | Utility scripts |

## Tech Stack

**Frontend**
- React 19, Vite, Tailwind CSS
- TanStack Query, Wouter, shadcn/ui

**Backend**
- Express 5, Mongoose, JWT auth
- Zod validation, Pino logging
- Express rate limiting, Helmet, CORS

**Tooling**
- TypeScript, pnpm workspaces
- esbuild for API server bundle
- Orval codegen from OpenAPI

## Getting Started

### Prerequisites

- Node.js 22 LTS
- pnpm 11
- MongoDB instance (local or hosted)
- Gemini AI credentials

### Install

```bash
pnpm install
```

### Configure Environment

Create an `.env` file in `artifacts/api-server` (see `artifacts/api-server/.env.example` for reference):

```bash
PORT=3000
MONGODB_URI=mongodb://localhost:27017/quiz-master-hub
JWT_SECRET=your-secure-random-256-bit-secret
AI_INTEGRATIONS_GEMINI_API_KEY=your-gemini-api-key
AI_INTEGRATIONS_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
LOG_LEVEL=info
```

Optional frontend .env in artifacts/quiz-app:

```bash
VITE_API_PROXY_TARGET=http://localhost:3000
BASE_PATH=/
PORT=5173
```

### Run Locally

```bash
pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/quiz-app run dev
```

Open http://localhost:5173 in your browser.

## Scripts

**Root**
- `pnpm run build` — typecheck and build all packages
- `pnpm run typecheck` — typecheck all packages

**API server**
- `pnpm --filter @workspace/api-server run dev`
- `pnpm --filter @workspace/api-server run build`
- `pnpm --filter @workspace/api-server run start`
- `pnpm --filter @workspace/api-server test`

**Frontend**
- `pnpm --filter @workspace/quiz-app run dev`
- `pnpm --filter @workspace/quiz-app run build`
- `pnpm --filter @workspace/quiz-app run serve`

**API codegen**
- `pnpm --filter @workspace/api-spec run codegen`

## CI/CD

### GitHub Actions

The CI pipeline runs on every push to `main` / `production-hardening` and on pull requests targeting `main`.

Pipeline stages (`.github/workflows/ci.yml`):

```
Install dependencies (pnpm install --frozen-lockfile)
  ↓
Typecheck  (pnpm typecheck — covers all workspaces)
  ↓
Tests      (pnpm --filter @workspace/api-server test)
  ↓
Build backend   (pnpm --filter @workspace/api-server run build)
  ↓
Build frontend  (pnpm --filter @workspace/quiz-app run build)
```

**Environment:** Node 22, pnpm 11, Ubuntu latest.

**Test secret required:** Add `MONGODB_URI` as a GitHub repository secret
(`Settings → Secrets → Actions → New repository secret`).
The test suite connects to a MongoDB Atlas cluster. `vitest.config.ts` contains
a fallback URI so CI still runs without the secret, but adding it is recommended
for reliable, isolated test runs.

> **Note:** No lint script exists in the repository (prettier is available but
> not enforced). A lint step will be added in a future stage once a formatter
> baseline is established.

### Local verification (mirrors CI exactly)

```bash
pnpm install --frozen-lockfile     # enforced dependency install
pnpm typecheck                     # typecheck all workspaces
pnpm --filter @workspace/api-server test          # integration tests
pnpm --filter @workspace/api-server run build     # backend build
pnpm --filter @workspace/quiz-app run build       # frontend build
```

### Render Deployment (Native Node — no Docker)

Deployment uses **Render's native Node.js runtime**. No Docker, no containers.

**Build command** (Render dashboard → Build Command):

```bash
pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/quiz-app run build
```

**Start command** (Render dashboard → Start Command):

```bash
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

**Health check:** `GET /api/healthz` (no authentication required).

**PORT:** Provided automatically by Render — do not set it manually.

**SPA routing:** Express serves the React build with a catch-all fallback so
direct navigation to `/quiz/<shareId>`, `/dashboard`, etc. returns `index.html`
rather than a 404.

**Required environment variables** (set in Render dashboard — never commit secrets):

| Variable | Required | Example |
|---|---|---|
| `NODE_ENV` | ✅ | `production` |
| `MONGODB_URI` | ✅ | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `JWT_SECRET` | ✅ | 32+ char random hex string |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | ✅ | Gemini API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | ✅ | `https://generativelanguage.googleapis.com` |
| `FRONTEND_URL` | ✅ | `https://your-domain.onrender.com` |
| `AUTH_TOKEN_TTL` | optional | `7d` |
| `LOG_LEVEL` | optional | `info` |
| `EMBEDDING_MODEL` | optional | `gemini-embedding-001` |
| `RAG_TOP_K` | optional | `5` |
| `RAG_CHUNK_SIZE` | optional | `800` |
| `RAG_CHUNK_OVERLAP` | optional | `150` |
| `PDF_MAX_PAGES` | optional | `50` |

> **CI/CD independence note:** GitHub Actions and Render Git deployments are
> separate systems. Render detects new commits on the connected branch and
> deploys independently. A CI failure on GitHub does not block Render from
> deploying (unless a deployment protection rule is configured separately).
> See `render.yaml` for the full service blueprint.

## API Overview

Base path: /api

- GET /healthz - Health check (no auth)
- GET /readyz - Readiness check (no auth)
- POST /auth/register - Register
- POST /auth/login - Login
- POST /auth/logout - Logout
- GET /auth/me - Current user
- GET /quizzes - List quizzes
- POST /quizzes - Create quiz
- GET /quizzes/:id - Quiz details
- PATCH /quizzes/:id/visibility - Toggle public/private
- GET /public/quizzes/:shareId - Public quiz via share link
- POST /quizzes/:id/submit - Submit attempt
- POST /public/quizzes/:shareId/submit - Submit public quiz
- GET /attempts - List attempts
- GET /attempts/:id - Attempt details
- POST /generate-quiz - AI quiz generation
- POST /quiz/generate-from-pdf - AI quiz generation from PDF

Full spec: lib/api-spec/openapi.yaml

## Data Model (MongoDB)

- User: username, email, password hash
- Quiz: title, description, questions, createdBy, quizType, sourceFileName, visibility, shareId
- Attempt: quizId, userId, answers, score, totalQuestions, completedAt, questionSnapshot
- Document: userId, filename, pageCount, chunkCount
- DocumentChunk: documentId, userId, pageNumber, text, embedding

## Auth and Storage

- JWT access token stored in secure, HttpOnly, SameSite=Lax cookie (`auth_token`)
- Auth middleware protects quiz and attempt endpoints

## Rate Limits

- Auth: 10 requests per 15 minutes
- AI generation: 10 requests per hour
- PDF AI generation: 5 requests per hour
- General API: 300 requests per 15 minutes (health check excluded)

## Build Outputs

- API server bundle: artifacts/api-server/dist
- Frontend build: artifacts/quiz-app/dist/public

## Troubleshooting

- If the API fails to start, ensure all required env vars are set in artifacts/api-server/.env
- If CORS blocks the frontend, verify FRONTEND_URL matches the UI origin
- If AI generation fails, verify Gemini API key and base URL

## License

MIT
