/**
 * GD&T Compliance Engine
 *
 * A pure, deterministic TypeScript module that validates enriched GD&T annotations
 * against ASME Y14.5-2018 rules. No external dependencies or LLM calls.
 *
 * Exports a single entry point: `validateCompliance(annotations) → ComplianceIssue[]`
 */

// ---------------------------------------------------------------------------
// Type definitions (local interfaces matching the OpenAPI schema)
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface AnnotationBase {
  id: string;
  label: string;
  value: string;
  view: string;
  boundingBox: BoundingBox;
  description?: string;
  confidence: number;
  needsReview?: boolean;
}

export interface DimensionAnnotation extends AnnotationBase {
  type: "dimension";
  dimensionType: "linear" | "angular" | "radius" | "diameter";
  nominalValue: number;
  plusTolerance?: number;
  minusTolerance?: number;
  unit?: string;
}

export type GeometricCharacteristic =
  | "position"
  | "flatness"
  | "straightness"
  | "circularity"
  | "cylindricity"
  | "perpendicularity"
  | "parallelism"
  | "angularity"
  | "profileOfLine"
  | "profileOfSurface"
  | "circularRunout"
  | "totalRunout"
  | "symmetry"
  | "concentricity";

export interface FcfAnnotation extends AnnotationBase {
  type: "fcf";
  geometricCharacteristic: GeometricCharacteristic;
  toleranceValue: number;
  materialCondition: "MMC" | "LMC" | "RFS" | null;
  datumReferences: string[];
}

export interface DatumAnnotation extends AnnotationBase {
  type: "datum";
  datumLetter: string;
}

export interface SurfaceFinishAnnotation extends AnnotationBase {
  type: "surface_finish";
  roughnessValue: number;
  processNote?: string;
}

export interface NoteAnnotation extends AnnotationBase {
  type: "note";
}

export type EnrichedAnnotation =
  | DimensionAnnotation
  | FcfAnnotation
  | DatumAnnotation
  | SurfaceFinishAnnotation
  | NoteAnnotation;

export interface ComplianceIssue {
  annotationId: string;
  ruleId: string;
  severity: "error" | "warning";
  description: string;
}

// ---------------------------------------------------------------------------
// ASME Y14.5-2018 Lookup Tables
// ---------------------------------------------------------------------------

/**
 * Valid datum reference count ranges per geometric characteristic.
 * Each entry is [min, max] inclusive.
 */
export const DATUM_COUNT_RANGE: Record<
  GeometricCharacteristic,
  [number, number]
> = {
  position: [2, 3],
  flatness: [0, 0],
  straightness: [0, 0],
  circularity: [0, 0],
  cylindricity: [0, 0],
  perpendicularity: [1, 2],
  parallelism: [1, 2],
  angularity: [1, 2],
  profileOfLine: [0, 3],
  profileOfSurface: [0, 3],
  circularRunout: [1, 2],
  totalRunout: [1, 2],
  symmetry: [3, 3],
  concentricity: [1, 1],
};

/**
 * Geometric characteristics that permit MMC / LMC material condition modifiers.
 */
export const MMC_LMC_PERMITTED: ReadonlySet<GeometricCharacteristic> = new Set([
  "position",
  "concentricity",
  "symmetry",
]);

// ---------------------------------------------------------------------------
// Individual Rule Implementations
// ---------------------------------------------------------------------------

/**
 * FCF_DATUM_COUNT – validate datum reference count per geometric characteristic.
 */
export function checkFcfDatumCount(
  annotations: EnrichedAnnotation[],
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const ann of annotations) {
    if (ann.type !== "fcf") continue;

    const [min, max] = DATUM_COUNT_RANGE[ann.geometricCharacteristic];
    const count = ann.datumReferences.length;

    if (count < min || count > max) {
      issues.push({
        annotationId: ann.id,
        ruleId: "FCF_DATUM_COUNT",
        severity: "error",
        description: `${ann.geometricCharacteristic} requires ${min === max ? String(min) : `${min}–${max}`} datum reference(s), but ${count} provided.`,
      });
    }
  }

  return issues;
}

/**
 * DATUM_REF_EXISTS – verify all referenced datums exist in the annotation set.
 */
export function checkDatumRefExists(
  annotations: EnrichedAnnotation[],
): ComplianceIssue[] {
  // Collect all declared datum letters
  const declaredDatums = new Set<string>();
  for (const ann of annotations) {
    if (ann.type === "datum") {
      declaredDatums.add(ann.datumLetter);
    }
  }

  const issues: ComplianceIssue[] = [];

  for (const ann of annotations) {
    if (ann.type !== "fcf") continue;

    for (const ref of ann.datumReferences) {
      if (!declaredDatums.has(ref)) {
        issues.push({
          annotationId: ann.id,
          ruleId: "DATUM_REF_EXISTS",
          severity: "error",
          description: `FCF references datum "${ref}" which is not declared in the annotation set.`,
        });
      }
    }
  }

  return issues;
}

/**
 * MMC_LMC_APPLICABILITY – validate material condition modifier is permitted
 * for the geometric characteristic.
 */
export function checkMmcLmcApplicability(
  annotations: EnrichedAnnotation[],
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const ann of annotations) {
    if (ann.type !== "fcf") continue;
    if (ann.materialCondition === null || ann.materialCondition === "RFS")
      continue;

    if (!MMC_LMC_PERMITTED.has(ann.geometricCharacteristic)) {
      issues.push({
        annotationId: ann.id,
        ruleId: "MMC_LMC_APPLICABILITY",
        severity: "error",
        description: `${ann.materialCondition} is not permitted for ${ann.geometricCharacteristic} per ASME Y14.5-2018.`,
      });
    }
  }

  return issues;
}

/**
 * TOLERANCE_POSITIVE – flag FCFs with zero or negative tolerance values.
 */
export function checkTolerancePositive(
  annotations: EnrichedAnnotation[],
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const ann of annotations) {
    if (ann.type !== "fcf") continue;

    if (ann.toleranceValue <= 0) {
      issues.push({
        annotationId: ann.id,
        ruleId: "TOLERANCE_POSITIVE",
        severity: "error",
        description: `Tolerance value must be positive, but got ${ann.toleranceValue}.`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Validate an array of enriched annotations against all ASME Y14.5-2018 rules.
 * Returns the concatenated list of compliance issues from every rule.
 */
export function validateCompliance(
  annotations: EnrichedAnnotation[],
): ComplianceIssue[] {
  return [
    ...checkFcfDatumCount(annotations),
    ...checkDatumRefExists(annotations),
    ...checkMmcLmcApplicability(annotations),
    ...checkTolerancePositive(annotations),
  ];
}
