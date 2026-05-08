/**
 * GD&T Detection Prompts & Response Parsing
 *
 * Provides the GD&T-aware system prompt for Stage 1 annotation detection,
 * a response parser that maps raw LLM JSON into validated EnrichedAnnotation
 * objects, and a focused re-query prompt builder for the Re-Query Service.
 *
 * The system prompt embeds the expected JSON schema so the vision model
 * returns structured, typed annotations with confidence scores.
 */

import type {
  EnrichedAnnotation,
  DimensionAnnotation,
  FcfAnnotation,
  DatumAnnotation,
  SurfaceFinishAnnotation,
  NoteAnnotation,
  BoundingBox,
  GeometricCharacteristic,
} from "./compliance-engine.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ANNOTATION_TYPES = [
  "dimension",
  "fcf",
  "datum",
  "surface_finish",
  "note",
] as const;

const VALID_DIMENSION_TYPES = [
  "linear",
  "angular",
  "radius",
  "diameter",
] as const;

const VALID_GEOMETRIC_CHARACTERISTICS: GeometricCharacteristic[] = [
  "position",
  "flatness",
  "straightness",
  "circularity",
  "cylindricity",
  "perpendicularity",
  "parallelism",
  "angularity",
  "profileOfLine",
  "profileOfSurface",
  "circularRunout",
  "totalRunout",
  "symmetry",
  "concentricity",
];

const VALID_MATERIAL_CONDITIONS = ["MMC", "LMC", "RFS"] as const;

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

// ---------------------------------------------------------------------------
// GD&T System Prompt
// ---------------------------------------------------------------------------

/**
 * GD&T-aware system prompt for the OpenAI vision model.
 *
 * Instructs the model to classify each annotation into one of 5 types,
 * extract type-specific sub-fields, assign confidence scores, and return
 * bounding boxes as percentage coordinates.
 */
export const GDT_SYSTEM_PROMPT = `You are an expert GD&T (Geometric Dimensioning and Tolerancing) analyzer for engineering drawings. Carefully analyze the provided CAD drawing image and extract ALL GD&T annotations, dimensions, feature control frames, datums, surface finish symbols, and notes.

For each annotation, you MUST:
1. Classify it into exactly one type: "dimension", "fcf", "datum", "surface_finish", or "note"
2. Extract type-specific sub-fields as described below
3. Assign a confidence score between 0.0 and 1.0 based on image clarity and your certainty
4. Provide bounding box coordinates as percentages (0-100) of the image dimensions

Return a JSON object with this exact structure:
{
  "annotations": [ ... ],
  "views": ["View 1", "View 2"],
  "description": "Overall description of the drawing"
}

Each annotation MUST follow one of these type schemas:

DIMENSION annotation:
{
  "id": "ann_1",
  "type": "dimension",
  "label": "40.2 ±0.1",
  "value": "40.2",
  "view": "Front View",
  "boundingBox": { "x": 10, "y": 20, "width": 15, "height": 8, "color": "green" },
  "confidence": 0.95,
  "dimensionType": "linear",
  "nominalValue": 40.2,
  "plusTolerance": 0.1,
  "minusTolerance": -0.1,
  "unit": "mm"
}
dimensionType must be one of: "linear", "angular", "radius", "diameter"

FCF (Feature Control Frame) annotation:
{
  "id": "ann_2",
  "type": "fcf",
  "label": "Position 0.05 MMC A B C",
  "value": "0.05",
  "view": "Front View",
  "boundingBox": { "x": 30, "y": 40, "width": 20, "height": 6, "color": "blue" },
  "confidence": 0.88,
  "geometricCharacteristic": "position",
  "toleranceValue": 0.05,
  "materialCondition": "MMC",
  "datumReferences": ["A", "B", "C"]
}
geometricCharacteristic must be one of: "position", "flatness", "straightness", "circularity", "cylindricity", "perpendicularity", "parallelism", "angularity", "profileOfLine", "profileOfSurface", "circularRunout", "totalRunout", "symmetry", "concentricity"
materialCondition must be one of: "MMC", "LMC", "RFS", or null
datumReferences is an ordered array of up to 3 uppercase letters (A-Z)

DATUM annotation:
{
  "id": "ann_3",
  "type": "datum",
  "label": "Datum A",
  "value": "A",
  "view": "Front View",
  "boundingBox": { "x": 50, "y": 60, "width": 5, "height": 5, "color": "red" },
  "confidence": 0.97,
  "datumLetter": "A"
}
datumLetter must be a single uppercase letter A-Z

SURFACE_FINISH annotation:
{
  "id": "ann_4",
  "type": "surface_finish",
  "label": "Ra 1.6",
  "value": "1.6",
  "view": "Front View",
  "boundingBox": { "x": 70, "y": 30, "width": 8, "height": 8, "color": "orange" },
  "confidence": 0.82,
  "roughnessValue": 1.6,
  "processNote": "Ground"
}

NOTE annotation:
{
  "id": "ann_5",
  "type": "note",
  "label": "UNLESS OTHERWISE SPECIFIED",
  "value": "UNLESS OTHERWISE SPECIFIED, DIMENSIONS ARE IN MM",
  "view": "Title Block",
  "boundingBox": { "x": 5, "y": 90, "width": 30, "height": 5, "color": "purple" },
  "confidence": 0.90
}

Rules:
- boundingBox x, y are the top-left corner as percentages (0-100) of image dimensions
- boundingBox width, height are dimensions as percentages
- Use different colors for different annotation types: green for dimensions, blue for FCFs, red for datums, orange for surface finish, purple for notes
- Extract ALL visible annotations — aim for completeness
- Set confidence lower (< 0.6) when the symbol is partially obscured, blurry, or ambiguous
- Only return valid JSON, no other text`;

