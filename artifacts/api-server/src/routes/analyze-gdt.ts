/**
 * GD&T Analysis Routes
 *
 * POST /api/analyze/gdt   — Run the full GD&T analysis pipeline
 * GET  /api/sessions/:sessionId — Retrieve a saved analysis session
 * PATCH /api/sessions/:sessionId/annotations/:annotationId — Update an annotation and re-run compliance
 *
 * These routes expose the three-stage GD&T pipeline (detection → compliance →
 * DFM review) and support human review workflows including session retrieval
 * and annotation editing with automatic compliance re-validation.
 */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import {
  AnalyzeDrawingBody,
  GetSessionParams,
  UpdateAnnotationParams,
  UpdateAnnotationBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  analysisSessions,
  gdtAnnotations,
  complianceIssues as complianceIssuesTable,
  dfmFindings as dfmFindingsTable,
  annotationEdits,
} from "@workspace/db";
import {
  runGdtPipeline,
  type GdtAnalyzeResult,
} from "../lib/pipeline-orchestrator.js";
import {
  validateCompliance,
  type EnrichedAnnotation,
} from "../lib/compliance-engine.js";

const router = Router();

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reconstruct an EnrichedAnnotation from a database row by merging the
 * base fields with the type-specific `typeData` JSONB column.
 */
function dbRowToAnnotation(
  row: typeof gdtAnnotations.$inferSelect,
): EnrichedAnnotation {
  const base = {
    id: row.id,
    label: row.label,
    value: row.value,
    view: row.view,
    boundingBox: row.boundingBox,
    confidence: row.confidence,
    needsReview: row.needsReview,
    ...(row.description != null ? { description: row.description } : {}),
  };

  const typeData = row.typeData as Record<string, unknown>;

  switch (row.type) {
    case "dimension":
      return { ...base, type: "dimension", ...typeData } as EnrichedAnnotation;
    case "fcf":
      return { ...base, type: "fcf", ...typeData } as EnrichedAnnotation;
    case "datum":
      return { ...base, type: "datum", ...typeData } as EnrichedAnnotation;
    case "surface_finish":
      return {
        ...base,
        type: "surface_finish",
        ...typeData,
      } as EnrichedAnnotation;
    case "note":
      return { ...base, type: "note" } as EnrichedAnnotation;
    default:
      return { ...base, type: "note" } as EnrichedAnnotation;
  }
}

/**
 * Load a full session from the database and assemble a GdtAnalyzeResult.
 */
