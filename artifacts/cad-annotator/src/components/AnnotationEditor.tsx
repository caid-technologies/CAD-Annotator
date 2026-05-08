/**
 * AnnotationEditor
 *
 * Inline edit form that opens when a user clicks an annotation card.
 * Pre-populated with the annotation's current fields.
 *
 * Supports all 5 annotation type variants with type-specific fields:
 * - dimension: dimensionType, nominalValue, plusTolerance, minusTolerance, unit
 * - fcf: geometricCharacteristic, toleranceValue, materialCondition, datumReferences
 * - datum: datumLetter (single uppercase A-Z)
 * - surface_finish: roughnessValue, processNote
 * - note: no additional fields beyond base
 *
 * Base fields: label, value, view, confidence
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, X } from "lucide-react";
import type { EnrichedAnnotation } from "@/components/AnnotationCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIMENSION_TYPES = ["linear", "angular", "radius", "diameter"] as const;

const GEOMETRIC_CHARACTERISTICS = [
  "position",
  "flatness",
  "straightness",
  "circularity",
  "cylindricity",
  "perpendicularity",
  "parallelism",
  "angularity",
  "profileOfLine",
  "profileOfSurface",
  "circularRunout",
  "totalRunout",
  "symmetry",
  "concentricity",
] as const;

const MATERIAL_CONDITIONS = ["MMC", "LMC", "RFS"] as const;

const CHARACTERISTIC_LABELS: Record<string, string> = {
  position: "Position",
  flatness: "Flatness",
  straightness: "Straightness",
  circularity: "Circularity",
  cylindricity: "Cylindricity",
  perpendicularity: "Perpendicularity",
  parallelism: "Parallelism",
  angularity: "Angularity",
  profileOfLine: "Profile of Line",
  profileOfSurface: "Profile of Surface",
  circularRunout: "Circular Runout",
  totalRunout: "Total Runout",
  symmetry: "Symmetry",
  concentricity: "Concentricity",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Internal form state — a flat record that holds all possible fields.
 * Type-specific fields are only relevant when the annotation type matches.
 */
