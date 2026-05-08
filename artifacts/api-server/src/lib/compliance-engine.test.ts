/**
 * Property-based tests for the GD&T Compliance Engine.
 *
 * Uses fast-check and vitest. Each property test validates a single compliance
 * rule against randomly generated annotation inputs.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  type EnrichedAnnotation,
  type FcfAnnotation,
  type DatumAnnotation,
  type GeometricCharacteristic,
  type ComplianceIssue,
  DATUM_COUNT_RANGE,
  MMC_LMC_PERMITTED,
  checkFcfDatumCount,
  checkDatumRefExists,
  checkMmcLmcApplicability,
  checkTolerancePositive,
} from "./compliance-engine.js";

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

const boundingBoxArb = fc.record({
  x: fc.double({ min: 0, max: 100, noNaN: true }),
  y: fc.double({ min: 0, max: 100, noNaN: true }),
  width: fc.double({ min: 0.1, max: 100, noNaN: true }),
  height: fc.double({ min: 0.1, max: 100, noNaN: true }),
  color: fc.constantFrom("red", "green", "blue"),
});

const annotationBaseArb = fc.record({
  id: fc.uuid(),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  value: fc.string({ minLength: 1, maxLength: 50 }),
  view: fc.string({ minLength: 1, maxLength: 20 }),
  boundingBox: boundingBoxArb,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  needsReview: fc.boolean(),
});

const allCharacteristics: GeometricCharacteristic[] = [
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

const geometricCharacteristicArb: fc.Arbitrary<GeometricCharacteristic> =
  fc.constantFrom(...allCharacteristics);

const datumLetterArb = fc.constantFrom(
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
);

/**
 * Build an FCF annotation arbitrary with explicit control over datum count.
 */
function fcfAnnotationArb(opts?: {
  datumCount?: fc.Arbitrary<number>;
  toleranceValue?: fc.Arbitrary<number>;
  materialCondition?: fc.Arbitrary<"MMC" | "LMC" | "RFS" | null>;
  characteristic?: fc.Arbitrary<GeometricCharacteristic>;
}): fc.Arbitrary<FcfAnnotation> {
  return annotationBaseArb.chain((base) =>
    fc
      .record({
        type: fc.constant("fcf" as const),
        geometricCharacteristic:
          opts?.characteristic ?? geometricCharacteristicArb,
        toleranceValue:
          opts?.toleranceValue ??
          fc.double({ min: 0.001, max: 1000, noNaN: true }),
        materialCondition:
          opts?.materialCondition ??
          fc.constantFrom("MMC" as const, "LMC" as const, "RFS" as const, null),
        datumReferences: fc.array(datumLetterArb, {
          minLength: opts?.datumCount ? 0 : 0,
          maxLength: opts?.datumCount ? 3 : 3,
        }),
      })
      .map((specific) => ({ ...base, ...specific })),
  );
}

function datumAnnotationArb(
  letter?: fc.Arbitrary<string>,
): fc.Arbitrary<DatumAnnotation> {
  return annotationBaseArb.chain((base) =>
    fc
      .record({
        type: fc.constant("datum" as const),
        datumLetter: letter ?? datumLetterArb,
      })
      .map((specific) => ({ ...base, ...specific })),
  );
}

// ---------------------------------------------------------------------------
// Property 5: FCF Datum Count Validation Correctness
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

