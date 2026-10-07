import React, { useState } from "react";
import {
  X,
  Check,
  Wand2,
  FileText,
  Copy,
  TrendingUp,
  ArrowRight,
  Eye,
  Edit3,
  ExternalLink,
  Layers,
  FileDown,
  Sparkles,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ResourceItem, RefactoringAudit } from "../types";

interface DocumentComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  enhancedResource: ResourceItem;
  fileName?: string;
  onConfirmSave: (finalResource: ResourceItem) => Promise<void> | void;
  onExportGoogleDoc?: (resource: ResourceItem) => void;
}

export const DocumentComparisonModal: React.FC<DocumentComparisonModalProps> = ({
  isOpen,
  onClose,
  originalText,
  enhancedResource,
  fileName,
  onConfirmSave,
  onExportGoogleDoc,
}) => {
  const [activeTab, setActiveTab] = useState<"side_by_side" | "original" | "enhanced">("side_by_side");
  const [enhancedViewMode, setEnhancedViewMode] = useState<"rendered" | "source">("rendered");
  const [editableMarkdown, setEditableMarkdown] = useState<string>(
    enhancedResource.metadata?.markdownContent || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedEnhanced, setCopiedEnhanced] = useState(false);

  if (!isOpen) return null;

  const audit: RefactoringAudit | undefined = enhancedResource.metadata?.refactoringAudit;
  const scoreBefore = audit?.readabilityBefore || 45;
  const scoreAfter = audit?.readabilityAfter || enhancedResource.metadata?.score || 92;
  const delta = audit?.readabilityDelta !== undefined ? audit.readabilityDelta : scoreAfter - scoreBefore;

  const originalWords = audit?.originalWordCount || originalText.split(/\s+/).filter(Boolean).length;
  const enhancedWords = audit?.enhancedWordCount || editableMarkdown.split(/\s+/).filter(Boolean).length;

  const handleCopy = (text: string, isOriginal: boolean) => {
    navigator.clipboard.writeText(text);
    if (isOriginal) {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    } else {
      setCopiedEnhanced(true);
      setTimeout(() => setCopiedEnhanced(false), 2000);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const finalResource: ResourceItem = {
        ...enhancedResource,
        metadata: {
          ...enhancedResource.metadata,
          markdownContent: editableMarkdown,
          rawSourceDocument: originalText,
          isRefactored: true,
          refactoringAudit: {
            ...audit,
            enhancedCharCount: editableMarkdown.length,
            enhancedWordCount: editableMarkdown.split(/\s+/).filter(Boolean).length,
          } as RefactoringAudit,
        },
      };
      await onConfirmSave(finalResource);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0C0C0C] border border-[#2B2B2B] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E1E] bg-[#121212] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-950/60 border border-indigo-700/50 rounded-xl text-indigo-400 shrink-0">
              <Wand2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  Refactoring &amp; Miglioramento Documento
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
                  OKF v0.2 Protocol
                </span>
              </div>
              <p className="text-xs text-[#888] truncate">
                Confronto Side-by-Side: Fonte Originale ({fileName || "Bozza"}) vs Specifica Normalizzata
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher on smaller screens */}
            <div className="flex lg:hidden bg-[#181818] p-0.5 rounded-lg border border-[#2B2B2B] text-xs">
              <button
                onClick={() => setActiveTab("side_by_side")}
                className={`px-2 py-1 rounded-md transition-colors ${activeTab === "side_by_side" ? "bg-[#252525] text-white" : "text-[#888]"}`}
              >
                Split
              </button>
              <button
                onClick={() => setActiveTab("original")}
                className={`px-2 py-1 rounded-md transition-colors ${activeTab === "original" ? "bg-[#252525] text-white" : "text-[#888]"}`}
              >
                Originale
              </button>
              <button
                onClick={() => setActiveTab("enhanced")}
                className={`px-2 py-1 rounded-md transition-colors ${activeTab === "enhanced" ? "bg-[#252525] text-white" : "text-[#888]"}`}
              >
                OKF v0.2
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-[#777] hover:text-white hover:bg-[#1E1E1E] rounded-xl transition-colors cursor-pointer"
              title="Chiudi senza salvare"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quality Delta & Audit Insights Strip */}
        <div className="bg-[#141414] border-b border-[#1E1E1E] px-5 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Score Improvement Metric */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[#888]">Indice Qualità:</span>
              <span className="px-2 py-0.5 rounded bg-[#202020] text-[#AAA] font-mono font-bold">
                {scoreBefore}/100
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#555]" />
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/50 text-emerald-400 font-mono font-bold">
                {scoreAfter}/100
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-bold font-mono">
                <TrendingUp className="w-3.5 h-3.5" />
                +{delta}%
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2 text-[#777] font-mono text-[11px] border-l border-[#2B2B2B] pl-4">
              <span>Originale: <strong>{originalWords}</strong> parole ({originalText.length} char)</span>
              <span>•</span>
              <span>Rielaborato: <strong>{enhancedWords}</strong> parole ({editableMarkdown.length} char)</span>
            </div>
          </div>

          {/* Model Badge */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#888]">
            <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Motore: <strong>{audit?.modelUsed || "gemini-3.7-flash"}</strong></span>
          </div>
        </div>

        {/* Improvements Summary Bar */}
        {audit && audit.improvementsApplied && audit.improvementsApplied.length > 0 && (
          <div className="bg-[#101010] border-b border-[#1E1E1E] px-5 py-2.5 shrink-0 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#888] uppercase tracking-wider flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Migliorie:
            </span>
            {audit.improvementsApplied.map((imp, idx) => (
              <span
                key={idx}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#181818] border border-[#2B2B2B] text-[#CCC]"
              >
                {imp}
              </span>
            ))}
          </div>
        )}

        {/* Main Content Side-by-Side Area */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#1E1E1E]">
          
          {/* Left Column: Original Raw Source Document */}
          <div className={`flex flex-col h-full overflow-hidden ${activeTab === "enhanced" ? "hidden lg:flex" : "flex"}`}>
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#121212] border-b border-[#1E1E1E] shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="text-xs font-bold text-[#DDD]">Fonte Originale Grezza</span>
                <span className="text-[10px] text-[#666] font-mono">(Immutata • Audit Trail)</span>
              </div>
              <button
                onClick={() => handleCopy(originalText, true)}
                className="flex items-center gap-1 text-[11px] text-[#888] hover:text-white px-2 py-1 rounded bg-[#181818] hover:bg-[#222] transition-colors cursor-pointer"
                title="Copia testo originale"
              >
                {copiedOriginal ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedOriginal ? "Copiato" : "Copia"}</span>
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar bg-[#0A0A0A]">
              <pre className="font-mono text-xs text-[#AAA] whitespace-pre-wrap leading-relaxed break-words font-normal">
                {originalText}
              </pre>
            </div>
          </div>

          {/* Right Column: Enhanced OKF v0.2 Specification */}
          <div className={`flex flex-col h-full overflow-hidden ${activeTab === "original" ? "hidden lg:flex" : "flex"}`}>
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#121212] border-b border-[#1E1E1E] shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-xs font-bold text-white">Versione Rielaborata (OKF v0.2)</span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">Standard Conforme</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Mode toggle (rendered vs source) */}
                <div className="flex bg-[#181818] p-0.5 rounded-lg border border-[#2B2B2B] text-[11px]">
                  <button
                    onClick={() => setEnhancedViewMode("rendered")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${enhancedViewMode === "rendered" ? "bg-[#252525] text-white" : "text-[#888]"}`}
                  >
                    <Eye className="w-3 h-3" />
                    <span>Anteprima</span>
                  </button>
                  <button
                    onClick={() => setEnhancedViewMode("source")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${enhancedViewMode === "source" ? "bg-[#252525] text-white" : "text-[#888]"}`}
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Modifica Markdown</span>
                  </button>
                </div>

                <button
                  onClick={() => handleCopy(editableMarkdown, false)}
                  className="flex items-center gap-1 text-[11px] text-[#888] hover:text-white px-2 py-1 rounded bg-[#181818] hover:bg-[#222] transition-colors cursor-pointer"
                  title="Copia markdown rielaborato"
                >
                  {copiedEnhanced ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedEnhanced ? "Copiato" : "Copia"}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar bg-[#0E0E0E]">
              {enhancedViewMode === "rendered" ? (
                <div className="prose prose-invert max-w-none text-xs sm:text-sm text-[#DDD] leading-relaxed">
                  <ReactMarkdown>{editableMarkdown}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={editableMarkdown}
                  onChange={(e) => setEditableMarkdown(e.target.value)}
                  className="w-full h-full bg-transparent border-none text-xs font-mono text-[#DDD] focus:outline-none resize-none leading-relaxed custom-scrollbar"
                  placeholder="Modifica il markdown rielaborato..."
                />
              )}
            </div>

            {/* Extracted Entities Bar */}
            {enhancedResource.metadata?.entities && enhancedResource.metadata.entities.length > 0 && (
              <div className="p-2.5 bg-[#121212] border-t border-[#1E1E1E] shrink-0 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3 h-3 text-indigo-400" /> Entità per il Grafo:
                </span>
                {enhancedResource.metadata.entities.slice(0, 8).map((e: any, idx: number) => {
                  const name = typeof e === "string" ? e : e.name;
                  const type = typeof e === "string" ? "concept" : e.type;
                  return (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950/40 border border-indigo-800/40 text-indigo-300"
                    >
                      {name} <span className="text-[9px] text-[#666]">[{type}]</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[#1E1E1E] bg-[#121212] shrink-0">
          <div className="text-xs text-[#777] hidden sm:block">
            Salvando, la risorsa conserverà <strong>sia la fonte grezza originale che la specifica rifinita</strong>.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#AAA] hover:text-white hover:bg-[#1C1C1C] border border-[#2B2B2B] transition-colors cursor-pointer"
            >
              Annulla
            </button>

            {onExportGoogleDoc && (
              <button
                onClick={() => {
                  const updated: ResourceItem = {
                    ...enhancedResource,
                    metadata: {
                      ...enhancedResource.metadata,
                      markdownContent: editableMarkdown,
                      rawSourceDocument: originalText,
                      isRefactored: true,
                    },
                  };
                  onExportGoogleDoc(updated);
                }}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#1C1C1C] hover:bg-[#252525] border border-[#333] text-[#4285F4] transition-all cursor-pointer"
                title="Esporta direttamente su Google Doc formattato"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Crea GDoc</span>
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#C5A059] hover:bg-[#D5B069] text-black shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvataggio nel Vault...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Accetta e Salva nel Vault</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