// ---------------------------------------------------------------------------
// Focused Re-Query Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Build a focused GD&T re-query prompt for a single annotation.
 *
 * Used by the Re-Query Service when re-examining a cropped bounding box
 * region. Includes the type hint from the initial detection to guide the
 * model toward the expected annotation structure.
 *
 * @param typeHint - The annotation type from the initial detection
 * @param label    - The label text from the initial detection
 * @param value    - The value text from the initial detection
 * @returns A system prompt string for the re-query vision call
 */
export function buildFocusedReQueryPrompt(
  typeHint: EnrichedAnnotation["type"],
  label: string,
  value: string,
): string {
  let typeSpecificInstructions = "";

  switch (typeHint) {
    case "dimension":
      typeSpecificInstructions = `This appears to be a DIMENSION annotation.
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
- Label: "${label}"
- Value: "${value}"

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
// Response Parsing & Validation
// ---------------------------------------------------------------------------

/**
 * Raw annotation shape as received from the LLM before validation.
 * Uses `unknown` for fields that need type checking.
 */
interface RawAnnotation {
  [key: string]: unknown;
}

/**
 * Result of parsing the LLM response.
 */
export interface ParsedGdtResponse {
  annotations: EnrichedAnnotation[];
  views: string[];
  description?: string;
}

/**
 * Clamp a numeric value to the [min, max] range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate and normalise a bounding box from raw LLM output.
 * Returns null if the bounding box is invalid.
 */
function validateBoundingBox(
  raw: unknown,
  fallbackColor: string,
): BoundingBox | null {
  if (typeof raw !== "object" || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  const x = typeof obj.x === "number" && !Number.isNaN(obj.x) ? obj.x : NaN;
  const y = typeof obj.y === "number" && !Number.isNaN(obj.y) ? obj.y : NaN;
  const width =
    typeof obj.width === "number" && !Number.isNaN(obj.width) ? obj.width : NaN;
  const height =
    typeof obj.height === "number" && !Number.isNaN(obj.height)
      ? obj.height
      : NaN;

  if ([x, y, width, height].some(Number.isNaN)) return null;
  if (width <= 0 || height <= 0) return null;

  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
    width: clamp(width, 0.1, 100),
    height: clamp(height, 0.1, 100),
    color: typeof obj.color === "string" ? obj.color : fallbackColor,
  };
}

/**
 * Validate a confidence score. Returns a clamped value in [0, 1] or a
 * default of 0.5 if the input is not a valid number.
 */
function validateConfidence(raw: unknown): number {
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    return clamp(raw, 0, 1);
  }
  return 0.5;
}

/**
 * Attempt to parse a single raw annotation object into a validated
 * EnrichedAnnotation. Returns null if the annotation is invalid and
 * cannot be salvaged.
 */
export function parseAnnotation(
  raw: RawAnnotation,
  index: number,
): EnrichedAnnotation | null {
  if (typeof raw !== "object" || raw === null) return null;

  // --- Common fields ---
  const type = raw.type;
  if (
    typeof type !== "string" ||
    !(VALID_ANNOTATION_TYPES as readonly string[]).includes(type)
  ) {
    return null;
  }

  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `ann_${index + 1}`;

  const label = typeof raw.label === "string" ? raw.label : "";
  const value = typeof raw.value === "string" ? raw.value : "";
  const view = typeof raw.view === "string" ? raw.view : "View 1";
  const description =
    typeof raw.description === "string" ? raw.description : undefined;
  const confidence = validateConfidence(raw.confidence);
  const needsReview =
    typeof raw.needsReview === "boolean" ? raw.needsReview : false;

  const fallbackColor = ANNOTATION_COLORS[index % ANNOTATION_COLORS.length];
  const boundingBox = validateBoundingBox(raw.boundingBox, fallbackColor);
  if (!boundingBox) return null;

  const base = {
    id,
    label,
    value,
    view,
    boundingBox,
    confidence,
    needsReview,
    ...(description !== undefined ? { description } : {}),
  };

  // --- Type-specific validation ---
  switch (type) {
    case "dimension":
      return parseDimension(raw, base);
    case "fcf":
      return parseFcf(raw, base);
    case "datum":
      return parseDatum(raw, base);
    case "surface_finish":
      return parseSurfaceFinish(raw, base);
    case "note":
      return { ...base, type: "note" } as NoteAnnotation;
    default:
      return null;
  }
}

/**
 * Parse a dimension annotation from raw LLM output.
 */
function parseDimension(
  raw: RawAnnotation,
  base: Omit<EnrichedAnnotation, "type">,
): DimensionAnnotation | null {
  const dimensionType = raw.dimensionType;
  if (
    typeof dimensionType !== "string" ||
    !(VALID_DIMENSION_TYPES as readonly string[]).includes(dimensionType)
  ) {
    return null;
  }

  const nominalValue =
    typeof raw.nominalValue === "number" && !Number.isNaN(raw.nominalValue)
      ? raw.nominalValue
      : NaN;
  if (Number.isNaN(nominalValue)) return null;

  const plusTolerance =
    typeof raw.plusTolerance === "number" && !Number.isNaN(raw.plusTolerance)
      ? raw.plusTolerance
      : undefined;
  const minusTolerance =
    typeof raw.minusTolerance === "number" && !Number.isNaN(raw.minusTolerance)
      ? raw.minusTolerance
      : undefined;
  const unit = typeof raw.unit === "string" ? raw.unit : undefined;

  return {
    ...base,
    type: "dimension",
    dimensionType: dimensionType as DimensionAnnotation["dimensionType"],
    nominalValue,
    ...(plusTolerance !== undefined ? { plusTolerance } : {}),
    ...(minusTolerance !== undefined ? { minusTolerance } : {}),
    ...(unit !== undefined ? { unit } : {}),
  } as DimensionAnnotation;
}

/**
 * Parse an FCF annotation from raw LLM output.
 */
function parseFcf(
  raw: RawAnnotation,
  base: Omit<EnrichedAnnotation, "type">,
): FcfAnnotation | null {
  const gc = raw.geometricCharacteristic;
  if (
    typeof gc !== "string" ||
    !(VALID_GEOMETRIC_CHARACTERISTICS as readonly string[]).includes(gc)
  ) {
    return null;
  }

  const toleranceValue =
    typeof raw.toleranceValue === "number" && !Number.isNaN(raw.toleranceValue)
      ? raw.toleranceValue
      : NaN;
  if (Number.isNaN(toleranceValue)) return null;

  let materialCondition: FcfAnnotation["materialCondition"] = null;
  if (
    typeof raw.materialCondition === "string" &&
    (VALID_MATERIAL_CONDITIONS as readonly string[]).includes(
      raw.materialCondition,
    )
  ) {
    materialCondition =
      raw.materialCondition as FcfAnnotation["materialCondition"];
  }

  let datumReferences: string[] = [];
  if (Array.isArray(raw.datumReferences)) {
    datumReferences = raw.datumReferences
      .filter(
        (ref: unknown): ref is string =>
          typeof ref === "string" && /^[A-Z]$/.test(ref),
      )
      .slice(0, 3);
  }

  return {
    ...base,
    type: "fcf",
    geometricCharacteristic: gc as GeometricCharacteristic,
    toleranceValue,
    materialCondition,
    datumReferences,
  } as FcfAnnotation;
}

/**
 * Parse a datum annotation from raw LLM output.
 */
function parseDatum(
  raw: RawAnnotation,
  base: Omit<EnrichedAnnotation, "type">,
): DatumAnnotation | null {
  const datumLetter = raw.datumLetter;
  if (typeof datumLetter !== "string" || !/^[A-Z]$/.test(datumLetter)) {
    return null;
  }

  return {
    ...base,
    type: "datum",
    datumLetter,
  } as DatumAnnotation;
}

/**
 * Parse a surface finish annotation from raw LLM output.
 */
function parseSurfaceFinish(
  raw: RawAnnotation,
  base: Omit<EnrichedAnnotation, "type">,
): SurfaceFinishAnnotation | null {
  const roughnessValue =
    typeof raw.roughnessValue === "number" && !Number.isNaN(raw.roughnessValue)
      ? raw.roughnessValue
      : NaN;
  if (Number.isNaN(roughnessValue)) return null;

  const processNote =
    typeof raw.processNote === "string" ? raw.processNote : undefined;

  return {
    ...base,
    type: "surface_finish",
    roughnessValue,
    ...(processNote !== undefined ? { processNote } : {}),
  } as SurfaceFinishAnnotation;
}

/**
 * Parse the full LLM JSON response into validated EnrichedAnnotation objects.
 *
 * Handles common LLM response quirks:
 * - JSON wrapped in markdown code fences
 * - Missing or malformed annotations (silently dropped)
 * - Missing views array (defaults to ["View 1"])
 *
 * @param content - Raw string content from the LLM response
 * @returns Parsed and validated response with annotations, views, and optional description
 */
export function parseGdtResponse(content: string): ParsedGdtResponse {
  let parsed: Record<string, unknown>;

  try {
    // The model sometimes wraps JSON in markdown code fences
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return { annotations: [], views: ["View 1"] };
  }

  // Parse annotations array
  const rawAnnotations = Array.isArray(parsed.annotations)
    ? (parsed.annotations as RawAnnotation[])
    : [];

  const annotations: EnrichedAnnotation[] = [];
  for (let i = 0; i < rawAnnotations.length; i++) {
    const ann = parseAnnotation(rawAnnotations[i], i);
    if (ann !== null) {
      annotations.push(ann);
    }
  }

  // Parse views
  const views = Array.isArray(parsed.views)
    ? (parsed.views as unknown[])
        .filter((v): v is string => typeof v === "string")
        .filter((v) => v.length > 0)
    : ["View 1"];

  // Parse optional description
  const description =
    typeof parsed.description === "string" ? parsed.description : undefined;

  return {
    annotations,
    views: views.length > 0 ? views : ["View 1"],
    ...(description !== undefined ? { description } : {}),
  };
}
