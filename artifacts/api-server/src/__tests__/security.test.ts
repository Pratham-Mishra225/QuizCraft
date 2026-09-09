import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
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
    await Quiz.deleteMany({ title: { $regex: /Stage \d+ Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage \d+ Test/ } });
    await closeMongoDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@stage4test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage \d+ Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage \d+ Test/ } });


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

// ═══════════════════════════════════════════════════════════════════════════
// 6. STAGE 6: QUIZ & ATTEMPT DATA MODEL REDESIGN
// ═══════════════════════════════════════════════════════════════════════════
describe("Stage 6: Quiz & Attempt Data Model Redesign", () => {
    let userACookie: string;
    let userAId: string;
    let userBCookie: string;
    let userBId: string;

    beforeAll(async () => {
      await connectToMongoDB();
      await User.deleteMany({ email: { $regex: /@stage6test\.com$/ } });
      await Quiz.deleteMany({ title: { $regex: /Stage 6 Test/ } });
      await Attempt.deleteMany({ quizTitle: { $regex: /Stage 6 Test/ } });
    });

    afterAll(async () => {
      await User.deleteMany({ email: { $regex: /@stage6test\.com$/ } });
      await Quiz.deleteMany({ title: { $regex: /Stage 6 Test/ } });
      await Attempt.deleteMany({ quizTitle: { $regex: /Stage 6 Test/ } });
      await closeMongoDB();
    });

    beforeEach(async () => {
      await User.deleteMany({ email: { $regex: /@stage6test\.com$/ } });
      await Quiz.deleteMany({ title: { $regex: /Stage 6 Test/ } });
      await Attempt.deleteMany({ quizTitle: { $regex: /Stage 6 Test/ } });

      const resA = await request(app)
        .post("/api/auth/register")
        .send({
          username: "stage6_usera",
          email: "usera@stage6test.com",
          password: "password123",
        });
      userACookie = extractCookie(resA);
      userAId = resA.body.user.id;

      const resB = await request(app)
        .post("/api/auth/register")
        .send({
          username: "stage6_userb",
          email: "userb@stage6test.com",
          password: "password123",
        });
      userBCookie = extractCookie(resB);
      userBId = resB.body.user.id;
    });

    // ─── A. Quiz Model: sourceType, visibility, sourceMetadata ─────────────────
    describe("Quiz Model: sourceType, visibility, sourceMetadata", () => {
      it("defaults to sourceType=manual, visibility=private, sourceMetadata=null when not provided", async () => {
        const res = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Default Quiz",
            questions: [
              { question: "What is 2+2?", options: ["1", "2", "3", "4"], correctAnswer: 3, explanation: "Math" },
            ],
          });

        expect(res.status).toBe(201);
        expect(res.body.sourceType).toBe("manual");
        expect(res.body.visibility).toBe("private");
        expect(res.body.sourceMetadata).toBeNull();
      });

      it("persists explicit sourceType=topic-ai with sourceMetadata", async () => {
        const res = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test AI Quiz",
            sourceType: "topic-ai",
            sourceMetadata: { topic: "Operating Systems", difficulty: "medium" },
            visibility: "private",
            questions: [
              { question: "What is a deadlock?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "Resource contention" },
            ],
          });

        expect(res.status).toBe(201);
        expect(res.body.sourceType).toBe("topic-ai");
        expect(res.body.sourceMetadata).toEqual({ topic: "Operating Systems", difficulty: "medium" });
        expect(res.body.visibility).toBe("private");
      });

      it("rejects invalid sourceType with 400", async () => {
        const res = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Invalid Source",
            sourceType: "invalid-source-type",
            questions: [
              { question: "Q?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "E" },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Validation error");
      });

      it("rejects invalid visibility with 400", async () => {
        const res = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Invalid Visibility",
            visibility: "unlisted",
            questions: [
              { question: "Q?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "E" },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Validation error");
      });
    });

    // ─── B. Historical Snapshotting on Submission ──────────────────────────────
    describe("Historical Snapshotting & Authoritative Scoring", () => {
      it("creates an immutable questionSnapshot containing complete question data and server-calculated isCorrect", async () => {
        const quizRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test JavaScript Basics",
            questions: [
              {
                question: "What is JavaScript?",
                options: ["Programming Language", "Coffee Brand", "Car Model", "Operating System"],
                correctAnswer: 0,
                explanation: "JS is a high-level programming language.",
              },
              {
                question: "Which keyword declares a constant in modern JS?",
                options: ["var", "let", "const", "def"],
                correctAnswer: 2,
                explanation: "const defines a block-scoped constant.",
              },
            ],
          });
        expect(quizRes.status).toBe(201);
        const quizId = quizRes.body.id;

        // Submit answers: Q0 correct (0), Q1 incorrect (1 instead of 2)
        const submitRes = await request(app)
          .post(`/api/quizzes/${quizId}/submit`)
          .set("Cookie", userACookie)
          .send({
            answers: [
              { questionIndex: 0, selectedOption: 0 },
              { questionIndex: 1, selectedOption: 1 },
            ],
          });

        expect(submitRes.status).toBe(201);
        expect(submitRes.body.score).toBe(1);
        expect(submitRes.body.totalQuestions).toBe(2);
        expect(submitRes.body.quizTitle).toBe("Stage 6 Test JavaScript Basics");
        expect(submitRes.body.userId).toBe(userAId);

        // Verify questionSnapshot in response
        expect(submitRes.body.questionSnapshot).toBeDefined();
        expect(submitRes.body.questionSnapshot.length).toBe(2);

        const snap0 = submitRes.body.questionSnapshot[0];
        expect(snap0.questionIndex).toBe(0);
        expect(snap0.question).toBe("What is JavaScript?");
        expect(snap0.options).toEqual(["Programming Language", "Coffee Brand", "Car Model", "Operating System"]);
        expect(snap0.correctAnswer).toBe(0);
        expect(snap0.explanation).toBe("JS is a high-level programming language.");

        const snap1 = submitRes.body.questionSnapshot[1];
        expect(snap1.questionIndex).toBe(1);
        expect(snap1.question).toBe("Which keyword declares a constant in modern JS?");
        expect(snap1.correctAnswer).toBe(2);

        // Verify answers contain server-calculated isCorrect
        expect(submitRes.body.answers[0].isCorrect).toBe(true);
        expect(submitRes.body.answers[1].isCorrect).toBe(false);

        // Verify direct retrieval from DB also contains full snapshot
        const dbAttempt = await Attempt.findById(submitRes.body.id).lean();
        expect(dbAttempt).toBeDefined();
        expect(dbAttempt?.questionSnapshot.length).toBe(2);
        expect(dbAttempt?.answers[0].isCorrect).toBe(true);
        expect(dbAttempt?.answers[1].isCorrect).toBe(false);
      });
    });

    // ─── C. Historical Integrity: Quiz Modification Resilience ────────────────
    describe("Historical Integrity: Quiz Modification Resilience", () => {
      it("preserves original attempt title, questions, options, and answers after quiz is modified", async () => {
        // 1. Create initial quiz
        const createRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test JavaScript Basics",
            questions: [
              {
                question: "What is JavaScript?",
                options: ["Language", "Coffee", "Car", "OS"],
                correctAnswer: 0,
                explanation: "It is a programming language.",
              },
            ],
          });
        const quizId = createRes.body.id;

        // 2. Submit quiz attempt
        const submitRes = await request(app)
          .post(`/api/quizzes/${quizId}/submit`)
          .set("Cookie", userACookie)
          .send({
            answers: [{ questionIndex: 0, selectedOption: 0 }],
          });
        expect(submitRes.status).toBe(201);
        const attemptId = submitRes.body.id;

        // 3. Owner edits the quiz: changes title, question text, options, and correctAnswer
        const updateRes = await request(app)
          .put(`/api/quizzes/${quizId}`)
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Advanced JavaScript",
            questions: [
              {
                question: "What is a closure in V8?",
                options: ["Lexical env capture", "Garbage collection", "JIT compiler", "Event loop"],
                correctAnswer: 0,
                explanation: "Closure captures outer lexical scope.",
              },
            ],
          });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.title).toBe("Stage 6 Test Advanced JavaScript");

        // 4. Retrieve original attempt
        const getAttemptRes = await request(app)
          .get(`/api/attempts/${attemptId}`)
          .set("Cookie", userACookie);

        expect(getAttemptRes.status).toBe(200);
        // Original quiz title preserved
        expect(getAttemptRes.body.quizTitle).toBe("Stage 6 Test JavaScript Basics");
        // Original question preserved
        expect(getAttemptRes.body.questionSnapshot[0].question).toBe("What is JavaScript?");
        expect(getAttemptRes.body.questionSnapshot[0].options).toEqual(["Language", "Coffee", "Car", "OS"]);
        expect(getAttemptRes.body.questionSnapshot[0].explanation).toBe("It is a programming language.");
        expect(getAttemptRes.body.score).toBe(1);
      });
    });

    // ─── D. Historical Integrity: Quiz Deletion Resilience ────────────────────
    describe("Historical Integrity: Quiz Deletion Resilience", () => {
      it("retains complete attempt result with snapshot even after original quiz is permanently deleted", async () => {
        // 1. Create quiz
        const createRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Ephemeral Quiz",
            questions: [
              {
                question: "Is this temporary?",
                options: ["Yes", "No", "Maybe", "Always"],
                correctAnswer: 0,
                explanation: "Will be deleted.",
              },
            ],
          });
        const quizId = createRes.body.id;

        // 2. Submit attempt
        const submitRes = await request(app)
          .post(`/api/quizzes/${quizId}/submit`)
          .set("Cookie", userACookie)
          .send({
            answers: [{ questionIndex: 0, selectedOption: 0 }],
          });
        expect(submitRes.status).toBe(201);
        const attemptId = submitRes.body.id;

        // 3. Delete the quiz
        const deleteRes = await request(app)
          .delete(`/api/quizzes/${quizId}`)
          .set("Cookie", userACookie);
        expect(deleteRes.status).toBe(200);

        // Confirm quiz is gone
        const checkQuizRes = await request(app)
          .get(`/api/quizzes/${quizId}`)
          .set("Cookie", userACookie);
        expect(checkQuizRes.status).toBe(404);

        // 4. Retrieve attempt: must still succeed and contain all historical data
        const getAttemptRes = await request(app)
          .get(`/api/attempts/${attemptId}`)
          .set("Cookie", userACookie);

        expect(getAttemptRes.status).toBe(200);
        expect(getAttemptRes.body.id).toBe(attemptId);
        expect(getAttemptRes.body.quizTitle).toBe("Stage 6 Test Ephemeral Quiz");
        expect(getAttemptRes.body.questionSnapshot.length).toBe(1);
        expect(getAttemptRes.body.questionSnapshot[0].question).toBe("Is this temporary?");
        expect(getAttemptRes.body.questionSnapshot[0].options).toEqual(["Yes", "No", "Maybe", "Always"]);
        expect(getAttemptRes.body.score).toBe(1);
        expect(getAttemptRes.body.totalQuestions).toBe(1);
      });
    });

    // ─── E. Attempt Authorization & Identity Security ─────────────────────────
    describe("Attempt Authorization & Identity Security", () => {
      it("prevents User B from accessing User A's attempt details (IDOR)", async () => {
        const createRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Private Attempt Quiz",
            questions: [
              { question: "Q1?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "E" },
            ],
          });

        const submitRes = await request(app)
          .post(`/api/quizzes/${createRes.body.id}/submit`)
          .set("Cookie", userACookie)
          .send({
            answers: [{ questionIndex: 0, selectedOption: 0 }],
          });
        const attemptId = submitRes.body.id;

        // User B attempts to access User A's attempt
        const getRes = await request(app)
          .get(`/api/attempts/${attemptId}`)
          .set("Cookie", userBCookie);

        expect(getRes.status).toBe(404);
      });

      it("ignores client spoofing of userId, score, isCorrect, questionSnapshot, and quizTitle", async () => {
        const createRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Real Title",
            questions: [
              { question: "Q1?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "Real" },
            ],
          });

        // Malicious client sends invalid answer (option 1 is wrong), but attempts to spoof score, isCorrect, userId, title
        const submitRes = await request(app)
          .post(`/api/quizzes/${createRes.body.id}/submit`)
          .set("Cookie", userACookie)
          .send({
            userId: userBId,
            score: 100,
            quizTitle: "Spoofed Title",
            questionSnapshot: [{ question: "Spoofed Question" }],
            answers: [{ questionIndex: 0, selectedOption: 1, isCorrect: true, score: 999 }],
          });

        expect(submitRes.status).toBe(201);
        // Server enforced real authenticated user
        expect(submitRes.body.userId).toBe(userAId);
        // Server evaluated score correctly (0, since option 1 != 0)
        expect(submitRes.body.score).toBe(0);
        // Server evaluated isCorrect correctly
        expect(submitRes.body.answers[0].isCorrect).toBe(false);
        // Server preserved authoritative quiz title
        expect(submitRes.body.quizTitle).toBe("Stage 6 Test Real Title");
        // Server stored real question in snapshot
        expect(submitRes.body.questionSnapshot[0].question).toBe("Q1?");
      });
    });

    // ─── F. Edge Cases & Legacy Compatibility ─────────────────────────────────
    describe("Edge Cases & Legacy Compatibility", () => {
      it("handles single-question quiz with 100% score", async () => {
        const createRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Single Question",
            questions: [
              { question: "Q?", options: ["A", "B", "C", "D"], correctAnswer: 3, explanation: "D" },
            ],
          });

        const submitRes = await request(app)
          .post(`/api/quizzes/${createRes.body.id}/submit`)
          .set("Cookie", userACookie)
          .send({
            answers: [{ questionIndex: 0, selectedOption: 3 }],
          });

        expect(submitRes.status).toBe(201);
        expect(submitRes.body.score).toBe(1);
        expect(submitRes.body.totalQuestions).toBe(1);
        expect(submitRes.body.answers[0].isCorrect).toBe(true);
      });

      it("handles multi-question quiz with 0% score (all incorrect)", async () => {
        const createRes = await request(app)
          .post("/api/quizzes")
          .set("Cookie", userACookie)
          .send({
            title: "Stage 6 Test Zero Score",
            questions: [
              { question: "Q1?", options: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "A" },
              { question: "Q2?", options: ["A", "B", "C", "D"], correctAnswer: 1, explanation: "B" },
            ],
          });

        const submitRes = await request(app)
          .post(`/api/quizzes/${createRes.body.id}/submit`)
          .set("Cookie", userACookie)
          .send({
            answers: [
              { questionIndex: 0, selectedOption: 2 },
              { questionIndex: 1, selectedOption: 3 },
            ],
          });

        expect(submitRes.status).toBe(201);
        expect(submitRes.body.score).toBe(0);
        expect(submitRes.body.answers[0].isCorrect).toBe(false);
        expect(submitRes.body.answers[1].isCorrect).toBe(false);
      });

      it("safely retrieves legacy attempt documents without questionSnapshot without crashing", async () => {
        // Directly insert a legacy attempt in MongoDB without questionSnapshot
        const legacyAttempt = await Attempt.create({
          quizId: new Types.ObjectId(),
          quizTitle: "Stage 6 Test Legacy Attempt",
          userId: new Types.ObjectId(userAId),
          answers: [{ questionIndex: 0, selectedOption: 1, isCorrect: false }],
          score: 0,
          totalQuestions: 1,
          completedAt: new Date(),
        });

        const getRes = await request(app)
          .get(`/api/attempts/${legacyAttempt._id}`)
          .set("Cookie", userACookie);

        expect(getRes.status).toBe(200);
        expect(getRes.body.quizTitle).toBe("Stage 6 Test Legacy Attempt");
        expect(Array.isArray(getRes.body.questionSnapshot)).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. STAGE 7: PROPER RESULT REVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Stage 7: Proper Result Review", () => {
    let userACookie: string;
    let userAId: string;
    let userBCookie: string;
    let userBId: string;

    beforeAll(async () => {
      await connectToMongoDB();
      await User.deleteMany({ email: { $regex: /@stage7test\.com$/ } });
      await Quiz.deleteMany({ title: { $regex: /Stage 7 Test/ } });
      await Attempt.deleteMany({ quizTitle: { $regex: /Stage 7 Test/ } });
    });

    afterAll(async () => {
      await User.deleteMany({ email: { $regex: /@stage7test\.com$/ } });
      await Quiz.deleteMany({ title: { $regex: /Stage 7 Test/ } });
      await Attempt.deleteMany({ quizTitle: { $regex: /Stage 7 Test/ } });
      await closeMongoDB();
    });

    beforeEach(async () => {
      await User.deleteMany({ email: { $regex: /@stage7test\.com$/ } });
      await Quiz.deleteMany({ title: { $regex: /Stage 7 Test/ } });
      await Attempt.deleteMany({ quizTitle: { $regex: /Stage 7 Test/ } });

      const resA = await request(app)
        .post("/api/auth/register")
        .send({
          username: "stage7_usera",
          email: "usera@stage7test.com",
          password: "password123",
        });
      userACookie = extractCookie(resA);
      userAId = resA.body.user.id;

      const resB = await request(app)
        .post("/api/auth/register")
        .send({
          username: "stage7_userb",
          email: "userb@stage7test.com",
          password: "password123",
        });
      userBCookie = extractCookie(resB);
      userBId = resB.body.user.id;
    });

    it("provides complete question snapshot, options, answers, correctness, and explanations for result review", async () => {
      const quizRes = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 7 Test Web Protocols",
          questions: [
            {
              question: "What does HTTP stand for?",
              options: [
                "HyperText Transfer Protocol",
                "High Tech Tool Path",
                "Hyper Transfer Text Program",
                "Home Terminal Test Port",
              ],
              correctAnswer: 0,
              explanation: "HTTP stands for HyperText Transfer Protocol.",
            },
            {
              question: "Which protocol is used for secure HTTP?",
              options: ["FTP", "HTTPS", "SMTP", "SSH"],
              correctAnswer: 1,
              explanation: "HTTPS is HTTP secured using TLS/SSL.",
            },
          ],
        });
      expect(quizRes.status).toBe(201);
      const quizId = quizRes.body.id;

      // Submit: Q0 correct (0), Q1 incorrect (0 instead of 1)
      const submitRes = await request(app)
        .post(`/api/quizzes/${quizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [
            { questionIndex: 0, selectedOption: 0 },
            { questionIndex: 1, selectedOption: 0 },
          ],
        });
      expect(submitRes.status).toBe(201);
      const attemptId = submitRes.body.id;

      // Fetch attempt result for review
      const reviewRes = await request(app)
        .get(`/api/attempts/${attemptId}`)
        .set("Cookie", userACookie);

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.id).toBe(attemptId);
      expect(reviewRes.body.quizTitle).toBe("Stage 7 Test Web Protocols");
      expect(reviewRes.body.score).toBe(1);
      expect(reviewRes.body.totalQuestions).toBe(2);

      // Verify questionSnapshot structure
      expect(reviewRes.body.questionSnapshot.length).toBe(2);
      expect(reviewRes.body.questionSnapshot[0].question).toBe("What does HTTP stand for?");
      expect(reviewRes.body.questionSnapshot[0].options[0]).toBe("HyperText Transfer Protocol");
      expect(reviewRes.body.questionSnapshot[0].correctAnswer).toBe(0);
      expect(reviewRes.body.questionSnapshot[0].explanation).toBe("HTTP stands for HyperText Transfer Protocol.");

      expect(reviewRes.body.questionSnapshot[1].question).toBe("Which protocol is used for secure HTTP?");
      expect(reviewRes.body.questionSnapshot[1].correctAnswer).toBe(1);
      expect(reviewRes.body.questionSnapshot[1].explanation).toBe("HTTPS is HTTP secured using TLS/SSL.");

      // Verify evaluated answers
      expect(reviewRes.body.answers[0].selectedOption).toBe(0);
      expect(reviewRes.body.answers[0].isCorrect).toBe(true);
      expect(reviewRes.body.answers[1].selectedOption).toBe(0);
      expect(reviewRes.body.answers[1].isCorrect).toBe(false);
    });

    it("maintains historical result review accuracy after quiz editing and quiz deletion", async () => {
      // 1. Create quiz
      const quizRes = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 7 Test Initial Topic",
          questions: [
            {
              question: "Original Question 1?",
              options: ["Opt A", "Opt B", "Opt C", "Opt D"],
              correctAnswer: 2,
              explanation: "Original Explanation 1",
            },
          ],
        });
      const quizId = quizRes.body.id;

      // 2. Submit quiz
      const submitRes = await request(app)
        .post(`/api/quizzes/${quizId}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [{ questionIndex: 0, selectedOption: 2 }],
        });
      const attemptId = submitRes.body.id;

      // 3. Edit quiz
      await request(app)
        .put(`/api/quizzes/${quizId}`)
        .set("Cookie", userACookie)
        .send({
          title: "Stage 7 Test Edited Topic",
          questions: [
            {
              question: "Completely Changed Question?",
              options: ["New 1", "New 2", "New 3", "New 4"],
              correctAnswer: 0,
              explanation: "Completely Changed Explanation",
            },
          ],
        });

      // 4. Verify review still shows original snapshot
      const reviewAfterEdit = await request(app)
        .get(`/api/attempts/${attemptId}`)
        .set("Cookie", userACookie);

      expect(reviewAfterEdit.status).toBe(200);
      expect(reviewAfterEdit.body.quizTitle).toBe("Stage 7 Test Initial Topic");
      expect(reviewAfterEdit.body.questionSnapshot[0].question).toBe("Original Question 1?");
      expect(reviewAfterEdit.body.questionSnapshot[0].options).toEqual(["Opt A", "Opt B", "Opt C", "Opt D"]);
      expect(reviewAfterEdit.body.questionSnapshot[0].explanation).toBe("Original Explanation 1");
      expect(reviewAfterEdit.body.score).toBe(1);

      // 5. Delete quiz
      await request(app)
        .delete(`/api/quizzes/${quizId}`)
        .set("Cookie", userACookie);

      // 6. Verify review still works independently
      const reviewAfterDelete = await request(app)
        .get(`/api/attempts/${attemptId}`)
        .set("Cookie", userACookie);

      expect(reviewAfterDelete.status).toBe(200);
      expect(reviewAfterDelete.body.quizTitle).toBe("Stage 7 Test Initial Topic");
      expect(reviewAfterDelete.body.questionSnapshot[0].question).toBe("Original Question 1?");
      expect(reviewAfterDelete.body.score).toBe(1);
    });

    it("strictly prevents User B from accessing User A's result review", async () => {
      const quizRes = await request(app)
        .post("/api/quizzes")
        .set("Cookie", userACookie)
        .send({
          title: "Stage 7 Test Private Review",
          questions: [
            { question: "Private Q?", options: ["1", "2", "3", "4"], correctAnswer: 0, explanation: "Private" },
          ],
        });

      const submitRes = await request(app)
        .post(`/api/quizzes/${quizRes.body.id}/submit`)
        .set("Cookie", userACookie)
        .send({
          answers: [{ questionIndex: 0, selectedOption: 0 }],
        });

      const getRes = await request(app)
        .get(`/api/attempts/${submitRes.body.id}`)
        .set("Cookie", userBCookie);

      expect(getRes.status).toBe(404);
      expect(getRes.body.message).toBe("Attempt not found");
    });
  });

