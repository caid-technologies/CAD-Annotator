/**
 * Home Page — CAD Drawing Annotator
 *
 * The main application screen. Users can:
 * 1. Upload a CAD drawing (drag-and-drop or file picker)
 * 2. Configure analysis options (detailed descriptions, baseline mode)
 * 3. Trigger AI-powered analysis via the API
 * 4. View extracted annotations as interactive bounding boxes over the image
 * 5. Click annotations to highlight them in both the image and the results list
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAnalyzeDrawing } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, X, Loader2, ImageIcon, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  AnalyzeDrawingResult,
  Annotation,
} from "@workspace/api-client-react";

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const { toast } = useToast();

  /* ---- Image state ---- */
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  /* ---- Analysis options ---- */
  const [includeDescription, setIncludeDescription] = useState(false);
  const [baselineMode, setBaselineMode] = useState(false);

  /* ---- Results state ---- */
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [analysisResult, setAnalysisResult] =
    useState<AnalyzeDrawingResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeDrawing = useAnalyzeDrawing();

  /* -------------------------------------------------------------------------- */
  /*  Clean up object URLs to prevent memory leaks                              */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  /* -------------------------------------------------------------------------- */
  /*  File handling                                                              */
  /* -------------------------------------------------------------------------- */

  /**
   * Validates and processes an uploaded image file:
   * - Creates a preview URL for display
   * - Reads the file as base64 for the API request
   * - Resets any previous analysis results
   */
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

      // Revoke the previous object URL before creating a new one
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(URL.createObjectURL(file));

      // Read the file as a base64 data URI for the API request
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBase64(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Clear previous results
      setAnalysisResult(null);
      setSelectedAnnotationId(null);
    },
    [imagePreviewUrl, toast],
  );

  /** Handle file input change event. */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  /** Handle drag-and-drop file upload. */
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  /** Prevent default browser behaviour on drag over. */
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  /** Remove the uploaded image and reset all state. */
  const handleRemoveImage = useCallback(() => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageBase64(null);
    setAnalysisResult(null);
    setSelectedAnnotationId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [imagePreviewUrl]);

  /* -------------------------------------------------------------------------- */
  /*  Analysis                                                                   */
  /* -------------------------------------------------------------------------- */

  /** Send the uploaded image to the API for AI-powered analysis. */
  const handleGenerate = useCallback(() => {
    if (!imageBase64) return;

    analyzeDrawing.mutate(
      {
        data: {
          imageData: imageBase64,
          includeDescription,
          baselineMode,
        },
      },
      {
        onSuccess: (data) => {
          setAnalysisResult(data);
          toast({
            title: "Analysis complete",
            description: `Found ${data.annotations.length} annotation${data.annotations.length !== 1 ? "s" : ""}.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Analysis failed",
            description: error.message || "An unexpected error occurred.",
            variant: "destructive",
          });
        },
      },
    );
  }, [imageBase64, includeDescription, baselineMode, analyzeDrawing, toast]);

  /* -------------------------------------------------------------------------- */
  /*  Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-dvh bg-background flex flex-col font-sans selection:bg-primary/10">
      {/* ------------------------------------------------------------------ */}
      {/*  Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="px-8 py-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-transparent transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            CAD Annotator
          </h1>
        </div>
      </header>

      <main className="flex-1 px-8 pb-12 flex flex-col max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-12 mt-4">
          {/* ---------------------------------------------------------------- */}
          {/*  Left Panel — Upload & Options                                   */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-10">
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

            {/* Options & Generate Button */}
            <OptionsSection
              includeDescription={includeDescription}
              baselineMode={baselineMode}
              isPending={analyzeDrawing.isPending}
              hasImage={!!imageBase64}
              onToggleDescription={setIncludeDescription}
              onToggleBaseline={setBaselineMode}
              onGenerate={handleGenerate}
            />
          </div>

          {/* ---------------------------------------------------------------- */}
          {/*  Right Panel — Preview & Results                                 */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-6 min-w-0">
            <PreviewHeader
              hasResult={!!analysisResult}
              showBoxes={showBoxes}
              onToggleBoxes={setShowBoxes}
            />

            <PreviewCanvas
              imagePreviewUrl={imagePreviewUrl}
              showBoxes={showBoxes}
              annotations={analysisResult?.annotations}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={setSelectedAnnotationId}
            />

            {/* Annotation Results */}
            {analysisResult && (
              <AnnotationResults
                result={analysisResult}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={setSelectedAnnotationId}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ========================================================================== */
/*  Sub-components                                                             */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/*  Upload Section                                                             */
/* -------------------------------------------------------------------------- */

interface UploadSectionProps {
  imageFile: File | null;
  imagePreviewUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveImage: () => void;
}

/** Drag-and-drop upload zone with image preview. */
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
          Select a CAD file or blueprint to analyze.
        </p>
      </div>

      {!imagePreviewUrl ? (
        /* Drop zone — shown when no image is loaded */
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
        /* Image preview — shown after upload */
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

      {/* Hidden file input — triggered by the drop zone click */}
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

/* -------------------------------------------------------------------------- */
/*  Options Section                                                            */
/* -------------------------------------------------------------------------- */

interface OptionsSectionProps {
  includeDescription: boolean;
  baselineMode: boolean;
  isPending: boolean;
  hasImage: boolean;
  onToggleDescription: (value: boolean) => void;
  onToggleBaseline: (value: boolean) => void;
  onGenerate: () => void;
}

/** Analysis configuration toggles and the generate button. */
function OptionsSection({
  includeDescription,
  baselineMode,
  isPending,
  hasImage,
  onToggleDescription,
  onToggleBaseline,
  onGenerate,
}: OptionsSectionProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 p-5 rounded-2xl bg-muted/30 border border-border/50">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="include-description"
            className="text-sm font-medium cursor-pointer text-foreground"
          >
            Detailed descriptions
          </Label>
          <Switch
            data-testid="toggle-include-description"
            id="include-description"
            checked={includeDescription}
            onCheckedChange={onToggleDescription}
          />
        </div>
        <div className="h-px w-full bg-border/50" />
        <div className="flex items-center justify-between">
          <Label
            htmlFor="baseline-mode"
            className="text-sm font-medium cursor-pointer text-foreground"
          >
            Fast baseline mode
          </Label>
          <Switch
            data-testid="toggle-baseline-mode"
            id="baseline-mode"
            checked={baselineMode}
            onCheckedChange={onToggleBaseline}
          />
        </div>
      </div>

      <Button
        data-testid="button-generate"
        onClick={onGenerate}
        disabled={!hasImage || isPending}
        className="w-full h-12 text-sm font-medium rounded-xl shadow-sm transition-all"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing drawing...
          </span>
        ) : (
          "Generate Annotations"
        )}
      </Button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview Header                                                             */
/* -------------------------------------------------------------------------- */

interface PreviewHeaderProps {
  hasResult: boolean;
  showBoxes: boolean;
  onToggleBoxes: (value: boolean) => void;
}

/** Header row above the preview canvas with the "Show boxes" toggle. */
function PreviewHeader({
  hasResult,
  showBoxes,
  onToggleBoxes,
}: PreviewHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-medium">Preview</h2>
      {hasResult && (
        <div className="flex items-center gap-2">
          <Label
            htmlFor="show-boxes"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Show boxes
          </Label>
          <Switch
            data-testid="toggle-show-boxes"
            id="show-boxes"
            checked={showBoxes}
            onCheckedChange={onToggleBoxes}
            className="scale-75 data-[state=checked]:bg-primary"
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview Canvas                                                             */
/* -------------------------------------------------------------------------- */

interface PreviewCanvasProps {
  imagePreviewUrl: string | null;
  showBoxes: boolean;
  annotations?: Annotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
}

/**
 * The main image preview area. Displays the uploaded drawing with
 * interactive bounding box overlays for each detected annotation.
 */
function PreviewCanvas({
  imagePreviewUrl,
  showBoxes,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
}: PreviewCanvasProps) {
  return (
    <div className="flex-1 flex flex-col min-h-[600px] bg-muted/20 border border-border rounded-3xl overflow-hidden relative">
      {!imagePreviewUrl ? (
        /* Empty state */
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
          <Layers className="w-10 h-10 mb-4 stroke-[1.5]" />
          <p className="text-sm">Upload a drawing to see annotations</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 h-full w-full">
          <div className="min-w-full min-h-full p-8 flex items-center justify-center">
            <div className="relative inline-block">
              <img
                src={imagePreviewUrl}
                alt="Annotated CAD drawing"
                className="max-w-none w-auto max-h-[700px] rounded-sm shadow-sm"
              />

              {/* Bounding box overlays */}
              {showBoxes &&
                annotations?.map((ann) => {
                  const isSelected = selectedAnnotationId === ann.id;
                  return (
                    <div
                      key={ann.id}
                      data-testid={`box-${ann.id}`}
                      className={`absolute transition-all duration-300 cursor-pointer rounded-[2px] ${
                        isSelected
                          ? "z-10 bg-primary/20 backdrop-blur-[1px]"
                          : "z-0 hover:bg-foreground/5"
                      }`}
                      style={{
                        left: `${ann.boundingBox.x}%`,
                        top: `${ann.boundingBox.y}%`,
                        width: `${ann.boundingBox.width}%`,
                        height: `${ann.boundingBox.height}%`,
                        border: `1.5px solid ${isSelected ? ann.boundingBox.color : "rgba(0,0,0,0.1)"}`,
                        boxShadow: isSelected
                          ? `0 0 0 1px ${ann.boundingBox.color} inset, 0 4px 12px rgba(0,0,0,0.1)`
                          : "none",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAnnotation(ann.id);
                      }}
                    />
                  );
                })}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Annotation Results                                                         */
/* -------------------------------------------------------------------------- */

interface AnnotationResultsProps {
  result: AnalyzeDrawingResult;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
}

/** Displays the analysis results as a grid of annotation cards. */
function AnnotationResults({
  result,
  selectedAnnotationId,
  onSelectAnnotation,
}: AnnotationResultsProps) {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Results header with count badge */}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">Results</h3>
        <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
          {result.annotations.length} found
        </span>
      </div>

      {/* Optional natural-language description of the drawing */}
      {result.description && (
        <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border/50">
          {result.description}
        </p>
      )}

      {/* Annotation cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {result.annotations.map((ann) => {
          const isSelected = selectedAnnotationId === ann.id;
          return (
            <div
              key={ann.id}
              data-testid={`card-${ann.id}`}
              className={`group cursor-pointer transition-all duration-300 border p-4 rounded-2xl flex flex-col gap-2 ${
                isSelected
                  ? "bg-background shadow-sm border-primary/30 ring-1 ring-primary/30"
                  : "bg-muted/20 border-border/60 hover:bg-muted/40 hover:border-border"
              }`}
              onClick={() => onSelectAnnotation(ann.id)}
            >
              <div className="flex justify-between items-start gap-2">
                <span
                  className={`text-sm font-medium transition-colors ${isSelected ? "text-primary" : "text-foreground"}`}
                >
                  {ann.label}
                </span>
                <span className="text-[10px] uppercase tracking-wider bg-background px-1.5 py-0.5 rounded-md text-muted-foreground border border-border/50 shrink-0">
                  {ann.view}
                </span>
              </div>
              <div className="text-lg font-mono text-foreground mt-1">
                {ann.value}
              </div>
              {ann.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-auto pt-2">
                  {ann.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
