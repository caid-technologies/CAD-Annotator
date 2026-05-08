/**
 * DrawBoundingBox
 *
 * Interactive overlay component for drawing a bounding box on a CAD image.
 * The user clicks and drags to define a rectangle. Returns bounding box
 * coordinates as percentages (x, y, width, height) relative to the
 * container dimensions.
 *
 * Used when adding new annotations manually.
 *
 * Features:
 * - Click-and-drag rectangle drawing
 * - Visual feedback during drawing (dashed border)
 * - Returns coordinates as percentages
 * - Overlays on top of the image
 */
import { useState, useRef, useCallback } from "react";
import type { BoundingBox } from "@/components/AnnotationCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

export interface DrawBoundingBoxProps {
  /** Called when the user finishes drawing a bounding box. */
  onComplete: (box: Omit<BoundingBox, "color">) => void;
  /** Called when the user cancels (e.g. pressing Escape). */
  onCancel?: () => void;
  /** Whether drawing mode is active. */
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DrawBoundingBox({
  onComplete,
  onCancel,
  active = true,
}: DrawBoundingBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);

  /** Convert a mouse/pointer event to percentage coordinates. */
  const toPercent = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      e.preventDefault();
      const pt = toPercent(e.clientX, e.clientY);
      if (!pt) return;
      setStartPoint(pt);
      setCurrentPoint(pt);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [active, toPercent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!startPoint) return;
      const pt = toPercent(e.clientX, e.clientY);
      if (pt) setCurrentPoint(pt);
    },
    [startPoint, toPercent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!startPoint || !currentPoint) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      // Only emit if the box has a meaningful size (> 1% in both dimensions)
      if (width > 1 && height > 1) {
        onComplete({ x, y, width, height });
      }

      setStartPoint(null);
      setCurrentPoint(null);
    },
    [startPoint, currentPoint, onComplete],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setStartPoint(null);
        setCurrentPoint(null);
        onCancel?.();
      }
    },
    [onCancel],
  );

  // Compute the preview rectangle
  const previewStyle =
    startPoint && currentPoint
      ? {
          left: `${Math.min(startPoint.x, currentPoint.x)}%`,
          top: `${Math.min(startPoint.y, currentPoint.y)}%`,
          width: `${Math.abs(currentPoint.x - startPoint.x)}%`,
          height: `${Math.abs(currentPoint.y - startPoint.y)}%`,
        }
      : null;

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      data-testid="draw-bounding-box"
      role="application"
      aria-label="Draw a bounding box by clicking and dragging"
      tabIndex={0}
      className="absolute inset-0 z-20 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      {/* Semi-transparent overlay to indicate drawing mode */}
      <div className="absolute inset-0 bg-primary/5" />

      {/* Drawing preview rectangle */}
      {previewStyle && (
        <div
          data-testid="draw-preview"
          className="absolute border-2 border-dashed border-primary bg-primary/10 rounded-[2px] pointer-events-none"
          style={previewStyle}
        />
      )}

      {/* Instruction hint */}
      {!startPoint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-sm pointer-events-none">
          <p className="text-xs text-muted-foreground">
            Click and drag to draw a bounding box · Press{" "}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
              Esc
            </kbd>{" "}
            to cancel
          </p>
        </div>
      )}
    </div>
  );
}