async function loadSession(
  sessionId: string,
): Promise<GdtAnalyzeResult | null> {
  // Fetch the session record
  const [session] = await db
    .select()
    .from(analysisSessions)
    .where(eq(analysisSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  // Fetch related data in parallel
  const [annotationRows, issueRows, findingRows] = await Promise.all([
    db
      .select()
      .from(gdtAnnotations)
      .where(eq(gdtAnnotations.sessionId, sessionId)),
    db
      .select()
      .from(complianceIssuesTable)
      .where(eq(complianceIssuesTable.sessionId, sessionId)),
    db
      .select()
      .from(dfmFindingsTable)
      .where(eq(dfmFindingsTable.sessionId, sessionId)),
  ]);

  const annotations = annotationRows.map(dbRowToAnnotation);

  const complianceIssues = issueRows.map(
    (row: {
      annotationId: string;
      ruleId: string;
      severity: string;
      description: string;
    }) => ({
      annotationId: row.annotationId,
      ruleId: row.ruleId,
      severity: row.severity as "error" | "warning",
      description: row.description,
    }),
  );

  const dfmFindings = findingRows.map(
    (row: {
      id: string;
      category: string;
      severity: string;
      description: string;
      recommendation: string;
      relatedAnnotationIds: unknown;
    }) => ({
      id: row.id,
      category: row.category as
        | "over_tolerancing"
        | "missing_tolerance"
        | "datum_scheme_completeness"
        | "surface_finish_consistency"
        | "general",
      severity: row.severity as "error" | "warning" | "info",
      description: row.description,
      recommendation: row.recommendation,
      relatedAnnotationIds: (row.relatedAnnotationIds as string[] | null) ?? [],
    }),
  );

  const result: GdtAnalyzeResult = {
    sessionId: session.id,
    annotations,
    complianceIssues,
    dfmFindings,
    views: (session.views as string[]) ?? [],
  };

  if (session.description) {
    result.description = session.description;
  }

  const stageErrors = session.stageErrors as
    | { stage: string; message: string }[]
    | null;
  if (stageErrors && stageErrors.length > 0) {
    result.errors = stageErrors as GdtAnalyzeResult["errors"];
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*  POST /analyze/gdt                                                          */
/* -------------------------------------------------------------------------- */

router.post("/analyze/gdt", async (req, res) => {
  const parseResult = AnalyzeDrawingBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "invalid_request",
      message: parseResult.error.message,
    });
    return;
  }

  const { imageData } = parseResult.data;

  if (!imageData || !imageData.startsWith("data:")) {
    res.status(400).json({
      error: "invalid_image",
      message:
        "imageData must be a base64 data URI (e.g. data:image/png;base64,...)",
    });
    return;
  }

  try {
    const result = await runGdtPipeline(imageData, parseResult.data);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error running GD&T pipeline");
    res.status(500).json({
      error: "analysis_failed",
      message:
        "Failed to analyze the drawing with GD&T pipeline. Please try again.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  GET /sessions/:sessionId                                                   */
/* -------------------------------------------------------------------------- */

router.get("/sessions/:sessionId", async (req, res) => {
  const paramResult = GetSessionParams.safeParse(req.params);
  if (!paramResult.success) {
    res.status(400).json({
      error: "invalid_request",
      message: paramResult.error.message,
    });
    return;
  }

  const { sessionId } = paramResult.data;

  try {
    const result = await loadSession(sessionId);

    if (!result) {
      res.status(404).json({
        error: "not_found",
        message: `Session "${sessionId}" not found.`,
      });
      return;
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error retrieving session");
    res.status(500).json({
      error: "retrieval_failed",
      message: "Failed to retrieve the analysis session.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  PATCH /sessions/:sessionId/annotations/:annotationId                       */
/* -------------------------------------------------------------------------- */

router.patch(
  "/sessions/:sessionId/annotations/:annotationId",
  async (req, res) => {
    const paramResult = UpdateAnnotationParams.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: "invalid_request",
        message: paramResult.error.message,
      });
      return;
    }

    const bodyResult = UpdateAnnotationBody.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: "invalid_request",
        message: bodyResult.error.message,
      });
      return;
    }

    const { sessionId, annotationId } = paramResult.data;
    const updatedAnnotation = bodyResult.data;

    try {
      // 1. Verify the session exists
      const [session] = await db
        .select()
        .from(analysisSessions)
        .where(eq(analysisSessions.id, sessionId))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "not_found",
          message: `Session "${sessionId}" not found.`,
        });
        return;
      }

      // 2. Fetch the existing annotation
      const [existingAnnotation] = await db
        .select()
        .from(gdtAnnotations)
        .where(
          and(
            eq(gdtAnnotations.id, annotationId),
            eq(gdtAnnotations.sessionId, sessionId),
          ),
        )
        .limit(1);

      if (!existingAnnotation) {
        res.status(404).json({
          error: "not_found",
          message: `Annotation "${annotationId}" not found in session "${sessionId}".`,
        });
        return;
      }

      // 3. Record the edit in annotation_edits for audit trail
      const previousAnnotation = dbRowToAnnotation(existingAnnotation);
      await db.insert(annotationEdits).values({
        sessionId,
        annotationId,
        previousValue: previousAnnotation,
        newValue: updatedAnnotation,
      });

      // 4. Extract type-specific data for the typeData JSONB column
      const typeData = extractTypeDataFromBody(updatedAnnotation);

      // 5. Update the annotation in the database
      await db
        .update(gdtAnnotations)
        .set({
          type: updatedAnnotation.type,
          label: updatedAnnotation.label,
          value: updatedAnnotation.value,
          view: updatedAnnotation.view,
          boundingBox: updatedAnnotation.boundingBox,
          confidence: updatedAnnotation.confidence,
          needsReview: updatedAnnotation.needsReview ?? false,
          description: updatedAnnotation.description,
          typeData,
        })
        .where(
          and(
            eq(gdtAnnotations.id, annotationId),
            eq(gdtAnnotations.sessionId, sessionId),
          ),
        );

      // 6. Fetch all annotations for this session to re-run compliance
      const allAnnotationRows = await db
        .select()
        .from(gdtAnnotations)
        .where(eq(gdtAnnotations.sessionId, sessionId));

      const allAnnotations = allAnnotationRows.map(dbRowToAnnotation);

      // 7. Re-run compliance engine on the full annotation set
      const newComplianceIssues = validateCompliance(allAnnotations);

      // 8. Replace compliance issues: delete old ones, insert new ones
      await db
        .delete(complianceIssuesTable)
        .where(eq(complianceIssuesTable.sessionId, sessionId));

      if (newComplianceIssues.length > 0) {
        await db.insert(complianceIssuesTable).values(
          newComplianceIssues.map((issue) => ({
            sessionId,
            annotationId: issue.annotationId,
            ruleId: issue.ruleId,
            severity: issue.severity,
            description: issue.description,
          })),
        );
      }

      // 9. Update session timestamp
      await db
        .update(analysisSessions)
        .set({ updatedAt: new Date() })
        .where(eq(analysisSessions.id, sessionId));

      // 10. Return the full updated session
      const result = await loadSession(sessionId);
      res.json(result);
    } catch (err) {
      req.log.error({ err }, "Error updating annotation");
      res.status(500).json({
        error: "update_failed",
        message: "Failed to update the annotation.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/*  Type-data extraction helper                                                */
/* -------------------------------------------------------------------------- */

/**
 * Extract type-specific fields from the validated request body for storage
 * in the `typeData` JSONB column.
 */
function extractTypeDataFromBody(
  annotation: Record<string, unknown>,
): Record<string, unknown> {
  const type = annotation.type as string;

  switch (type) {
    case "dimension":
      return {
        dimensionType: annotation.dimensionType,
        nominalValue: annotation.nominalValue,
        ...(annotation.plusTolerance !== undefined
          ? { plusTolerance: annotation.plusTolerance }
          : {}),
        ...(annotation.minusTolerance !== undefined
          ? { minusTolerance: annotation.minusTolerance }
          : {}),
        ...(annotation.unit !== undefined ? { unit: annotation.unit } : {}),
      };
    case "fcf":
      return {
        geometricCharacteristic: annotation.geometricCharacteristic,
        toleranceValue: annotation.toleranceValue,
        materialCondition: annotation.materialCondition,
        datumReferences: annotation.datumReferences,
      };
    case "datum":
      return {
        datumLetter: annotation.datumLetter,
      };
    case "surface_finish":
      return {
        roughnessValue: annotation.roughnessValue,
        ...(annotation.processNote !== undefined
          ? { processNote: annotation.processNote }
          : {}),
      };
    case "note":
      return {};
    default:
      return {};
  }
}

export default router;
