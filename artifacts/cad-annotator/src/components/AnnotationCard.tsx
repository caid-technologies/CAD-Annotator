/**
 * AnnotationCard
 *
 * Displays a single enriched GD&T annotation with:
 * - Type badge (dimension, fcf, datum, surface_finish, note)
 * - Confidence score indicator (progress bar + percentage)
 * - Compliance status coloring:
 *   - Red background/border: has compliance errors
 *   - Yellow background/border: has needsReview = true
 *   - Green background/border: passes all checks
 * - Annotation label and value
 * - Clickable (onClick handler for opening editor)
 */
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface EnrichedAnnotation {
  id: string;
  type: "dimension" | "fcf" | "datum" | "surface_finish" | "note";
  label: string;
  value: string;
  view: string;
  boundingBox: BoundingBox;
  confidence: number;
  needsReview?: boolean;
  description?: string;
}

export interface ComplianceIssue {
  annotationId: string;
  ruleId: string;
  severity: "error" | "warning";
  description: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable labels for annotation types. */
const TYPE_LABELS: Record<EnrichedAnnotation["type"], string> = {
  dimension: "Dimension",
  fcf: "FCF",
  datum: "Datum",
  surface_finish: "Surface Finish",
  note: "Note",
};

export type ComplianceStatus = "error" | "warning" | "passing";

/**
 * Determine the compliance status for an annotation given its issues and
 * needsReview flag.
 */
export function getComplianceStatus(
  annotation: Pick<EnrichedAnnotation, "id" | "needsReview">,
  issues: ComplianceIssue[],
): ComplianceStatus {
  const annotationIssues = issues.filter(
    (i) => i.annotationId === annotation.id,
  );
  if (annotationIssues.some((i) => i.severity === "error")) return "error";
  if (annotation.needsReview) return "warning";
  if (annotationIssues.some((i) => i.severity === "warning")) return "warning";
  return "passing";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AnnotationCardProps {
  annotation: EnrichedAnnotation;
  complianceIssues: ComplianceIssue[];
  isSelected?: boolean;
  onClick?: () => void;
}

export function AnnotationCard({
  annotation,
  complianceIssues,
  isSelected = false,
  onClick,
}: AnnotationCardProps) {
  const status = getComplianceStatus(annotation, complianceIssues);

  const statusStyles: Record<ComplianceStatus, string> = {
    error: "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-950/30",
    warning:
      "border-yellow-400 bg-yellow-50 dark:border-yellow-500/50 dark:bg-yellow-950/30",
    passing:
      "border-green-400 bg-green-50 dark:border-green-500/50 dark:bg-green-950/30",
  };

  const StatusIcon =
    status === "error"
      ? XCircle
      : status === "warning"
        ? AlertTriangle
        : CheckCircle;

  const statusIconColor =
    status === "error"
      ? "text-red-500"
      : status === "warning"
        ? "text-yellow-500"
        : "text-green-500";

  const confidencePercent = Math.round(annotation.confidence * 100);

  return (
    <div
      data-testid={`annotation-card-${annotation.id}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "cursor-pointer rounded-xl border p-4 transition-all duration-200",
        statusStyles[status],
        isSelected && "ring-2 ring-primary/50 shadow-md",
      )}
    >
      {/* Header: type badge + status icon */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge
          variant="secondary"
          className="text-[10px] uppercase tracking-wider"
        >
          {TYPE_LABELS[annotation.type]}
        </Badge>
        <StatusIcon className={cn("w-4 h-4 shrink-0", statusIconColor)} />
      </div>

      {/* Label and value */}
      <div className="mb-3">
        <p className="text-sm font-medium text-foreground truncate">
          {annotation.label}
        </p>
        <p className="text-lg font-mono text-foreground mt-0.5">
          {annotation.value}
        </p>
      </div>

      {/* Confidence indicator */}
      <div className="flex items-center gap-2">
        <Progress value={confidencePercent} className="h-1.5 flex-1" />
        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
          {confidencePercent}%
        </span>
      </div>

      {/* Description (if present) */}
      {annotation.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
          {annotation.description}
        </p>
      )}
    </div>
  );
}