interface FormState {
  // Base fields
  label: string;
  value: string;
  view: string;
  confidence: string;
  // Dimension fields
  dimensionType: string;
  nominalValue: string;
  plusTolerance: string;
  minusTolerance: string;
  unit: string;
  // FCF fields
  geometricCharacteristic: string;
  toleranceValue: string;
  materialCondition: string;
  datumRef1: string;
  datumRef2: string;
  datumRef3: string;
  // Datum fields
  datumLetter: string;
  // Surface finish fields
  roughnessValue: string;
  processNote: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build initial form state from an enriched annotation. */
function buildFormState(annotation: EnrichedAnnotation): FormState {
  const base: FormState = {
    label: annotation.label,
    value: annotation.value,
    view: annotation.view,
    confidence: String(annotation.confidence),
    dimensionType: "",
    nominalValue: "",
    plusTolerance: "",
    minusTolerance: "",
    unit: "",
    geometricCharacteristic: "",
    toleranceValue: "",
    materialCondition: "",
    datumRef1: "",
    datumRef2: "",
    datumRef3: "",
    datumLetter: "",
    roughnessValue: "",
    processNote: "",
  };

  switch (annotation.type) {
    case "dimension":
      base.dimensionType = annotation.dimensionType ?? "";
      base.nominalValue =
        annotation.nominalValue != null ? String(annotation.nominalValue) : "";
      base.plusTolerance =
        annotation.plusTolerance != null
          ? String(annotation.plusTolerance)
          : "";
      base.minusTolerance =
        annotation.minusTolerance != null
          ? String(annotation.minusTolerance)
          : "";
      base.unit = annotation.unit ?? "";
      break;
    case "fcf":
      base.geometricCharacteristic = annotation.geometricCharacteristic ?? "";
      base.toleranceValue =
        annotation.toleranceValue != null
          ? String(annotation.toleranceValue)
          : "";
      base.materialCondition = annotation.materialCondition ?? "";
      base.datumRef1 = annotation.datumReferences?.[0] ?? "";
      base.datumRef2 = annotation.datumReferences?.[1] ?? "";
      base.datumRef3 = annotation.datumReferences?.[2] ?? "";
      break;
    case "datum":
      base.datumLetter = annotation.datumLetter ?? "";
      break;
    case "surface_finish":
      base.roughnessValue =
        annotation.roughnessValue != null
          ? String(annotation.roughnessValue)
          : "";
      base.processNote = annotation.processNote ?? "";
      break;
    // note: no extra fields
  }

  return base;
}

/** Build an updated EnrichedAnnotation from form state. */
function buildAnnotation(
  original: EnrichedAnnotation,
  form: FormState,
): EnrichedAnnotation {
  const confidence = Math.max(0, Math.min(1, parseFloat(form.confidence) || 0));

  const base = {
    id: original.id,
    label: form.label,
    value: form.value,
    view: form.view,
    boundingBox: original.boundingBox,
    confidence,
    needsReview: original.needsReview,
    description: original.description,
  };

  switch (original.type) {
    case "dimension":
      return {
        ...base,
        type: "dimension",
        dimensionType: (form.dimensionType || "linear") as
          | "linear"
          | "angular"
          | "radius"
          | "diameter",
        nominalValue: parseFloat(form.nominalValue) || 0,
        plusTolerance: form.plusTolerance
          ? parseFloat(form.plusTolerance)
          : undefined,
        minusTolerance: form.minusTolerance
          ? parseFloat(form.minusTolerance)
          : undefined,
        unit: form.unit || undefined,
      };
    case "fcf": {
      const datumRefs = [form.datumRef1, form.datumRef2, form.datumRef3].filter(
        (d) => d.trim() !== "",
      );
      return {
        ...base,
        type: "fcf",
        geometricCharacteristic: (form.geometricCharacteristic ||
          "position") as (typeof GEOMETRIC_CHARACTERISTICS)[number],
        toleranceValue: parseFloat(form.toleranceValue) || 0,
        materialCondition: form.materialCondition
          ? (form.materialCondition as "MMC" | "LMC" | "RFS")
          : undefined,
        datumReferences: datumRefs,
      };
    }
    case "datum":
      return {
        ...base,
        type: "datum",
        datumLetter: form.datumLetter.toUpperCase().slice(0, 1) || "A",
      };
    case "surface_finish":
      return {
        ...base,
        type: "surface_finish",
        roughnessValue: parseFloat(form.roughnessValue) || 0,
        processNote: form.processNote || undefined,
      };
    case "note":
      return {
        ...base,
        type: "note",
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AnnotationEditorProps {
  annotation: EnrichedAnnotation;
  onSave: (updated: EnrichedAnnotation) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function AnnotationEditor({
  annotation,
  onSave,
  onCancel,
  isSaving = false,
}: AnnotationEditorProps) {
  const [form, setForm] = useState<FormState>(() => buildFormState(annotation));

  const update = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const updated = buildAnnotation(annotation, form);
    onSave(updated);
  }, [annotation, form, onSave]);

  return (
    <div
      data-testid={`annotation-editor-${annotation.id}`}
      className="rounded-xl border border-primary/30 bg-background p-4 shadow-md space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          Edit Annotation{" "}
          <span className="text-muted-foreground text-xs uppercase tracking-wider">
            ({annotation.type.replace("_", " ")})
          </span>
        </h4>
      </div>

      {/* Base fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="editor-label" className="text-xs">
            Label
          </Label>
          <Input
            id="editor-label"
            value={form.label}
            onChange={(e) => update("label", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-value" className="text-xs">
            Value
          </Label>
          <Input
            id="editor-value"
            value={form.value}
            onChange={(e) => update("value", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-view" className="text-xs">
            View
          </Label>
          <Input
            id="editor-view"
            value={form.view}
            onChange={(e) => update("view", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-confidence" className="text-xs">
            Confidence
          </Label>
          <Input
            id="editor-confidence"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={form.confidence}
            onChange={(e) => update("confidence", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Type-specific fields */}
      {annotation.type === "dimension" && (
        <DimensionFields form={form} update={update} />
      )}
      {annotation.type === "fcf" && <FcfFields form={form} update={update} />}
      {annotation.type === "datum" && (
        <DatumFields form={form} update={update} />
      )}
      {annotation.type === "surface_finish" && (
        <SurfaceFinishFields form={form} update={update} />
      )}
      {/* note type has no additional fields */}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="gap-1.5"
          data-testid="editor-save"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="gap-1.5"
          data-testid="editor-cancel"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type-specific field sub-components
// ---------------------------------------------------------------------------

interface FieldProps {
  form: FormState;
  update: (field: keyof FormState, value: string) => void;
}

function DimensionFields({ form, update }: FieldProps) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Dimension Fields
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="editor-dimensionType" className="text-xs">
            Dimension Type
          </Label>
          <Select
            value={form.dimensionType}
            onValueChange={(v) => update("dimensionType", v)}
          >
            <SelectTrigger id="editor-dimensionType" className="h-8 text-sm">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {DIMENSION_TYPES.map((dt) => (
                <SelectItem key={dt} value={dt}>
                  {dt.charAt(0).toUpperCase() + dt.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-nominalValue" className="text-xs">
            Nominal Value
          </Label>
          <Input
            id="editor-nominalValue"
            type="number"
            step="any"
            value={form.nominalValue}
            onChange={(e) => update("nominalValue", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-plusTolerance" className="text-xs">
            + Tolerance
          </Label>
          <Input
            id="editor-plusTolerance"
            type="number"
            step="any"
            value={form.plusTolerance}
            onChange={(e) => update("plusTolerance", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-minusTolerance" className="text-xs">
            − Tolerance
          </Label>
          <Input
            id="editor-minusTolerance"
            type="number"
            step="any"
            value={form.minusTolerance}
            onChange={(e) => update("minusTolerance", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="editor-unit" className="text-xs">
            Unit
          </Label>
          <Input
            id="editor-unit"
            value={form.unit}
            onChange={(e) => update("unit", e.target.value)}
            placeholder="mm, in, deg…"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function FcfFields({ form, update }: FieldProps) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        FCF Fields
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="editor-geometricCharacteristic" className="text-xs">
            Geometric Characteristic
          </Label>
          <Select
            value={form.geometricCharacteristic}
            onValueChange={(v) => update("geometricCharacteristic", v)}
          >
            <SelectTrigger
              id="editor-geometricCharacteristic"
              className="h-8 text-sm"
            >
              <SelectValue placeholder="Select characteristic" />
            </SelectTrigger>
            <SelectContent>
              {GEOMETRIC_CHARACTERISTICS.map((gc) => (
                <SelectItem key={gc} value={gc}>
                  {CHARACTERISTIC_LABELS[gc] ?? gc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-toleranceValue" className="text-xs">
            Tolerance Value
          </Label>
          <Input
            id="editor-toleranceValue"
            type="number"
            step="any"
            value={form.toleranceValue}
            onChange={(e) => update("toleranceValue", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-materialCondition" className="text-xs">
            Material Condition
          </Label>
          <Select
            value={form.materialCondition || "__none__"}
            onValueChange={(v) =>
              update("materialCondition", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger
              id="editor-materialCondition"
              className="h-8 text-sm"
            >
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {MATERIAL_CONDITIONS.map((mc) => (
                <SelectItem key={mc} value={mc}>
                  {mc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Datum References (up to 3)</Label>
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="A"
              maxLength={1}
              value={form.datumRef1}
              onChange={(e) =>
                update("datumRef1", e.target.value.toUpperCase().slice(0, 1))
              }
              className="h-8 text-sm text-center uppercase"
            />
            <Input
              placeholder="B"
              maxLength={1}
              value={form.datumRef2}
              onChange={(e) =>
                update("datumRef2", e.target.value.toUpperCase().slice(0, 1))
              }
              className="h-8 text-sm text-center uppercase"
            />
            <Input
              placeholder="C"
              maxLength={1}
              value={form.datumRef3}
              onChange={(e) =>
                update("datumRef3", e.target.value.toUpperCase().slice(0, 1))
              }
              className="h-8 text-sm text-center uppercase"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DatumFields({ form, update }: FieldProps) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Datum Fields
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="editor-datumLetter" className="text-xs">
          Datum Letter (A–Z)
        </Label>
        <Input
          id="editor-datumLetter"
          maxLength={1}
          value={form.datumLetter}
          onChange={(e) =>
            update("datumLetter", e.target.value.toUpperCase().slice(0, 1))
          }
          placeholder="A"
          className="h-8 text-sm w-20 text-center uppercase"
        />
      </div>
    </div>
  );
}

function SurfaceFinishFields({ form, update }: FieldProps) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Surface Finish Fields
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="editor-roughnessValue" className="text-xs">
            Roughness Value
          </Label>
          <Input
            id="editor-roughnessValue"
            type="number"
            step="any"
            value={form.roughnessValue}
            onChange={(e) => update("roughnessValue", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editor-processNote" className="text-xs">
            Process Note
          </Label>
          <Input
            id="editor-processNote"
            value={form.processNote}
            onChange={(e) => update("processNote", e.target.value)}
            placeholder="Optional"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
