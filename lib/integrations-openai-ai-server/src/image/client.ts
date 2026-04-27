/**
 * OpenAI Image Generation & Editing Client
 *
 * Provides utility functions for generating and editing images using
 * OpenAI's image models. Returns raw image buffers suitable for saving
 * to disk or streaming to clients.
 */
import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

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

/**
 * Generate an image from a text prompt and return it as a Buffer.
 *
 * @param prompt - Text description of the desired image.
 * @param size - Image dimensions (default: 1024x1024).
 * @returns A Buffer containing the generated image in PNG format.
 */
export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024",
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });

  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

/**
 * Edit one or more images using a text prompt and return the result as a Buffer.
 *
 * @param imageFiles - Array of file paths to the source images.
 * @param prompt - Text description of the desired edits.
 * @param outputPath - Optional path to save the result to disk.
 * @returns A Buffer containing the edited image in PNG format.
 */
export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string,
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, { type: "image/png" }),
    ),
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
