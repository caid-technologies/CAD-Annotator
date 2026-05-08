/**
 * GD&T Analysis Page
 *
 * Composes all GD&T-related components into a complete analysis workflow:
 * 1. Upload a CAD drawing image (drag-and-drop or file picker)
 * 2. Trigger GD&T analysis via POST /api/analyze/gdt
 * 3. Display results: bounding box overlay, compliance summary, annotation cards,
 *    compliance popovers, DFM findings panel
 * 4. Edit annotations inline with optimistic updates
 * 5. Add new annotations by drawing bounding boxes on the image
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAnalyzeDrawingGdt } from "@workspace/api-client-react";
import type {
  GdtAnalyzeResult,
  EnrichedAnnotation,
  ComplianceIssue,
  DfmFinding,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  X,
  Loader2,
  ImageIcon,
  Layers,
  Plus,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

import { AnnotationCard } from "@/components/AnnotationCard";
import type { EnrichedAnnotation as CardAnnotation } from "@/components/AnnotationCard";
import type { ComplianceIssue as CardComplianceIssue } from "@/components/AnnotationCard";
import { BoundingBoxOverlay } from "@/components/BoundingBoxOverlay";
import { ComplianceSummaryBar } from "@/components/ComplianceSummaryBar";
import { CompliancePopover } from "@/components/CompliancePopover";
import { DfmFindingsPanel } from "@/components/DfmFindingsPanel";
import type { DfmFinding as PanelDfmFinding } from "@/components/DfmFindingsPanel";
import { AnnotationEditor } from "@/components/AnnotationEditor";
import { DrawBoundingBox } from "@/components/DrawBoundingBox";
import type { BoundingBox } from "@/components/AnnotationCard";
import { useAnnotationUpdate } from "@/hooks/use-annotation-update";

// ---------------------------------------------------------------------------
// Helpers — adapt API types to component types
// ---------------------------------------------------------------------------

/**
 * Map API EnrichedAnnotation to the component-level EnrichedAnnotation type.
 * The component types use a simpler flat structure.
 */
function toCardAnnotation(ann: EnrichedAnnotation): CardAnnotation {
  const base = {
    id: ann.id,
    label: ann.label,
    value: ann.value,
    view: ann.view,
    boundingBox: ann.boundingBox,
    confidence: ann.confidence,
    needsReview: ann.needsReview,
    description: ann.description,
  };

  switch (ann.type) {
    case "dimension":
      return {
        ...base,
        type: "dimension",
        dimensionType: ann.dimensionType,
        nominalValue: ann.nominalValue,
        plusTolerance: ann.plusTolerance,
        minusTolerance: ann.minusTolerance,
        unit: ann.unit,
      } as CardAnnotation;
    case "fcf":
      return {
        ...base,
        type: "fcf",
        geometricCharacteristic: ann.geometricCharacteristic,
        toleranceValue: ann.toleranceValue,
        materialCondition: ann.materialCondition,
        datumReferences: ann.datumReferences,
      } as CardAnnotation;
    case "datum":
      return {
        ...base,
        type: "datum",
        datumLetter: ann.datumLetter,
      } as CardAnnotation;
    case "surface_finish":
      return {
        ...base,
        type: "surface_finish",
        roughnessValue: ann.roughnessValue,
        processNote: ann.processNote,
      } as CardAnnotation;
    case "note":
      return { ...base, type: "note" } as CardAnnotation;
  }
}

function toCardIssues(issues: ComplianceIssue[]): CardComplianceIssue[] {
  return issues.map((i) => ({
    annotationId: i.annotationId,
    ruleId: i.ruleId,
    severity: i.severity as "error" | "warning",
    description: i.description,
  }));
}

function toPanelFindings(findings: DfmFinding[]): PanelDfmFinding[] {
  return findings.map((f) => ({
    id: f.id,
    category: f.category as PanelDfmFinding["category"],
    severity: f.severity as PanelDfmFinding["severity"],
    description: f.description,
    recommendation: f.recommendation,
    relatedAnnotationIds: f.relatedAnnotationIds,
  }));
}

