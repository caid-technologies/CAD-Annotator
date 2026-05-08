/**
 * Property-Based Test: SQLite Round-Trip Data Equivalence
 *
 * Feature: local-dev-setup, Property 1: SQLite round-trip data equivalence
 *
 * Validates: Requirements 4.4
 *
 * For any valid analysis session with associated annotations (of any type:
 * dimension, fcf, datum, surface_finish, note), compliance issues, and DFM
 * findings, writing the data to an in-memory SQLite database and reading it
 * back produces an equivalent object — preserving all field values including
 * JSON-serialized fields and timestamps.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";

import * as sqliteSchema from "./schema-sqlite/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE analysis_sessions (
      id TEXT PRIMARY KEY,
      image_reference TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('completed','partial','failed')),
      description TEXT,
      views TEXT NOT NULL DEFAULT '[]',
      stage_errors TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE gdt_annotations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('dimension','fcf','datum','surface_finish','note')),
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      view TEXT NOT NULL,
      bounding_box TEXT NOT NULL,
      confidence REAL NOT NULL,
      needs_review INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      type_data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE compliance_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
      annotation_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('error','warning')),
      description TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE dfm_findings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('over_tolerancing','missing_tolerance','datum_scheme_completeness','surface_finish_consistency','general')),
      severity TEXT NOT NULL CHECK(severity IN ('error','warning','info')),
      description TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      related_annotation_ids TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE annotation_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
      annotation_id TEXT NOT NULL,
      previous_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return { db: drizzle(sqlite, { schema: sqliteSchema }), sqlite };
}

/** Normalize via JSON round-trip to compare values consistently. */
function normalizeJson(val: unknown): unknown {
  return JSON.parse(JSON.stringify(val));
}

/**
 * Deep-clone a plain object to ensure standard Object prototype.
 * fast-check v4 creates records with null prototype which breaks Drizzle ORM.
 */
