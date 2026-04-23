import React, { useState, useRef } from "react";
import { useAnalyzeDrawing } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, X, Loader2, ImageIcon, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AnalyzeDrawingResult } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Home() {
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  
  const [includeDescription, setIncludeDescription] = useState(false);
  const [baselineMode, setBaselineMode] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  
  const [analysisResult, setAnalysisResult] = useState<AnalyzeDrawingResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeDrawing = useAnalyzeDrawing();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive"
      });
      return;
    }
    
    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
    
    setAnalysisResult(null);
    setSelectedAnnotationId(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageBase64(null);
    setAnalysisResult(null);
    setSelectedAnnotationId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = () => {
    if (!imageBase64) return;
    
    analyzeDrawing.mutate(
      {
        data: {
          imageData: imageBase64,
          includeDescription,
          baselineMode
        }
      },
      {
        onSuccess: (data) => {
          setAnalysisResult(data);
          toast({
            title: "Analysis complete",
            description: `Found ${data.annotations.length} annotations.`
          });
        },
        onError: (error) => {
          toast({
            title: "Analysis failed",
            description: error.message || "An unexpected error occurred.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col font-sans selection:bg-primary/10">
      <header className="px-8 py-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-transparent transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">CAD Annotator</h1>
        </div>
      </header>

      <main className="flex-1 px-8 pb-12 flex flex-col max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-12 mt-4">
          
          {/* LEFT PANEL */}
          <div className="flex flex-col gap-10">
            
            {/* Upload Section */}
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-medium">Upload drawing</h2>
                <p className="text-sm text-muted-foreground">Select a CAD file or blueprint to analyze.</p>
              </div>

              {!imagePreviewUrl ? (
                <div
                  data-testid="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
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
                    <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-contain p-2" />
                    <div className="absolute inset-0 bg-background/0 group-hover:bg-background/10 transition-colors duration-200" />
                  </div>
                  <div className="p-3 bg-background border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate text-foreground" title={imageFile?.name}>
                        {imageFile?.name}
                      </span>
                    </div>
                    <Button data-testid="button-remove-image" variant="ghost" size="icon" onClick={handleRemoveImage} className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              
              <input
                data-testid="input-file"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </section>

            {/* Options Section */}
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 p-5 rounded-2xl bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-description" className="text-sm font-medium cursor-pointer text-foreground">
                    Detailed descriptions
                  </Label>
                  <Switch
                    data-testid="toggle-include-description"
                    id="include-description"
                    checked={includeDescription}
                    onCheckedChange={setIncludeDescription}
                  />
                </div>
                <div className="h-[1px] w-full bg-border/50" />
                <div className="flex items-center justify-between">
                  <Label htmlFor="baseline-mode" className="text-sm font-medium cursor-pointer text-foreground">
                    Fast baseline mode
                  </Label>
                  <Switch
                    data-testid="toggle-baseline-mode"
                    id="baseline-mode"
                    checked={baselineMode}
                    onCheckedChange={setBaselineMode}
                  />
                </div>
              </div>

              <Button 
                data-testid="button-generate"
                onClick={handleGenerate} 
                disabled={!imageBase64 || analyzeDrawing.isPending}
                className="w-full h-12 text-sm font-medium rounded-xl shadow-sm transition-all"
              >
                {analyzeDrawing.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing drawing...
                  </span>
                ) : (
                  "Generate Annotations"
                )}
              </Button>
            </section>

          </div>

          {/* RIGHT PANEL */}
          <div className="flex flex-col gap-6 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Preview</h2>
              {analysisResult && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-boxes" className="text-xs text-muted-foreground cursor-pointer">
                    Show boxes
                  </Label>
                  <Switch
                    data-testid="toggle-show-boxes"
                    id="show-boxes"
                    checked={showBoxes}
                    onCheckedChange={setShowBoxes}
                    className="scale-75 data-[state=checked]:bg-primary"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col min-h-[600px] bg-muted/20 border border-border rounded-3xl overflow-hidden relative">
              {!imagePreviewUrl ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                  <Layers className="w-10 h-10 mb-4 stroke-[1.5]" />
                  <p className="text-sm">Upload a drawing to see annotations</p>
                </div>
              ) : (
                <ScrollArea className="flex-1 h-full w-full">
                  <div className="min-w-full min-h-full p-8 flex items-center justify-center">
                    <div className="relative inline-block">
                      <img src={imagePreviewUrl} alt="Parsed CAD" className="max-w-none w-auto max-h-[700px] rounded-sm shadow-sm" />
                      
                      {showBoxes && analysisResult?.annotations.map((ann) => (
                        <div
                          key={ann.id}
                          data-testid={`box-${ann.id}`}
                          className={`absolute transition-all duration-300 cursor-pointer rounded-[2px] ${
                            selectedAnnotationId === ann.id 
                              ? "z-10 bg-primary/20 backdrop-blur-[1px]" 
                              : "z-0 hover:bg-foreground/5"
                          }`}
                          style={{
                            left: `${ann.boundingBox.x}%`,
                            top: `${ann.boundingBox.y}%`,
                            width: `${ann.boundingBox.width}%`,
                            height: `${ann.boundingBox.height}%`,
                            border: `1.5px solid ${selectedAnnotationId === ann.id ? ann.boundingBox.color : 'rgba(0,0,0,0.1)'}`,
                            boxShadow: selectedAnnotationId === ann.id ? `0 0 0 1px ${ann.boundingBox.color} inset, 0 4px 12px rgba(0,0,0,0.1)` : 'none'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAnnotationId(ann.id);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Annotations List */}
            {analysisResult && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium">Results</h3>
                  <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                    {analysisResult.annotations.length} found
                  </span>
                </div>
                
                {analysisResult.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border/50">
                    {analysisResult.description}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {analysisResult.annotations.map((ann) => {
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
                        onClick={() => setSelectedAnnotationId(ann.id)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
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
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
