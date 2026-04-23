import React, { useState, useRef, useCallback } from "react";
import { useAnalyzeDrawing } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, X, Eye, EyeOff, Loader2, ChevronDown, ChevronRight, Crosshair, ZoomIn, FileText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import type { Annotation, AnalyzeDrawingResult } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Home() {
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  
  const [includeDescription, setIncludeDescription] = useState(false);
  const [baselineMode, setBaselineMode] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationsOpen, setAnnotationsOpen] = useState(true);
  
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
          <Crosshair className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-semibold tracking-tight">AeroInspect CAD Review</h1>
        </div>
        <div className="text-sm font-mono text-slate-500">
          STATUS: {analyzeDrawing.isPending ? "PROCESSING" : "READY"}
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          
          {/* LEFT PANEL */}
          <div className="flex flex-col gap-6">
            <Card className="shadow-sm border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium">Upload Drawing</CardTitle>
                <CardDescription>Upload CAD blueprint or diagram for automated annotation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!imagePreviewUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mb-4" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Click or drag image to upload
                    </p>
                    <p className="text-xs text-slate-500">Supports PNG, JPG, WEBP</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative aspect-video rounded-md overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono truncate max-w-[200px] text-slate-600 dark:text-slate-400" title={imageFile?.name}>
                        {imageFile?.name}
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleRemoveImage} className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <X className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-description" className="text-sm font-medium cursor-pointer">
                      Include detailed description
                    </Label>
                    <Switch
                      id="include-description"
                      checked={includeDescription}
                      onCheckedChange={setIncludeDescription}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="baseline-mode" className="text-sm font-medium cursor-pointer">
                      Baseline mode (faster)
                    </Label>
                    <Switch
                      id="baseline-mode"
                      checked={baselineMode}
                      onCheckedChange={setBaselineMode}
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleGenerate} 
                  disabled={!imageBase64 || analyzeDrawing.isPending}
                  className="w-full font-semibold"
                  size="lg"
                >
                  {analyzeDrawing.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing Drawing...
                    </>
                  ) : (
                    "Generate CAD Drawing"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT PANEL */}
          <Card className="shadow-sm border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[600px] lg:h-auto min-h-[600px]">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <ZoomIn className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-sm font-medium">Parsed CAD Drawing</CardTitle>
              </div>
              {analysisResult && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBoxes(!showBoxes)}
                  className="h-8"
                >
                  {showBoxes ? (
                    <><EyeOff className="w-4 h-4 mr-2" /> Hide Boxes</>
                  ) : (
                    <><Eye className="w-4 h-4 mr-2" /> Show Boxes</>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 relative bg-slate-100/50 dark:bg-slate-950 flex flex-col">
              {!imagePreviewUrl ? (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No drawing loaded</p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1 h-full w-full">
                  <div className="min-w-full min-h-full p-4 flex items-center justify-center">
                    <div className="relative shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 inline-block">
                      <img src={imagePreviewUrl} alt="Parsed CAD" className="max-w-none w-auto max-h-[800px]" />
                      
                      {showBoxes && analysisResult?.annotations.map((ann) => (
                        <div
                          key={ann.id}
                          className={`absolute transition-all duration-200 cursor-pointer ${
                            selectedAnnotationId === ann.id 
                              ? "z-10 ring-2 ring-white ring-offset-2 ring-offset-blue-500 bg-white/10" 
                              : "z-0 hover:bg-white/10"
                          }`}
                          style={{
                            left: `${ann.boundingBox.x}%`,
                            top: `${ann.boundingBox.y}%`,
                            width: `${ann.boundingBox.width}%`,
                            height: `${ann.boundingBox.height}%`,
                            border: `2px solid ${ann.boundingBox.color}`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAnnotationId(ann.id);
                            // Also expand bottom panel if closed
                            setAnnotationsOpen(true);
                          }}
                        >
                          {selectedAnnotationId === ann.id && (
                            <div className="absolute -top-6 left-0 bg-slate-900 text-white text-xs font-mono px-2 py-1 rounded whitespace-nowrap shadow-md">
                              {ann.label}: {ann.value}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              )}
              
              {analysisResult?.description && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Analysis Description</h4>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {analysisResult.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* BOTTOM PANEL */}
        {analysisResult && (
          <Collapsible
            open={annotationsOpen}
            onOpenChange={setAnnotationsOpen}
            className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 shadow-sm"
          >
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Annotations ({analysisResult.annotations.length})</h3>
                  {analysisResult.views.length > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full font-mono">
                      {analysisResult.views.length} views
                    </span>
                  )}
                </div>
                {annotationsOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {analysisResult.annotations.map((ann) => (
                    <Card 
                      key={ann.id} 
                      className={`cursor-pointer transition-all duration-200 border-2 ${
                        selectedAnnotationId === ann.id 
                          ? "shadow-md bg-white dark:bg-slate-900 translate-y-[-2px]" 
                          : "border-transparent hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-900/50"
                      }`}
                      style={{
                        borderColor: selectedAnnotationId === ann.id ? ann.boundingBox.color : undefined
                      }}
                      onClick={() => setSelectedAnnotationId(ann.id)}
                    >
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100" style={{ color: selectedAnnotationId === ann.id ? ann.boundingBox.color : undefined }}>
                            {ann.label}
                          </span>
                          <span className="text-[10px] font-mono uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                            {ann.view}
                          </span>
                        </div>
                        <div className="text-2xl font-mono tracking-tight text-slate-800 dark:text-slate-200">
                          {ann.value}
                        </div>
                        {ann.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {ann.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </main>
    </div>
  );
}
