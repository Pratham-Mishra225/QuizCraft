# QuizCraft Architecture & Technical Design

This document details the system design, data architecture, security boundaries, and retrieval-augmented generation (RAG) pipeline of QuizCraft.

---

## 1. System Overview & Deployment Topology

QuizCraft is built as a unified TypeScript monorepo using pnpm workspaces. In production on Render, a single Node.js process runs the Express server, which hosts both the REST API and the compiled React SPA static assets.

```
                      ┌─────────────────────────────────────────┐
                      │                 Browser                 │
                      └────────────────────┬────────────────────┘
                                           │ HTTPS (TLS 1.3)
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │          Render Cloud Service           │
                      │          (Native Node.js 22)            │
                      │                                         │
                      │  ┌───────────────────────────────────┐  │
                      │  │         Express 5 Server          │  │
                      │  │                                   │  │
                      │  │  ┌─────────────┐ ┌─────────────┐  │  │
                      │  │  │  React SPA  │ │  REST API   │  │  │
                      │  │  │ Static Dist │ │   /api/*    │  │  │
                      │  │  └─────────────┘ └──────┬──────┘  │  │
                      │  └─────────────────────────┼─────────┘  │
                      └────────────────────────────┼────────────┘
                                                   │
                            ┌──────────────────────┴──────────────────────┐
                            │                                             │
                            ▼                                             ▼
                 ┌────────────────────┐                        ┌────────────────────┐
                 │   MongoDB Atlas    │                        │  Google Gemini AI  │
                 │   - Users          │                        │  - Flash 3.1-Lite  │
                 │   - Quizzes        │                        │  - Embedding-001   │
                 │   - Attempts       │                        └────────────────────┘
                 │   - Documents      │
                 │   - Chunks         │
                 └────────────────────┘
```

---

## 2. Core Monorepo Packages

The monorepo separates concerns across frontend, backend, shared types, and external integrations:

| Workspace Path | Package Name | Responsibility |
|---|---|---|
| `artifacts/api-server` | `@workspace/api-server` | Express 5 API application, Mongoose models, security middlewares, RAG pipeline, and build bundle (`esbuild`). |
| `artifacts/quiz-app` | `@workspace/quiz-app` | React 19 single-page application built with Vite, Tailwind CSS, TanStack Query, and Wouter. |
| `artifacts/mockup-sandbox` | `@workspace/mockup-sandbox` | Component prototyping environment. |
| `lib/api-spec` | `@workspace/api-spec` | Authoritative OpenAPI 3.0 specification (`openapi.yaml`) and Orval codegen configuration. |
| `lib/api-zod` | `@workspace/api-zod` | Generated Zod validation schemas for request bodies, query parameters, and API responses. |
| `lib/api-client-react` | `@workspace/api-client-react` | Generated React Query hooks providing type-safe API communication in the frontend. |
| `lib/integrations-gemini-ai` | `@workspace/integrations-gemini-ai` | Official `@google/genai` client wrapper with centralized error formatting and retry helpers. |

---

## 3. Data Models & Schemas

The database uses MongoDB with Mongoose ODM. Schemas are designed for high read throughput, strict tenant isolation, and audit immutability.

```mermaid
erDiagram
    USER ||--o{ QUIZ : "creates"
    USER ||--o{ ATTEMPT : "completes"
    USER ||--o{ DOCUMENT : "uploads"
    QUIZ ||--o{ ATTEMPT : "referenced by"
    DOCUMENT ||--o{ DOCUMENT_CHUNK : "segmented into"

    USER {
        ObjectId _id PK
        string username UK
        string email UK
        string password "bcrypt hash"
        Date createdAt
    }

    QUIZ {
        ObjectId _id PK
        string title
        string description
        array questions "QuestionSchema[]"
        ObjectId createdBy FK
        string sourceType "manual | topic-ai | pdf-ai"
        object sourceMetadata
        string visibility "private | public"
        string shareId UK
        Date createdAt
    }

    ATTEMPT {
        ObjectId _id PK
        ObjectId quizId FK
        string quizTitle
        ObjectId userId FK
        array questionSnapshot "Immutable snapshot"
        array answers "Evaluated answers"
        number score
        number totalQuestions
        Date completedAt
    }

    DOCUMENT {
        ObjectId _id PK
        ObjectId userId FK
        string fileName
        number pageCount
        string status "processing | ready | failed"
        Date createdAt
    }

    DOCUMENT_CHUNK {
        ObjectId _id PK
        ObjectId documentId FK
        ObjectId userId FK
        string chunkId
        number pageNumber
        string text
        array embedding "768-dim vector"
    }
```

### Key Schema Design Decisions

1. **Immutable Historical Snapshotting (`Attempt.questionSnapshot`)**:
   - When a quiz is submitted, the server copies all question data, options, correct answers, explanations, and source citations directly into the `Attempt` record.
   - If the creator later edits questions or deletes the original `Quiz`, historical attempts remain completely intact and reviewable with 100% fidelity.
2. **Cryptographic Share IDs (`Quiz.shareId`)**:
   - Generated via `crypto.randomBytes(12).toString("base64url")`.
   - Allows sharing quizzes publicly without exposing internal MongoDB `ObjectId` identifiers.
3. **Compound Indexes for Query Optimization**:
   - `Quiz`: `{ createdBy: 1, createdAt: -1 }` avoids in-memory sorts for creator dashboards.
   - `Attempt`: `{ userId: 1, completedAt: -1 }` optimizes user history retrieval.
   - `DocumentChunk`: `{ documentId: 1, userId: 1 }` isolates chunk retrieval strictly to the authenticated document owner.

