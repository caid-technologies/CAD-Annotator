/**
 * Tests for GD&T Detection Prompts & Response Parsing
 *
 * Covers the GD&T system prompt export, the focused re-query prompt builder,
 * and the response parsing logic that maps raw LLM JSON to validated
 * EnrichedAnnotation objects.
 */
import { describe, it, expect } from "vitest";
import {
  GDT_SYSTEM_PROMPT,
  buildFocusedReQueryPrompt,
  parseGdtResponse,
  parseAnnotation,
  type ParsedGdtResponse,
} from "./gdt-prompts.js";
import type {
  EnrichedAnnotation,
  DimensionAnnotation,
  FcfAnnotation,
  DatumAnnotation,
  SurfaceFinishAnnotation,
  NoteAnnotation,
} from "./compliance-engine.js";

// ---------------------------------------------------------------------------
// GD&T System Prompt
// ---------------------------------------------------------------------------

describe("GDT_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof GDT_SYSTEM_PROMPT).toBe("string");
    expect(GDT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions all 5 annotation types", () => {
    expect(GDT_SYSTEM_PROMPT).toContain('"dimension"');
    expect(GDT_SYSTEM_PROMPT).toContain('"fcf"');
    expect(GDT_SYSTEM_PROMPT).toContain('"datum"');
    expect(GDT_SYSTEM_PROMPT).toContain('"surface_finish"');
    expect(GDT_SYSTEM_PROMPT).toContain('"note"');
  });

  it("mentions confidence scoring", () => {
    expect(GDT_SYSTEM_PROMPT).toContain("confidence");
    expect(GDT_SYSTEM_PROMPT).toContain("0.0");
    expect(GDT_SYSTEM_PROMPT).toContain("1.0");
  });

  it("mentions bounding box percentage coordinates", () => {
    expect(GDT_SYSTEM_PROMPT).toContain("percentage");
    expect(GDT_SYSTEM_PROMPT).toContain("boundingBox");
  });
});

// ---------------------------------------------------------------------------
// Focused Re-Query Prompt Builder
// ---------------------------------------------------------------------------

describe("buildFocusedReQueryPrompt", () => {
  it("includes the type hint in the prompt", () => {
    const prompt = buildFocusedReQueryPrompt("fcf", "Position", "0.05");
    expect(prompt).toContain("fcf");
    expect(prompt).toContain("Position");
    expect(prompt).toContain("0.05");
  });

  it("includes dimension-specific instructions for dimension type", () => {
    const prompt = buildFocusedReQueryPrompt("dimension", "40.2", "40.2");
    expect(prompt).toContain("DIMENSION");
    expect(prompt).toContain("dimensionType");
    expect(prompt).toContain("nominalValue");
  });

  it("includes FCF-specific instructions for fcf type", () => {
    const prompt = buildFocusedReQueryPrompt("fcf", "Position", "0.05");
    expect(prompt).toContain("FEATURE CONTROL FRAME");
    expect(prompt).toContain("geometricCharacteristic");
    expect(prompt).toContain("datumReferences");
  });

  it("includes datum-specific instructions for datum type", () => {
    const prompt = buildFocusedReQueryPrompt("datum", "Datum A", "A");
    expect(prompt).toContain("DATUM");
    expect(prompt).toContain("datumLetter");
  });

  it("includes surface finish instructions for surface_finish type", () => {
    const prompt = buildFocusedReQueryPrompt("surface_finish", "Ra 1.6", "1.6");
    expect(prompt).toContain("SURFACE FINISH");
    expect(prompt).toContain("roughnessValue");
  });

  it("includes note instructions for note type", () => {
    const prompt = buildFocusedReQueryPrompt("note", "Note 1", "text");
    expect(prompt).toContain("NOTE");
  });

  it("always includes confidence instructions", () => {
    for (const type of [
      "dimension",
      "fcf",
      "datum",
      "surface_finish",
      "note",
    ] as const) {
      const prompt = buildFocusedReQueryPrompt(type, "label", "value");
      expect(prompt).toContain("confidence");
    }
  });
});

