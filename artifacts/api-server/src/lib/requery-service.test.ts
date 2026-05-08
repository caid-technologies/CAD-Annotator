/**
 * Property-based tests for the Re-Query Service.
 *
 * Uses fast-check and vitest. Each property test validates crop region
 * computation against randomly generated bounding boxes and image dimensions.
 */
import { describe, it, expect, vi } from "vitest";

// Mock external dependencies that are imported at module level by requery-service
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

import * as fc from "fast-check";
import { computeCropRegion, applyReQueryDecision } from "./requery-service.js";
import type { EnrichedAnnotation } from "./compliance-engine.js";

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/** Bounding box with percentage coordinates (0–100) and positive dimensions. */
const boundingBoxArb = fc.record({
  x: fc.double({ min: 0, max: 99, noNaN: true }),
  y: fc.double({ min: 0, max: 99, noNaN: true }),
  width: fc.double({ min: 0.1, max: 100, noNaN: true }),
  height: fc.double({ min: 0.1, max: 100, noNaN: true }),
});

/** Positive image dimensions in pixels. */
const imageDimensionsArb = fc.record({
  width: fc.integer({ min: 1, max: 10000 }),
  height: fc.integer({ min: 1, max: 10000 }),
});

/** The padding fraction used by the Re-Query Service. */
const CROP_PADDING = 0.15;

// ---------------------------------------------------------------------------
// Property 4: Bounding Box Crop Containment
// **Validates: Requirements 2.1**
// ---------------------------------------------------------------------------

