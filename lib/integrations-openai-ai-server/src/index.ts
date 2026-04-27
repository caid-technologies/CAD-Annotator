/**
 * OpenAI Server Integration
 *
 * Public API for the server-side OpenAI integration library.
 * Re-exports the OpenAI client instance and utility functions for
 * image generation, editing, and batch processing.
 */
export { openai } from "./client";
export { generateImageBuffer, editImages } from "./image";
export {
  batchProcess,
  batchProcessWithSSE,
  isRateLimitError,
  type BatchOptions,
} from "./batch";
