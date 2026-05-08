/**
 * CompliancePopover
 *
 * Displays compliance issues for a selected annotation in a popover.
 * Triggered when clicking a non-compliant annotation.
 *
 * Each issue shows:
 * - ruleId
 * - severity (with color coding: red for error, yellow for warning)
 * - description
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, XCircle } from "lucide-react";
import type { ComplianceIssue } from "@/components/AnnotationCard";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CompliancePopoverProps {
  issues: ComplianceIssue[];
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CompliancePopover({
  issues,
  children,
  open,
  onOpenChange,
}: CompliancePopoverProps) {
  if (issues.length === 0) {
    return <>{children}</>;
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={8}>
        <div className="p-3 border-b">
          <h4 className="text-sm font-medium">
            Compliance Issues ({issues.length})
          </h4>
        </div>
        <div className="max-h-60 overflow-y-auto">
          {issues.map((issue, index) => (
            <div
              key={`${issue.ruleId}-${index}`}
              className={cn(
                "p-3 flex flex-col gap-1.5",
                index < issues.length - 1 && "border-b",
              )}
            >
              <div className="flex items-center gap-2">
                {issue.severity === "error" ? (
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                )}
                <Badge
                  variant={
                    issue.severity === "error" ? "destructive" : "outline"
                  }
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    issue.severity === "warning" &&
                      "border-yellow-500 text-yellow-600 dark:text-yellow-400",
                  )}
                >
                  {issue.severity}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {issue.ruleId}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {issue.description}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
