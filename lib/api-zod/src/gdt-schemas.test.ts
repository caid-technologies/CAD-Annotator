/**
 * Property-based tests for GD&T enriched annotation schemas.
 *
 * Tests JSON round-trip serialization and Zod schema validation/rejection
 * for all annotation type variants, ComplianceIssue, and DfmFinding.
 *
 * Uses fast-check for property-based testing and the Orval-generated
 * Zod schemas from the OpenAPI spec.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  AnalyzeDrawingGdtResponse,
  UpdateAnnotationBody,
} from "./generated/api";

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

const boundingBoxArb = fc.record({
  x: fc.double({ min: 0, max: 100, noNaN: true }),
  y: fc.double({ min: 0, max: 100, noNaN: true }),
  width: fc.double({ min: 0.1, max: 100, noNaN: true }),
  height: fc.double({ min: 0.1, max: 100, noNaN: true }),
  color: fc.constantFrom("red", "green", "blue", "yellow", "orange"),
});

const annotationBaseArb = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.string({ minLength: 1, maxLength: 100 }),
  view: fc.string({ minLength: 1, maxLength: 30 }),
  boundingBox: boundingBoxArb,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  needsReview: fc.boolean(),
});

const annotationBaseWithDescArb = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.string({ minLength: 1, maxLength: 100 }),
  view: fc.string({ minLength: 1, maxLength: 30 }),
  boundingBox: boundingBoxArb,
  description: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
    nil: undefined,
  }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  needsReview: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Annotation type arbitraries
// ---------------------------------------------------------------------------

const dimensionAnnotationArb = annotationBaseWithDescArb.chain((base) =>
  fc
    .record({
      type: fc.constant("dimension" as const),
      dimensionType: fc.constantFrom(
        "linear" as const,
        "angular" as const,
        "radius" as const,
        "diameter" as const,
      ),
      nominalValue: fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
      plusTolerance: fc.option(
        fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
        { nil: undefined },
      ),
      minusTolerance: fc.option(
        fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
        { nil: undefined },
      ),
      unit: fc.option(fc.constantFrom("mm", "in", "deg"), { nil: undefined }),
    })
    .map((specific) => ({ ...base, ...specific })),
);

const geometricCharacteristics = [
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
] as const;

const fcfAnnotationArb = annotationBaseWithDescArb.chain((base) =>
  fc
    .record({
      type: fc.constant("fcf" as const),
      geometricCharacteristic: fc.constantFrom(...geometricCharacteristics),
      toleranceValue: fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
      materialCondition: fc.option(
        fc.constantFrom("MMC" as const, "LMC" as const, "RFS" as const),
        { nil: null },
      ),
      datumReferences: fc.array(
        fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")),
        { minLength: 0, maxLength: 3 },
      ),
    })
    .map((specific) => ({ ...base, ...specific })),
);

const datumAnnotationArb = annotationBaseWithDescArb.chain((base) =>
  fc
    .record({
      type: fc.constant("datum" as const),
      datumLetter: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")),
    })
    .map((specific) => ({ ...base, ...specific })),
);

const surfaceFinishAnnotationArb = annotationBaseWithDescArb.chain((base) =>
  fc
    .record({
      type: fc.constant("surface_finish" as const),
      roughnessValue: fc.double({ noNaN: true, min: 0, max: 1e6 }),
      processNote: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
        nil: undefined,
      }),
    })
    .map((specific) => ({ ...base, ...specific })),
);

const noteAnnotationArb = annotationBaseWithDescArb.chain((base) =>
  fc
    .constant({ type: "note" as const })
    .map((specific) => ({ ...base, ...specific })),
);

const enrichedAnnotationArb = fc.oneof(
  dimensionAnnotationArb,
  fcfAnnotationArb,
  datumAnnotationArb,
  surfaceFinishAnnotationArb,
  noteAnnotationArb,
);

// ---------------------------------------------------------------------------
// ComplianceIssue arbitrary
// ---------------------------------------------------------------------------

const complianceIssueArb = fc.record({
  annotationId: fc.uuid(),
  ruleId: fc.constantFrom(
    "FCF_DATUM_COUNT",
    "DATUM_REF_EXISTS",
    "MMC_LMC_APPLICABILITY",
    "TOLERANCE_POSITIVE",
  ),
  severity: fc.constantFrom("error" as const, "warning" as const),
  description: fc.string({ minLength: 1, maxLength: 200 }),
});

// ---------------------------------------------------------------------------
// DfmFinding arbitrary
// ---------------------------------------------------------------------------

const dfmFindingArb = fc.record({
  id: fc.uuid(),
  category: fc.constantFrom(
    "over_tolerancing" as const,
    "missing_tolerance" as const,
    "datum_scheme_completeness" as const,
    "surface_finish_consistency" as const,
    "general" as const,
  ),
  severity: fc.constantFrom(
    "error" as const,
    "warning" as const,
    "info" as const,
  ),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  recommendation: fc.string({ minLength: 1, maxLength: 200 }),
  relatedAnnotationIds: fc.option(fc.array(fc.uuid(), { maxLength: 5 }), {
    nil: undefined,
  }),
});

// ---------------------------------------------------------------------------
// Property 1: Enriched Annotation Schema Round-Trip
// **Validates: Requirements 9.1, 9.4**
// ---------------------------------------------------------------------------

describe("Property 1: Enriched Annotation Schema Round-Trip", () => {
  it("for all valid enriched annotation objects (all 5 type variants), JSON round-trip produces equivalent object", () => {
    fc.assert(
      fc.property(enrichedAnnotationArb, (annotation) => {
        const json = JSON.stringify(annotation);
        const parsed = JSON.parse(json);
        const result = UpdateAnnotationBody.safeParse(parsed);

        expect(result.success).toBe(true);
        if (result.success) {
          // Compare key fields to verify round-trip equivalence
          expect(result.data.type).toBe(annotation.type);
          expect(result.data.id).toBe(annotation.id);
          expect(result.data.label).toBe(annotation.label);
          expect(result.data.value).toBe(annotation.value);
          expect(result.data.view).toBe(annotation.view);
          expect(result.data.confidence).toBe(annotation.confidence);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Test each variant individually to ensure full coverage
  const variants = [
    { name: "dimension", arb: dimensionAnnotationArb },
    { name: "fcf", arb: fcfAnnotationArb },
    { name: "datum", arb: datumAnnotationArb },
    { name: "surface_finish", arb: surfaceFinishAnnotationArb },
    { name: "note", arb: noteAnnotationArb },
  ] as const;

  for (const { name, arb } of variants) {
    it(`round-trips ${name} annotations through JSON and Zod validation`, () => {
      fc.assert(
        fc.property(arb, (annotation) => {
          const json = JSON.stringify(annotation);
          const parsed = JSON.parse(json);
          const result = UpdateAnnotationBody.safeParse(parsed);

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.type).toBe(name);
          }
        }),
        { numRuns: 100 },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Property 2: Compliance Issue Round-Trip
// **Validates: Requirements 9.2**
// ---------------------------------------------------------------------------

describe("Property 2: ComplianceIssue Round-Trip", () => {
  // Extract the complianceIssues schema from the response schema
  const complianceIssueSchema =
    AnalyzeDrawingGdtResponse.shape.complianceIssues.element;

  it("for all valid ComplianceIssue objects, JSON round-trip produces equivalent object", () => {
    fc.assert(
      fc.property(complianceIssueArb, (issue) => {
        const json = JSON.stringify(issue);
        const parsed = JSON.parse(json);
        const result = complianceIssueSchema.safeParse(parsed);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.annotationId).toBe(issue.annotationId);
          expect(result.data.ruleId).toBe(issue.ruleId);
          expect(result.data.severity).toBe(issue.severity);
          expect(result.data.description).toBe(issue.description);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: DfmFinding Round-Trip
// **Validates: Requirements 9.3**
// ---------------------------------------------------------------------------

describe("Property 3: DfmFinding Round-Trip", () => {
  const dfmFindingSchema = AnalyzeDrawingGdtResponse.shape.dfmFindings.element;

  it("for all valid DfmFinding objects, JSON round-trip produces equivalent object", () => {
    fc.assert(
      fc.property(dfmFindingArb, (finding) => {
        const json = JSON.stringify(finding);
        const parsed = JSON.parse(json);
        const result = dfmFindingSchema.safeParse(parsed);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe(finding.id);
          expect(result.data.category).toBe(finding.category);
          expect(result.data.severity).toBe(finding.severity);
          expect(result.data.description).toBe(finding.description);
          expect(result.data.recommendation).toBe(finding.recommendation);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Zod Schema Discrimination (accept valid / reject invalid)
// **Validates: Requirements 1.7, 9.4**
// ---------------------------------------------------------------------------

describe("Property 11: Zod Schema Discrimination", () => {
  it("accepts valid annotations of each type", () => {
    fc.assert(
      fc.property(enrichedAnnotationArb, (annotation) => {
        const result = UpdateAnnotationBody.safeParse(annotation);
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("rejects annotations with missing required type-specific fields", () => {
    fc.assert(
      fc.property(annotationBaseArb, (base) => {
        // An annotation with only base fields and no type should be rejected
        const result = UpdateAnnotationBody.safeParse(base);
        expect(result.success).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  it("rejects annotations with invalid type values", () => {
    fc.assert(
      fc.property(
        annotationBaseArb,
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter(
            (s) =>
              !["dimension", "fcf", "datum", "surface_finish", "note"].includes(
                s,
              ),
          ),
        (base, badType) => {
          const invalid = { ...base, type: badType };
          const result = UpdateAnnotationBody.safeParse(invalid);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("rejects annotations with confidence outside [0, 1]", () => {
    fc.assert(
      fc.property(
        dimensionAnnotationArb,
        fc.oneof(
          fc.double({ min: 1.01, max: 1e6, noNaN: true }),
          fc.double({ min: -1e6, max: -0.01, noNaN: true }),
        ),
        (annotation, badConfidence) => {
          const invalid = { ...annotation, confidence: badConfidence };
          const result = UpdateAnnotationBody.safeParse(invalid);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("rejects dimension annotations with invalid dimensionType enum", () => {
    fc.assert(
      fc.property(
        dimensionAnnotationArb,
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter(
            (s) => !["linear", "angular", "radius", "diameter"].includes(s),
          ),
        (annotation, badDimType) => {
          const invalid = { ...annotation, dimensionType: badDimType };
          const result = UpdateAnnotationBody.safeParse(invalid);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("rejects fcf annotations with invalid geometricCharacteristic enum", () => {
    fc.assert(
      fc.property(
        fcfAnnotationArb,
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter(
            (s) => !(geometricCharacteristics as readonly string[]).includes(s),
          ),
        (annotation, badCharacteristic) => {
          const invalid = {
            ...annotation,
            geometricCharacteristic: badCharacteristic,
          };
          const result = UpdateAnnotationBody.safeParse(invalid);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("rejects fcf annotations with invalid materialCondition enum", () => {
    fc.assert(
      fc.property(
        fcfAnnotationArb,
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => !["MMC", "LMC", "RFS"].includes(s)),
        (annotation, badMC) => {
          const invalid = { ...annotation, materialCondition: badMC };
          const result = UpdateAnnotationBody.safeParse(invalid);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });
});
