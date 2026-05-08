/**
 * Re-Query Service
 *
 * Handles confidence-based re-querying of GD&T annotations. When an annotation
 * has a confidence score below 0.6, this service crops the bounding box region
 * from the original image (with 15% padding), sends it to the vision model with
 * a focused GD&T prompt, and applies a decision rule to determine whether to
 * replace the original annotation.
 *
 * Exports pure functions for crop computation and decision logic so they can
 * be tested independently without mocking.
 */

import sharp from "sharp";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { EnrichedAnnotation } from "./compliance-engine.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence threshold below which annotations are re-queried. */
const REQUERY_CONFIDENCE_THRESHOLD = 0.6;

/** Padding fraction applied to each side of the bounding box crop. */
const CROP_PADDING = 0.15;

/** OpenAI model for re-query vision calls. */
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

/** Maximum tokens for re-query responses. */
const MAX_COMPLETION_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Crop Region Types & Logic
// ---------------------------------------------------------------------------

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Compute the pixel crop region for a bounding box with padding, clamped to
 * image bounds.
 *
 * The bounding box coordinates are percentages (0–100) of the image dimensions.
 * Padding is applied as a fraction of the bounding box dimensions on each side.
 *
 * @param boundingBox - Bounding box with x, y, width, height as percentages
 * @param imageWidth  - Image width in pixels (must be positive)
 * @param imageHeight - Image height in pixels (must be positive)
 * @param padding     - Padding fraction (0.15 = 15% of bbox dimensions on each side)
 * @returns Pixel crop region clamped to image bounds with positive dimensions
 */
export function computeCropRegion(
  boundingBox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  padding: number,
): CropRegion {
  // Convert percentage coordinates to pixels
  const bboxLeftPx = (boundingBox.x / 100) * imageWidth;
  const bboxTopPx = (boundingBox.y / 100) * imageHeight;
  const bboxWidthPx = (boundingBox.width / 100) * imageWidth;
  const bboxHeightPx = (boundingBox.height / 100) * imageHeight;

  // Compute padding in pixels (fraction of bbox dimensions)
  const padX = bboxWidthPx * padding;
  const padY = bboxHeightPx * padding;

  // Expand with padding
  const expandedLeft = bboxLeftPx - padX;
  const expandedTop = bboxTopPx - padY;
  const expandedRight = bboxLeftPx + bboxWidthPx + padX;
  const expandedBottom = bboxTopPx + bboxHeightPx + padY;

  // Clamp to image bounds
  const clampedLeft = Math.max(0, Math.floor(expandedLeft));
  const clampedTop = Math.max(0, Math.floor(expandedTop));
  const clampedRight = Math.min(imageWidth, Math.ceil(expandedRight));
  const clampedBottom = Math.min(imageHeight, Math.ceil(expandedBottom));

  // Ensure positive dimensions (at least 1px)
  const width = Math.max(1, clampedRight - clampedLeft);
  const height = Math.max(1, clampedBottom - clampedTop);

  return {
    left: clampedLeft,
    top: clampedTop,
    width,
    height,
  };
}

// ---------------------------------------------------------------------------
// Re-Query Decision Logic
// ---------------------------------------------------------------------------

/**
 * Apply the re-query decision rule to determine which annotation to keep.
 *
 * - If the re-query result has confidence >= 0.6, replace the original.
 * - If the re-query result has confidence < 0.6, keep whichever has higher
 *   confidence and set needsReview = true.
 *
 * @param original     - The original annotation from Stage 1
 * @param reQueryResult - The annotation from the re-query attempt
 * @returns The chosen annotation with appropriate flags
 */
export function applyReQueryDecision(
  original: EnrichedAnnotation,
  reQueryResult: EnrichedAnnotation,
): EnrichedAnnotation {
  if (reQueryResult.confidence >= REQUERY_CONFIDENCE_THRESHOLD) {
    // Re-query succeeded with sufficient confidence — replace original
    return { ...reQueryResult };
  }

  // Re-query still low confidence — keep the higher-confidence result
  // and flag for human review
  if (reQueryResult.confidence >= original.confidence) {
    return { ...reQueryResult, needsReview: true };
  }

  return { ...original, needsReview: true };
}

// ---------------------------------------------------------------------------
// Re-Query Prompt
// ---------------------------------------------------------------------------

/**
 * Build a focused GD&T re-query prompt that includes the type hint from the
 * initial detection. This prompt is more specific than the Stage 1 prompt,
 * asking the model to re-examine a single cropped GD&T symbol.
 */
