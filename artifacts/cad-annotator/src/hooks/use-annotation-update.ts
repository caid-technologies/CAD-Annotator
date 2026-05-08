/**
 * useAnnotationUpdate
 *
 * Custom hook that wires annotation editing to the PATCH API endpoint
 * with optimistic updates and compliance re-validation.
 *
 * Uses the Orval-generated `useUpdateAnnotation` mutation hook under the hood.
 *
 * Optimistic update flow:
 * 1. Immediately update local annotations state
 * 2. Send PATCH request to server
 * 3. On success: replace local state with server response (includes re-validated compliance)
 * 4. On error: revert to the previous state
 */
import { useCallback, useState } from "react";
import { useUpdateAnnotation } from "@workspace/api-client-react";
import type {
  EnrichedAnnotation,
  GdtAnalyzeResult,
  ComplianceIssue,
} from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAnnotationUpdateOptions {
  /** Current session ID. */
  sessionId: string;
  /** Current annotations list. */
  annotations: EnrichedAnnotation[];
  /** Current compliance issues list. */
  complianceIssues: ComplianceIssue[];
  /** Callback to update the full session state after a successful server response. */
  onSessionUpdate: (result: GdtAnalyzeResult) => void;
  /** Optional error callback. */
  onError?: (error: Error, revertedAnnotation: EnrichedAnnotation) => void;
}

export interface UseAnnotationUpdateReturn {
  /** Submit an annotation update with optimistic UI. */
  updateAnnotation: (updated: EnrichedAnnotation) => void;
  /** Whether a mutation is currently in flight. */
  isSaving: boolean;
  /** The optimistically-updated annotations (use these for rendering). */
  optimisticAnnotations: EnrichedAnnotation[];
  /** The optimistically-updated compliance issues (use these for rendering). */
  optimisticComplianceIssues: ComplianceIssue[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAnnotationUpdate({
  sessionId,
  annotations,
  complianceIssues,
  onSessionUpdate,
  onError,
}: UseAnnotationUpdateOptions): UseAnnotationUpdateReturn {
  const mutation = useUpdateAnnotation();

  // Optimistic state — mirrors the server state but updates immediately on edit
  const [optimisticAnnotations, setOptimisticAnnotations] = useState<
    EnrichedAnnotation[] | null
  >(null);
  const [optimisticComplianceIssues, setOptimisticComplianceIssues] = useState<
    ComplianceIssue[] | null
  >(null);

  const updateAnnotation = useCallback(
    (updated: EnrichedAnnotation) => {
      // Snapshot for rollback
      const previousAnnotations = optimisticAnnotations ?? annotations;
      const previousIssues = optimisticComplianceIssues ?? complianceIssues;

      // Optimistic update: replace the annotation in the local list
      const nextAnnotations = previousAnnotations.map((a) =>
        a.id === updated.id ? updated : a,
      );
      setOptimisticAnnotations(nextAnnotations);

      // Send PATCH to server
      mutation.mutate(
        {
          sessionId,
          annotationId: updated.id,
          data: updated,
        },
        {
          onSuccess: (result: GdtAnalyzeResult) => {
            // Server response includes re-validated compliance issues
            setOptimisticAnnotations(null);
            setOptimisticComplianceIssues(null);
            onSessionUpdate(result);
          },
          onError: (error: unknown) => {
            // Revert optimistic update
            setOptimisticAnnotations(previousAnnotations);
            setOptimisticComplianceIssues(previousIssues);

            const originalAnnotation = previousAnnotations.find(
              (a) => a.id === updated.id,
            );
            if (onError && originalAnnotation) {
              onError(
                error instanceof Error ? error : new Error(String(error)),
                originalAnnotation,
              );
            }
          },
        },
      );
    },
    [
      sessionId,
      annotations,
      complianceIssues,
      optimisticAnnotations,
      optimisticComplianceIssues,
      mutation,
      onSessionUpdate,
      onError,
    ],
  );

  return {
    updateAnnotation,
    isSaving: mutation.isPending,
    optimisticAnnotations: optimisticAnnotations ?? annotations,
    optimisticComplianceIssues: optimisticComplianceIssues ?? complianceIssues,
  };
}