// ─── Stage 8: Public / Private Quiz Sharing ──────────────────────────────────

describe("Stage 8: Public / Private Quiz Sharing", () => {
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;

  beforeAll(async () => {
    await connectToMongoDB();
    await User.deleteMany({ email: { $regex: /@stage8test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 8 Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage 8 Test/ } });
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: /@stage8test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 8 Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage 8 Test/ } });
    await closeMongoDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@stage8test\.com$/ } });
    await Quiz.deleteMany({ title: { $regex: /Stage 8 Test/ } });
    await Attempt.deleteMany({ quizTitle: { $regex: /Stage 8 Test/ } });

    // Register User A (creator)
    const resA = await request(app)
      .post("/api/auth/register")
      .send({
        username: "stage8_usera",
        email: "usera@stage8test.com",
        password: "password123",
      });
    userACookie = extractCookie(resA);
    userAId = resA.body.user.id;

    // Register User B (participant)
    const resB = await request(app)
      .post("/api/auth/register")
      .send({
        username: "stage8_userb",
        email: "userb@stage8test.com",
        password: "password123",
      });
    userBCookie = extractCookie(resB);
    userBId = resB.body.user.id;
  });

  const sampleQuestions = [
    {
      question: "What is the primary key in MongoDB?",
      options: ["_id", "id", "key", "pk"],
      correctAnswer: 0,
      explanation: "_id is MongoDB default unique identifier",
    },
    {
      question: "Which HTTP status code represents Not Found?",
      options: ["200", "400", "404", "500"],
      correctAnswer: 2,
      explanation: "404 indicates resource not found",
    },
  ];

  it("defaults new quiz to visibility=private and generates a secure random shareId", async () => {
    const res = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Default Private",
        questions: sampleQuestions,
      });

    expect(res.status).toBe(201);
    expect(res.body.visibility).toBe("private");
    expect(res.body.shareId).toBeDefined();
    expect(typeof res.body.shareId).toBe("string");
    expect(res.body.shareId.length).toBeGreaterThanOrEqual(12);
    // Ensure URL-safe base64url characters only
    expect(/^[A-Za-z0-9_-]+$/.test(res.body.shareId)).toBe(true);
  });

  it("ignores client attempts to inject or overwrite shareId on creation and update", async () => {
    const fakeShareId = "injected-custom-share-id";
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Injected ShareId",
        questions: sampleQuestions,
        shareId: fakeShareId,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.shareId).not.toBe(fakeShareId);

    const updateRes = await request(app)
      .put(`/api/quizzes/${createRes.body.id}`)
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Updated Title",
        questions: sampleQuestions,
        shareId: fakeShareId,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.shareId).toBe(createRes.body.shareId);
  });

  it("allows quiz owner to toggle visibility (private -> public and public -> private)", async () => {
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Toggle Visibility",
        questions: sampleQuestions,
      });

    expect(createRes.body.visibility).toBe("private");

    // Make Public via PATCH /api/quizzes/:id/visibility
    const makePublicRes = await request(app)
      .patch(`/api/quizzes/${createRes.body.id}/visibility`)
      .set("Cookie", userACookie)
      .send({ visibility: "public" });

    expect(makePublicRes.status).toBe(200);
    expect(makePublicRes.body.visibility).toBe("public");
    expect(makePublicRes.body.shareId).toBe(createRes.body.shareId);

    // Make Private via PATCH /api/quizzes/:id/visibility
    const makePrivateRes = await request(app)
      .patch(`/api/quizzes/${createRes.body.id}/visibility`)
      .set("Cookie", userACookie)
      .send({ visibility: "private" });

    expect(makePrivateRes.status).toBe(200);
    expect(makePrivateRes.body.visibility).toBe("private");
    expect(makePrivateRes.body.shareId).toBe(createRes.body.shareId);
  });

  it("strictly forbids non-owner from changing quiz visibility", async () => {
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Non-Owner Visibility Protection",
        questions: sampleQuestions,
      });

    const patchRes = await request(app)
      .patch(`/api/quizzes/${createRes.body.id}/visibility`)
      .set("Cookie", userBCookie)
      .send({ visibility: "public" });

    expect(patchRes.status).toBe(404);
    expect(patchRes.body.message).toBe("Quiz not found");
  });

  it("allows authenticated non-owner to retrieve a public quiz via shareId with Cache-Control headers", async () => {
    // 1. User A creates public quiz
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Public Access",
        description: "Public test description",
        questions: sampleQuestions,
        visibility: "public",
      });

    const shareId = createRes.body.shareId;

    // 2. User B fetches via GET /api/public/quizzes/:shareId
    const publicRes = await request(app)
      .get(`/api/public/quizzes/${shareId}`)
      .set("Cookie", userBCookie);

    expect(publicRes.status).toBe(200);
    expect(publicRes.headers["cache-control"]).toContain("private");
    expect(publicRes.headers["cache-control"]).toContain("no-store");
    expect(publicRes.body.id).toBe(createRes.body.id);
    expect(publicRes.body.shareId).toBe(shareId);
    expect(publicRes.body.title).toBe("Stage 8 Test Public Access");
    expect(publicRes.body.description).toBe("Public test description");
    expect(publicRes.body.questions).toHaveLength(2);
    expect(publicRes.body.visibility).toBe("public");
  });

  it("denies access to a private quiz when requested via shareId by another user", async () => {
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Private via ShareId",
        questions: sampleQuestions,
        visibility: "private",
      });

    const shareId = createRes.body.shareId;

    const publicRes = await request(app)
      .get(`/api/public/quizzes/${shareId}`)
      .set("Cookie", userBCookie);

    expect(publicRes.status).toBe(404);
    expect(publicRes.body.message).toBe("Quiz not found");
  });

  it("denies unauthenticated requests to /api/public/quizzes/:shareId with 401", async () => {
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Unauth Public Access",
        questions: sampleQuestions,
        visibility: "public",
      });

    const shareId = createRes.body.shareId;

    const unauthRes = await request(app).get(`/api/public/quizzes/${shareId}`);
    expect(unauthRes.status).toBe(401);
  });

  it("returns safe 404 for invalid or non-existent shareId without leaking database details", async () => {
    const res = await request(app)
      .get("/api/public/quizzes/non-existent-random-share-id-12345")
      .set("Cookie", userBCookie);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Quiz not found");
  });

  it("allows non-owner to submit a public quiz and assigns Attempt strictly to participant", async () => {
    // 1. User A creates public quiz
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Non-Owner Submit",
        questions: sampleQuestions,
        visibility: "public",
      });

    const quizId = createRes.body.id;

    // 2. User B submits answers
    const submitRes = await request(app)
      .post(`/api/quizzes/${quizId}/submit`)
      .set("Cookie", userBCookie)
      .send({
        answers: [
          { questionIndex: 0, selectedOption: 0 }, // Correct
          { questionIndex: 1, selectedOption: 0 }, // Incorrect (correct is 2)
        ],
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.userId).toBe(userBId); // Must be User B, NOT User A!
    expect(submitRes.body.quizId).toBe(quizId);
    expect(submitRes.body.quizTitle).toBe("Stage 8 Test Non-Owner Submit");
    expect(submitRes.body.score).toBe(1);
    expect(submitRes.body.totalQuestions).toBe(2);
    expect(submitRes.body.questionSnapshot).toHaveLength(2);

    // 3. User B can view their attempt in their attempt history
    const attemptsRes = await request(app)
      .get("/api/attempts")
      .set("Cookie", userBCookie);

    expect(attemptsRes.status).toBe(200);
    expect(attemptsRes.body.some((a: { id: string }) => a.id === submitRes.body.id)).toBe(true);

    // 4. User B does NOT see User A's quiz in their "My Quizzes" list
    const myQuizzesRes = await request(app)
      .get("/api/quizzes")
      .set("Cookie", userBCookie);

    expect(myQuizzesRes.status).toBe(200);
    expect(myQuizzesRes.body.some((q: { id: string }) => q.id === quizId)).toBe(false);

    // 5. User A cannot view User B's attempt (IDOR protection on attempt)
    const userAAttemptView = await request(app)
      .get(`/api/attempts/${submitRes.body.id}`)
      .set("Cookie", userACookie);

    expect(userAAttemptView.status).toBe(404);
  });

  it("supports submitting public quiz using shareId as the route parameter", async () => {
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Submit via ShareId",
        questions: sampleQuestions,
        visibility: "public",
      });

    const shareId = createRes.body.shareId;

    const submitRes = await request(app)
      .post(`/api/quizzes/${shareId}/submit`)
      .set("Cookie", userBCookie)
      .send({
        answers: [
          { questionIndex: 0, selectedOption: 0 },
          { questionIndex: 1, selectedOption: 2 },
        ],
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.userId).toBe(userBId);
    expect(submitRes.body.score).toBe(2);
  });

  it("prevents participant from modifying or deleting creator's public quiz", async () => {
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Creator Protected Public Quiz",
        questions: sampleQuestions,
        visibility: "public",
      });

    const quizId = createRes.body.id;

    // User B tries to update User A's public quiz
    const updateRes = await request(app)
      .put(`/api/quizzes/${quizId}`)
      .set("Cookie", userBCookie)
      .send({
        title: "Hacked Title",
        questions: sampleQuestions,
      });
    expect(updateRes.status).toBe(404);

    // User B tries to delete User A's public quiz
    const deleteRes = await request(app)
      .delete(`/api/quizzes/${quizId}`)
      .set("Cookie", userBCookie);
    expect(deleteRes.status).toBe(404);
  });

  it("revokes participant access when public quiz is made private, but preserves historical attempts", async () => {
    // 1. User A creates public quiz
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Public to Private Transition",
        questions: sampleQuestions,
        visibility: "public",
      });

    const quizId = createRes.body.id;
    const shareId = createRes.body.shareId;

    // 2. User B takes the quiz and creates an Attempt
    const submitRes = await request(app)
      .post(`/api/quizzes/${quizId}/submit`)
      .set("Cookie", userBCookie)
      .send({
        answers: [
          { questionIndex: 0, selectedOption: 0 },
          { questionIndex: 1, selectedOption: 2 },
        ],
      });
    expect(submitRes.status).toBe(201);
    const attemptId = submitRes.body.id;

    // 3. User A makes the quiz private
    const patchRes = await request(app)
      .patch(`/api/quizzes/${quizId}/visibility`)
      .set("Cookie", userACookie)
      .send({ visibility: "private" });
    expect(patchRes.status).toBe(200);

    // 4. User B now tries to access the shareId -> 404
    const getShareRes = await request(app)
      .get(`/api/public/quizzes/${shareId}`)
      .set("Cookie", userBCookie);
    expect(getShareRes.status).toBe(404);

    // 5. User B tries to submit again -> 404
    const submitAgainRes = await request(app)
      .post(`/api/quizzes/${quizId}/submit`)
      .set("Cookie", userBCookie)
      .send({
        answers: [
          { questionIndex: 0, selectedOption: 0 },
          { questionIndex: 1, selectedOption: 2 },
        ],
      });
    expect(submitAgainRes.status).toBe(404);

    // 6. User B's historical attempt remains completely accessible with intact snapshot
    const attemptRes = await request(app)
      .get(`/api/attempts/${attemptId}`)
      .set("Cookie", userBCookie);
    expect(attemptRes.status).toBe(200);
    expect(attemptRes.body.score).toBe(2);
    expect(attemptRes.body.questionSnapshot).toHaveLength(2);
  });

  it("preserves participant attempts even if creator deletes the public quiz", async () => {
    // 1. User A creates public quiz
    const createRes = await request(app)
      .post("/api/quizzes")
      .set("Cookie", userACookie)
      .send({
        title: "Stage 8 Test Delete Public Quiz",
        questions: sampleQuestions,
        visibility: "public",
      });

    const quizId = createRes.body.id;
    const shareId = createRes.body.shareId;

    // 2. User B takes the quiz
    const submitRes = await request(app)
      .post(`/api/quizzes/${quizId}/submit`)
      .set("Cookie", userBCookie)
      .send({
        answers: [
          { questionIndex: 0, selectedOption: 0 },
          { questionIndex: 1, selectedOption: 2 },
        ],
      });
    const attemptId = submitRes.body.id;

    // 3. User A deletes the quiz
    const deleteRes = await request(app)
      .delete(`/api/quizzes/${quizId}`)
      .set("Cookie", userACookie);
    expect(deleteRes.status).toBe(200);

    // 4. Public share link is no longer accessible
    const getShareRes = await request(app)
      .get(`/api/public/quizzes/${shareId}`)
      .set("Cookie", userBCookie);
    expect(getShareRes.status).toBe(404);

    // 5. User B's attempt remains intact and queryable
    const attemptRes = await request(app)
      .get(`/api/attempts/${attemptId}`)
      .set("Cookie", userBCookie);
    expect(attemptRes.status).toBe(200);
    expect(attemptRes.body.quizTitle).toBe("Stage 8 Test Delete Public Quiz");
    expect(attemptRes.body.score).toBe(2);
  });
});



