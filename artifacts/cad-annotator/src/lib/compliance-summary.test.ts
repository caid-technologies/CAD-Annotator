/**
 * Property-Based Test: Compliance Summary Counts (Property 10)
 *
 * **Validates: Requirements 7.4**
 *
 * FOR ALL sets of annotations and compliance issues, the compliance summary
 * counts (errors + warnings + passing) SHALL equal the total number of
 * annotations.
 *
 * An annotation counts as:
 * - "error" if it has any compliance issue with severity "error"
 * - "warning" if it has only warning-severity issues (no errors)
 * - "passing" if it has no compliance issues at all
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  computeComplianceSummary,
  type ComplianceSummaryCounts,
  type ComplianceIssue,
  type AnnotationId,
} from "./compliance-summary";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a minimal annotation with just an id (all we need for counting). */
const annotationArb: fc.Arbitrary<AnnotationId> = fc.record({
  id: fc.uuid(),
});

/** Generate a compliance issue that references one of the given annotation IDs. */
function complianceIssuesArb(
  annotationIds: string[],
): fc.Arbitrary<ComplianceIssue[]> {
  if (annotationIds.length === 0) {
    return fc.constant([]);
  }

  const singleIssue: fc.Arbitrary<ComplianceIssue> = fc.record({
    annotationId: fc.constantFrom(...annotationIds),
    ruleId: fc.constantFrom(
      "FCF_DATUM_COUNT",
      "DATUM_REF_EXISTS",
      "MMC_LMC_APPLICABILITY",
      "TOLERANCE_POSITIVE",
    ),
    severity: fc.constantFrom("error" as const, "warning" as const),
    description: fc.string({ minLength: 1, maxLength: 50 }),
  });

  return fc.array(singleIssue, { minLength: 0, maxLength: 20 });
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("Compliance Summary — Property 10", () => {
  it("errors + warnings + passing always equals total annotation count", () => {
    fc.assert(
      fc.property(
        fc.array(annotationArb, { minLength: 0, maxLength: 30 }),
        fc.gen(),
        (annotations, gen) => {
          const ids = annotations.map((a) => a.id);
          const issues = gen(complianceIssuesArb, ids);

          const summary: ComplianceSummaryCounts = computeComplianceSummary(
            annotations,
            issues,
          );

          // Core property: counts must sum to total annotations
          expect(summary.errors + summary.warnings + summary.passing).toBe(
            annotations.length,
          );

          // All counts must be non-negative
          expect(summary.errors).toBeGreaterThanOrEqual(0);
          expect(summary.warnings).toBeGreaterThanOrEqual(0);
          expect(summary.passing).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("annotations with no issues are all passing", () => {
    fc.assert(
      fc.property(
        fc.array(annotationArb, { minLength: 1, maxLength: 20 }),
        (annotations) => {
          const summary = computeComplianceSummary(annotations, []);

          expect(summary.errors).toBe(0);
          expect(summary.warnings).toBe(0);
          expect(summary.passing).toBe(annotations.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("annotation with at least one error-severity issue counts as error", () => {
    fc.assert(
      fc.property(
        annotationArb,
        fc.array(
          fc.record({
            ruleId: fc.constantFrom(
              "FCF_DATUM_COUNT",
              "DATUM_REF_EXISTS",
              "MMC_LMC_APPLICABILITY",
              "TOLERANCE_POSITIVE",
            ),
            severity: fc.constantFrom("error" as const, "warning" as const),
            description: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (annotation, issueTemplates) => {
          const issues: ComplianceIssue[] = issueTemplates.map((t) => ({
            ...t,
            annotationId: annotation.id,
          }));
          // Force at least one error
          issues[0] = { ...issues[0], severity: "error" as const };

          const summary = computeComplianceSummary([annotation], issues);

          expect(summary.errors).toBe(1);
          expect(summary.warnings).toBe(0);
          expect(summary.passing).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("annotation with only warning-severity issues counts as warning", () => {
    fc.assert(
      fc.property(
        annotationArb,
        fc.array(
          fc.record({
            ruleId: fc.constantFrom(
              "FCF_DATUM_COUNT",
              "DATUM_REF_EXISTS",
              "MMC_LMC_APPLICABILITY",
              "TOLERANCE_POSITIVE",
            ),
            description: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (annotation, issueTemplates) => {
          const issues: ComplianceIssue[] = issueTemplates.map((t) => ({
            ...t,
            annotationId: annotation.id,
            severity: "warning" as const,
          }));

          const summary = computeComplianceSummary([annotation], issues);

          expect(summary.errors).toBe(0);
          expect(summary.warnings).toBe(1);
          expect(summary.passing).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
