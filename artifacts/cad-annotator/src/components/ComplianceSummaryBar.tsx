/**
 * ComplianceSummaryBar
 *
 * Displays a summary bar with counts of errors, warnings, and passing
 * annotations using colored badges.
 *
 * Counting logic:
 * - "error": annotation has any compliance issue with severity "error"
 * - "warning": annotation has only warning-severity issues (no errors)
 * - "passing": annotation has no compliance issues
 */
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { computeComplianceSummary } from "@/lib/compliance-summary";
import type { ComplianceIssue } from "@/components/AnnotationCard";

// Re-export for convenience
export { computeComplianceSummary };
export type { ComplianceSummaryCounts } from "@/lib/compliance-summary";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ComplianceSummaryBarProps {
  annotations: { id: string }[];
  complianceIssues: ComplianceIssue[];
}

export function ComplianceSummaryBar({
  annotations,
  complianceIssues,
}: ComplianceSummaryBarProps) {
  const { errors, warnings, passing } = computeComplianceSummary(
    annotations,
    complianceIssues,
  );

  return (
    <div
      data-testid="compliance-summary-bar"
      className="flex items-center gap-3 flex-wrap"
    >
      <Badge variant="destructive" className="gap-1.5 px-3 py-1">
        <XCircle className="w-3.5 h-3.5" />
        <span>
          {errors} error{errors !== 1 ? "s" : ""}
        </span>
      </Badge>

      <Badge className="gap-1.5 px-3 py-1 bg-yellow-500 text-white border-transparent hover:bg-yellow-600">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>
          {warnings} warning{warnings !== 1 ? "s" : ""}
        </span>
      </Badge>

      <Badge className="gap-1.5 px-3 py-1 bg-green-500 text-white border-transparent hover:bg-green-600">
        <CheckCircle className="w-3.5 h-3.5" />
        <span>{passing} passing</span>
      </Badge>
    </div>
  );
}
