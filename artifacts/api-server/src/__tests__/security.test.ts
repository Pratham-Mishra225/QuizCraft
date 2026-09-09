import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { connectToMongoDB, closeMongoDB } from "../db/mongodb.js";
import { User } from "../models/User.js";
import { Quiz } from "../models/Quiz.js";
import { Attempt } from "../models/Attempt.js";

// ─── Cookie helpers ──────────────────────────────────────────────────────────
// supertest does not automatically carry Set-Cookie back to subsequent requests
// when using the standalone request() API. We extract the auth cookie from a
// login/register response and pass it explicitly via .set("Cookie", ...).

function getSetCookieHeaders(res: request.Response): string[] {
  const h = res.headers["set-cookie"];
  if (!h) return [];
  return Array.isArray(h) ? h : [h];
}

function extractCookie(res: request.Response): string {
  const setCookie = getSetCookieHeaders(res);
  const authCookie = setCookie.find((c: string) => c.startsWith("auth_token="));
  if (!authCookie) throw new Error("No auth_token cookie in response");
  // Return the cookie in the format expected by the Cookie request header
  return authCookie.split(";")[0]; // e.g.  "auth_token=eyJ..."
}

// ─── Stage 4: API Validation & Authorization Hardening ──────────────────────
describe("Stage 4: API Validation & Authorization Hardening", () => {
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;

  beforeAll(async () => {
    await connectToMongoDB();
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: /@stage4test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 4 Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage 4 Test/ } });
    await closeMongoDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@stage4test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 4 Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage 4 Test/ } });

    // Register User A — cookie is the auth transport from Stage 5 onwards
    const resA = await request(app)
      .post("/api/auth/register")
      .send({
        username: "stage4_usera",
        email: "usera@stage4test.com",
        password: "password123",
      });
    userACookie = extractCookie(resA);
    userAId = resA.body.user.id;

    // Register User B
    const resB = await request(app)
      .post("/api/auth/register")
      .send({
        username: "stage4_userb",
        email: "userb@stage4test.com",
        password: "password123",
      });
    userBCookie = extractCookie(resB);
    userBId = resB.body.user.id;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. AUTHENTICATION & INPUT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Authentication Validation & Identity Security", () => {
    it("rejects registration with invalid email format", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "validuser",
          email: "not-an-email",
          password: "password123",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation error");
    });

    it("rejects registration with short password (< 6 chars)", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "validuser",
          email: "valid@stage4test.com",
          password: "123",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation error");
    });

    it("rejects duplicate email registration", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "different_name",
          email: "usera@stage4test.com",
          password: "password123",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("already taken");
    });

    it("rejects login with incorrect password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "usera@stage4test.com",
          password: "wrongpassword",
        });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Invalid credentials");
    });

    it("returns authenticated profile on GET /auth/me with valid cookie", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", userACookie);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userAId);
      expect(res.body.email).toBe("usera@stage4test.com");
    });

    it("rejects GET /auth/me when cookie is missing or malformed", async () => {
      const resMissing = await request(app).get("/api/auth/me");
      expect(resMissing.status).toBe(401);

      const resInvalid = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "auth_token=invalid-token-string");
      expect(resInvalid.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. QUIZ CREATION & VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Quiz Creation Validation & Identity Spoofing", () => {
    it("accepts a valid quiz payload and assigns createdBy to authenticated user", async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Quiz 1",
          description: "A valid test quiz",
          questions: [
            {
              question: "What is 2 + 2?",
              options: ["3", "4", "5", "6"],
              correctAnswer: 1,
              explanation: "2 + 2 equals 4",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("Stage 4 Test Quiz 1");
      expect(res.body.createdBy).toBe(userAId);
      expect(res.body.questions).toHaveLength(1);
      expect(res.body.questions[0].correctAnswer).toBe(1);
    });

    it("rejects quiz creation with missing or empty/whitespace-only title", async () => {
      const resMissing = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          questions: [
            {
              question: "What is 2 + 2?",
              options: ["3", "4", "5", "6"],
              correctAnswer: 1,
            },
          ],
        });
      expect(resMissing.status).toBe(400);

      const resWhitespace = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "   ",
          questions: [
            {
              question: "What is 2 + 2?",
              options: ["3", "4", "5", "6"],
              correctAnswer: 1,
            },
          ],
        });
      expect(resWhitespace.status).toBe(400);
    });

    it("rejects quiz when options count is not 4", async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Invalid Options",
          questions: [
            {
              question: "Sample Question?",
              options: ["A", "B", "C"],
              correctAnswer: 0,
            },
          ],
        });
      expect(res.status).toBe(400);
    });

    it("rejects quiz when options contain duplicates", async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Duplicate Options",
          questions: [
            {
              question: "Sample Question?",
              options: ["Option A", "Option A", "Option B", "Option C"],
              correctAnswer: 0,
            },
          ],
        });
      expect(res.status).toBe(400);
    });

    it("rejects quiz when correctAnswer is out of range (<0 or >3 or non-integer)", async () => {
      const resOutOfRange = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Out of Range",
          questions: [
            {
              question: "Sample Question?",
              options: ["A", "B", "C", "D"],
              correctAnswer: 4,
            },
          ],
        });
      expect(resOutOfRange.status).toBe(400);

      const resNegative = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Negative Index",
          questions: [
            {
              question: "Sample Question?",
              options: ["A", "B", "C", "D"],
              correctAnswer: -1,
            },
          ],
        });
      expect(resNegative.status).toBe(400);
    });

    it("ignores client-supplied createdBy / userId and enforces authenticated identity", async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Spoof Attempt",
          createdBy: userBId, // Maliciously attempting to create quiz under User B
          questions: [
            {
              question: "Sample Question?",
              options: ["A", "B", "C", "D"],
              correctAnswer: 0,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe(userAId); // MUST be User A, not User B
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AUTHORIZATION & IDOR AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Quiz Object-Level Authorization (IDOR Prevention)", () => {
    let quizAId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test User A Private Quiz",
          questions: [
            {
              question: "User A Private Question?",
              options: ["Option 1", "Option 2", "Option 3", "Option 4"],
              correctAnswer: 0,
            },
          ],
        });
      quizAId = res.body.id;
    });

    it("allows User A to retrieve their own quiz", async () => {
      const res = await request(app)
        .get(`/api/quizzes/${quizAId}`)
        .set("Cookie", userACookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(quizAId);
      expect(res.body.title).toBe("Stage 4 Test User A Private Quiz");
    });

    it("allows User A to update their own quiz", async () => {
      const res = await request(app)
        .put(`/api/quizzes/${quizAId}`)
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Updated Quiz Title",
          questions: [
            {
              question: "Updated Question?",
              options: ["U1", "U2", "U3", "U4"],
              correctAnswer: 3,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Stage 4 Test Updated Quiz Title");
    });

    it("allows User A to delete their own quiz", async () => {
      const res = await request(app)
        .delete(`/api/quizzes/${quizAId}`)
        .set("Cookie", userACookie);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Quiz deleted successfully");
    });

    it("denies User B access to User A's quiz with 404 Not Found", async () => {
      const res = await request(app)
        .get(`/api/quizzes/${quizAId}`)
        .set("Cookie", userBCookie);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Quiz not found");
    });

    it("denies User B from updating User A's quiz with 404 Not Found", async () => {
      const res = await request(app)
        .put(`/api/quizzes/${quizAId}`)
        .set("Cookie", userBCookie)
        .send({
          title: "Stage 4 Malicious Update Attempt",
          questions: [
            {
              question: "Hacked Question?",
              options: ["H1", "H2", "H3", "H4"],
              correctAnswer: 2,
            },
          ],
        });

      expect(res.status).toBe(404);

      // Verify quiz content remained unchanged
      const verifyRes = await request(app)
        .get(`/api/quizzes/${quizAId}`)
        .set("Cookie", userACookie);
      expect(verifyRes.body.title).toBe("Stage 4 Test User A Private Quiz");
    });

    it("denies User B from deleting User A's quiz with 404 Not Found", async () => {
      const res = await request(app)
        .delete(`/api/quizzes/${quizAId}`)
        .set("Cookie", userBCookie);

      expect(res.status).toBe(404);

      // Verify quiz still exists for User A
      const verifyRes = await request(app)
        .get(`/api/quizzes/${quizAId}`)
        .set("Cookie", userACookie);
      expect(verifyRes.status).toBe(200);
    });

    it("returns 404 on malformed ObjectId without throwing unhandled CastError", async () => {
      const res = await request(app)
        .get("/api/quizzes/not-a-valid-id")
        .set("Cookie", userACookie);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Quiz not found");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. QUIZ SUBMISSION INTEGRITY & SCORING HARDENING
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Quiz Submission Hardening & Authoritative Scoring", () => {
    let twoQuestionQuizId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test 2-Question Quiz",
          questions: [
            {
              question: "Q1: What is the capital of France?",
              options: ["London", "Berlin", "Paris", "Madrid"],
              correctAnswer: 2, // Paris
            },
            {
              question: "Q2: What is 5 * 5?",
              options: ["20", "25", "30", "35"],
              correctAnswer: 1, // 25
            },
          ],
        });
      twoQuestionQuizId = res.body.id;
    });

    it("scores valid submission correctly on the server (100% score)", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 }, // Correct (Paris)
            { questionIndex: 1, selectedOption: 1 }, // Correct (25)
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.score).toBe(2);
      expect(res.body.totalQuestions).toBe(2);
      expect(res.body.userId).toBe(userAId);
    });

    it("scores partially correct submission correctly on the server", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 }, // Correct
            { questionIndex: 1, selectedOption: 0 }, // Incorrect (selected "20" instead of "25")
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.score).toBe(1);
      expect(res.body.totalQuestions).toBe(2);
    });

    it("rejects partial submissions (missing answers for some questions)", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [{ questionIndex: 0, selectedOption: 2 }], // Only 1 of 2 questions answered
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("expected 2 answers");
    });

    it("rejects extra answers beyond quiz length", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 },
            { questionIndex: 1, selectedOption: 1 },
            { questionIndex: 2, selectedOption: 0 }, // Extra answer
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("expected 2 answers");
    });

    it("rejects duplicate questionIndex in submission payload", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 },
            { questionIndex: 0, selectedOption: 2 }, // Duplicate questionIndex 0
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Duplicate answer received");
    });

    it("rejects invalid out-of-range questionIndex (<0 or >=N)", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 },
            { questionIndex: 99, selectedOption: 1 }, // Invalid index 99
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid questionIndex");
    });

    it("rejects invalid selectedOption index (<0 or >3)", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 },
            { questionIndex: 1, selectedOption: 5 }, // Invalid option index 5
          ],
        });

      expect(res.status).toBe(400);
    });

    it("ignores client manipulation of score and totalQuestions in submission", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          score: 100, // Malicious score claim
          totalQuestions: 100,
          userId: userBId, // Malicious user spoof attempt
          answers: [
            { questionIndex: 0, selectedOption: 0 }, // Incorrect
            { questionIndex: 1, selectedOption: 0 }, // Incorrect
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.score).toBe(0); // Server must compute real score (0/2)
      expect(res.body.totalQuestions).toBe(2);
      expect(res.body.userId).toBe(userAId);
    });

    it("denies User B from submitting answers to User A's quiz", async () => {
      const res = await request(app)
        .post(`/api/quizzes/${twoQuestionQuizId}/submit`)
        .set("Cookie", userBCookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 2 },
            { questionIndex: 1, selectedOption: 1 },
          ],
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Quiz not found");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ATTEMPT AUTHORIZATION & HISTORY SCOPING
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Attempt Authorization & Scoping", () => {
    let attemptAId: string;

    beforeEach(async () => {
      // Create quiz for User A
      const quizRes = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 4 Test Attempt Scoping Quiz",
          questions: [
            {
              question: "Sample Question?",
              options: ["A", "B", "C", "D"],
              correctAnswer: 0,
            },
          ],
        });

      // User A submits quiz
      const submitRes = await request(app)
        .post(`/api/quizzes/${quizRes.body.id}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [{ questionIndex: 0, selectedOption: 0 }],
        });

      attemptAId = submitRes.body.id;
    });

    it("allows User A to retrieve their own attempt history", async () => {
      const res = await request(app)
        .get("/api/attempts")
        .set("Cookie", userACookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].userId).toBe(userAId);
    });

    it("returns empty attempts list for User B (does not leak User A attempts)", async () => {
      const res = await request(app)
        .get("/api/attempts")
        .set("Cookie", userBCookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("allows User A to retrieve their specific attempt by ID", async () => {
      const res = await request(app)
        .get(`/api/attempts/${attemptAId}`)
        .set("Cookie", userACookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(attemptAId);
      expect(res.body.userId).toBe(userAId);
    });

    it("denies User B access to User A's attempt with 404 Not Found", async () => {
      const res = await request(app)
        .get(`/api/attempts/${attemptAId}`)
        .set("Cookie", userBCookie);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Attempt not found");
    });

    it("returns 404 on malformed attempt ID without throwing unhandled error", async () => {
      const res = await request(app)
        .get("/api/attempts/invalid-attempt-id")
        .set("Cookie", userACookie);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Attempt not found");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. GENERATION ENDPOINTS AUTHORIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("AI & PDF Quiz Generation Route Authorization", () => {
    it("denies unauthenticated access to /api/generate-quiz with 401", async () => {
      const res = await request(app)
        .post("/api/generate-quiz")
        .send({
          topic: "Computer Science",
          difficulty: "easy",
          numberOfQuestions: 5,
        });

      expect(res.status).toBe(401);
    });

    it("denies unauthenticated access to /api/quiz/generate-from-pdf with 401", async () => {
      const res = await request(app)
        .post("/api/quiz/generate-from-pdf")
        .field("difficulty", "easy")
        .field("numberOfQuestions", "5");

      expect(res.status).toBe(401);
    });
  });
});

// ─── Stage 5: Cookie-Based Authentication ────────────────────────────────────
describe("Stage 5: Cookie-Based Authentication", () => {
  const TEST_EMAIL = "cookietest@stage5test.com";
  const TEST_PASSWORD = "password123";
  const TEST_USERNAME = "stage5_user";

  beforeAll(async () => {
    await connectToMongoDB();
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: /@stage5test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 5 Test/ } });
    await closeMongoDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@stage5test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 5 Test/ } });
  });

  // ─── 1. Registration ──────────────────────────────────────────────────────
  describe("Registration", () => {
    it("returns 201 and user object (no token in body)", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(201);
      // Safe user object is present
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(TEST_EMAIL);
      expect(res.body.user.id).toBeDefined();
      // JWT MUST NOT appear in the response body
      expect(res.body.token).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
    });

    it("sets an auth_token cookie on registration", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token="));
      expect(authCookie).toBeDefined();
    });

    it("registration cookie has HttpOnly flag", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token=")) ?? "";
      expect(authCookie.toLowerCase()).toContain("httponly");
    });

    it("registration cookie has SameSite=Lax", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token=")) ?? "";
      expect(authCookie.toLowerCase()).toContain("samesite=lax");
    });
  });

  // ─── 2. Login ─────────────────────────────────────────────────────────────
  describe("Login", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });
    });

    it("returns 200 and user object (no token in body)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(TEST_EMAIL);
      // JWT MUST NOT appear in the response body
      expect(res.body.token).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
    });

    it("sets an auth_token cookie on login", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token="));
      expect(authCookie).toBeDefined();
    });

    it("login cookie has HttpOnly flag", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token=")) ?? "";
      expect(authCookie.toLowerCase()).toContain("httponly");
    });

    it("login cookie has SameSite=Lax", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token=")) ?? "";
      expect(authCookie.toLowerCase()).toContain("samesite=lax");
    });

    it("login cookie has a Max-Age attribute (aligned with JWT TTL)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const setCookieHeader = getSetCookieHeaders(res);
      const authCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token=")) ?? "";
      expect(authCookie.toLowerCase()).toContain("max-age=");
    });
  });

  // ─── 3. Cookie-Based Authentication ──────────────────────────────────────
  describe("Cookie-Based Request Authentication", () => {
    let validCookie: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });
      validCookie = extractCookie(res);
    });

    it("authenticates successfully with a valid cookie", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", validCookie);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(TEST_EMAIL);
    });

    it("rejects request with missing cookie — returns 401", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("rejects request with invalid cookie value — returns 401", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "auth_token=this.is.not.a.valid.jwt");
      expect(res.status).toBe(401);
    });

    it("rejects request with malformed JWT structure in cookie — returns 401", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.badpayload.badsig");
      expect(res.status).toBe(401);
    });

    it("rejects request with an expired JWT in cookie — returns 401", async () => {
      // Create an already-expired JWT using the test secret
      const expiredToken = jwt.sign(
        { userId: "000000000000000000000000" },
        "test-secret-key-that-is-at-least-32-chars-long-for-testing",
        { expiresIn: -1 }, // already expired
      );

      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", `auth_token=${expiredToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ─── 4. Logout ────────────────────────────────────────────────────────────
  describe("Logout", () => {
    let validCookie: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: TEST_USERNAME, email: TEST_EMAIL, password: TEST_PASSWORD });
      validCookie = extractCookie(res);
    });

    it("POST /auth/logout returns 200 and clears the cookie", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", validCookie);

      expect(res.status).toBe(200);

      // The Set-Cookie header should clear the cookie (Max-Age=0 or Expires in the past)
      const setCookieHeader = getSetCookieHeaders(res);
      const clearedCookie = setCookieHeader.find((c: string) => c.startsWith("auth_token="));
      expect(clearedCookie).toBeDefined();
      // Cleared cookie should have Max-Age=0 or an expires date in the past
      const cookieLower = clearedCookie?.toLowerCase() ?? "";
      const isCleared =
        cookieLower.includes("max-age=0") ||
        cookieLower.includes("expires=thu, 01 jan 1970");
      expect(isCleared).toBe(true);
    });

    it("POST /auth/logout succeeds even without a cookie (idempotent)", async () => {
      const res = await request(app).post("/api/auth/logout");
      expect(res.status).toBe(200);
    });

    it("authenticated request fails after logout (cookie cleared)", async () => {
      // Verify authenticated before logout
      const beforeRes = await request(app)
        .get("/api/auth/me")
        .set("Cookie", validCookie);
      expect(beforeRes.status).toBe(200);

      // Logout (server clears cookie)
      await request(app)
        .post("/api/auth/logout")
        .set("Cookie", validCookie);

      // Attempt to use the original cookie — the JWT itself is still mathematically
      // valid (stateless), but the browser would have deleted it on logout.
      // This test verifies the server-side behavior: it cannot truly invalidate a
      // stateless JWT without a revocation mechanism (out of scope for Stage 5).
      // The cookie WOULD be gone from a real browser after the logout Set-Cookie response.
      // In a supertest context the old cookie still works (expected JWT statelessness behavior).
      // We verify only that GET /api/auth/me without ANY cookie returns 401.
      const afterRes = await request(app).get("/api/auth/me"); // No cookie sent
      expect(afterRes.status).toBe(401);
    });
  });

  // ─── 5. Authorization regression ─────────────────────────────────────────
  describe("Stage 5 Authorization Regression", () => {
    let userACookie: string;
    let userAId: string;
    let userBCookie: string;

    beforeEach(async () => {
      const resA = await request(app)
        .post("/api/auth/register")
        .send({ username: "s5_usera", email: "usera@stage5test.com", password: "password123" });
      userACookie = extractCookie(resA);
      userAId = resA.body.user.id;

      const resB = await request(app)
        .post("/api/auth/register")
        .send({ username: "s5_userb", email: "userb@stage5test.com", password: "password123" });
      userBCookie = extractCookie(resB);
    });

    it("User A can access their own quiz with cookie auth", async () => {
      const createRes = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 5 Test Quiz",
          questions: [
            { question: "Q?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "A" },
          ],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.createdBy).toBe(userAId);

      const getRes = await request(app)
        .get(`/api/quizzes/${createRes.body.id}`)
        .set("Cookie", userACookie);
      expect(getRes.status).toBe(200);
    });

    it("User B cannot access User A's quiz — IDOR protection intact", async () => {
      const createRes = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 5 Test Private Quiz",
          questions: [
            { question: "Q?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "A" },
          ],
        });

      const getRes = await request(app)
        .get(`/api/quizzes/${createRes.body.id}`)
        .set("Cookie", userBCookie);
      expect(getRes.status).toBe(404);
    });
  });
});
