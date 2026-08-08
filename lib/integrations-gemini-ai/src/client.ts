import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (_ai) return _ai;

  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_GEMINI_API_KEY must be set. Did you forget to provision the Gemini AI integration?",
    );
  }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

  const options: { apiKey: string; httpOptions?: { baseUrl?: string } } = {
    apiKey,
  };

  if (baseUrl) {
    options.httpOptions = {
      baseUrl,
    };
  }

  _ai = new GoogleGenAI(options);
  return _ai;
}

export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return (getAI() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function validateGeminiConnection(): Promise<void> {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI_INTEGRATIONS_GEMINI_API_KEY environment variable is missing.");
  }

  const aiClient = getAI();
  try {
    // Perform a minimal models list or small generation call
    await aiClient.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "validation-ping",
    });
  } catch (err: any) {
    // 429 Quota/Rate Limit is a successful connection and auth confirmation
    if (err.status === 429) {
      return;
    }
    throw err;
  }
}

export interface FormattedGeminiError {
  message: string;
  status: number | null;
  details: any;
  model: string;
  endpoint: string;
}

export function formatGeminiError(err: any, modelName = "gemini-3.1-flash-lite"): FormattedGeminiError {
  return {
    message: err.message || "Unknown Gemini API error",
    status: err.status || err.statusCode || null,
    details: err.error || err.details || null,
    model: modelName,
    endpoint: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "Default Google GenAI endpoint",
  };
}