describe("Property 5: FCF Datum Count Validation", () => {
  it("produces FCF_DATUM_COUNT issue iff datum count is outside valid range for the characteristic", () => {
    // Generate a characteristic and an arbitrary datum count (0-4 to cover out-of-range)
    const arbInput = fc
      .tuple(geometricCharacteristicArb, fc.integer({ min: 0, max: 4 }))
      .chain(([characteristic, datumCount]) => {
        return annotationBaseArb.map(
          (base): FcfAnnotation => ({
            ...base,
            type: "fcf",
            geometricCharacteristic: characteristic,
            toleranceValue: 1.0,
            materialCondition: null,
            datumReferences: Array.from({ length: datumCount }, (_, i) =>
              String.fromCharCode(65 + i),
            ),
          }),
        );
      });

    fc.assert(
      fc.property(arbInput, (fcf) => {
        const issues = checkFcfDatumCount([fcf]);
        const [min, max] = DATUM_COUNT_RANGE[fcf.geometricCharacteristic];
        const count = fcf.datumReferences.length;
        const shouldHaveIssue = count < min || count > max;

        const hasIssue = issues.some(
          (i) => i.ruleId === "FCF_DATUM_COUNT" && i.annotationId === fcf.id,
        );

        expect(hasIssue).toBe(shouldHaveIssue);

        // If there is an issue, verify it has the correct structure
        if (hasIssue) {
          const issue = issues.find(
            (i) => i.ruleId === "FCF_DATUM_COUNT" && i.annotationId === fcf.id,
          )!;
          expect(issue.severity).toBe("error");
          expect(issue.description).toBeTruthy();
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Datum Reference Consistency
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

describe("Property 6: Datum Reference Consistency", () => {
  it("produces DATUM_REF_EXISTS issue for each missing datum and no issue for existing datums", () => {
    // Generate a set of declared datum letters and an FCF that references some of them plus extras
    const arbInput = fc
      .tuple(
        fc.uniqueArray(datumLetterArb, { minLength: 0, maxLength: 5 }),
        fc.uniqueArray(datumLetterArb, { minLength: 1, maxLength: 3 }),
      )
      .chain(([declaredLetters, referencedLetters]) => {
        // Build datum annotations for declared letters
        const datumAnnsArb: fc.Arbitrary<DatumAnnotation[]> =
          declaredLetters.length > 0
            ? fc
                .tuple(
                  ...declaredLetters.map((letter) =>
                    annotationBaseArb.map(
                      (base): DatumAnnotation => ({
                        ...base,
                        type: "datum",
                        datumLetter: letter,
                      }),
                    ),
                  ),
                )
                .map((arr) => arr as DatumAnnotation[])
            : fc.constant([] as DatumAnnotation[]);

        // Build an FCF that references the chosen letters
        const fcfAnn = annotationBaseArb.map(
          (base): FcfAnnotation => ({
            ...base,
            type: "fcf",
            geometricCharacteristic: "profileOfSurface", // allows 0-3 datums
            toleranceValue: 1.0,
            materialCondition: null,
            datumReferences: referencedLetters,
          }),
        );

        return fc.tuple(
          datumAnnsArb,
          fcfAnn,
          fc.constant(declaredLetters),
          fc.constant(referencedLetters),
        );
      });

    fc.assert(
      fc.property(
        arbInput,
        ([datumAnnotations, fcf, declaredLetters, referencedLetters]) => {
          const annotations: EnrichedAnnotation[] = [...datumAnnotations, fcf];

          const issues = checkDatumRefExists(annotations);
          const declaredSet = new Set(declaredLetters);

          for (const ref of referencedLetters) {
            const hasIssue = issues.some(
              (i) =>
                i.ruleId === "DATUM_REF_EXISTS" &&
                i.annotationId === fcf.id &&
                i.description.includes(`"${ref}"`),
            );

            if (declaredSet.has(ref)) {
              // Existing datum → no issue expected
              expect(hasIssue).toBe(false);
            } else {
              // Missing datum → issue expected
              expect(hasIssue).toBe(true);
            }
          }

          // No spurious issues for datums not referenced
          for (const issue of issues) {
            expect(issue.ruleId).toBe("DATUM_REF_EXISTS");
            expect(issue.annotationId).toBe(fcf.id);
            expect(issue.severity).toBe("error");
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Material Condition Modifier Validation
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

describe("Property 7: Material Condition Modifier Validation", () => {
  it("produces MMC_LMC_APPLICABILITY issue iff characteristic does not permit MMC/LMC", () => {
    const arbInput = fc
      .tuple(
        geometricCharacteristicArb,
        fc.constantFrom("MMC" as const, "LMC" as const),
      )
      .chain(([characteristic, mc]) =>
        annotationBaseArb.map(
          (base): FcfAnnotation => ({
            ...base,
            type: "fcf",
            geometricCharacteristic: characteristic,
            toleranceValue: 1.0,
            materialCondition: mc,
            datumReferences: [],
          }),
        ),
      );

    fc.assert(
      fc.property(arbInput, (fcf) => {
        const issues = checkMmcLmcApplicability([fcf]);
        const shouldHaveIssue = !MMC_LMC_PERMITTED.has(
          fcf.geometricCharacteristic,
        );

        const hasIssue = issues.some(
          (i) =>
            i.ruleId === "MMC_LMC_APPLICABILITY" && i.annotationId === fcf.id,
        );

        expect(hasIssue).toBe(shouldHaveIssue);

        // Verify no issue when materialCondition is null or RFS
        const fcfNull: FcfAnnotation = { ...fcf, materialCondition: null };
        const fcfRfs: FcfAnnotation = { ...fcf, materialCondition: "RFS" };
        expect(checkMmcLmcApplicability([fcfNull])).toHaveLength(0);
        expect(checkMmcLmcApplicability([fcfRfs])).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Tolerance Positivity Check
// **Validates: Requirements 3.4**
// ---------------------------------------------------------------------------

describe("Property 8: Tolerance Positivity Check", () => {
  it("produces TOLERANCE_POSITIVE issue iff toleranceValue <= 0", () => {
    const arbInput = fc
      .double({ min: -1000, max: 1000, noNaN: true })
      .chain((toleranceValue) =>
        annotationBaseArb.map(
          (base): FcfAnnotation => ({
            ...base,
            type: "fcf",
            geometricCharacteristic: "position",
            toleranceValue,
            materialCondition: null,
            datumReferences: ["A", "B"],
          }),
        ),
      );

    fc.assert(
      fc.property(arbInput, (fcf) => {
        const issues = checkTolerancePositive([fcf]);
        const shouldHaveIssue = fcf.toleranceValue <= 0;

        const hasIssue = issues.some(
          (i) => i.ruleId === "TOLERANCE_POSITIVE" && i.annotationId === fcf.id,
        );

        expect(hasIssue).toBe(shouldHaveIssue);

        if (hasIssue) {
          const issue = issues.find(
            (i) =>
              i.ruleId === "TOLERANCE_POSITIVE" && i.annotationId === fcf.id,
          )!;
          expect(issue.severity).toBe("error");
        }
      }),
      { numRuns: 300 },
    );
  });
});
