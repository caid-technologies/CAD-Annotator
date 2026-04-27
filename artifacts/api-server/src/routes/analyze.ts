/**
 * CAD Drawing Analysis Route
 *
 * POST /api/analyze
 *
 * Accepts a base64-encoded image of a CAD drawing and sends it to OpenAI's
 * vision model for analysis. The model extracts annotations, dimensions,
 * measurements, tolerances, and labels, returning them as structured JSON
 * with bounding box coordinates (as percentages of image dimensions).
 *
 * Request body (validated via Zod):
 *   - imageData: base64 data URI (e.g. "data:image/png;base64,...")
 *   - includeDescription: whether to include a natural-language summary
 *   - baselineMode: use a simpler prompt for faster/cheaper analysis
 *
 * Response:
 *   - annotations[]: extracted labels with bounding boxes
 *   - views[]: detected drawing views
 *   - description?: optional natural-language summary
 */
import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AnalyzeDrawingBody } from "@workspace/api-zod";

const router = Router();

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Bounding box coordinates as percentages (0–100) of the image dimensions. */
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/** A single annotation extracted from the CAD drawing. */
interface Annotation {
  id: string;
  label: string;
  value: string;
  view: string;
  boundingBox: BoundingBox;
  description?: string;
}

/** Colour palette for annotation bounding boxes, cycled by index. */
const ANNOTATION_COLORS = [
  "green",
  "blue",
  "red",
  "orange",
  "purple",
  "cyan",
  "yellow",
] as const;

/**
 * OpenAI model to use for vision analysis.
 * Configurable via the `OPENAI_MODEL` environment variable.
 * Must be a model that supports image/vision input.
 */
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

/** Maximum tokens the model can generate in its response. */
const MAX_COMPLETION_TOKENS = 8192;

/* -------------------------------------------------------------------------- */
/*  System prompts                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Baseline prompt — simpler analysis that focuses on the most prominent
 * dimensions and labels. Faster and cheaper, useful for quick previews.
 */
const BASELINE_SYSTEM_PROMPT = `You are a CAD drawing analyzer. Analyze the provided engineering drawing and extract key annotations and measurements. 
Focus only on the most prominent dimensions and labels.
Return a JSON object with this exact structure:
{
  "annotations": [
    {
      "id": "ann_1",
      "label": "R3.2 TYP.",
      "value": "R3.2",
      "view": "View 1",
      "boundingBox": { "x": 10, "y": 20, "width": 15, "height": 8, "color": "green" },
      "description": "optional description"
    }
  ],
  "views": ["View 1", "View 2"],
  "description": "optional overall description"
}
The boundingBox coordinates are percentages of the image dimensions (0-100).
x and y are the top-left corner. width and height are the dimensions.
Use different colors for different sections: green, blue, red, orange, purple.
Only return valid JSON, no other text.`;

/**
 * Detailed prompt — thorough analysis that extracts ALL annotations,
 * dimensions, measurements, tolerances, notes, and labels from the drawing.
 */
const DETAILED_SYSTEM_PROMPT = `You are an expert CAD drawing analyzer. Carefully analyze the provided engineering drawing and extract ALL annotations, dimensions, measurements, tolerances, notes, and labels.
For each annotation, identify its location in the image as a bounding box (percentage coordinates).
Group annotations by which view they belong to (e.g., "View 1", "View 2", or "Top View", "Front View", etc.).
Return a JSON object with this exact structure:
{
  "annotations": [
    {
      "id": "ann_1",
      "label": "R3.2 TYP.",
      "value": "R3.2",
      "view": "View 1",
      "boundingBox": { "x": 10, "y": 20, "width": 15, "height": 8, "color": "green" },
      "description": "Typical radius of 3.2mm"
    }
  ],
  "views": ["View 1", "View 2"],
  "description": "Overall description of the drawing"
}

Rules:
- The boundingBox coordinates are percentages of the image dimensions (0-100)
- x and y are the top-left corner, width and height are the dimensions of the bounding box
- Use different colors for different sections/views: green for main views, blue for detail views, red for notes/title block, orange for additional views, purple for reference dimensions
- Extract at minimum 6-12 annotations from complex drawings
- label should be a short identifier (e.g. "R3.2 TYP.", "40.2", "M6x1.0")
- value should be the extracted numeric or text value
- Only return valid JSON, no other text.`;

/* -------------------------------------------------------------------------- */
/*  Route handler                                                              */
/* -------------------------------------------------------------------------- */

router.post("/analyze", async (req, res) => {
  // Validate request body against the OpenAPI-derived Zod schema
  const parseResult = AnalyzeDrawingBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "invalid_request",
      message: parseResult.error.message,
    });
    return;
  }

  const { imageData, includeDescription, baselineMode } = parseResult.data;

  // Ensure the image is a valid base64 data URI
  if (!imageData || !imageData.startsWith("data:")) {
    res.status(400).json({
      error: "invalid_image",
      message:
        "imageData must be a base64 data URI (e.g. data:image/png;base64,...)",
    });
    return;
  }

  // Extract the raw base64 payload and MIME type from the data URI
  const base64Data = imageData.split(",")[1];
  const mimeType = imageData.split(";")[0].split(":")[1] || "image/png";

  const systemPrompt = baselineMode
    ? BASELINE_SYSTEM_PROMPT
    : DETAILED_SYSTEM_PROMPT;

  try {
    const userMessage = includeDescription
      ? "Analyze this CAD drawing. Extract all annotations, dimensions, and measurements. Include a natural language description of the overall drawing."
      : "Analyze this CAD drawing. Extract all annotations, dimensions, and measurements.";

    const messages: Parameters<
      typeof openai.chat.completions.create
    >[0]["messages"] = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
              detail: "high",
            },
          },
          { type: "text", text: userMessage },
        ],
      },
    ];

    // Call the OpenAI vision model
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });

    const content = response.choices[0]?.message?.content ?? "{}";

    // Parse the JSON response from the model.
    // The model sometimes wraps JSON in markdown code fences, so we extract
    // the first JSON object we find in the response.
    let parsed: {
      annotations?: Annotation[];
      views?: string[];
      description?: string;
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      req.log.error({ content }, "Failed to parse AI response as JSON");
      parsed = {};
    }

    // Normalise annotations: ensure each has an ID and a fallback colour
    const annotations = (parsed.annotations ?? []).map((ann, idx) => ({
      ...ann,
      id: ann.id ?? `ann_${idx + 1}`,
      color:
        ann.boundingBox?.color ??
        ANNOTATION_COLORS[idx % ANNOTATION_COLORS.length],
    }));

    const result = {
      annotations,
      views: parsed.views ?? ["View 1"],
      ...(includeDescription && parsed.description
        ? { description: parsed.description }
        : {}),
    };

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error analyzing drawing");
    res.status(500).json({
      error: "analysis_failed",
      message: "Failed to analyze the drawing. Please try again.",
    });
  }
});

export default router;
