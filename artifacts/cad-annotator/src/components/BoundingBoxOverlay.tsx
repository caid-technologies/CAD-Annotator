/**
 * BoundingBoxOverlay
 *
 * Renders bounding boxes on top of a CAD drawing image with compliance-aware
 * border coloring:
 * - Red border + warning icon: annotation has compliance errors
 * - Yellow border: annotation has needsReview = true
 * - Green border: annotation passes all checks
 * - Default (gray) border: no compliance data yet
 *
 * Bounding box coordinates are percentages (x, y, width, height).
 * Supports click handler for selecting an annotation.
 */
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type {
  EnrichedAnnotation,
  ComplianceIssue,
  ComplianceStatus,
} from "@/components/AnnotationCard";
import { getComplianceStatus } from "@/components/AnnotationCard";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BoundingBoxOverlayProps {
  annotations: EnrichedAnnotation[];
  complianceIssues: ComplianceIssue[];
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string) => void;
  /** When true, compliance coloring is not yet available. */
  hasComplianceData?: boolean;
}

const BORDER_COLORS: Record<ComplianceStatus | "default", string> = {
  error: "border-red-500",
  warning: "border-yellow-500",
  passing: "border-green-500",
  default: "border-muted-foreground/30",
};

const BG_HOVER: Record<ComplianceStatus | "default", string> = {
  error: "hover:bg-red-500/10",
  warning: "hover:bg-yellow-500/10",
  passing: "hover:bg-green-500/10",
  default: "hover:bg-foreground/5",
};

export function BoundingBoxOverlay({
  annotations,
  complianceIssues,
  selectedAnnotationId,
  onSelectAnnotation,
  hasComplianceData = true,
}: BoundingBoxOverlayProps) {
  return (
    <>
      {annotations.map((ann) => {
        const isSelected = selectedAnnotationId === ann.id;
        const status: ComplianceStatus | "default" = hasComplianceData
          ? getComplianceStatus(ann, complianceIssues)
          : "default";

        return (
          <div
            key={ann.id}
            data-testid={`bbox-${ann.id}`}
            role="button"
            tabIndex={0}
            className={cn(
              "absolute border-2 rounded-[2px] cursor-pointer transition-all duration-200",
              BORDER_COLORS[status],
              BG_HOVER[status],
              isSelected && "z-10 shadow-lg ring-1 ring-primary/40",
            )}
            style={{
              left: `${ann.boundingBox.x}%`,
              top: `${ann.boundingBox.y}%`,
              width: `${ann.boundingBox.width}%`,
              height: `${ann.boundingBox.height}%`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAnnotation?.(ann.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectAnnotation?.(ann.id);
              }
            }}
          >
            {/* Warning icon for annotations with compliance errors */}
            {status === "error" && (
              <div className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5">
                <AlertTriangle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
