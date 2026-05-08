/**
 * Compliance Summary — Pure Logic
 *
 * Extracted as a standalone module so it can be tested without React dependencies.
 * Used by ComplianceSummaryBar component and property-based tests.
 */

// ---------------------------------------------------------------------------
// Types (minimal subset needed for counting)
// ---------------------------------------------------------------------------

export interface ComplianceSummaryCounts {
  errors: number;
  warnings: number;
  passing: number;
}

export interface AnnotationId {
  id: string;
}

export interface ComplianceIssue {
  annotationId: string;
  ruleId: string;
  severity: "error" | "warning";
  description: string;
}

// ---------------------------------------------------------------------------
// Pure counting logic
// ---------------------------------------------------------------------------

/**
 * Compute compliance summary counts from annotations and issues.
 *
 * An annotation counts as:
 * - "error" if it has any compliance issue with severity "error"
 * - "warning" if it has only warning-severity issues (no errors)
 * - "passing" if it has no compliance issues at all
 *
 * The sum (errors + warnings + passing) always equals annotations.length.
 */
export function computeComplianceSummary(
  annotations: AnnotationId[],
  issues: ComplianceIssue[],
): ComplianceSummaryCounts {
  // Build a map of annotationId → set of severities
  const severitiesByAnnotation = new Map<string, Set<"error" | "warning">>();

  for (const issue of issues) {
    let set = severitiesByAnnotation.get(issue.annotationId);
    if (!set) {
      set = new Set();
      severitiesByAnnotation.set(issue.annotationId, set);
    }
    set.add(issue.severity);
  }

  let errors = 0;
  let warnings = 0;
  let passing = 0;

  for (const ann of annotations) {
    const severities = severitiesByAnnotation.get(ann.id);
    if (!severities || severities.size === 0) {
      passing++;
    } else if (severities.has("error")) {
      errors++;
    } else {
      warnings++;
    }
  }

  return { errors, warnings, passing };
}
