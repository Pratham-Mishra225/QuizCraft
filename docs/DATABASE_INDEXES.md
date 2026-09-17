# Database Index Strategy

This document records the indexes declared in each Mongoose schema, the queries they support, and the rationale behind every decision — including indexes that were deliberately **not** added.

---

## Index Summary Table

| Collection | Index Name | Keys | Type | Query / Flow Supported |
|---|---|---|---|---|
| `users` | `_id_` | `{ _id: 1 }` | Unique (MongoDB default) | `findById(req.userId)` (GET /auth/me), token validation |
| `users` | `username_1` | `{ username: 1 }` | Unique (`unique: true`) | Registration duplicate check |
| `users` | `email_1` | `{ email: 1 }` | Unique (`unique: true`) | `POST /auth/login` credential lookup, registration duplicate check |
| `quizzes` | `_id_` | `{ _id: 1 }` | Unique (MongoDB default) | `findById(quizId)` (submission, owner update, delete) |
| `quizzes` | `shareId_1` | `{ shareId: 1 }` | Unique (`unique: true`) | `GET /api/quizzes/share/:shareId`, taking public quizzes |
| `quizzes` | `quiz_creator_createdAt` | `{ createdBy: 1, createdAt: -1 }` | Compound | `GET /api/quizzes` — creator dashboard sorted newest first |
| `attempts` | `_id_` | `{ _id: 1 }` | Unique (MongoDB default) | `GET /api/attempts/:id` (result review by ID) |
| `attempts` | `attempt_user_completedAt` | `{ userId: 1, completedAt: -1 }` | Compound | `GET /api/attempts` — user attempt history sorted newest first |
| `attempts` | `attempt_quizId` | `{ quizId: 1 }` | Single-field | Quiz-level attempt queries & cascades |
| `documents` | `_id_` | `{ _id: 1 }` | Unique (MongoDB default) | Document lookups & status updates |
| `documents` | `document_user_createdAt` | `{ userId: 1, createdAt: -1 }` | Compound | `GET /api/documents` — user document history sorted newest first |
| `documentchunks` | `_id_` | `{ _id: 1 }` | Unique (MongoDB default) | Chunk lookups |
| `documentchunks` | `chunk_document_user` | `{ documentId: 1, userId: 1 }` | Compound | `searchSimilarChunks(documentId, queryEmbedding, userId)` (RAG retrieval scoped to document & user) |

---

## Detailed Rationale by Collection

### 1. `users`

- **`email` (unique)**: Lookups on login (`User.findOne({ email })`) must be $O(1)$. Uniqueness also prevents duplicate accounts.
- **`username` (unique)**: Registration checks for existing usernames. Uniqueness prevents duplicates.
- **No additional indexes**: No sorting or multi-field queries on `users` exist in the application.

### 2. `quizzes`

- **`{ createdBy: 1, createdAt: -1 }` (`quiz_creator_createdAt`)**: The creator dashboard (`GET /api/quizzes`) always filters by `createdBy: req.userId` and sorts by `createdAt: -1`. This compound index satisfies both the filter and sort without an in-memory sort stage (`SORT_KEY_GENERATOR`).
- **`shareId` (unique)**: Public quiz lookups find a quiz by its unique `shareId`. The filter `{ shareId, visibility: "public" }` is fully served by this unique index because `shareId` is guaranteed to match at most 1 document, making the `visibility` check an O(1) in-memory property check.
- **`_id`**: Default MongoDB index. Serves `Quiz.findOne({ _id, createdBy })` (owner-scoped update/delete) and `Quiz.findById(id)` (submission).

### 3. `attempts`

- **`{ userId: 1, completedAt: -1 }` (`attempt_user_completedAt`)**: The attempt history endpoint (`GET /api/attempts`) queries all attempts for the authenticated user sorted newest first. The compound index provides index-supported sorting without in-memory sort.
- **`{ quizId: 1 }` (`attempt_quizId`)**: Supports queries relating to attempts for a specific quiz (e.g. cascading deletes or analytics).
- **`_id`**: Default MongoDB index. Serves `Attempt.findOne({ _id, userId })` (result review).

### 4. `documents`

- **`{ userId: 1, createdAt: -1 }` (`document_user_createdAt`)**: Document listings are scoped to the authenticated user and sorted by creation date descending.

### 5. `documentchunks`

- **`{ documentId: 1, userId: 1 }` (`chunk_document_user`)**: During RAG retrieval, `searchSimilarChunks` fetches all chunks for the given `documentId` that belong to `userId` (preventing cross-user IDOR data leaks). This compound index allows MongoDB to fetch only the relevant chunks directly.
- **Deliberately removed**: A standalone `{ userId: 1 }` index was evaluated and removed. No production query searches chunks by `userId` without a `documentId`. The compound index already handles `documentId` filtering with `userId` verification.

---

## Indexes Deliberately NOT Added

| Proposed Index | Collection | Why It Was Rejected |
|---|---|---|
| `{ _id: 1, createdBy: 1 }` | `quizzes` | `_id` is globally unique. MongoDB will use the `_id` primary key index to find at most 1 document, then check `createdBy` in memory. A compound index would waste RAM and disk space. |
| `{ _id: 1, userId: 1 }` | `attempts` | Same rationale as above: `_id` is globally unique and resolves in O(1). |
| `{ shareId: 1, visibility: 1 }` | `quizzes` | `shareId` is unique. An index on `shareId` narrows the search space to at most 1 document immediately; appending `visibility` adds zero selectivity. |
| `{ quizId: 1, userId: 1 }` | `attempts` | No application query searches attempts by both `quizId` AND `userId` simultaneously. History queries filter by `userId` alone, while result queries filter by `_id`. |
| `{ userId: 1 }` (standalone) | `documentchunks` | Chunk queries always include `documentId`. Indexing `userId` alone would increase write overhead on batch chunk insertions with no query benefit. |

---

## Vector Search Considerations

- In the current deployment, vector embeddings are searched in memory using cosine similarity within the application process (`vectorStore.ts`).
- MongoDB Atlas Vector Search indexes are not required for this in-process retrieval model.