// ---------------------------------------------------------------------------
// Response Parsing — parseGdtResponse
// ---------------------------------------------------------------------------

describe("parseGdtResponse", () => {
  it("parses a valid dimension annotation", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "dimension",
          label: "40.2 ±0.1",
          value: "40.2",
          view: "Front View",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 0.95,
          dimensionType: "linear",
          nominalValue: 40.2,
          plusTolerance: 0.1,
          minusTolerance: -0.1,
          unit: "mm",
        },
      ],
      views: ["Front View"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);

    const ann = result.annotations[0] as DimensionAnnotation;
    expect(ann.type).toBe("dimension");
    expect(ann.dimensionType).toBe("linear");
    expect(ann.nominalValue).toBe(40.2);
    expect(ann.plusTolerance).toBe(0.1);
    expect(ann.minusTolerance).toBe(-0.1);
    expect(ann.unit).toBe("mm");
    expect(ann.confidence).toBe(0.95);
  });

  it("parses a valid FCF annotation", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_2",
          type: "fcf",
          label: "Position 0.05 MMC A B C",
          value: "0.05",
          view: "Front View",
          boundingBox: {
            x: 30,
            y: 40,
            width: 20,
            height: 6,
            color: "blue",
          },
          confidence: 0.88,
          geometricCharacteristic: "position",
          toleranceValue: 0.05,
          materialCondition: "MMC",
          datumReferences: ["A", "B", "C"],
        },
      ],
      views: ["Front View"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);

    const ann = result.annotations[0] as FcfAnnotation;
    expect(ann.type).toBe("fcf");
    expect(ann.geometricCharacteristic).toBe("position");
    expect(ann.toleranceValue).toBe(0.05);
    expect(ann.materialCondition).toBe("MMC");
    expect(ann.datumReferences).toEqual(["A", "B", "C"]);
  });

  it("parses a valid datum annotation", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_3",
          type: "datum",
          label: "Datum A",
          value: "A",
          view: "Front View",
          boundingBox: { x: 50, y: 60, width: 5, height: 5, color: "red" },
          confidence: 0.97,
          datumLetter: "A",
        },
      ],
      views: ["Front View"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);

    const ann = result.annotations[0] as DatumAnnotation;
    expect(ann.type).toBe("datum");
    expect(ann.datumLetter).toBe("A");
  });

  it("parses a valid surface_finish annotation", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_4",
          type: "surface_finish",
          label: "Ra 1.6",
          value: "1.6",
          view: "Front View",
          boundingBox: {
            x: 70,
            y: 30,
            width: 8,
            height: 8,
            color: "orange",
          },
          confidence: 0.82,
          roughnessValue: 1.6,
          processNote: "Ground",
        },
      ],
      views: ["Front View"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);

    const ann = result.annotations[0] as SurfaceFinishAnnotation;
    expect(ann.type).toBe("surface_finish");
    expect(ann.roughnessValue).toBe(1.6);
    expect(ann.processNote).toBe("Ground");
  });

  it("parses a valid note annotation", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_5",
          type: "note",
          label: "UNLESS OTHERWISE SPECIFIED",
          value: "UNLESS OTHERWISE SPECIFIED, DIMENSIONS ARE IN MM",
          view: "Title Block",
          boundingBox: {
            x: 5,
            y: 90,
            width: 30,
            height: 5,
            color: "purple",
          },
          confidence: 0.9,
        },
      ],
      views: ["Title Block"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);

    const ann = result.annotations[0] as NoteAnnotation;
    expect(ann.type).toBe("note");
    expect(ann.label).toBe("UNLESS OTHERWISE SPECIFIED");
  });

  it("handles JSON wrapped in markdown code fences", () => {
    const content = `\`\`\`json
{
  "annotations": [
    {
      "id": "ann_1",
      "type": "note",
      "label": "Test",
      "value": "Test value",
      "view": "View 1",
      "boundingBox": { "x": 10, "y": 20, "width": 15, "height": 8, "color": "green" },
      "confidence": 0.9
    }
  ],
  "views": ["View 1"]
}
\`\`\``;

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].type).toBe("note");
  });

  it("drops annotations with invalid type", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "invalid_type",
          label: "Test",
          value: "Test",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 0.9,
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(0);
  });

  it("drops annotations with missing bounding box", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "note",
          label: "Test",
          value: "Test",
          view: "View 1",
          confidence: 0.9,
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(0);
  });

  it("clamps confidence to [0, 1]", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "note",
          label: "Test",
          value: "Test",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 1.5,
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations[0].confidence).toBe(1);
  });

  it("defaults confidence to 0.5 when missing", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "note",
          label: "Test",
          value: "Test",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations[0].confidence).toBe(0.5);
  });

  it("assigns auto-generated IDs when missing", () => {
    const content = JSON.stringify({
      annotations: [
        {
          type: "note",
          label: "Test",
          value: "Test",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 0.9,
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations[0].id).toBe("ann_1");
  });

  it("defaults views to ['View 1'] when missing", () => {
    const content = JSON.stringify({
      annotations: [],
    });

    const result = parseGdtResponse(content);
    expect(result.views).toEqual(["View 1"]);
  });

  it("returns empty annotations for unparseable JSON", () => {
    const result = parseGdtResponse("this is not json at all");
    expect(result.annotations).toHaveLength(0);
    expect(result.views).toEqual(["View 1"]);
  });

  it("returns empty annotations for empty string", () => {
    const result = parseGdtResponse("");
    expect(result.annotations).toHaveLength(0);
  });

  it("drops FCF annotations with invalid geometricCharacteristic", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "fcf",
          label: "Test",
          value: "0.05",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "blue",
          },
          confidence: 0.9,
          geometricCharacteristic: "invalid_gc",
          toleranceValue: 0.05,
          materialCondition: null,
          datumReferences: [],
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(0);
  });

  it("drops dimension annotations with missing nominalValue", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "dimension",
          label: "Test",
          value: "40.2",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 0.9,
          dimensionType: "linear",
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(0);
  });

  it("drops datum annotations with invalid datumLetter", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "datum",
          label: "Datum",
          value: "a",
          view: "View 1",
          boundingBox: { x: 10, y: 20, width: 5, height: 5, color: "red" },
          confidence: 0.9,
          datumLetter: "a",
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(0);
  });

  it("drops surface_finish annotations with missing roughnessValue", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "surface_finish",
          label: "Ra",
          value: "1.6",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 8,
            height: 8,
            color: "orange",
          },
          confidence: 0.9,
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(0);
  });

  it("filters invalid datum references in FCF (non-uppercase single letters)", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "fcf",
          label: "Position",
          value: "0.05",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "blue",
          },
          confidence: 0.9,
          geometricCharacteristic: "position",
          toleranceValue: 0.05,
          materialCondition: null,
          datumReferences: ["A", "invalid", "B", 123, "C"],
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);
    const fcf = result.annotations[0] as FcfAnnotation;
    expect(fcf.datumReferences).toEqual(["A", "B", "C"]);
  });

  it("truncates datum references to max 3", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "fcf",
          label: "Position",
          value: "0.05",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "blue",
          },
          confidence: 0.9,
          geometricCharacteristic: "position",
          toleranceValue: 0.05,
          materialCondition: null,
          datumReferences: ["A", "B", "C", "D"],
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    const fcf = result.annotations[0] as FcfAnnotation;
    expect(fcf.datumReferences).toHaveLength(3);
    expect(fcf.datumReferences).toEqual(["A", "B", "C"]);
  });

  it("parses a mixed response with all 5 annotation types", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "dimension",
          label: "40.2",
          value: "40.2",
          view: "Front",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 0.95,
          dimensionType: "linear",
          nominalValue: 40.2,
        },
        {
          id: "ann_2",
          type: "fcf",
          label: "Position",
          value: "0.05",
          view: "Front",
          boundingBox: {
            x: 30,
            y: 40,
            width: 20,
            height: 6,
            color: "blue",
          },
          confidence: 0.88,
          geometricCharacteristic: "position",
          toleranceValue: 0.05,
          materialCondition: "MMC",
          datumReferences: ["A", "B"],
        },
        {
          id: "ann_3",
          type: "datum",
          label: "Datum A",
          value: "A",
          view: "Front",
          boundingBox: { x: 50, y: 60, width: 5, height: 5, color: "red" },
          confidence: 0.97,
          datumLetter: "A",
        },
        {
          id: "ann_4",
          type: "surface_finish",
          label: "Ra 1.6",
          value: "1.6",
          view: "Front",
          boundingBox: {
            x: 70,
            y: 30,
            width: 8,
            height: 8,
            color: "orange",
          },
          confidence: 0.82,
          roughnessValue: 1.6,
        },
        {
          id: "ann_5",
          type: "note",
          label: "Note",
          value: "All dims in mm",
          view: "Title",
          boundingBox: {
            x: 5,
            y: 90,
            width: 30,
            height: 5,
            color: "purple",
          },
          confidence: 0.9,
        },
      ],
      views: ["Front", "Title"],
      description: "Test drawing",
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(5);
    expect(result.annotations.map((a) => a.type)).toEqual([
      "dimension",
      "fcf",
      "datum",
      "surface_finish",
      "note",
    ]);
    expect(result.views).toEqual(["Front", "Title"]);
    expect(result.description).toBe("Test drawing");
  });

  it("clamps bounding box coordinates to valid ranges", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "note",
          label: "Test",
          value: "Test",
          view: "View 1",
          boundingBox: {
            x: -5,
            y: 120,
            width: 15,
            height: 8,
            color: "green",
          },
          confidence: 0.9,
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].boundingBox.x).toBe(0);
    expect(result.annotations[0].boundingBox.y).toBe(100);
  });

  it("sets FCF materialCondition to null for invalid values", () => {
    const content = JSON.stringify({
      annotations: [
        {
          id: "ann_1",
          type: "fcf",
          label: "Position",
          value: "0.05",
          view: "View 1",
          boundingBox: {
            x: 10,
            y: 20,
            width: 15,
            height: 8,
            color: "blue",
          },
          confidence: 0.9,
          geometricCharacteristic: "position",
          toleranceValue: 0.05,
          materialCondition: "INVALID",
          datumReferences: ["A", "B"],
        },
      ],
      views: ["View 1"],
    });

    const result = parseGdtResponse(content);
    const fcf = result.annotations[0] as FcfAnnotation;
    expect(fcf.materialCondition).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseAnnotation — edge cases
// ---------------------------------------------------------------------------

describe("parseAnnotation", () => {
  it("returns null for null input", () => {
    expect(
      parseAnnotation(null as unknown as Record<string, unknown>, 0),
    ).toBeNull();
  });

  it("returns null for annotation with zero-width bounding box", () => {
    const raw = {
      id: "ann_1",
      type: "note",
      label: "Test",
      value: "Test",
      view: "View 1",
      boundingBox: { x: 10, y: 20, width: 0, height: 8, color: "green" },
      confidence: 0.9,
    };
    expect(parseAnnotation(raw, 0)).toBeNull();
  });

  it("returns null for annotation with zero-height bounding box", () => {
    const raw = {
      id: "ann_1",
      type: "note",
      label: "Test",
      value: "Test",
      view: "View 1",
      boundingBox: { x: 10, y: 20, width: 15, height: 0, color: "green" },
      confidence: 0.9,
    };
    expect(parseAnnotation(raw, 0)).toBeNull();
  });
});