function fix<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val;
  if (Array.isArray(val)) return val.map(fix) as T;
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>)) {
      out[k] = fix((val as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Arbitraries (fast-check v4 API)
// ---------------------------------------------------------------------------

const arbTimestamp = fc
  .integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 })
  .map((ms) => new Date(ms));

const arbHexColor = fc
  .array(
    fc.constantFrom(
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ),
    { minLength: 6, maxLength: 6 },
  )
  .map((c) => `#${c.join("")}`);

const arbSafe = (min: number, max: number) =>
  fc.string({ minLength: min, maxLength: max, unit: "grapheme" });

const arbBoundingBox = fc
  .record({
    x: fc.float({ min: 0, max: 1000, noNaN: true }),
    y: fc.float({ min: 0, max: 1000, noNaN: true }),
    width: fc.float({ min: 1, max: 500, noNaN: true }),
    height: fc.float({ min: 1, max: 500, noNaN: true }),
    color: arbHexColor,
  })
  .map(fix);

const arbStageError = fc
  .record({
    stage: arbSafe(1, 20),
    message: arbSafe(1, 50),
  })
  .map(fix);

const arbTypeData = fc
  .oneof(
    fc.record({
      nominal: fc.float({ min: 0, max: 1000, noNaN: true }),
      upperTolerance: fc.float({ min: 0, max: 10, noNaN: true }),
      lowerTolerance: fc.float({ min: -10, max: 0, noNaN: true }),
      unit: fc.constantFrom("mm", "in"),
    }),
    fc.record({
      characteristic: arbSafe(1, 30),
      toleranceValue: fc.float({ min: 0, max: 10, noNaN: true }),
      datumReferences: fc.array(arbSafe(1, 5), { minLength: 0, maxLength: 3 }),
    }),
    fc.record({ datumLetter: fc.constantFrom("A", "B", "C", "D", "E", "F") }),
    fc.record({
      roughnessValue: fc.float({ min: 0, max: 100, noNaN: true }),
      process: arbSafe(1, 20),
    }),
    fc.record({ noteText: arbSafe(1, 100) }),
  )
  .map(fix);

const arbAnnotation = fc
  .record({
    id: fc.uuid(),
    type: fc.constantFrom(
      "dimension" as const,
      "fcf" as const,
      "datum" as const,
      "surface_finish" as const,
      "note" as const,
    ),
    label: arbSafe(1, 30),
    value: arbSafe(1, 30),
    view: arbSafe(1, 20),
    boundingBox: arbBoundingBox,
    confidence: fc.float({ min: 0, max: 1, noNaN: true }),
    needsReview: fc.boolean(),
    description: fc.option(arbSafe(1, 50), { nil: undefined }),
    typeData: arbTypeData,
    createdAt: arbTimestamp,
  })
  .map(fix);

const arbComplianceIssue = fc
  .record({
    annotationId: fc.uuid(),
    ruleId: arbSafe(1, 20),
    severity: fc.constantFrom("error" as const, "warning" as const),
    description: arbSafe(1, 100),
    createdAt: arbTimestamp,
  })
  .map(fix);

const arbDfmFinding = fc
  .record({
    id: fc.uuid(),
    category: fc.constantFrom(
      "over_tolerancing" as const,
      "missing_tolerance" as const,
      "datum_scheme_completeness" as const,
      "surface_finish_consistency" as const,
      "general" as const,
    ),
    severity: fc.constantFrom(
      "error" as const,
      "warning" as const,
      "info" as const,
    ),
    description: arbSafe(1, 100),
    recommendation: arbSafe(1, 100),
    relatedAnnotationIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    createdAt: arbTimestamp,
  })
  .map(fix);

const arbSessionData = fc
  .record({
    sessionId: fc.uuid(),
    imageReference: arbSafe(1, 50),
    status: fc.constantFrom(
      "completed" as const,
      "partial" as const,
      "failed" as const,
    ),
    description: fc.option(arbSafe(1, 100), { nil: undefined }),
    views: fc.array(arbSafe(1, 20), { minLength: 0, maxLength: 5 }),
    stageErrors: fc.array(arbStageError, { minLength: 0, maxLength: 3 }),
    createdAt: arbTimestamp,
    updatedAt: arbTimestamp,
    annotations: fc.uniqueArray(arbAnnotation, {
      minLength: 1,
      maxLength: 5,
      selector: (a) => a.id,
    }),
    complianceIssues: fc.array(arbComplianceIssue, {
      minLength: 0,
      maxLength: 3,
    }),
    dfmFindings: fc.uniqueArray(arbDfmFinding, {
      minLength: 0,
      maxLength: 3,
      selector: (d) => d.id,
    }),
  })
  .map(fix);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("Feature: local-dev-setup, Property 1: SQLite round-trip data equivalence", () => {
  it("round-trips analysis sessions with annotations, compliance issues, and DFM findings", () => {
    fc.assert(
      fc.property(arbSessionData, (data) => {
        const { db, sqlite } = createTestDb();

        try {
          // Write session
          db.insert(sqliteSchema.analysisSessions)
            .values({
              id: data.sessionId,
              imageReference: data.imageReference,
              status: data.status,
              description: data.description ?? null,
              views: data.views,
              stageErrors: data.stageErrors,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            })
            .run();

          // Write annotations
          for (const a of data.annotations) {
            db.insert(sqliteSchema.gdtAnnotations)
              .values({
                id: a.id,
                sessionId: data.sessionId,
                type: a.type,
                label: a.label,
                value: a.value,
                view: a.view,
                boundingBox: a.boundingBox,
                confidence: a.confidence,
                needsReview: a.needsReview,
                description: a.description ?? null,
                typeData: a.typeData,
                createdAt: a.createdAt,
              })
              .run();
          }

          // Write compliance issues
          for (const ci of data.complianceIssues) {
            db.insert(sqliteSchema.complianceIssues)
              .values({
                sessionId: data.sessionId,
                annotationId: ci.annotationId,
                ruleId: ci.ruleId,
                severity: ci.severity,
                description: ci.description,
                createdAt: ci.createdAt,
              })
              .run();
          }

          // Write DFM findings
          for (const dfm of data.dfmFindings) {
            db.insert(sqliteSchema.dfmFindings)
              .values({
                id: dfm.id,
                sessionId: data.sessionId,
                category: dfm.category,
                severity: dfm.severity,
                description: dfm.description,
                recommendation: dfm.recommendation,
                relatedAnnotationIds: dfm.relatedAnnotationIds,
                createdAt: dfm.createdAt,
              })
              .run();
          }

          // --- Read back & assert session ---
          const [session] = db
            .select()
            .from(sqliteSchema.analysisSessions)
            .where(eq(sqliteSchema.analysisSessions.id, data.sessionId))
            .all();

          expect(session).toBeDefined();
          expect(session!.id).toBe(data.sessionId);
          expect(session!.imageReference).toBe(data.imageReference);
          expect(session!.status).toBe(data.status);
          expect(session!.description).toBe(data.description ?? null);
          expect(normalizeJson(session!.views)).toEqual(
            normalizeJson(data.views),
          );
          expect(normalizeJson(session!.stageErrors)).toEqual(
            normalizeJson(data.stageErrors),
          );
          expect(session!.createdAt.getTime()).toBe(data.createdAt.getTime());
          expect(session!.updatedAt.getTime()).toBe(data.updatedAt.getTime());

          // --- Read back & assert annotations ---
          const anns = db
            .select()
            .from(sqliteSchema.gdtAnnotations)
            .where(eq(sqliteSchema.gdtAnnotations.sessionId, data.sessionId))
            .all();

          expect(anns).toHaveLength(data.annotations.length);
          for (const inp of data.annotations) {
            const f = anns.find((x) => x.id === inp.id)!;
            expect(f).toBeDefined();
            expect(f.type).toBe(inp.type);
            expect(f.label).toBe(inp.label);
            expect(f.value).toBe(inp.value);
            expect(f.view).toBe(inp.view);
            expect(normalizeJson(f.boundingBox)).toEqual(
              normalizeJson(inp.boundingBox),
            );
            expect(f.confidence).toBeCloseTo(inp.confidence, 5);
            expect(f.needsReview).toBe(inp.needsReview);
            expect(f.description).toBe(inp.description ?? null);
            expect(normalizeJson(f.typeData)).toEqual(
              normalizeJson(inp.typeData),
            );
            expect(f.createdAt.getTime()).toBe(inp.createdAt.getTime());
          }

          // --- Read back & assert compliance issues ---
          const issues = db
            .select()
            .from(sqliteSchema.complianceIssues)
            .where(eq(sqliteSchema.complianceIssues.sessionId, data.sessionId))
            .all();

          expect(issues).toHaveLength(data.complianceIssues.length);
          for (let i = 0; i < data.complianceIssues.length; i++) {
            const inp = data.complianceIssues[i]!;
            const f = issues[i]!;
            expect(f.annotationId).toBe(inp.annotationId);
            expect(f.ruleId).toBe(inp.ruleId);
            expect(f.severity).toBe(inp.severity);
            expect(f.description).toBe(inp.description);
            expect(f.createdAt.getTime()).toBe(inp.createdAt.getTime());
          }

          // --- Read back & assert DFM findings ---
          const findings = db
            .select()
            .from(sqliteSchema.dfmFindings)
            .where(eq(sqliteSchema.dfmFindings.sessionId, data.sessionId))
            .all();

          expect(findings).toHaveLength(data.dfmFindings.length);
          for (const inp of data.dfmFindings) {
            const f = findings.find((x) => x.id === inp.id)!;
            expect(f).toBeDefined();
            expect(f.category).toBe(inp.category);
            expect(f.severity).toBe(inp.severity);
            expect(f.description).toBe(inp.description);
            expect(f.recommendation).toBe(inp.recommendation);
            expect(normalizeJson(f.relatedAnnotationIds)).toEqual(
              normalizeJson(inp.relatedAnnotationIds),
            );
            expect(f.createdAt.getTime()).toBe(inp.createdAt.getTime());
          }
        } finally {
          sqlite.close();
        }
      }),
      { numRuns: 100 },
    );
  });
});