---

## 4. Retrieval-Augmented Generation (RAG) Architecture

The PDF-to-quiz pipeline converts unstructured PDF documents into grounded, cited multiple-choice quizzes.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as Express API (/api/quiz/generate-from-pdf)
    participant Parser as PDF Parser (pdf-parse)
    participant Chunker as Text Chunker
    participant GeminiEmbed as Gemini Embedding API (gemini-embedding-001)
    participant Mongo as MongoDB (Document & Chunks)
    participant GeminiGen as Gemini Generation API (gemini-3.1-flash-lite)

    User->>App: POST /api/quiz/generate-from-pdf (Multipart Form with PDF)
    App->>App: Authenticate JWT Cookie & Check Rate Limit (pdfAiLimiter: 5/hr)
    App->>Mongo: Create Document (status: "processing")
    App->>Parser: extractPagesFromPdf(buffer, maxPages=50)
    Parser-->>App: { totalPages, pages: [{ pageNumber, text }] }
    App->>App: cleanExtractedPages(pages)
    App->>Chunker: chunkPages(cleanedPages, chunkSize=800, overlap=150)
    Chunker-->>App: Chunk[] with unique chunkId & pageNumber
    App->>GeminiEmbed: embedBatch(chunkTexts, taskType="RETRIEVAL_DOCUMENT", dim=768)
    GeminiEmbed-->>App: number[][] (768-dim vectors)
    App->>Mongo: storeChunks(documentId, userId, chunksWithVectors)
    App->>GeminiEmbed: embedText(query, taskType="RETRIEVAL_QUERY", dim=768)
    GeminiEmbed-->>App: queryVector
    App->>App: searchSimilarChunks() + diversifyChunks()
    App->>GeminiGen: generateContent(Structured JSON Schema + Retrieved Context)
    GeminiGen-->>App: JSON { questions: [{ question, options, correctAnswer, explanation, source: { chunkId } }] }
    App->>App: Authoritative Source Validation & Mapping
    App->>Mongo: Create Quiz (sourceType="pdf-ai", questions with verified source citations)
    App->>Mongo: Update Document (status: "ready")
    App-->>User: HTTP 201 Created { id, title }
```

### Mathematical Formulation of Vector Search

For a query embedding vector $\mathbf{q} \in \mathbb{R}^{768}$ and a document chunk embedding $\mathbf{d} \in \mathbb{R}^{768}$, the semantic relevance score is calculated via cosine similarity:

$$\text{Cosine Similarity}(\mathbf{q}, \mathbf{d}) = \frac{\mathbf{q} \cdot \mathbf{d}}{\|\mathbf{q}\|_2 \|\mathbf{d}\|_2} = \frac{\sum_{i=1}^{768} q_i d_i}{\sqrt{\sum_{i=1}^{768} q_i^2} \sqrt{\sum_{i=1}^{768} d_i^2}}$$

- **Page Diversification Algorithm**: Chunks with high scores are grouped into page buckets. A round-robin selection takes top candidates across different pages to prevent the generated quiz from focusing on a single section of the document.

---

## 5. Security & Request Lifecycle

```mermaid
flowchart TD
    Req[Incoming HTTP Request] --> SecHeaders[Helmet Security Headers]
    SecHeaders --> CORS[CORS Origin Whitelist Check]
    CORS --> RateLimiter[Rate Limiters: General / Auth / AI]
    RateLimiter --> CookieParser[Cookie Parser: Extract auth_token]
    CookieParser --> RouteRouter{Route Path}

    RouteRouter -->|/api/healthz, /api/readyz| PublicHealth[Health Handler]
    RouteRouter -->|/api/auth/register, /api/auth/login| PublicAuth[Auth Handler]
    RouteRouter -->|/api/quizzes, /api/attempts, etc.| AuthGuard[requireAuth Middleware]

    AuthGuard --> TokenVerify{Verify JWT Signature & Expiry}
    TokenVerify -->|Invalid / Expired / Missing| Err401[401 Unauthorized]
    TokenVerify -->|Valid| SetUserId[Set req.userId]

    SetUserId --> ZodValidate{Zod Schema Validation}
    ZodValidate -->|Invalid Schema| Err400[400 Bad Request]
    ZodValidate -->|Valid| ServiceHandler[Execute Business Logic]

    ServiceHandler --> DBQuery{Database Query Scoped to req.userId}
    DBQuery -->|Found & Authorized| SuccessResp[200 / 201 JSON Response]
    DBQuery -->|Not Found or IDOR Attempt| Err404[404 Not Found]
```

---

## 6. Observability & Reliability

1. **Structured Logging (`pino`)**:
   - JSON structured output in production (`LOG_LEVEL=info`).
   - Human-readable formatting via `pino-pretty` in development.
   - Automatic HTTP request/response serialization with duration tracking.
2. **Process Lifecycle & Signal Handling**:
   - Listens for `SIGTERM` and `SIGINT`.
   - Stops receiving new HTTP traffic and awaits in-flight requests.
   - Closes MongoDB connection cleanly before exiting.
   - Failsafe 10-second timeout forces exit if connections hang.
3. **Health & Readiness Endpoints**:
   - `/api/healthz`: Liveness probe for load balancer health checking.
   - `/api/readyz`: Readiness probe asserting active MongoDB connection state (`mongoose.connection.readyState === 1`).
   - `/api/healthz/gemini`: Diagnostic probe verifying Gemini API connectivity and credentials.
