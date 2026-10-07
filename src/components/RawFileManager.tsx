import React, { useState, useRef } from "react";
import { 
  FileText, 
  UploadCloud, 
  Sparkles, 
  Trash2, 
  Download, 
  Eye, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileCode, 
  FileImage, 
  FileSpreadsheet, 
  File, 
  Search, 
  RefreshCw, 
  ArrowRight,
  ExternalLink,
  Info,
  Layers,
  X,
  FileCheck,
  Headphones,
  Volume2
} from "lucide-react";
import { RawFileItem, ResourceItem } from "../types";
import { formatDate } from "../lib/dateUtils";

interface RawFileManagerProps {
  files: RawFileItem[];
  isLoading: boolean;
  onUploadFile: (file: File, notes?: string) => Promise<boolean>;
  onDeleteFile: (fileId: string) => Promise<boolean>;
  onConvertFileToOKF: (file: RawFileItem) => Promise<boolean>;
  onViewResource: (resourceId: string) => void;
  isConvertingId: string | null;
}

export const RawFileManager: React.FC<RawFileManagerProps> = ({
  files,
  isLoading,
  onUploadFile,
  onDeleteFile,
  onConvertFileToOKF,
  onViewResource,
  isConvertingId,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "raw" | "converted">("all");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const [previewFile, setPreviewFile] = useState<RawFileItem | null>(null);
  const [fileToDelete, setFileToDelete] = useState<RawFileItem | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Byte";
    const k = 1024;
    const sizes = ["Byte", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileType: string, fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm"].includes(ext) || fileType === "audio") {
      return <Headphones className="w-5 h-5 text-amber-400 shrink-0" />;
    }
    if (ext === "pdf") return <FileText className="w-5 h-5 text-rose-400 shrink-0" />;
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) {
      return <FileImage className="w-5 h-5 text-purple-400 shrink-0" />;
    }
    if (["md", "markdown", "txt"].includes(ext)) {
      return <FileCode className="w-5 h-5 text-[#C5A059] shrink-0" />;
    }
    if (["json", "yaml", "yml", "xml", "toml", "ts", "js", "py", "rs", "go"].includes(ext)) {
      return <FileSpreadsheet className="w-5 h-5 text-cyan-400 shrink-0" />;
    }
    return <File className="w-5 h-5 text-[#888] shrink-0" />;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processSelectedFile(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const processSelectedFile = async (file: File) => {
    // 50MB safety ceiling
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`Il file "${file.name}" supera il limite massimo consentito di 50MB.`);
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(20);
      await onUploadFile(file, notesInput.trim());
      setNotesInput("");
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(null);
      }, 600);
    } catch (err: any) {
      console.error("Upload error:", err);
      alert("Errore durante l'upload del file: " + (err?.message || "Errore sconosciuto"));
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const filteredFiles = files.filter((file) => {
    const matchesSearch = file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (file.notes && file.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (file.convertedResourceTitle && file.convertedResourceTitle.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterStatus === "raw") return file.status === "raw" || file.status === "error";
    if (filterStatus === "converted") return file.status === "converted_okf";
    return true;
  });

  const rawCount = files.filter(f => f.status === "raw" || f.status === "error").length;
  const convertedCount = files.filter(f => f.status === "converted_okf").length;

  return (
    <div className="space-y-6">
      {/* Header & Explanation Card */}
      <div className="bg-[#0B0B0B] border border-[#1C1C1C] rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#C5A059]/5 blur-[90px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#C5A059]/15 text-[#E5C170] border border-[#C5A059]/30 uppercase">
                Staging & Buffer Files
              </span>
              <span className="text-xs text-[#666] font-mono">Fino a 50MB (PDF, MD, TXT, Immagini)</span>
            </div>
            <h2 className="text-xl md:text-2xl font-serif italic text-white font-semibold">
              Archivio Documenti Grezzi
            </h2>
            <p className="text-xs md:text-sm text-[#888] mt-1 max-w-2xl leading-relaxed">
              Carica file di grandi dimensioni per archiviarli in sicurezza su Firestore. In qualsiasi momento puoi richiedere a Gemini di analizzarli, estrarre entità e relazioni e convertirli nello standard OKF v0.2 per collegarli al Grafo Topologico.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-[#121212] border border-[#222] rounded-xl px-3 py-2 text-xs font-mono">
              <span className="text-[#888]">In attesa:</span>
              <span className="text-[#E5C170] font-bold">{rawCount}</span>
              <span className="text-[#444]">|</span>
              <span className="text-[#888]">Convertiti:</span>
              <span className="text-emerald-400 font-bold">{convertedCount}</span>
            </div>
          </div>
        </div>

        {/* Upload Drop Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-5 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragging 
              ? "border-[#C5A059] bg-[#1A160C]" 
              : "border-[#262626] hover:border-[#C5A059]/60 hover:bg-[#111]"
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".pdf,.txt,.md,.markdown,.json,.yaml,.yml,.csv,.log,.png,.jpg,.jpeg,.webp,.svg,.ts,.js,.py,.rs,.go,.mp3,.wav,.m4a,.ogg,.aac,.flac,.opus,.webm,audio/*,image/*"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#17140E] border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059] shadow-inner shadow-[#C5A059]/20">
              <UploadCloud className="w-6 h-6" />
            </div>
            
            <div className="text-sm font-medium text-white">
              {isUploading ? "Caricamento e frammentazione file in corso..." : "Trascina qui il file o fai clic per selezionarlo"}
            </div>
            
            <p className="text-xs text-[#777] font-mono">
              Supporta Audio (MP3, WAV, M4A), PDF, Markdown, Testi, JSON, Immagini e Log (Max 50MB)
            </p>

            {isUploading && (
              <div className="w-full max-w-xs bg-[#222] rounded-full h-1.5 mt-3 overflow-hidden">
                <div 
                  className="bg-[#C5A059] h-full transition-all duration-300 rounded-full" 
                  style={{ width: `${uploadProgress || 50}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0A0A0A] p-3 rounded-xl border border-[#1A1A1A]">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#555] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca per nome file o note..."
            className="w-full bg-[#121212] border border-[#222] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#C5A059]/70 font-mono"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#121212] p-1 rounded-lg border border-[#222] shrink-0">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
              filterStatus === "all"
                ? "bg-[#221C11] text-[#E5C170] font-bold border border-[#C5A059]/40"
                : "text-[#777] hover:text-white"
            }`}
          >
            Tutti ({files.length})
          </button>
          <button
            onClick={() => setFilterStatus("raw")}
            className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
              filterStatus === "raw"
                ? "bg-[#221C11] text-[#E5C170] font-bold border border-[#C5A059]/40"
                : "text-[#777] hover:text-white"
            }`}
          >
            Grezzi ({rawCount})
          </button>
          <button
            onClick={() => setFilterStatus("converted")}
            className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
              filterStatus === "converted"
                ? "bg-[#221C11] text-[#E5C170] font-bold border border-[#C5A059]/40"
                : "text-[#777] hover:text-white"
            }`}
          >
            Convertiti OKF ({convertedCount})
          </button>
        </div>
      </div>

      {/* File List / Cards */}
      {isLoading ? (
        <div className="p-12 text-center text-[#777] font-mono text-xs flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 text-[#C5A059] animate-spin" />
          <span>Caricamento elenco file dal database...</span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#222] rounded-2xl bg-[#0A0A0A]">
          <Layers className="w-8 h-8 text-[#444] mx-auto mb-2" />
          <p className="text-sm text-[#888] font-medium">Nessun file trovato</p>
          <p className="text-xs text-[#555] font-mono mt-1">
            {searchQuery ? "Nessun risultato per i filtri correnti." : "Trascina un file PDF, TXT o MD per iniziare."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredFiles.map((file) => {
            const isConverting = isConvertingId === file.id;
            const isConverted = file.status === "converted_okf";

            return (
              <div
                key={file.id}
                className={`bg-[#0C0C0C] border rounded-xl p-4 transition-all hover:border-[#333] ${
                  isConverted 
                    ? "border-[#1B291F] hover:border-emerald-500/40" 
                    : "border-[#1E1E1E]"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* File Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#222] shrink-0 mt-0.5">
                      {getFileIcon(file.fileType, file.fileName)}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-white truncate max-w-md" title={file.fileName}>
                          {file.fileName}
                        </h4>

                        {/* Status Tag */}
                        {isConverted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                            <CheckCircle2 className="w-3 h-3" /> Convertito OKF v0.2
                          </span>
                        ) : isConverting ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#2A2315] text-[#E5C170] border border-[#C5A059]/40 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Conversione Gemini AI...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-[#888] bg-[#141414] border border-[#262626]">
                            <Clock className="w-3 h-3 text-[#C5A059]" /> File Grezzo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono text-[#666]">
                        <span>{formatBytes(file.fileSize)}</span>
                        <span>•</span>
                        <span>{formatDate(file.createdAt)}</span>
                        {file.hasChunks && (
                          <>
                            <span>•</span>
                            <span className="text-[#888]">Frammentato ({file.totalChunks || 1} blocchi)</span>
                          </>
                        )}
                      </div>

                      {file.notes && (
                        <p className="text-xs text-[#999] italic line-clamp-1 mt-0.5">
                          Nota: {file.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap justify-end">
                    {isConverted && file.convertedResourceId && (
                      <button
                        onClick={() => onViewResource(file.convertedResourceId!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 text-xs font-mono transition-colors"
                        title="Visualizza la specifica OKF v0.2 nel lettore o grafo"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Apri Risorsa OKF</span>
                      </button>
                    )}

                    <button
                      onClick={() => onConvertFileToOKF(file)}
                      disabled={isConverting}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shadow-xs disabled:opacity-50 ${
                        isConverted
                          ? "bg-[#161616] hover:bg-[#222] text-[#CCC] border border-[#333] hover:border-[#C5A059]/60 hover:text-[#E5C170]"
                          : "bg-[#1C160B] hover:bg-[#2A210F] text-[#E5C170] border border-[#C5A059]/40 hover:border-[#C5A059]"
                      }`}
                      title={isConverted ? "Rianalizza il documento ed estrai una nuova specifica OKF v0.2 completa con Gemini" : "Analizza il documento con Gemini ed estrai specifiche OKF v0.2"}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                      <span>{isConverting ? "Conversione..." : isConverted ? "Riconverti con Gemini" : "Converti in OKF v0.2"}</span>
                    </button>

                    {/* Preview button */}
                    {(file.textContent || file.contentPreview) && (
                      <button
                        onClick={() => setPreviewFile(file)}
                        className="p-1.5 text-[#888] hover:text-white hover:bg-[#1A1A1A] rounded-lg border border-transparent hover:border-[#333] transition-colors"
                        title="Visualizza testo/anteprima"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={() => setFileToDelete(file)}
                      disabled={isDeletingId === file.id}
                      className="p-1.5 text-[#666] hover:text-rose-400 hover:bg-[#1A1A1A] rounded-lg border border-transparent hover:border-[#333] transition-colors disabled:opacity-40"
                      title="Elimina file dal database"
                    >
                      {isDeletingId === file.id ? (
                        <RefreshCw className="w-4 h-4 text-rose-400 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0D0D0D] border border-rose-900/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-800/40 text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">
                  Elimina File dal Vault
                </h3>
                <p className="text-xs text-[#888] leading-relaxed">
                  Sei sicuro di voler eliminare definitivamente il file{" "}
                  <span className="text-white font-mono font-medium">"{fileToDelete.fileName}"</span>?
                  L'operazione rimuoverà il file e tutti i relativi blocchi dal database Firestore.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1C1C1C]">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeletingId === fileToDelete.id}
                className="px-3.5 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222] text-[#AAA] hover:text-white text-xs font-mono transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isDeletingId === fileToDelete.id}
                onClick={async () => {
                  try {
                    setIsDeletingId(fileToDelete.id);
                    await onDeleteFile(fileToDelete.id);
                  } finally {
                    setIsDeletingId(null);
                    setFileToDelete(null);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-semibold transition-colors shadow-xs disabled:opacity-50"
              >
                {isDeletingId === fileToDelete.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Eliminazione...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Elimina Definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      {previewFile && (() => {
        const lowerName = previewFile.fileName.toLowerCase();
        const ext = lowerName.split(".").pop() || "";
        const isAudio = (previewFile.mimeType && previewFile.mimeType.toLowerCase().startsWith("audio/")) ||
          ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm"].includes(ext) ||
          previewFile.fileType === "audio";
        const isImage = (previewFile.mimeType && previewFile.mimeType.toLowerCase().startsWith("image/")) ||
          ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#0D0D0D] border border-[#262626] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-4 border-b border-[#1F1F1F] flex items-center justify-between bg-[#111]">
                <div className="flex items-center gap-2">
                  {isAudio ? (
                    <Headphones className="w-4 h-4 text-amber-400" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#C5A059]" />
                  )}
                  <h3 className="text-sm font-semibold text-white truncate max-w-md">
                    {previewFile.fileName}
                  </h3>
                </div>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="text-[#666] hover:text-white p-1 rounded-lg hover:bg-[#222]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 font-mono text-xs text-[#BBB] leading-relaxed custom-scrollbar bg-[#080808] space-y-4">
                {/* Audio Player if Audio file with Base64 */}
                {isAudio && (
                  <div className="bg-[#121212] p-4 rounded-xl border border-[#222] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#E5C170]">
                      <Headphones className="w-4 h-4" />
                      <span>Riproduzione Audio Integrata</span>
                    </div>
                    {previewFile.base64Data ? (
                      <audio
                        controls
                        src={`data:${previewFile.mimeType || "audio/mp3"};base64,${previewFile.base64Data}`}
                        className="w-full h-10 accent-[#C5A059]"
                      />
                    ) : (
                      <div className="text-xs text-[#777] font-mono">
                        Traccia audio archiviata in Firestore ({formatBytes(previewFile.fileSize)}).
                      </div>
                    )}
                  </div>
                )}

                {/* Image Preview if Image file with Base64 */}
                {isImage && previewFile.base64Data && (
                  <div className="bg-[#121212] p-2 rounded-xl border border-[#222] flex justify-center">
                    <img
                      src={`data:${previewFile.mimeType || "image/png"};base64,${previewFile.base64Data}`}
                      alt={previewFile.fileName}
                      className="max-h-64 object-contain rounded-lg"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Text / Notes Content */}
                <div className="whitespace-pre-wrap">
                  {previewFile.textContent || previewFile.contentPreview || "Nessuna anteprima testuale disponibile."}
                </div>
              </div>

              <div className="p-3 border-t border-[#1F1F1F] bg-[#111] flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#666]">
                  Dimensione: {formatBytes(previewFile.fileSize)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onConvertFileToOKF(previewFile);
                      setPreviewFile(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C5A059] text-black font-semibold text-xs font-mono hover:bg-[#D5B069] transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Converti in OKF v0.2</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
