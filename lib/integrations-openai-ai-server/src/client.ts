/**
 * OpenAI Client
 *
 * Initialises a singleton OpenAI SDK client using environment variables.
 * The client is shared across the entire API server process.
 *
 * Required environment variables:
 *   - AI_INTEGRATIONS_OPENAI_BASE_URL — API base URL (e.g. https://api.openai.com/v1)
 *   - AI_INTEGRATIONS_OPENAI_API_KEY  — Your OpenAI API key
 */
import OpenAI from "openai";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. " +
      "Add it to your .env file (see .env.example).",
  );
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. " +
      "Add it to your .env file (see .env.example).",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
