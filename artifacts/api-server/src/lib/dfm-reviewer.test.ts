/**
 * Tests for the DFM Reviewer.
 *
 * Covers:
 * - Deterministic datum scheme completeness pre-check
 * - DFM response parsing and validation
 * - LLM prompt construction
 * - Integration of reviewDfm with mocked OpenAI
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies before importing the module under test
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  EnrichedAnnotation,
  DatumAnnotation,
  FcfAnnotation,
  DimensionAnnotation,
  SurfaceFinishAnnotation,
  NoteAnnotation,
} from "./compliance-engine.js";
import {
  checkDatumSchemeCompleteness,
  buildDfmPrompt,
  parseDfmResponse,
  parseSingleFinding,
  reviewDfm,
  type DfmFinding,
} from "./dfm-reviewer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseBoundingBox = {
  x: 10,
  y: 20,
  width: 15,
  height: 8,
  color: "green",
};

function makeDatum(letter: string, id?: string): DatumAnnotation {
  return {
    type: "datum",
    id: id ?? `datum_${letter}`,
    label: `Datum ${letter}`,
    value: letter,
    view: "Front View",
    boundingBox: baseBoundingBox,
    confidence: 0.95,
    datumLetter: letter,
  };
}

function makeFcf(overrides?: Partial<FcfAnnotation>): FcfAnnotation {
  return {
    type: "fcf",
    id: "fcf_1",
    label: "Position 0.05 MMC A B",
    value: "0.05",
    view: "Front View",
    boundingBox: baseBoundingBox,
    confidence: 0.9,
    geometricCharacteristic: "position",
    toleranceValue: 0.05,
    materialCondition: "MMC",
    datumReferences: ["A", "B"],
    ...overrides,
  };
}

function makeDimension(
  overrides?: Partial<DimensionAnnotation>,
): DimensionAnnotation {
  return {
    type: "dimension",
    id: "dim_1",
    label: "40.2 ±0.1",
    value: "40.2",
    view: "Front View",
    boundingBox: baseBoundingBox,
    confidence: 0.95,
    dimensionType: "linear",
    nominalValue: 40.2,
    plusTolerance: 0.1,
    minusTolerance: -0.1,
    unit: "mm",
    ...overrides,
  };
}

function makeSurfaceFinish(
  overrides?: Partial<SurfaceFinishAnnotation>,
): SurfaceFinishAnnotation {
  return {
    type: "surface_finish",
    id: "sf_1",
    label: "Ra 1.6",
    value: "1.6",
    view: "Front View",
    boundingBox: baseBoundingBox,
    confidence: 0.85,
    roughnessValue: 1.6,
    ...overrides,
  };
}

function makeNote(overrides?: Partial<NoteAnnotation>): NoteAnnotation {
  return {
    type: "note",
    id: "note_1",
    label: "General note",
    value: "All dimensions in mm",
    view: "Title Block",
    boundingBox: baseBoundingBox,
    confidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Deterministic Pre-Check: Datum Scheme Completeness
// ---------------------------------------------------------------------------

describe("checkDatumSchemeCompleteness", () => {
  it("returns a warning when 0 datums are present", () => {
    const annotations: EnrichedAnnotation[] = [makeDimension(), makeFcf()];
    const result = checkDatumSchemeCompleteness(annotations);

    expect(result).not.toBeNull();
    expect(result!.category).toBe("datum_scheme_completeness");
    expect(result!.severity).toBe("warning");
    expect(result!.description).toContain("No datums detected");
    expect(result!.recommendation).toBeTruthy();
  });

  it("returns a warning when 1 unique datum is present", () => {
    const annotations: EnrichedAnnotation[] = [makeDatum("A")];
    const result = checkDatumSchemeCompleteness(annotations);

    expect(result).not.toBeNull();
    expect(result!.category).toBe("datum_scheme_completeness");
    expect(result!.severity).toBe("warning");
    expect(result!.description).toContain("1 unique datum");
    expect(result!.description).toContain("A");
    expect(result!.relatedAnnotationIds).toContain("datum_A");
  });

  it("returns a warning when 2 unique datums are present", () => {
    const annotations: EnrichedAnnotation[] = [makeDatum("A"), makeDatum("B")];
    const result = checkDatumSchemeCompleteness(annotations);

    expect(result).not.toBeNull();
    expect(result!.category).toBe("datum_scheme_completeness");
    expect(result!.severity).toBe("warning");
    expect(result!.description).toContain("2 unique datum");
    expect(result!.description).toContain("A");
    expect(result!.description).toContain("B");
  });

  it("returns null when exactly 3 unique datums are present", () => {
    const annotations: EnrichedAnnotation[] = [
      makeDatum("A"),
      makeDatum("B"),
      makeDatum("C"),
    ];
    const result = checkDatumSchemeCompleteness(annotations);
    expect(result).toBeNull();
  });

  it("returns null when more than 3 unique datums are present", () => {
    const annotations: EnrichedAnnotation[] = [
      makeDatum("A"),
      makeDatum("B"),
      makeDatum("C"),
      makeDatum("D"),
    ];
    const result = checkDatumSchemeCompleteness(annotations);
    expect(result).toBeNull();
  });

  it("counts duplicate datum letters as one unique datum", () => {
    const annotations: EnrichedAnnotation[] = [
      makeDatum("A", "datum_A_1"),
      makeDatum("A", "datum_A_2"),
      makeDatum("B", "datum_B_1"),
    ];
    const result = checkDatumSchemeCompleteness(annotations);

    expect(result).not.toBeNull();
    expect(result!.description).toContain("2 unique datum");
    // All datum annotation IDs should be in relatedAnnotationIds
    expect(result!.relatedAnnotationIds).toHaveLength(3);
  });

  it("ignores non-datum annotations when counting datums", () => {
    const annotations: EnrichedAnnotation[] = [
      makeDimension(),
      makeFcf(),
      makeSurfaceFinish(),
      makeNote(),
    ];
    const result = checkDatumSchemeCompleteness(annotations);

    expect(result).not.toBeNull();
    expect(result!.description).toContain("No datums detected");
  });

  it("returns null for empty annotation array (edge case: 0 < 3 but no datums)", () => {
    // With 0 annotations, there are 0 datums which is < 3, so it should warn
    const result = checkDatumSchemeCompleteness([]);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("No datums detected");
  });
});

// ---------------------------------------------------------------------------
// LLM Prompt Construction
// ---------------------------------------------------------------------------

describe("buildDfmPrompt", () => {
  it("includes annotation data in the prompt", () => {
    const annotations: EnrichedAnnotation[] = [
      makeDatum("A"),
      makeFcf(),
      makeDimension(),
    ];
    const prompt = buildDfmPrompt(annotations);

    expect(prompt).toContain("datum");
    expect(prompt).toContain("position");
    expect(prompt).toContain("over_tolerancing");
    expect(prompt).toContain("missing_tolerance");
    expect(prompt).toContain("datum_scheme_completeness");
    expect(prompt).toContain("surface_finish_consistency");
  });

  it("includes type-specific fields for each annotation type", () => {
    const annotations: EnrichedAnnotation[] = [
      makeDimension({ nominalValue: 42.5, unit: "mm" }),
      makeFcf({ geometricCharacteristic: "flatness", toleranceValue: 0.01 }),
      makeDatum("B"),
      makeSurfaceFinish({ roughnessValue: 3.2, processNote: "Milled" }),
      makeNote(),
    ];
    const prompt = buildDfmPrompt(annotations);

    expect(prompt).toContain("42.5");
    expect(prompt).toContain("flatness");
    expect(prompt).toContain("3.2");
    expect(prompt).toContain("Milled");
  });

  it("returns a valid string for empty annotations", () => {
    const prompt = buildDfmPrompt([]);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("[]");
  });
});

// ---------------------------------------------------------------------------
// Response Parsing & Validation
// ---------------------------------------------------------------------------

describe("parseDfmResponse", () => {
  const validIds = new Set(["ann_1", "ann_2", "ann_3"]);

  it("parses a valid LLM response with multiple findings", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "over_tolerancing",
          severity: "warning",
          description: "Multiple tight tolerances detected",
          recommendation: "Consider relaxing non-critical tolerances",
          relatedAnnotationIds: ["ann_1", "ann_2"],
        },
        {
          id: "dfm_2",
          category: "missing_tolerance",
          severity: "error",
          description: "Critical feature lacks tolerance",
          recommendation: "Add position tolerance to feature",
          relatedAnnotationIds: ["ann_3"],
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(2);
    expect(findings[0].category).toBe("over_tolerancing");
    expect(findings[0].relatedAnnotationIds).toEqual(["ann_1", "ann_2"]);
    expect(findings[1].category).toBe("missing_tolerance");
  });

  it("handles JSON wrapped in markdown code fences", () => {
    const content = `\`\`\`json
{
  "findings": [
    {
      "id": "dfm_1",
      "category": "general",
      "severity": "info",
      "description": "Drawing looks good",
      "recommendation": "No changes needed"
    }
  ]
}
\`\`\``;

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("general");
  });

  it("filters out findings with invalid category", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "invalid_category",
          severity: "warning",
          description: "Some issue",
          recommendation: "Fix it",
        },
        {
          id: "dfm_2",
          category: "over_tolerancing",
          severity: "warning",
          description: "Valid issue",
          recommendation: "Fix it properly",
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("dfm_2");
  });

  it("filters out findings with invalid severity", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "over_tolerancing",
          severity: "critical",
          description: "Some issue",
          recommendation: "Fix it",
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(0);
  });

  it("filters out findings with empty description", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "over_tolerancing",
          severity: "warning",
          description: "",
          recommendation: "Fix it",
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(0);
  });

  it("filters out findings with empty recommendation", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "over_tolerancing",
          severity: "warning",
          description: "Some issue",
          recommendation: "",
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(0);
  });

  it("generates fallback IDs for findings without id", () => {
    const content = JSON.stringify({
      findings: [
        {
          category: "general",
          severity: "info",
          description: "No id provided",
          recommendation: "Add an id",
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("dfm_1");
  });

  it("filters relatedAnnotationIds to only valid IDs", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "over_tolerancing",
          severity: "warning",
          description: "Issue found",
          recommendation: "Fix it",
          relatedAnnotationIds: ["ann_1", "invalid_id", "ann_3"],
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedAnnotationIds).toEqual(["ann_1", "ann_3"]);
  });

  it("omits relatedAnnotationIds when all references are invalid", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "over_tolerancing",
          severity: "warning",
          description: "Issue found",
          recommendation: "Fix it",
          relatedAnnotationIds: ["invalid_1", "invalid_2"],
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedAnnotationIds).toBeUndefined();
  });

  it("returns empty array for completely invalid JSON", () => {
    const findings = parseDfmResponse("not json at all", validIds);
    expect(findings).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const findings = parseDfmResponse("", validIds);
    expect(findings).toHaveLength(0);
  });

  it("returns empty array when findings is not an array", () => {
    const content = JSON.stringify({ findings: "not an array" });
    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(0);
  });

  it("trims whitespace from description and recommendation", () => {
    const content = JSON.stringify({
      findings: [
        {
          id: "dfm_1",
          category: "general",
          severity: "info",
          description: "  padded description  ",
          recommendation: "  padded recommendation  ",
        },
      ],
    });

    const findings = parseDfmResponse(content, validIds);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toBe("padded description");
    expect(findings[0].recommendation).toBe("padded recommendation");
  });
});

// ---------------------------------------------------------------------------
// parseSingleFinding
// ---------------------------------------------------------------------------

describe("parseSingleFinding", () => {
  const validIds = new Set(["ann_1"]);

  it("returns null for null input", () => {
    expect(
      parseSingleFinding(
        null as unknown as Record<string, unknown>,
        0,
        validIds,
      ),
    ).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(
      parseSingleFinding(
        "string" as unknown as Record<string, unknown>,
        0,
        validIds,
      ),
    ).toBeNull();
  });

  it("returns null when category is missing", () => {
    const raw = {
      severity: "warning",
      description: "desc",
      recommendation: "rec",
    };
    expect(parseSingleFinding(raw, 0, validIds)).toBeNull();
  });

  it("returns null when severity is missing", () => {
    const raw = {
      category: "general",
      description: "desc",
      recommendation: "rec",
    };
    expect(parseSingleFinding(raw, 0, validIds)).toBeNull();
  });

  it("accepts all valid categories", () => {
    const categories = [
      "over_tolerancing",
      "missing_tolerance",
      "datum_scheme_completeness",
      "surface_finish_consistency",
      "general",
    ];
    for (const category of categories) {
      const raw = {
        category,
        severity: "info",
        description: "desc",
        recommendation: "rec",
      };
      const result = parseSingleFinding(raw, 0, validIds);
      expect(result).not.toBeNull();
      expect(result!.category).toBe(category);
    }
  });

  it("accepts all valid severities", () => {
    const severities = ["error", "warning", "info"];
    for (const severity of severities) {
      const raw = {
        category: "general",
        severity,
        description: "desc",
        recommendation: "rec",
      };
      const result = parseSingleFinding(raw, 0, validIds);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe(severity);
    }
  });
});

// ---------------------------------------------------------------------------
// reviewDfm (integration with mocked OpenAI)
// ---------------------------------------------------------------------------

describe("reviewDfm", () => {
  const mockCreate = openai.chat.completions.create as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes deterministic datum scheme finding when < 3 datums", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ findings: [] }),
          },
        },
      ],
    });

    const annotations: EnrichedAnnotation[] = [
      makeDatum("A"),
      makeDatum("B"),
      makeFcf(),
    ];

    const findings = await reviewDfm(annotations);

    // Should have the deterministic datum scheme completeness finding
    const datumFinding = findings.find(
      (f) => f.category === "datum_scheme_completeness",
    );
    expect(datumFinding).toBeDefined();
    expect(datumFinding!.severity).toBe("warning");
    expect(datumFinding!.id).toBe("dfm_datum_scheme_completeness");
  });

  it("does not include datum scheme finding when >= 3 datums", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ findings: [] }),
          },
        },
      ],
    });

    const annotations: EnrichedAnnotation[] = [
      makeDatum("A"),
      makeDatum("B"),
      makeDatum("C"),
      makeFcf(),
    ];

    const findings = await reviewDfm(annotations);

    const datumFinding = findings.find(
      (f) =>
        f.category === "datum_scheme_completeness" &&
        f.id === "dfm_datum_scheme_completeness",
    );
    expect(datumFinding).toBeUndefined();
  });

  it("merges LLM findings with deterministic findings", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              findings: [
                {
                  id: "dfm_llm_1",
                  category: "over_tolerancing",
                  severity: "warning",
                  description: "Tight tolerances detected",
                  recommendation: "Relax tolerances",
                  relatedAnnotationIds: ["fcf_1"],
                },
              ],
            }),
          },
        },
      ],
    });

    const annotations: EnrichedAnnotation[] = [makeDatum("A"), makeFcf()];

    const findings = await reviewDfm(annotations);

    // Should have both deterministic and LLM findings
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(
      findings.some((f) => f.category === "datum_scheme_completeness"),
    ).toBe(true);
    expect(findings.some((f) => f.category === "over_tolerancing")).toBe(true);
  });

  it("deduplicates datum_scheme_completeness from LLM when deterministic check already produced one", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              findings: [
                {
                  id: "dfm_llm_datum",
                  category: "datum_scheme_completeness",
                  severity: "error",
                  description: "LLM also found datum issue",
                  recommendation: "Add more datums",
                },
                {
                  id: "dfm_llm_other",
                  category: "general",
                  severity: "info",
                  description: "General observation",
                  recommendation: "No action needed",
                },
              ],
            }),
          },
        },
      ],
    });

    const annotations: EnrichedAnnotation[] = [makeDatum("A")];

    const findings = await reviewDfm(annotations);

    // Should have exactly one datum_scheme_completeness finding (the deterministic one)
    const datumFindings = findings.filter(
      (f) => f.category === "datum_scheme_completeness",
    );
    expect(datumFindings).toHaveLength(1);
    expect(datumFindings[0].id).toBe("dfm_datum_scheme_completeness");

    // The general finding from LLM should still be included
    expect(findings.some((f) => f.category === "general")).toBe(true);
  });

  it("returns only deterministic findings when LLM call fails", async () => {
    mockCreate.mockRejectedValue(new Error("API error"));

    const annotations: EnrichedAnnotation[] = [makeDatum("A"), makeFcf()];

    const findings = await reviewDfm(annotations);

    // Should still have the deterministic datum scheme finding
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("datum_scheme_completeness");
  });

  it("calls OpenAI with the correct model", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ findings: [] }),
          },
        },
      ],
    });

    await reviewDfm([makeDatum("A")]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBeDefined();
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[1].role).toBe("user");
  });

  it("handles empty choices from OpenAI", async () => {
    mockCreate.mockResolvedValue({
      choices: [],
    });

    const annotations: EnrichedAnnotation[] = [makeDatum("A")];
    const findings = await reviewDfm(annotations);

    // Should still have deterministic finding
    expect(
      findings.some((f) => f.category === "datum_scheme_completeness"),
    ).toBe(true);
  });
});
