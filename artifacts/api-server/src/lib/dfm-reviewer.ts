/**
 * DFM Reviewer
 *
 * Generates Design for Manufacturability (DFM) feedback by combining
 * deterministic pre-checks with an LLM-powered analysis. The module:
 *
 * 1. Runs a deterministic datum scheme completeness check (< 3 unique datums → warning)
 * 2. Sends structured annotation data (no image) to a text-only OpenAI model
 * 3. Parses and validates the LLM response into DfmFinding objects
 *
 * Exports:
 * - `reviewDfm(annotations)` — main entry point
 * - `checkDatumSchemeCompleteness(annotations)` — deterministic pre-check (exported for testing)
 * - `buildDfmPrompt(annotations)` — prompt construction (exported for testing)
 * - `parseDfmResponse(content)` — response parsing (exported for testing)
 */

import { openai } from "@workspace/integrations-openai-ai-server";
import type { EnrichedAnnotation } from "./compliance-engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DfmCategory =
  | "over_tolerancing"
  | "missing_tolerance"
  | "datum_scheme_completeness"
  | "surface_finish_consistency"
  | "general";

export type DfmSeverity = "error" | "warning" | "info";

export interface DfmFinding {
  id: string;
  category: DfmCategory;
  severity: DfmSeverity;
  description: string;
  recommendation: string;
  relatedAnnotationIds?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: ReadonlySet<string> = new Set<DfmCategory>([
  "over_tolerancing",
  "missing_tolerance",
  "datum_scheme_completeness",
  "surface_finish_consistency",
  "general",
]);

const VALID_SEVERITIES: ReadonlySet<string> = new Set<DfmSeverity>([
  "error",
  "warning",
  "info",
]);

/** OpenAI model for DFM text-only analysis (cost-efficient). */
const DFM_MODEL = process.env.DFM_MODEL || "gpt-4o-mini";

/** Maximum tokens for DFM responses. */
const MAX_COMPLETION_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Deterministic Pre-Check: Datum Scheme Completeness
// ---------------------------------------------------------------------------

/**
 * Check whether the annotation set has fewer than 3 unique datum letters.
 *
 * Per ASME Y14.5-2018, a fully constrained part typically requires at least
 * 3 datums (primary, secondary, tertiary). Fewer than 3 unique datums
 * produces a warning-level DFM finding.
 *
 * This is a deterministic check that runs BEFORE the LLM call, ensuring
 * the finding always appears regardless of LLM output.
 *
 * @param annotations - Array of enriched annotations
 * @returns A DfmFinding if fewer than 3 unique datums, otherwise null
 */
export function checkDatumSchemeCompleteness(
  annotations: EnrichedAnnotation[],
): DfmFinding | null {
  const uniqueDatums = new Set<string>();

  for (const ann of annotations) {
    if (ann.type === "datum") {
      uniqueDatums.add(ann.datumLetter);
    }
  }

  if (uniqueDatums.size < 3) {
    const datumLetters = Array.from(uniqueDatums).sort();
    const datumAnnotationIds = annotations
      .filter((a) => a.type === "datum")
      .map((a) => a.id);

    return {
      id: "dfm_datum_scheme_completeness",
      category: "datum_scheme_completeness",
      severity: "warning",
      description:
        uniqueDatums.size === 0
          ? "No datums detected. A fully constrained part typically requires at least 3 datums (primary, secondary, tertiary)."
          : `Only ${uniqueDatums.size} unique datum(s) detected (${datumLetters.join(", ")}). A fully constrained part typically requires at least 3 datums (primary, secondary, tertiary).`,
      recommendation:
        "Review the drawing and add datum references to establish a complete datum reference frame with primary, secondary, and tertiary datums.",
      ...(datumAnnotationIds.length > 0
        ? { relatedAnnotationIds: datumAnnotationIds }
        : {}),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// LLM Prompt Construction
// ---------------------------------------------------------------------------

/**
 * Build a text-only prompt for DFM analysis.
 *
 * Sends structured annotation data (no image) to the LLM, asking it to
 * evaluate over-tolerancing, missing tolerances, datum scheme completeness,
 * and surface finish consistency.
 *
 * @param annotations - Array of enriched annotations
 * @returns The system prompt string
 */
export function buildDfmPrompt(annotations: EnrichedAnnotation[]): string {
  // Summarise annotations by type for the LLM
  const summary = annotations.map((ann) => {
    const base = {
      id: ann.id,
      type: ann.type,
      label: ann.label,
      value: ann.value,
      confidence: ann.confidence,
    };

    switch (ann.type) {
      case "dimension":
        return {
          ...base,
          dimensionType: ann.dimensionType,
          nominalValue: ann.nominalValue,
          plusTolerance: ann.plusTolerance,
          minusTolerance: ann.minusTolerance,
          unit: ann.unit,
        };
      case "fcf":
        return {
          ...base,
          geometricCharacteristic: ann.geometricCharacteristic,
          toleranceValue: ann.toleranceValue,
          materialCondition: ann.materialCondition,
          datumReferences: ann.datumReferences,
        };
      case "datum":
        return { ...base, datumLetter: ann.datumLetter };
      case "surface_finish":
        return {
          ...base,
          roughnessValue: ann.roughnessValue,
          processNote: ann.processNote,
        };
      case "note":
        return base;
    }
  });

  const annotationJson = JSON.stringify(summary, null, 2);

  return `You are an expert manufacturing engineer reviewing GD&T (Geometric Dimensioning and Tolerancing) annotations extracted from an engineering drawing. Analyze the following annotations for Design for Manufacturability (DFM) concerns.

Annotations:
${annotationJson}

Evaluate the annotations for the following DFM categories:

1. **over_tolerancing**: Identify cases where multiple tight tolerances are specified that would significantly increase manufacturing cost. Look for unnecessarily tight geometric tolerances, redundant tolerance specifications, or tolerance values that are tighter than typical manufacturing capabilities.

2. **missing_tolerance**: Identify critical features that appear to lack dimensional control. Look for dimensions without tolerances, features that should have geometric tolerances but don't, or incomplete tolerance specifications.

3. **datum_scheme_completeness**: Evaluate whether the datum reference frame is complete and well-defined. Check if datums are properly ordered (primary, secondary, tertiary) and if the datum scheme adequately constrains the part.

4. **surface_finish_consistency**: Check if surface finish values are consistent with the specified tolerances. Tight tolerances typically require finer surface finishes. Flag inconsistencies where rough surface finishes are paired with tight tolerances.

For each finding, return a JSON object in this exact format:
{
  "findings": [
    {
      "id": "dfm_1",
      "category": "over_tolerancing",
      "severity": "warning",
      "description": "Clear description of the issue",
      "recommendation": "Specific corrective action",
      "relatedAnnotationIds": ["ann_1", "ann_2"]
    }
  ]
}

Rules:
- category MUST be one of: "over_tolerancing", "missing_tolerance", "datum_scheme_completeness", "surface_finish_consistency", "general"
- severity MUST be one of: "error", "warning", "info"
- Each finding MUST have a non-empty description and recommendation
- relatedAnnotationIds should reference actual annotation IDs from the input
- Only return valid JSON, no other text
- Be specific and actionable in your recommendations
- If no issues are found for a category, do not include empty findings`;
}

// ---------------------------------------------------------------------------
// Response Parsing & Validation
// ---------------------------------------------------------------------------

/**
 * Validate and parse a single raw finding object into a DfmFinding.
 * Returns null if the finding is invalid.
 *
 * @param raw - Raw finding object from LLM response
 * @param index - Index for fallback ID generation
 * @param validAnnotationIds - Set of valid annotation IDs for reference validation
 * @returns A validated DfmFinding or null
 */
export function parseSingleFinding(
  raw: Record<string, unknown>,
  index: number,
  validAnnotationIds: ReadonlySet<string>,
): DfmFinding | null {
  if (typeof raw !== "object" || raw === null) return null;

  // Validate category
  const category = raw.category;
  if (typeof category !== "string" || !VALID_CATEGORIES.has(category)) {
    return null;
  }

  // Validate severity
  const severity = raw.severity;
  if (typeof severity !== "string" || !VALID_SEVERITIES.has(severity)) {
    return null;
  }

  // Validate description
  const description = raw.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    return null;
  }

  // Validate recommendation
  const recommendation = raw.recommendation;
  if (
    typeof recommendation !== "string" ||
    recommendation.trim().length === 0
  ) {
    return null;
  }

  // Validate id (use fallback if missing)
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `dfm_${index + 1}`;

  // Validate relatedAnnotationIds — filter to only valid annotation IDs
  let relatedAnnotationIds: string[] | undefined;
  if (Array.isArray(raw.relatedAnnotationIds)) {
    const filtered = raw.relatedAnnotationIds.filter(
      (ref: unknown): ref is string =>
        typeof ref === "string" && validAnnotationIds.has(ref),
    );
    if (filtered.length > 0) {
      relatedAnnotationIds = filtered;
    }
  }

  return {
    id,
    category: category as DfmCategory,
    severity: severity as DfmSeverity,
    description: description.trim(),
    recommendation: recommendation.trim(),
    ...(relatedAnnotationIds ? { relatedAnnotationIds } : {}),
  };
}

/**
 * Parse the LLM response content into validated DfmFinding objects.
 *
 * Handles common LLM response quirks:
 * - JSON wrapped in markdown code fences
 * - Missing or malformed findings (silently dropped)
 *
 * @param content - Raw string content from the LLM response
 * @param validAnnotationIds - Set of valid annotation IDs for reference validation
 * @returns Array of validated DfmFinding objects
 */
export function parseDfmResponse(
  content: string,
  validAnnotationIds: ReadonlySet<string>,
): DfmFinding[] {
  let parsed: Record<string, unknown>;

  try {
    // The model sometimes wraps JSON in markdown code fences
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return [];
  }

  const rawFindings = Array.isArray(parsed.findings)
    ? (parsed.findings as Record<string, unknown>[])
    : [];

  const findings: DfmFinding[] = [];
  for (let i = 0; i < rawFindings.length; i++) {
    const finding = parseSingleFinding(rawFindings[i], i, validAnnotationIds);
    if (finding !== null) {
      findings.push(finding);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Generate DFM (Design for Manufacturability) findings for a set of annotations.
 *
 * 1. Runs a deterministic datum scheme completeness pre-check
 * 2. Sends structured annotation data to a text-only OpenAI model
 * 3. Parses and validates the LLM response
 * 4. Merges deterministic and LLM findings, deduplicating datum_scheme_completeness
 *
 * @param annotations - Array of enriched annotations from the compliance engine
 * @returns Array of DFM findings
 */
export async function reviewDfm(
  annotations: EnrichedAnnotation[],
): Promise<DfmFinding[]> {
  const findings: DfmFinding[] = [];

  // Step 1: Deterministic pre-check for datum scheme completeness
  const datumFinding = checkDatumSchemeCompleteness(annotations);
  if (datumFinding) {
    findings.push(datumFinding);
  }

  // Step 2: Build prompt and call LLM
  const prompt = buildDfmPrompt(annotations);
  const annotationJson = JSON.stringify(
    annotations.map((a) => ({ id: a.id, type: a.type, label: a.label })),
  );

  try {
    const response = await openai.chat.completions.create({
      model: DFM_MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Please analyze these GD&T annotations for DFM concerns:\n${annotationJson}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";

    // Step 3: Parse and validate LLM response
    const validAnnotationIds = new Set(annotations.map((a) => a.id));
    const llmFindings = parseDfmResponse(content, validAnnotationIds);

    // Step 4: Merge findings, skipping LLM datum_scheme_completeness if we already have one
    for (const llmFinding of llmFindings) {
      if (
        llmFinding.category === "datum_scheme_completeness" &&
        datumFinding !== null
      ) {
        // Skip LLM's datum scheme finding — the deterministic one takes precedence
        continue;
      }
      findings.push(llmFinding);
    }
  } catch {
    // LLM call failed — return only deterministic findings
    // The pipeline orchestrator will handle the error at a higher level
  }

  return findings;
}
