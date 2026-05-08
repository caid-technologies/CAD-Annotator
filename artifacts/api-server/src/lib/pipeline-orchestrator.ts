/**
 * GD&T Pipeline Orchestrator
 *
 * Coordinates the sequential execution of the three-stage GD&T analysis
 * pipeline:
 *
 *   Stage 1: Annotation Detection (OpenAI vision → EnrichedAnnotation[])
 *   Re-Query: Low-confidence annotations re-examined with focused prompts
 *   Stage 2: Compliance Validation (deterministic ASME Y14.5-2018 rules)
 *   Stage 3: DFM Review (text-only LLM manufacturability feedback)
 *
 * After all stages complete, the orchestrator persists the full session
 * (annotations, compliance issues, DFM findings) to the database and
 * returns a unified GdtAnalyzeResult.
 *
 * Error handling: Stages 2–3 are individually wrapped in try/catch. If a
 * stage fails, the error is collected in a StageError[] array and the
 * pipeline continues with available results.
 */

import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import {
  analysisSessions,
  gdtAnnotations,
  complianceIssues as complianceIssuesTable,
  dfmFindings as dfmFindingsTable,
} from "@workspace/db";
import type { AnalyzeDrawingBody as AnalyzeDrawingBodyType } from "@workspace/api-zod";
import type { z } from "zod/v4";

import { GDT_SYSTEM_PROMPT, parseGdtResponse } from "./gdt-prompts.js";
import { reQueryLowConfidence } from "./requery-service.js";
import {
  validateCompliance,
  type EnrichedAnnotation,
  type ComplianceIssue,
} from "./compliance-engine.js";
import { reviewDfm, type DfmFinding } from "./dfm-reviewer.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StageError {
  stage: "detection" | "requery" | "compliance" | "dfm";
  message: string;
}

