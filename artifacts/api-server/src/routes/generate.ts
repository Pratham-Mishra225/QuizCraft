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

  const prompt = `Generate ${numberOfQuestions} multiple choice questions on ${topic} at ${difficulty} level.

Return strictly in JSON format:
[
  {
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": "A",
    "explanation": "..."
  }
]

Do not include extra text. No markdown. Only JSON.`;

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