function buildReQueryPrompt(annotation: EnrichedAnnotation): string {
  const typeHint = annotation.type;
  const labelHint = annotation.label;
  const valueHint = annotation.value;

  let typeSpecificInstructions = "";

  switch (typeHint) {
    case "dimension":
      typeSpecificInstructions = `This appears to be a DIMENSION annotation (${annotation.dimensionType}).
Extract: dimensionType (linear|angular|radius|diameter), nominalValue, plusTolerance, minusTolerance, unit.`;
      break;
    case "fcf":
      typeSpecificInstructions = `This appears to be a FEATURE CONTROL FRAME (FCF) annotation.
Extract: geometricCharacteristic (position|flatness|straightness|circularity|cylindricity|perpendicularity|parallelism|angularity|profileOfLine|profileOfSurface|circularRunout|totalRunout|symmetry|concentricity), toleranceValue, materialCondition (MMC|LMC|RFS|null), datumReferences (array of up to 3 uppercase letters).`;
      break;
    case "datum":
      typeSpecificInstructions = `This appears to be a DATUM annotation.
Extract: datumLetter (a single uppercase letter A-Z).`;
      break;
    case "surface_finish":
      typeSpecificInstructions = `This appears to be a SURFACE FINISH annotation.
Extract: roughnessValue (number), processNote (optional text).`;
      break;
    case "note":
      typeSpecificInstructions = `This appears to be a NOTE annotation.
Extract the text content of the note.`;
      break;
  }

  return `You are an expert GD&T (Geometric Dimensioning and Tolerancing) symbol reader. You are re-examining a specific cropped region of an engineering drawing that was initially detected as a GD&T annotation.

Initial detection:
- Type: ${typeHint}
- Label: "${labelHint}"
- Value: "${valueHint}"

${typeSpecificInstructions}

Carefully examine this cropped image and provide an accurate reading of the GD&T annotation. Return a JSON object with this exact structure:
{
  "type": "${typeHint}",
  "label": "the annotation label text",
  "value": "the annotation value",
  "confidence": 0.85,
  ... type-specific fields as described above
}

Rules:
- confidence must be between 0.0 and 1.0, reflecting your certainty in the reading
- If you cannot read the annotation clearly, set confidence below 0.5
- Only return valid JSON, no other text
- Keep the same "type" as the initial detection unless you are very confident it is a different type`;
}

// ---------------------------------------------------------------------------
// Image Cropping
// ---------------------------------------------------------------------------

/**
 * Crop a region from a base64-encoded image using sharp.
 *
 * @param imageData  - Base64 data URI (e.g. "data:image/png;base64,...")
 * @param cropRegion - Pixel crop region
 * @returns Base64 data URI of the cropped image
 */
async function cropImage(
  imageData: string,
  cropRegion: CropRegion,
): Promise<string> {
  // Extract raw base64 and mime type from data URI
  const base64Data = imageData.split(",")[1] ?? imageData;
  const mimeType = imageData.split(";")[0]?.split(":")[1] ?? "image/png";

  const buffer = Buffer.from(base64Data, "base64");

  const croppedBuffer = await sharp(buffer)
    .extract({
      left: cropRegion.left,
      top: cropRegion.top,
      width: cropRegion.width,
      height: cropRegion.height,
    })
    .png()
    .toBuffer();

  return `data:image/png;base64,${croppedBuffer.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Re-Query Result Type
// ---------------------------------------------------------------------------

export interface ReQueryResult {
  annotation: EnrichedAnnotation;
  wasRequeried: boolean;
}

// ---------------------------------------------------------------------------
// Main Re-Query Function
// ---------------------------------------------------------------------------

/**
 * Re-query annotations with low confidence scores.
 *
 * For each annotation with confidence < 0.6:
 * 1. Crop the bounding box region from the original image (15% padding)
 * 2. Send the cropped image to the vision model with a focused GD&T prompt
 * 3. Apply the decision rule to determine which annotation to keep
 *
 * Maximum one re-query attempt per annotation.
 *
 * @param annotations - Array of enriched annotations from Stage 1
 * @param imageData   - Original base64 image data URI
 * @returns Array of ReQueryResult objects
 */
export async function reQueryLowConfidence(
  annotations: EnrichedAnnotation[],
  imageData: string,
): Promise<ReQueryResult[]> {
  // Get image dimensions using sharp
  const base64Data = imageData.split(",")[1] ?? imageData;
  const imageBuffer = Buffer.from(base64Data, "base64");
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;

  const results: ReQueryResult[] = [];

  for (const annotation of annotations) {
    if (annotation.confidence >= REQUERY_CONFIDENCE_THRESHOLD) {
      // High enough confidence — keep as-is
      results.push({ annotation, wasRequeried: false });
      continue;
    }

    try {
      // Crop the bounding box region with padding
      const cropRegion = computeCropRegion(
        annotation.boundingBox,
        imageWidth,
        imageHeight,
        CROP_PADDING,
      );

      const croppedImage = await cropImage(imageData, cropRegion);

      // Build focused re-query prompt
      const prompt = buildReQueryPrompt(annotation);

      // Extract base64 from cropped image
      const croppedBase64 = croppedImage.split(",")[1] ?? croppedImage;

      // Call vision model with cropped image
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${croppedBase64}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Please re-examine this GD&T annotation and provide an accurate reading.",
              },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "{}";

      // Parse the re-query response
      let parsed: Record<string, unknown>;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        // Failed to parse — keep original with needsReview
        results.push({
          annotation: { ...annotation, needsReview: true },
          wasRequeried: true,
        });
        continue;
      }

      // Build the re-query annotation, preserving the original's id and boundingBox
      const reQueryAnnotation: EnrichedAnnotation = {
        ...annotation,
        ...parsed,
        id: annotation.id,
        boundingBox: annotation.boundingBox,
        confidence:
          typeof parsed.confidence === "number"
            ? Math.max(0, Math.min(1, parsed.confidence as number))
            : annotation.confidence,
      } as EnrichedAnnotation;

      // Apply decision logic
      const chosen = applyReQueryDecision(annotation, reQueryAnnotation);
      results.push({ annotation: chosen, wasRequeried: true });
    } catch {
      // Re-query failed — keep original with needsReview flag
      results.push({
        annotation: { ...annotation, needsReview: true },
        wasRequeried: true,
      });
    }
  }

  return results;
}