export interface GdtAnalyzeResult {
  sessionId: string;
  annotations: EnrichedAnnotation[];
  complianceIssues: ComplianceIssue[];
  dfmFindings: DfmFinding[];
  views: string[];
  description?: string;
  errors?: StageError[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OpenAI model for Stage 1 vision detection. */
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

/** Maximum tokens for Stage 1 detection responses. */
const MAX_COMPLETION_TOKENS = 8192;

// ---------------------------------------------------------------------------
// Type-specific data extraction for DB persistence
// ---------------------------------------------------------------------------

/**
 * Extract type-specific fields from an EnrichedAnnotation for storage
 * in the `typeData` JSONB column.
 */
function extractTypeData(
  annotation: EnrichedAnnotation,
): Record<string, unknown> {
  switch (annotation.type) {
    case "dimension":
      return {
        dimensionType: annotation.dimensionType,
        nominalValue: annotation.nominalValue,
        ...(annotation.plusTolerance !== undefined
          ? { plusTolerance: annotation.plusTolerance }
          : {}),
        ...(annotation.minusTolerance !== undefined
          ? { minusTolerance: annotation.minusTolerance }
          : {}),
        ...(annotation.unit !== undefined ? { unit: annotation.unit } : {}),
      };
    case "fcf":
      return {
        geometricCharacteristic: annotation.geometricCharacteristic,
        toleranceValue: annotation.toleranceValue,
        materialCondition: annotation.materialCondition,
        datumReferences: annotation.datumReferences,
      };
    case "datum":
      return {
        datumLetter: annotation.datumLetter,
      };
    case "surface_finish":
      return {
        roughnessValue: annotation.roughnessValue,
        ...(annotation.processNote !== undefined
          ? { processNote: annotation.processNote }
          : {}),
      };
    case "note":
      return {};
  }
}

// ---------------------------------------------------------------------------
// Session Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a complete analysis session to the database.
 *
 * Creates the session record and inserts all annotations, compliance issues,
 * and DFM findings in a single logical operation.
 *
 * @returns The generated session ID
 */
export async function persistSession(params: {
  annotations: EnrichedAnnotation[];
  complianceIssues: ComplianceIssue[];
  dfmFindings: DfmFinding[];
  views: string[];
  description?: string;
  imageReference: string;
  errors: StageError[];
}): Promise<string> {
  const {
    annotations,
    complianceIssues,
    dfmFindings,
    views,
    description,
    imageReference,
    errors,
  } = params;

  // Determine session status based on errors
  let status: "completed" | "partial" | "failed";
  if (errors.some((e) => e.stage === "detection")) {
    status = "failed";
  } else if (errors.length > 0) {
    status = "partial";
  } else {
    status = "completed";
  }

  // Insert the session record
  const [session] = await db
    .insert(analysisSessions)
    .values({
      imageReference,
      status,
      description,
      views,
      stageErrors: errors,
    })
    .returning({ id: analysisSessions.id });

  const sessionId = session.id;

  // Insert annotations
  if (annotations.length > 0) {
    await db.insert(gdtAnnotations).values(
      annotations.map((ann) => ({
        id: ann.id,
        sessionId,
        type: ann.type,
        label: ann.label,
        value: ann.value,
        view: ann.view,
        boundingBox: ann.boundingBox,
        confidence: ann.confidence,
        needsReview: ann.needsReview ?? false,
        description: ann.description,
        typeData: extractTypeData(ann),
      })),
    );
  }

  // Insert compliance issues
  if (complianceIssues.length > 0) {
    await db.insert(complianceIssuesTable).values(
      complianceIssues.map((issue) => ({
        sessionId,
        annotationId: issue.annotationId,
        ruleId: issue.ruleId,
        severity: issue.severity,
        description: issue.description,
      })),
    );
  }

  // Insert DFM findings
  if (dfmFindings.length > 0) {
    await db.insert(dfmFindingsTable).values(
      dfmFindings.map((finding) => ({
        id: finding.id,
        sessionId,
        category: finding.category,
        severity: finding.severity,
        description: finding.description,
        recommendation: finding.recommendation,
        relatedAnnotationIds: finding.relatedAnnotationIds ?? [],
      })),
    );
  }

  return sessionId;
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full GD&T analysis pipeline.
 *
 * 1. Stage 1 — Annotation Detection (OpenAI vision)
 * 2. Re-Query — Low-confidence annotations re-examined
 * 3. Stage 2 — Compliance Validation (deterministic)
 * 4. Stage 3 — DFM Review (text-only LLM)
 * 5. Persist session to database
 * 6. Return unified GdtAnalyzeResult
 *
 * If Stage 1 fails, the pipeline throws (no partial results possible).
 * If Stages 2–3 fail, errors are collected and partial results returned.
 *
 * @param imageData - Base64 data URI of the CAD drawing
 * @param options   - Request body options (imageData, includeDescription, baselineMode)
 * @returns Unified analysis result with sessionId
 */
export async function runGdtPipeline(
  imageData: string,
  options: z.infer<typeof AnalyzeDrawingBodyType>,
): Promise<GdtAnalyzeResult> {
  const errors: StageError[] = [];
  let annotations: EnrichedAnnotation[] = [];
  let complianceIssues: ComplianceIssue[] = [];
  let dfmFindings: DfmFinding[] = [];
  let views: string[] = ["View 1"];
  let description: string | undefined;

  // -----------------------------------------------------------------------
  // Stage 1: Annotation Detection
  // -----------------------------------------------------------------------
  const base64Data = imageData.split(",")[1] ?? imageData;
  const mimeType = imageData.split(";")[0]?.split(":")[1] ?? "image/png";

  const userMessage = options.includeDescription
    ? "Analyze this CAD drawing with full GD&T analysis. Extract all annotations, dimensions, feature control frames, datums, surface finish symbols, and notes. Include a natural language description."
    : "Analyze this CAD drawing with full GD&T analysis. Extract all annotations, dimensions, feature control frames, datums, surface finish symbols, and notes.";

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: [
        { role: "system", content: GDT_SYSTEM_PROMPT },
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
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = parseGdtResponse(content);

    annotations = parsed.annotations;
    views = parsed.views;
    description = parsed.description;
  } catch (err) {
    // Stage 1 failure is fatal — we cannot proceed without annotations
    logger.error({ err }, "Stage 1 (detection) failed");
    errors.push({
      stage: "detection",
      message: err instanceof Error ? err.message : "Detection stage failed",
    });

    // Persist the failed session and return
    const sessionId = await persistSession({
      annotations: [],
      complianceIssues: [],
      dfmFindings: [],
      views,
      description,
      imageReference: imageData.substring(0, 100),
      errors,
    });

    return {
      sessionId,
      annotations: [],
      complianceIssues: [],
      dfmFindings: [],
      views,
      description,
      errors,
    };
  }

  // -----------------------------------------------------------------------
  // Re-Query: Low-confidence annotations
  // -----------------------------------------------------------------------
  try {
    const reQueryResults = await reQueryLowConfidence(annotations, imageData);
    annotations = reQueryResults.map((r) => r.annotation);
  } catch (err) {
    logger.error({ err }, "Re-query stage failed");
    errors.push({
      stage: "requery",
      message: err instanceof Error ? err.message : "Re-query stage failed",
    });
    // Continue with original annotations
  }

  // -----------------------------------------------------------------------
  // Stage 2: Compliance Validation
  // -----------------------------------------------------------------------
  try {
    complianceIssues = validateCompliance(annotations);
  } catch (err) {
    logger.error({ err }, "Stage 2 (compliance) failed");
    errors.push({
      stage: "compliance",
      message: err instanceof Error ? err.message : "Compliance stage failed",
    });
    // Continue with empty compliance issues
  }

  // -----------------------------------------------------------------------
  // Stage 3: DFM Review
  // -----------------------------------------------------------------------
  try {
    dfmFindings = await reviewDfm(annotations);
  } catch (err) {
    logger.error({ err }, "Stage 3 (DFM) failed");
    errors.push({
      stage: "dfm",
      message: err instanceof Error ? err.message : "DFM stage failed",
    });
    // Continue with empty DFM findings
  }

  // -----------------------------------------------------------------------
  // Persist session to database
  // -----------------------------------------------------------------------
  const sessionId = await persistSession({
    annotations,
    complianceIssues,
    dfmFindings,
    views,
    description,
    imageReference: imageData.substring(0, 100),
    errors,
  });

  // -----------------------------------------------------------------------
  // Return unified result
  // -----------------------------------------------------------------------
  const result: GdtAnalyzeResult = {
    sessionId,
    annotations,
    complianceIssues,
    dfmFindings,
    views,
  };

  if (description !== undefined) {
    result.description = description;
  }

  if (errors.length > 0) {
    result.errors = errors;
  }

  return result;
}
