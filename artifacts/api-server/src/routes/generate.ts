import { Router } from "express";
import { GenerateQuizBody, GenerateQuizResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { ai } from "@workspace/integrations-gemini-ai";

const router = Router();

router.post("/generate-quiz", requireAuth, async (req, res) => {
  const parsed = GenerateQuizBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { topic, difficulty, numberOfQuestions } = parsed.data;

  const prompt = `Generate ${numberOfQuestions} unique multiple-choice quiz questions about "${topic}" at ${difficulty} difficulty level.

Requirements:
- Each question must be clearly worded and unambiguous
- Provide exactly 4 answer options in an array
- correctAnswer is the zero-based index (0, 1, 2, or 3) of the correct option in the options array
- The explanation must clearly explain why the correct answer is right
- All questions must be distinct — no duplicate or paraphrased questions
- Difficulty "${difficulty}": ${
    difficulty === "easy"
      ? "straightforward factual questions suitable for beginners"
      : difficulty === "medium"
        ? "questions requiring moderate understanding and application of concepts"
        : "challenging questions requiring deep knowledge and critical thinking"
  }

Respond with ONLY a valid JSON object matching this exact schema:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Explanation of why Option A is correct."
    }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const rawText = response.text ?? "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      req.log.error({ rawText }, "Gemini returned non-JSON response");
      res.status(500).json({ message: "AI returned an invalid response. Please try again." });
      return;
    }

    const validated = GenerateQuizResponse.safeParse(parsedJson);
    if (!validated.success) {
      req.log.error({ errors: validated.error.errors, parsedJson }, "Gemini response failed schema validation");
      res.status(500).json({ message: "AI response did not match expected format. Please try again." });
      return;
    }

    const unique = validated.data.questions.filter(
      (q, idx, arr) =>
        arr.findIndex(
          (other) => other.question.trim().toLowerCase() === q.question.trim().toLowerCase()
        ) === idx
    );

    if (unique.length === 0) {
      res.status(500).json({ message: "AI failed to generate valid questions. Please try again." });
      return;
    }

    res.json({ questions: unique });
  } catch (err) {
    req.log.error({ err }, "Gemini generation error");
    res.status(500).json({ message: "Failed to generate quiz questions. Please try again." });
  }
});

export default router;