describe("Property 4: Bounding Box Crop Containment", () => {
  it("crop region fully contains the original bounding box, is clamped to image bounds, and has positive dimensions", () => {
    fc.assert(
      fc.property(boundingBoxArb, imageDimensionsArb, (bbox, imgDims) => {
        const crop = computeCropRegion(
          bbox,
          imgDims.width,
          imgDims.height,
          CROP_PADDING,
        );

        // Convert bounding box percentage coordinates to pixels
        const bboxLeftPx = (bbox.x / 100) * imgDims.width;
        const bboxTopPx = (bbox.y / 100) * imgDims.height;
        const bboxRightPx = bboxLeftPx + (bbox.width / 100) * imgDims.width;
        const bboxBottomPx = bboxTopPx + (bbox.height / 100) * imgDims.height;

        // (a) Crop region fully contains the original bounding box.
        //     The crop uses Math.floor for left/top and Math.ceil for right/bottom,
        //     so the crop region should encompass the pixel bbox coordinates.
        expect(crop.left).toBeLessThanOrEqual(Math.floor(bboxLeftPx));
        expect(crop.top).toBeLessThanOrEqual(Math.floor(bboxTopPx));
        expect(crop.left + crop.width).toBeGreaterThanOrEqual(
          Math.min(Math.ceil(bboxRightPx), imgDims.width),
        );
        expect(crop.top + crop.height).toBeGreaterThanOrEqual(
          Math.min(Math.ceil(bboxBottomPx), imgDims.height),
        );

        // (b) Crop region is clamped within image bounds.
        expect(crop.left).toBeGreaterThanOrEqual(0);
        expect(crop.top).toBeGreaterThanOrEqual(0);
        expect(crop.left + crop.width).toBeLessThanOrEqual(imgDims.width);
        expect(crop.top + crop.height).toBeLessThanOrEqual(imgDims.height);

        // (c) Crop region has positive width and height.
        expect(crop.width).toBeGreaterThan(0);
        expect(crop.height).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Shared arbitraries for Property 9
// ---------------------------------------------------------------------------

/** Bounding box arbitrary for annotation construction. */
const annotationBoundingBoxArb = fc.record({
  x: fc.double({ min: 0, max: 80, noNaN: true }),
  y: fc.double({ min: 0, max: 80, noNaN: true }),
  width: fc.double({ min: 1, max: 20, noNaN: true }),
  height: fc.double({ min: 1, max: 20, noNaN: true }),
  color: fc.constant("#00FF00"),
});

/** Confidence score arbitrary (0–1). */
const confidenceArb = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Build a minimal valid EnrichedAnnotation (using the "note" variant for
 * simplicity — the decision logic only inspects `confidence` and `needsReview`,
 * not type-specific fields).
 */
function makeNoteAnnotation(
  overrides: Partial<{
    id: string;
    confidence: number;
    needsReview: boolean;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    };
  }>,
): EnrichedAnnotation {
  return {
    type: "note",
    id: overrides.id ?? "ann-1",
    label: "Test Note",
    value: "Some note text",
    view: "front",
    boundingBox: overrides.boundingBox ?? {
      x: 10,
      y: 10,
      width: 5,
      height: 5,
      color: "#00FF00",
    },
    confidence: overrides.confidence ?? 0.5,
    needsReview: overrides.needsReview ?? false,
  };
}

/** Arbitrary that produces a pair of (original, reQueryResult) annotations with independent confidence scores. */
const annotationPairArb = fc
  .tuple(confidenceArb, confidenceArb, annotationBoundingBoxArb)
  .map(([origConf, reqConf, bbox]) => ({
    original: makeNoteAnnotation({
      id: "orig-1",
      confidence: origConf,
      boundingBox: bbox,
    }),
    reQueryResult: makeNoteAnnotation({
      id: "requery-1",
      confidence: reqConf,
      boundingBox: bbox,
    }),
  }));

// ---------------------------------------------------------------------------
// Property 9: Re-Query Decision Logic
// **Validates: Requirements 2.3, 2.4**
// ---------------------------------------------------------------------------

describe("Property 9: Re-Query Decision Logic", () => {
  it("returns re-query result when its confidence >= 0.6", () => {
    const highConfidenceReQueryArb = fc
      .tuple(
        confidenceArb,
        fc.double({ min: 0.6, max: 1, noNaN: true, noDefaultInfinity: true }),
        annotationBoundingBoxArb,
      )
      .map(([origConf, reqConf, bbox]) => ({
        original: makeNoteAnnotation({
          id: "orig-1",
          confidence: origConf,
          boundingBox: bbox,
        }),
        reQueryResult: makeNoteAnnotation({
          id: "requery-1",
          confidence: reqConf,
          boundingBox: bbox,
        }),
      }));

    fc.assert(
      fc.property(highConfidenceReQueryArb, ({ original, reQueryResult }) => {
        const result = applyReQueryDecision(original, reQueryResult);

        // (a) Should return the re-query result when confidence >= 0.6
        expect(result.confidence).toBe(reQueryResult.confidence);
        expect(result.id).toBe(reQueryResult.id);
      }),
      { numRuns: 500 },
    );
  });

  it("returns higher-confidence annotation with needsReview = true when re-query confidence < 0.6", () => {
    const lowConfidenceReQueryArb = fc
      .tuple(
        confidenceArb,
        fc.double({
          min: 0,
          max: 0.5999999999,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        annotationBoundingBoxArb,
      )
      .map(([origConf, reqConf, bbox]) => ({
        original: makeNoteAnnotation({
          id: "orig-1",
          confidence: origConf,
          boundingBox: bbox,
        }),
        reQueryResult: makeNoteAnnotation({
          id: "requery-1",
          confidence: reqConf,
          boundingBox: bbox,
        }),
      }));

    fc.assert(
      fc.property(lowConfidenceReQueryArb, ({ original, reQueryResult }) => {
        const result = applyReQueryDecision(original, reQueryResult);

        // (b) Should return the higher-confidence annotation with needsReview = true
        const expectedConfidence = Math.max(
          original.confidence,
          reQueryResult.confidence,
        );
        expect(result.confidence).toBe(expectedConfidence);
        expect(result.needsReview).toBe(true);

        // The chosen annotation should be the one with higher confidence
        if (reQueryResult.confidence >= original.confidence) {
          expect(result.id).toBe(reQueryResult.id);
        } else {
          expect(result.id).toBe(original.id);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("output confidence is always >= the minimum of the two input confidences", () => {
    fc.assert(
      fc.property(annotationPairArb, ({ original, reQueryResult }) => {
        const result = applyReQueryDecision(original, reQueryResult);

        const minConfidence = Math.min(
          original.confidence,
          reQueryResult.confidence,
        );
        expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
      }),
      { numRuns: 500 },
    );
  });
});