/** Generate a random color for new bounding boxes. */
const BBOX_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
];
function randomColor(): string {
  return BBOX_COLORS[Math.floor(Math.random() * BBOX_COLORS.length)];
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function GdtAnalysis() {
  const { toast } = useToast();

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Analysis result state
  const [sessionResult, setSessionResult] = useState<GdtAnalyzeResult | null>(
    null,
  );

  // UI state
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null,
  );
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeGdt = useAnalyzeDrawingGdt();

  // Derived state
  const annotations = sessionResult?.annotations ?? [];
  const complianceIssues = sessionResult?.complianceIssues ?? [];
  const dfmFindings = sessionResult?.dfmFindings ?? [];
  const stageErrors = sessionResult?.errors ?? [];

  // Annotation update hook (only active when we have a session)
  const annotationUpdate = useAnnotationUpdate({
    sessionId: sessionResult?.sessionId ?? "",
    annotations: annotations as EnrichedAnnotation[],
    complianceIssues: complianceIssues as ComplianceIssue[],
    onSessionUpdate: (result) => {
      setSessionResult(result);
      setEditingAnnotationId(null);
      toast({
        title: "Annotation updated",
        description: "Compliance has been re-validated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message || "Could not save annotation changes.",
        variant: "destructive",
      });
    },
  });

  // Use optimistic data when available
  const displayAnnotations = sessionResult
    ? annotationUpdate.optimisticAnnotations
    : [];
  const displayIssues = sessionResult
    ? annotationUpdate.optimisticComplianceIssues
    : [];

  // Convert to component types
  const cardAnnotations = (displayAnnotations as EnrichedAnnotation[]).map(
    toCardAnnotation,
  );
  const cardIssues = toCardIssues(displayIssues as ComplianceIssue[]);
  const panelFindings = toPanelFindings(dfmFindings);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // --------------------------------------------------------------------------
  // File handling
  // --------------------------------------------------------------------------

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image file (PNG, JPG, or WEBP).",
          variant: "destructive",
        });
        return;
      }

      setImageFile(file);

      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(URL.createObjectURL(file));

      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBase64(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Clear previous results
      setSessionResult(null);
      setSelectedAnnotationId(null);
      setEditingAnnotationId(null);
      setIsDrawingMode(false);
    },
    [imagePreviewUrl, toast],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageBase64(null);
    setSessionResult(null);
    setSelectedAnnotationId(null);
    setEditingAnnotationId(null);
    setIsDrawingMode(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [imagePreviewUrl]);

  // --------------------------------------------------------------------------
  // Analysis
  // --------------------------------------------------------------------------

  const handleAnalyze = useCallback(() => {
    if (!imageBase64) return;

    analyzeGdt.mutate(
      {
        data: {
          imageData: imageBase64,
          includeDescription: true,
        },
      },
      {
        onSuccess: (data) => {
          setSessionResult(data);
          toast({
            title: "GD&T analysis complete",
            description: `Found ${data.annotations.length} annotation${data.annotations.length !== 1 ? "s" : ""}, ${data.complianceIssues.length} compliance issue${data.complianceIssues.length !== 1 ? "s" : ""}.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Analysis failed",
            description:
              error instanceof Error
                ? error.message
                : "An unexpected error occurred.",
            variant: "destructive",
          });
        },
      },
    );
  }, [imageBase64, analyzeGdt, toast]);

  // --------------------------------------------------------------------------
  // Annotation interactions
  // --------------------------------------------------------------------------

  const handleSelectAnnotation = useCallback(
    (id: string) => {
      if (isDrawingMode) return;
      setSelectedAnnotationId((prev) => (prev === id ? null : id));
      // If clicking a different annotation while editing, close editor
      if (editingAnnotationId && editingAnnotationId !== id) {
        setEditingAnnotationId(null);
      }
    },
    [isDrawingMode, editingAnnotationId],
  );

  const handleEditAnnotation = useCallback((id: string) => {
    setEditingAnnotationId(id);
    setSelectedAnnotationId(id);
  }, []);

  const handleSaveAnnotation = useCallback(
    (updated: CardAnnotation) => {
      // Convert back to API type and send update
      annotationUpdate.updateAnnotation(
        updated as unknown as EnrichedAnnotation,
      );
    },
    [annotationUpdate],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingAnnotationId(null);
  }, []);

  const handleDrawComplete = useCallback(
    (box: Omit<BoundingBox, "color">) => {
      setIsDrawingMode(false);
      // Create a new annotation stub with the drawn bounding box
      const newAnnotation: CardAnnotation = {
        id: `new-${Date.now()}`,
        type: "note",
        label: "New Annotation",
        value: "",
        view: "View 1",
        boundingBox: { ...box, color: randomColor() },
        confidence: 1.0,
        needsReview: true,
      };
      // Add to local state — user can then edit it
      if (sessionResult) {
        const updatedAnnotations = [
          ...sessionResult.annotations,
          newAnnotation as unknown as EnrichedAnnotation,
        ];
        setSessionResult({
          ...sessionResult,
          annotations: updatedAnnotations,
        });
        setEditingAnnotationId(newAnnotation.id);
        setSelectedAnnotationId(newAnnotation.id);
      }
    },
    [sessionResult],
  );

  const handleDrawCancel = useCallback(() => {
    setIsDrawingMode(false);
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const selectedAnnotation = cardAnnotations.find(
    (a) => a.id === selectedAnnotationId,
  );
  const editingAnnotation = cardAnnotations.find(
    (a) => a.id === editingAnnotationId,
  );
  const selectedIssues = selectedAnnotationId
    ? cardIssues.filter((i) => i.annotationId === selectedAnnotationId)
    : [];

  return (
    <div className="min-h-dvh bg-background flex flex-col font-sans selection:bg-primary/10">
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-transparent transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            CAD Annotator
          </h1>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Basic Analysis
          </Link>
          <span className="text-sm font-medium text-foreground">
            GD&T Analysis
          </span>
        </nav>
      </header>

      <main className="flex-1 px-8 pb-12 flex flex-col max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-12 mt-4">
          {/* Left Panel — Upload, Controls, Annotations */}
          <div className="flex flex-col gap-6">
            {/* Upload Section */}
            <UploadSection
              imageFile={imageFile}
              imagePreviewUrl={imagePreviewUrl}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onRemoveImage={handleRemoveImage}
            />

            {/* Analyze Button */}
            <Button
              data-testid="button-analyze-gdt"
              onClick={handleAnalyze}
              disabled={!imageBase64 || analyzeGdt.isPending}
              className="w-full h-12 text-sm font-medium rounded-xl shadow-sm transition-all"
            >
              {analyzeGdt.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running GD&T analysis…
                </span>
              ) : (
                "Analyze GD&T Compliance"
              )}
            </Button>

            {/* Stage Errors */}
            {stageErrors.length > 0 && (
              <div className="space-y-2">
                {stageErrors.map((err, i) => (
                  <Alert key={i} variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <span className="font-medium capitalize">
                        {err.stage}
                      </span>
                      : {err.message}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Results Panel */}
            {sessionResult && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Compliance Summary */}
                <ComplianceSummaryBar
                  annotations={cardAnnotations}
                  complianceIssues={cardIssues}
                />

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="button-add-annotation"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsDrawingMode(true);
                      setEditingAnnotationId(null);
                    }}
                    disabled={isDrawingMode}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Annotation
                  </Button>
                  {isDrawingMode && (
                    <span className="text-xs text-muted-foreground">
                      Draw a bounding box on the image…
                    </span>
                  )}
                </div>

                {/* Annotation Editor (when editing) */}
                {editingAnnotation && (
                  <AnnotationEditor
                    annotation={editingAnnotation}
                    onSave={handleSaveAnnotation}
                    onCancel={handleCancelEdit}
                    isSaving={annotationUpdate.isSaving}
                  />
                )}

                {/* Annotation Cards */}
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium">Annotations</h3>
                  <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                    {cardAnnotations.length} found
                  </span>
                </div>

                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-2 pr-2">
                    {cardAnnotations.map((ann) => {
                      const issues = cardIssues.filter(
                        (i) => i.annotationId === ann.id,
                      );
                      const hasIssues = issues.length > 0;

                      const card = (
                        <AnnotationCard
                          key={ann.id}
                          annotation={ann}
                          complianceIssues={cardIssues}
                          isSelected={selectedAnnotationId === ann.id}
                          onClick={() => handleEditAnnotation(ann.id)}
                        />
                      );

                      // Wrap non-compliant annotations in a CompliancePopover
                      if (hasIssues) {
                        return (
                          <CompliancePopover
                            key={ann.id}
                            issues={issues}
                            open={
                              selectedAnnotationId === ann.id
                                ? undefined
                                : false
                            }
                          >
                            {card}
                          </CompliancePopover>
                        );
                      }

                      return card;
                    })}
                  </div>
                </ScrollArea>

                {/* DFM Findings */}
                {panelFindings.length > 0 && (
                  <DfmFindingsPanel findings={panelFindings} />
                )}
              </div>
            )}
          </div>

          {/* Right Panel — Image Preview with Overlays */}
          <div className="flex flex-col gap-6 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Preview</h2>
            </div>

            <div className="flex-1 flex flex-col min-h-[600px] bg-muted/20 border border-border rounded-3xl overflow-hidden relative">
              {!imagePreviewUrl ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                  <Layers className="w-10 h-10 mb-4 stroke-[1.5]" />
                  <p className="text-sm">
                    Upload a drawing to start GD&T analysis
                  </p>
                </div>
              ) : (
                <ScrollArea className="flex-1 h-full w-full">
                  <div className="min-w-full min-h-full p-8 flex items-center justify-center">
                    <div className="relative inline-block">
                      <img
                        src={imagePreviewUrl}
                        alt="CAD drawing for GD&T analysis"
                        className="max-w-none w-auto max-h-[700px] rounded-sm shadow-sm"
                      />

                      {/* Bounding box overlays */}
                      {sessionResult && (
                        <BoundingBoxOverlay
                          annotations={cardAnnotations}
                          complianceIssues={cardIssues}
                          selectedAnnotationId={selectedAnnotationId}
                          onSelectAnnotation={handleSelectAnnotation}
                          hasComplianceData={true}
                        />
                      )}

                      {/* Draw bounding box mode */}
                      {isDrawingMode && (
                        <DrawBoundingBox
                          onComplete={handleDrawComplete}
                          onCancel={handleDrawCancel}
                          active={true}
                        />
                      )}
                    </div>
                  </div>
                </ScrollArea>
              )}

              {/* Loading overlay */}
              {analyzeGdt.isPending && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center z-30">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    Analyzing GD&T compliance…
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This may take a moment
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {sessionResult?.description && (
              <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border/50">
                {sessionResult.description}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Section Sub-component
// ---------------------------------------------------------------------------

interface UploadSectionProps {
  imageFile: File | null;
  imagePreviewUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveImage: () => void;
}

function UploadSection({
  imageFile,
  imagePreviewUrl,
  fileInputRef,
  onFileChange,
  onDrop,
  onDragOver,
  onRemoveImage,
}: UploadSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Upload drawing</h2>
        <p className="text-sm text-muted-foreground">
          Select a CAD file or blueprint for GD&T compliance review.
        </p>
      </div>

      {!imagePreviewUrl ? (
        <div
          data-testid="upload-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="group relative border border-dashed border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer bg-muted/30 hover:bg-muted/80 transition-all duration-300"
        >
          <div className="w-12 h-12 rounded-full bg-background border border-border flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300 shadow-sm">
            <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            Click or drag image here
          </p>
          <p className="text-xs text-muted-foreground">PNG, JPG, or WEBP</p>
        </div>
      ) : (
        <div className="group relative rounded-2xl overflow-hidden bg-muted/30 border border-border">
          <div className="aspect-video relative">
            <img
              src={imagePreviewUrl}
              alt="Uploaded CAD drawing preview"
              className="w-full h-full object-contain p-2"
            />
            <div className="absolute inset-0 bg-background/0 group-hover:bg-background/10 transition-colors duration-200" />
          </div>
          <div className="p-3 bg-background border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span
                className="text-xs font-medium truncate text-foreground"
                title={imageFile?.name}
              >
                {imageFile?.name}
              </span>
            </div>
            <Button
              data-testid="button-remove-image"
              variant="ghost"
              size="icon"
              onClick={onRemoveImage}
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <input
        data-testid="input-file"
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="image/*"
        className="hidden"
      />
    </section>
  );
}
