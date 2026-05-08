/**
 * DfmFindingsPanel
 *
 * A collapsible panel that displays DFM (Design for Manufacturability) findings
 * grouped by category. Each finding shows severity, description, and recommendation.
 *
 * Categories:
 * - over_tolerancing
 * - missing_tolerance
 * - datum_scheme_completeness
 * - surface_finish_consistency
 * - general
 */
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";

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
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<DfmCategory, string> = {
  over_tolerancing: "Over-Tolerancing",
  missing_tolerance: "Missing Tolerance",
  datum_scheme_completeness: "Datum Scheme Completeness",
  surface_finish_consistency: "Surface Finish Consistency",
  general: "General",
};

/** Ordered list of categories for consistent display. */
const CATEGORY_ORDER: DfmCategory[] = [
  "over_tolerancing",
  "missing_tolerance",
  "datum_scheme_completeness",
  "surface_finish_consistency",
  "general",
];

function SeverityIcon({ severity }: { severity: DfmSeverity }) {
  switch (severity) {
    case "error":
      return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case "warning":
      return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
    case "info":
      return <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  }
}

function severityBadgeClass(severity: DfmSeverity): string {
  switch (severity) {
    case "error":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800";
    case "warning":
      return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-400 dark:border-yellow-800";
    case "info":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DfmFindingsPanelProps {
  findings: DfmFinding[];
}

export function DfmFindingsPanel({ findings }: DfmFindingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (findings.length === 0) return null;

  // Group findings by category
  const grouped = new Map<DfmCategory, DfmFinding[]>();
  for (const finding of findings) {
    const list = grouped.get(finding.category) ?? [];
    list.push(finding);
    grouped.set(finding.category, list);
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      data-testid="dfm-findings-panel"
    >
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">DFM Findings</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {findings.length}
        </Badge>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 space-y-3">
          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => {
            const categoryFindings = grouped.get(category)!;
            return (
              <CategoryGroup
                key={category}
                category={category}
                findings={categoryFindings}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Category Group Sub-component
// ---------------------------------------------------------------------------

interface CategoryGroupProps {
  category: DfmCategory;
  findings: DfmFinding[];
}

function CategoryGroup({ category, findings }: CategoryGroupProps) {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-muted/20 border-b border-border/50">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {CATEGORY_LABELS[category]}
        </h4>
      </div>
      <div className="divide-y divide-border/50">
        {findings.map((finding) => (
          <div key={finding.id} className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <SeverityIcon severity={finding.severity} />
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  severityBadgeClass(finding.severity),
                )}
              >
                {finding.severity}
              </Badge>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {finding.description}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium">Recommendation:</span>{" "}
              {finding.recommendation}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
