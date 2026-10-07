import React, { useState, useMemo } from "react";
import { 
  X, 
  BrainCircuit, 
  Copy, 
  Check, 
  Download, 
  Tag, 
  Network, 
  FileCode, 
  ArrowRight,
  ExternalLink,
  BookOpen,
  Sparkles,
  Loader2,
  User,
  Shield,
  Layers,
  Calendar,
  CheckCircle2,
  Info,
  Printer,
  Headphones,
  FileAudio,
  FileText,
  FileDown,
  Wand2,
  Image as ImageIcon,
  Video,
  Workflow,
  AlertTriangle,
  Clock,
  Wrench,
  RotateCcw,
  ListChecks,
  Edit3,
  Link as LinkIcon
} from "lucide-react";
import Markdown from "react-markdown";
import { ResourceItem } from "../types";
import { generateAndDownloadResourcePdf } from "../lib/pdfExport";
import { identifyRelatedResources } from "../lib/relatedResourcesEngine";

interface KnowledgeReaderProps {
  resource: ResourceItem | null;
  allResources: ResourceItem[];
  onClose: () => void;
  onNavigateToResource: (resource: ResourceItem) => void;
  onViewInGraph?: (resource: ResourceItem) => void;
  onUpdate?: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
  onPrintPreview?: (resource: ResourceItem) => void;
  onExportGoogleDoc?: (resource: ResourceItem) => void;
  onOpenComparison?: (resource: ResourceItem) => void;
  onOpenEdit?: (resource: ResourceItem) => void;
}

export const KnowledgeReader: React.FC<KnowledgeReaderProps> = ({
  resource: initialResource,
  allResources,
  onClose,
  onNavigateToResource,
  onViewInGraph,
  onUpdate,
  onPrintPreview,
  onExportGoogleDoc,
  onOpenComparison,
  onOpenEdit,
}) => {
  const [currentResource, setCurrentResource] = useState<ResourceItem | null>(initialResource);
  const resource = currentResource || initialResource;
  const [activeTab, setActiveTab] = useState<"document" | "raw_source" | "okf_spec" | "graph_links">("document");
  const [copied, setCopied] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandMessage, setExpandMessage] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [markdownDownloaded, setMarkdownDownloaded] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  const handleCopyLink = () => {
    if (!resource.url) return;
    navigator.clipboard.writeText(resource.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Direct client-side generation of offline PDF reference document
  const handleDownloadPdf = async () => {
    if (!resource || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await generateAndDownloadResourcePdf(resource);
      setPdfDownloaded(true);
      setTimeout(() => setPdfDownloaded(false), 2500);
    } catch (err) {
      console.error("Errore generazione PDF:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Sync internal state if prop changes
  React.useEffect(() => {
    setCurrentResource(initialResource);
  }, [initialResource]);

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Discover other resources sharing entities, tags, or content overlap via semantic affinity engine
  const correlatedResources = useMemo(() => {
    if (!currentResource) return [];
    return identifyRelatedResources(currentResource, allResources, { limit: 4, minScore: 18 });
  }, [currentResource, allResources]);

  if (!currentResource) return null;

  const rawMarkdown =
    resource.metadata?.markdownContent ||
    `---\nokf_version: "0.2"\ntitle: "${resource.title}"\ntype: "${resource.metadata?.docType || 'concept'}"\ndomain: "${resource.metadata?.domain || 'dev-ai'}"\ntags: ${JSON.stringify(resource.tags || [])}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${resource.title}\n\n${resource.summary}\n\n${resource.url ? `**Fonte**: [${resource.url}](${resource.url})` : ''}`;

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(rawMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const filename = `${resource.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.okf.md`;
    const blob = new Blob([rawMarkdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setMarkdownDownloaded(true);
    setTimeout(() => setMarkdownDownloaded(false), 2500);
  };

  const handleExpandWithAI = async () => {
    if (!resource) return;
    setIsExpanding(true);
    setExpandMessage(null);
    try {
      const res = await fetch("/api/expand-documentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource,
          existingResources: allResources.slice(0, 30),
        }),
      });
      const data = await res.json();
      if (data?.success && data?.data) {
        const { markdownContent, summary, domain, docType, entities, relations } = data.data;
        
        const updatedResource: ResourceItem = {
          ...resource,
          summary: summary || resource.summary,
          metadata: {
            ...resource.metadata,
            markdownContent: markdownContent || resource.metadata?.markdownContent,
            domain: domain || resource.metadata?.domain,
            docType: docType || resource.metadata?.docType,
            entities: entities || resource.metadata?.entities,
            relations: relations || resource.metadata?.relations,
          },
        };

        // 1. Immediately update local modal state so user sees results with 0ms delay
        setCurrentResource(updatedResource);
        setActiveTab("document");

        // 2. Persist to Firestore & parent state
        if (onUpdate) {
          await onUpdate(resource.id, {
            summary: updatedResource.summary,
            metadata: updatedResource.metadata,
          });
        }
        setExpandMessage("✨ Documentazione OKF v0.2 approfondita ed estesa con successo!");
        setTimeout(() => setExpandMessage(null), 5000);
      } else {
        setExpandMessage("⚠️ Impossibile espandere la documentazione: " + (data?.error || "risposta non valida"));
      }
    } catch (err: any) {
      console.error("Expand documentation error:", err);
      setExpandMessage("⚠️ Errore durante l'elaborazione: " + (err?.message || ""));
    } finally {
      setIsExpanding(false);
    }
  };

  // Find linked resources from OKF relations & shared ontology
  const linkedResources = (resource.metadata?.relations || []).map((rel) => {
    const targetTitle = rel.targetTitle || (rel as any).target || (rel as any).targetName || "";
    const match = allResources.find(
      (r) =>
        (rel.targetId && r.id === rel.targetId) ||
        (targetTitle && r.title.toLowerCase().trim() === targetTitle.toLowerCase().trim()) ||
        (targetTitle.length >= 4 &&
          (r.title.toLowerCase().includes(targetTitle.toLowerCase()) ||
            targetTitle.toLowerCase().includes(r.title.toLowerCase())))
    );
    return {
      relation: {
        ...rel,
        targetTitle: targetTitle || rel.targetId || "Risorsa Correlata",
        relationType: rel.relationType || (rel as any).type || "references",
      },
      targetResource: match,
    };
  });

  // Extract clean markdown without frontmatter for reader display
  const contentBody = rawMarkdown.replace(/^---[\s\S]*?---\n*/, "") || resource.summary;
  const wordCount = contentBody.trim().split(/\s+/).filter(Boolean).length;
  const isShallowDraft =
    wordCount < 120 ||
    contentBody.includes("Documentazione acquisita tramite il modulo di upload") ||
    contentBody.includes("Contenuto estratto dal file") ||
    (resource.summary && resource.summary.includes("Documento acquisito da") && wordCount < 200);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-[#0C0C0C] border border-[#242424] rounded-2xl w-full max-w-4xl max-h-[94vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#1C1C1C] bg-[#090909] flex items-center justify-between gap-2.5">
          {/* Left Title & Badges */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#181818] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-mono uppercase bg-[#181818] text-[#C5A059] px-1.5 sm:px-2 py-0.5 rounded border border-[#C5A059]/30 shrink-0">
                  OKF v0.2
                </span>
                {resource.metadata?.domain && (
                  <span className="hidden xs:inline-block text-[9px] sm:text-[10px] font-mono text-[#888] bg-[#141414] px-1.5 sm:px-2 py-0.5 rounded truncate max-w-[120px] sm:max-w-[180px]">
                    {resource.metadata.domain}
                  </span>
                )}
                {resource.metadata?.docType && (
                  <span className="text-[9px] sm:text-[10px] font-mono text-[#777] bg-[#121212] px-1.5 py-0.5 rounded uppercase shrink-0">
                    {resource.metadata.docType}
                  </span>
                )}
                {(resource.metadata?.status === "draft" || resource.metadata?.isDraft) && (
                  <span className="text-[9px] sm:text-[10px] font-mono text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1.5 sm:px-2 py-0.5 rounded shrink-0">
                    Bozza (Draft)
                  </span>
                )}
                {(resource.metadata?.uncategorized || resource.metadata?.isUncategorized || resource.metadata?.domain === "Uncategorized") && (
                  <span className="text-[9px] sm:text-[10px] font-mono text-[#AAA] bg-[#1E1E1E] border border-[#333] px-1.5 sm:px-2 py-0.5 rounded shrink-0">
                    Uncategorized
                  </span>
                )}
                <span className="text-[9px] sm:text-[10px] font-mono text-[#777] bg-[#121212] px-1.5 py-0.5 rounded shrink-0">
                  {contentBody.trim().split(/\s+/).filter(Boolean).length} parole
                </span>
              </div>
              <h2 className="text-sm sm:text-lg font-serif text-white font-medium truncate mt-0.5">
                {resource.title}
              </h2>
            </div>
          </div>

          {/* Right Action & Prominent Close Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Direct Edit Button */}
            {onOpenEdit && (
              <button
                type="button"
                onClick={() => onOpenEdit(resource)}
                className="flex items-center gap-1.5 text-xs text-[#E5C170] hover:text-white bg-[#1A160C] hover:bg-[#282112] border border-[#C5A059]/40 hover:border-[#C5A059] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer shadow-xs font-mono font-medium"
                title="Modifica metadati, titolo, tipologia e contenuto del documento"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#C5A059]" />
                <span className="hidden xs:inline">Modifica</span>
              </button>
            )}

            {/* AI Expand Documentation Button */}
            <button
              onClick={handleExpandWithAI}
              disabled={isExpanding}
              className="flex items-center gap-1.5 text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shadow-sm shrink-0"
              title="Genera ed espandi la documentazione tecnica in modo approfondito con Google Gemini"
            >
              {isExpanding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                  <span className="hidden sm:inline">Espansione AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-black" />
                  <span className="hidden sm:inline">Approfondisci con AI</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1 text-xs text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-[#2B2B2B] px-2 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
              title="Copia Markdown OKF"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-mono text-[11px] sm:text-xs">Copiato</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span className="hidden md:inline font-mono">Copia .md</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadMarkdown}
              className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer ${
                markdownDownloaded
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                  : "text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-[#2B2B2B]"
              }`}
              title="Scarica documento OKF in formato .okf.md (.md)"
              aria-label="Scarica file markdown OKF"
            >
              {markdownDownloaded ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Download className="w-4 h-4 text-[#C5A059]" />
              )}
              <span className="hidden md:inline font-mono">
                {markdownDownloaded ? "Scaricato!" : ".md"}
              </span>
            </button>

            {/* Compare Side-by-Side Button for Refactored Documents */}
            {resource.metadata?.rawSourceDocument && onOpenComparison && (
              <button
                onClick={() => onOpenComparison(resource)}
                className="p-1.5 sm:p-2 border rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border-indigo-700/50 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer shadow-sm"
                title="Confronta Side-by-Side: fonte originale vs specifica OKF v0.2 rielaborata"
              >
                <Wand2 className="w-4 h-4 text-indigo-400" />
                <span className="hidden md:inline font-mono">Confronta Diff</span>
              </button>
            )}

            {/* Google Doc Export / Open */}
            {onExportGoogleDoc && (
              <button
                onClick={() => onExportGoogleDoc(resource)}
                className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono ${
                  resource.metadata?.gdocUrl
                    ? "bg-[#4285F4]/20 border-[#4285F4]/40 text-[#4285F4] hover:bg-[#4285F4]/30"
                    : "bg-[#141414] hover:bg-[#1E1E1E] border-[#2B2B2B] text-[#AAA] hover:text-[#4285F4]"
                }`}
                title={resource.metadata?.gdocUrl ? "Apri o aggiorna Google Doc in cartella 'knowledge'" : "Esporta in Google Doc nella cartella 'knowledge'"}
              >
                <FileText className="w-4 h-4 text-[#4285F4]" />
                <span className="hidden sm:inline">{resource.metadata?.gdocUrl ? "Google Doc" : "Crea GDoc"}</span>
              </button>
            )}

            {/* Quick Copy Link (Graffetta) Icon Button */}
            {resource.url && (
              <button
                type="button"
                onClick={handleCopyLink}
                className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer ${
                  copiedLink
                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                    : "text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-[#2B2B2B]"
                }`}
                title={copiedLink ? "Link copiato negli appunti!" : "Copia link sorgente negli appunti"}
                aria-label="Copia link sorgente"
              >
                {copiedLink ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <LinkIcon className="w-4 h-4 text-[#C5A059]" />
                )}
                <span className="hidden md:inline font-mono">
                  {copiedLink ? "Copiato!" : "Link"}
                </span>
              </button>
            )}

            {/* Direct Download PDF Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer ${
                pdfDownloaded
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                  : isGeneratingPdf
                  ? "bg-[#1A140B] text-[#C5A059] border-[#C5A059]/40"
                  : "bg-[#141414] hover:bg-[#1E1E1E] text-[#AAA] hover:text-[#C5A059] border-[#2B2B2B]"
              }`}
              title="Scarica documento PDF per consultazione offline"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-4 h-4 text-[#C5A059] animate-spin" />
              ) : pdfDownloaded ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <FileDown className="w-4 h-4 text-[#C5A059]" />
              )}
              <span className="hidden md:inline font-mono">PDF</span>
            </button>

            {onPrintPreview && (
              <button
                onClick={() => onPrintPreview(resource)}
                className="p-1.5 sm:p-2 text-[#AAA] hover:text-[#C5A059] bg-[#141414] hover:bg-[#1E1E1E] border border-[#2B2B2B] rounded-lg transition-colors shrink-0"
                title="Anteprima di Stampa & Salva in PDF"
              >
                <Printer className="w-4 h-4 text-[#C5A059]" />
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl sm:rounded-lg bg-[#222] sm:bg-[#1C1C1C] hover:bg-[#2E2E2E] active:bg-[#383838] text-white border border-[#444] sm:border-[#333] transition-all active:scale-95 shrink-0 cursor-pointer shadow-md"
              title="Chiudi finestra (Esc)"
            >
              <X className="w-5 h-5 stroke-[2.5] sm:stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {expandMessage && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <span>{expandMessage}</span>
            <button onClick={() => setExpandMessage(null)} className="text-emerald-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="px-3 sm:px-6 border-b border-[#1A1A1A] bg-[#0A0A0A] flex items-center gap-2 sm:gap-4 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab("document")}
            className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "document"
                ? "border-[#C5A059] text-white"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Lettore Markdown</span>
          </button>
          {resource.metadata?.rawSourceDocument && (
            <button
              onClick={() => setActiveTab("raw_source")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeTab === "raw_source"
                  ? "border-amber-400 text-amber-300 font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Fonte Originale Grezza</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab("graph_links")}
            className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "graph_links"
                ? "border-[#C5A059] text-white"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <Network className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Connessioni ({linkedResources.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("okf_spec")}
            className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "okf_spec"
                ? "border-[#C5A059] text-white"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Sorgente YAML</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 sm:space-y-6 text-[#CCC]">
          {activeTab === "document" && (
            <div className="space-y-6">
              {/* Refactored Document Info Banner */}
              {resource.metadata?.rawSourceDocument && (
                <div className="bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-[#121212] border border-indigo-700/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-indigo-900/40 border border-indigo-700/50 text-indigo-300 shrink-0 mt-0.5">
                      <Wand2 className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-white text-sm">
                          Documento Rielaborato &amp; Migliorato
                        </h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                          OKF v0.2 Protocol
                        </span>
                        {resource.metadata.refactoringAudit?.readabilityDelta !== undefined && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-700/50">
                            +{resource.metadata.refactoringAudit.readabilityDelta}% Qualità
                          </span>
                        )}
                      </div>
                      <p className="text-[#BBB] text-xs mt-1 leading-relaxed">
                        {resource.metadata.refactoringAudit?.keyDifferencesSummary ||
                          "Questo documento è stato compreso a fondo e ristrutturato in OKF v0.2. La fonte originale è salvata integra nel Vault."}
                      </p>
                      {resource.metadata.refactoringAudit?.improvementsApplied && resource.metadata.refactoringAudit.improvementsApplied.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {resource.metadata.refactoringAudit.improvementsApplied.map((imp, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#141414] border border-[#2B2B2B] text-[#DDD]">
                              ✓ {imp}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {onOpenComparison && (
                    <button
                      onClick={() => onOpenComparison(resource)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Apri Comparatore</span>
                    </button>
                  )}
                </div>
              )}
              {/* Draft / Shallow Content Warning & AI Upgrade Banner */}
              {(isShallowDraft || resource.metadata?.status === "draft" || resource.metadata?.isDraft) && (
                <div className="bg-[#1C160B] border border-[#C5A059]/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[#C5A059]/20 text-[#E5C170] shrink-0 mt-0.5 sm:mt-0">
                      <Sparkles className="w-5 h-5 text-[#C5A059]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#E5C170] text-sm flex items-center gap-1.5 flex-wrap">
                        <span>{resource.metadata?.status === "draft" ? "Documento in stato Bozza (Draft)" : "Bozza essenziale rilevata"}</span>
                        <span className="text-[10px] font-mono font-normal text-[#C5A059] bg-[#C5A059]/15 px-1.5 py-0.5 rounded">
                          {resource.metadata?.uncategorized ? "Uncategorized Draft" : "OKF Draft"}
                        </span>
                      </h4>
                      <p className="text-[#BBB] text-xs mt-0.5 leading-relaxed">
                        {resource.metadata?.draftReason || 
                          "Questo documento è stato salvato come bozza dal Validatore Schema per preservare tutti i dati. Usa Gemini per generare la specifica tecnica completa, l'ontologia e il grafo topologico."}
                      </p>
                      {resource.metadata?.okfValidationWarnings && resource.metadata.okfValidationWarnings.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-[#888] font-mono">Campi da completare:</span>
                          {resource.metadata.okfValidationWarnings.map((warn, wIdx) => (
                            <span key={wIdx} className="text-[9.5px] font-mono bg-black/40 text-amber-300/80 border border-amber-500/20 px-1.5 py-0.2 rounded">
                              {warn}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleExpandWithAI}
                    disabled={isExpanding}
                    className="shrink-0 px-3.5 py-2 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-sm text-xs font-mono disabled:opacity-50"
                  >
                    {isExpanding ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        <span>Generazione in corso...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-black" />
                        <span>Approfondisci con AI</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* SOP / Procedure Operational Highlights Banner */}
              {resource.type === "procedure" && (
                <div className="bg-[#081318] border border-[#22D3EE]/40 rounded-xl p-4 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#22D3EE]/20 pb-2.5">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#22D3EE]">
                      <Workflow className="w-4 h-4 text-[#22D3EE]" />
                      <span className="uppercase tracking-wider">Playbook Operativo Standard (SOP)</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                      {resource.metadata?.targetSystem && (
                        <span className="px-2 py-0.5 rounded-full bg-[#0D242C] text-[#A5F3FC] border border-[#164E63]">
                          Sistema: {resource.metadata.targetSystem}
                        </span>
                      )}
                      {resource.metadata?.estimatedDuration && (
                        <span className="px-2 py-0.5 rounded-full bg-[#141F1A] text-emerald-400 border border-emerald-800/40 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{resource.metadata.estimatedDuration}</span>
                        </span>
                      )}
                      {resource.metadata?.riskLevel && (
                        <span className={`px-2 py-0.5 rounded-full uppercase font-bold border ${
                          resource.metadata.riskLevel === "critical"
                            ? "bg-red-950/70 border-red-700/60 text-red-300"
                            : resource.metadata.riskLevel === "high"
                            ? "bg-orange-950/70 border-orange-700/60 text-orange-300"
                            : resource.metadata.riskLevel === "medium"
                            ? "bg-amber-950/70 border-amber-700/60 text-amber-300"
                            : "bg-emerald-950/70 border-emerald-700/60 text-emerald-300"
                        }`}>
                          Rischio: {resource.metadata.riskLevel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Safety Warnings if present */}
                  {resource.metadata?.safetyWarnings && resource.metadata.safetyWarnings.length > 0 && (
                    <div className="bg-[#180A0A] border border-red-800/50 rounded-lg p-2.5 text-xs text-red-200 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold font-mono text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Avvertenze di Sicurezza:</span>
                      </div>
                      <ul className="pl-4 list-disc space-y-0.5 text-[11.5px]">
                        {resource.metadata.safetyWarnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Prerequisites & Required Tools */}
                  {((resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0) || (resource.metadata?.requiredTools && resource.metadata.requiredTools.length > 0)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                      {resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0 && (
                        <div className="p-2 rounded bg-[#061014] border border-[#164E63]/60">
                          <span className="text-[10px] uppercase text-[#67E8F9] font-bold block mb-1">Prerequisiti:</span>
                          <span className="text-[#CCC] text-[11px]">{resource.metadata.prerequisites.join(" • ")}</span>
                        </div>
                      )}
                      {resource.metadata?.requiredTools && resource.metadata.requiredTools.length > 0 && (
                        <div className="p-2 rounded bg-[#061014] border border-[#164E63]/60">
                          <span className="text-[10px] uppercase text-[#67E8F9] font-bold block mb-1">Strumenti:</span>
                          <span className="text-[#A5F3FC] text-[11px]">{resource.metadata.requiredTools.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rollback Plan Note */}
                  {resource.metadata?.rollbackPlan && (
                    <div className="p-2.5 rounded-lg bg-[#140D05] border border-orange-800/40 text-xs text-orange-200/90 flex items-start gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold font-mono text-orange-400 text-[10.5px] uppercase mr-1.5">Piano di Rollback:</span>
                        <span className="text-[11.5px]">{resource.metadata.rollbackPlan}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Executive Summary Card */}
              <div className="bg-[#111] border border-[#1F1F1F] rounded-xl p-4">
                <div className="text-[10px] font-mono uppercase text-[#666] tracking-wider mb-1">
                  Sommario Esecutivo
                </div>
                <p className="text-xs sm:text-sm text-[#DDD] leading-relaxed">
                  {resource.summary}
                </p>
              </div>

              {/* Image Asset / Screenshot Preview Card */}
              {(resource.metadata?.mediaType === "image" || resource.metadata?.imageUrl || (resource.metadata?.sourceFileType && ["png", "jpg", "jpeg", "webp", "gif"].includes(resource.metadata.sourceFileType.toLowerCase()))) && (
                <div className="bg-[#10100E] border border-[#C5A059]/30 rounded-xl p-4 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#E5C170] font-semibold">
                      <ImageIcon className="w-4 h-4 text-[#C5A059]" />
                      <span>Immagine / Screenshot Sorgente Multimodale</span>
                    </div>
                    {resource.metadata?.sourceFileName && (
                      <span className="text-[10px] font-mono text-[#AAA] bg-[#181814] px-2 py-0.5 rounded border border-[#333] truncate max-w-[220px]">
                        {resource.metadata.sourceFileName}
                      </span>
                    )}
                  </div>
                  {resource.metadata?.imageUrl ? (
                    <div className="rounded-lg overflow-hidden border border-[#222] bg-black/60 flex flex-col items-center justify-center p-2">
                      <img 
                        src={resource.metadata.imageUrl} 
                        alt={resource.title} 
                        className={`max-w-full rounded object-contain transition-all cursor-pointer ${isImageExpanded ? "max-h-[600px]" : "max-h-72"}`}
                        onClick={() => setIsImageExpanded(!isImageExpanded)}
                        title="Clicca per ingrandire o ridurre l'anteprima"
                      />
                      <button
                        type="button"
                        onClick={() => setIsImageExpanded(!isImageExpanded)}
                        className="mt-2 text-[10.5px] font-mono text-[#888] hover:text-[#E5C170] transition-colors cursor-pointer"
                      >
                        {isImageExpanded ? "Riduci anteprima ▲" : "Ingrandisci anteprima ▼"}
                      </button>
                    </div>
                  ) : null}
                  <p className="text-[11px] text-[#888] font-mono leading-relaxed">
                    Scansionato e interpretato visivamente dal motore multimodale Gemini OKF v0.2. Gli elementi grafici, testo OCR ed entità sono formalizzati nel documento sottostante.
                  </p>
                </div>
              )}

              {/* Video Player Card for YouTube / Tech Talks */}
              {(() => {
                const url = resource.url || "";
                const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
                const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
                const videoId = ytMatch ? ytMatch[1] : null;

                if (!videoId && resource.metadata?.mediaType !== "video") return null;

                return (
                  <div className="bg-[#0E0C10] border border-purple-900/40 rounded-xl p-4 space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-purple-300 font-semibold">
                        <Video className="w-4 h-4 text-purple-400" />
                        <span>Tech Talk & Video Intelligence {videoId ? "(YouTube Embedded)" : ""}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#AAA] bg-[#16121C] px-2 py-0.5 rounded border border-purple-900/30">
                        {resource.metadata?.siteName || "Video Stream"}
                      </span>
                    </div>

                    {videoId && (
                      <div className="rounded-lg overflow-hidden border border-[#222] aspect-video w-full bg-black">
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                          title={resource.title}
                          className="w-full h-full border-none"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                    )}
                    <p className="text-[11px] text-[#888] font-mono leading-relaxed">
                      Risorsa multimediale video con analisi strutturata dei concetti chiave, abstract e relazioni nel Vault.
                    </p>
                  </div>
                );
              })()}

              {/* Audio Media / Transcription Card */}
              {(resource.metadata?.mediaType === "audio" || resource.metadata?.audioTranscript) && (
                <div className="bg-[#12100A] border border-amber-900/50 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 font-semibold">
                      <Headphones className="w-4 h-4" />
                      <span>Trascrizione Audio Gemini 3.5</span>
                    </div>
                    {resource.metadata?.audioDurationSec && (
                      <span className="text-[10px] font-mono text-[#888] bg-[#1C1810] px-2 py-0.5 rounded border border-amber-900/30">
                        Durata: {Math.floor(resource.metadata.audioDurationSec / 60)}m {Math.floor(resource.metadata.audioDurationSec % 60)}s
                      </span>
                    )}
                  </div>
                  {resource.metadata?.audioTranscript ? (
                    <div className="bg-[#0A0906] p-3 rounded-lg border border-[#221D12] text-xs font-mono text-[#D8C7A0] leading-relaxed max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                      {resource.metadata.audioTranscript}
                    </div>
                  ) : (
                    <p className="text-xs text-[#888] font-mono">
                      La trascrizione integrale è stata elaborata e strutturata nelle sezioni Markdown sottostanti.
                    </p>
                  )}
                </div>
              )}

              {/* Structured OKF v0.2 Metadata Grid */}
              {(resource.metadata?.author || resource.metadata?.version || resource.metadata?.docVersion || resource.metadata?.status || resource.metadata?.license || (resource.metadata?.dependencies && resource.metadata.dependencies.length > 0) || (resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0)) && (
                <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-xl p-4 space-y-3">
                  <div className="text-[10px] font-mono uppercase text-[#C5A059] font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Specifiche & Metadati OKF v0.2</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {/* Author / Maintainer */}
                    {(resource.metadata?.author || resource.metadata?.maintainer) && (
                      <div className="bg-[#141414] border border-[#222] rounded-lg p-2.5">
                        <div className="text-[10px] font-mono text-[#777] uppercase flex items-center gap-1 mb-1">
                          <User className="w-3 h-3 text-[#C5A059]" />
                          <span>Autore / Maintainer</span>
                        </div>
                        <div className="font-mono text-[#EEE] font-medium truncate">
                          {resource.metadata?.author || resource.metadata?.maintainer}
                        </div>
                      </div>
                    )}

                    {/* Version */}
                    {(resource.metadata?.version || resource.metadata?.docVersion || resource.metadata?.okfVersion) && (
                      <div className="bg-[#141414] border border-[#222] rounded-lg p-2.5">
                        <div className="text-[10px] font-mono text-[#777] uppercase flex items-center gap-1 mb-1">
                          <Layers className="w-3 h-3 text-[#C5A059]" />
                          <span>Versione Doc</span>
                        </div>
                        <div className="font-mono text-[#C5A059] font-medium">
                          v{resource.metadata?.version || resource.metadata?.docVersion || resource.metadata?.okfVersion || "0.2"}
                        </div>
                      </div>
                    )}

                    {/* Status */}
                    {resource.metadata?.status && (
                      <div className="bg-[#141414] border border-[#222] rounded-lg p-2.5">
                        <div className="text-[10px] font-mono text-[#777] uppercase flex items-center gap-1 mb-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Stato</span>
                        </div>
                        <div className="font-mono text-emerald-400 font-medium uppercase text-[11px]">
                          {resource.metadata.status}
                        </div>
                      </div>
                    )}

                    {/* License */}
                    {resource.metadata?.license && (
                      <div className="bg-[#141414] border border-[#222] rounded-lg p-2.5">
                        <div className="text-[10px] font-mono text-[#777] uppercase flex items-center gap-1 mb-1">
                          <Shield className="w-3 h-3 text-[#38BDF8]" />
                          <span>Licenza</span>
                        </div>
                        <div className="font-mono text-[#38BDF8] font-medium truncate">
                          {resource.metadata.license}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dependencies / Prerequisites Chips */}
                  {((resource.metadata?.dependencies && resource.metadata.dependencies.length > 0) || (resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0)) && (
                    <div className="pt-2 border-t border-[#1C1C1C] flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-[10px] font-mono text-[#777] uppercase">Dipendenze / Prerequisiti:</span>
                      {(resource.metadata.dependencies || resource.metadata.prerequisites || []).map((dep, idx) => (
                        <span key={`reader-dep-${idx}-${dep}`} className="text-[11px] font-mono bg-[#161616] text-[#BBB] border border-[#2A2A2A] px-2 py-0.5 rounded">
                          {dep}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Entities Pill Bar */}
              {resource.metadata?.entities && resource.metadata.entities.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono text-[#666]">Entità Rilevate:</span>
                  {resource.metadata.entities.map((e, idx) => {
                    const name = typeof e === "string" ? e : e.name;
                    const type = typeof e === "string" ? "entity" : e.type;
                    return (
                      <span
                        key={`reader-ent-${idx}-${name}`}
                        className="text-[11px] font-mono bg-[#141414] text-[#C5A059] border border-[#2B2B2B] px-2 py-0.5 rounded flex items-center gap-1"
                      >
                        <span className="text-[9px] text-[#666] uppercase">{type}:</span>
                        <span>{name}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Rendered Markdown Body */}
              <div className="bg-[#0A0A0A] border border-[#161616] rounded-xl p-6 text-sm text-[#CCC] leading-relaxed space-y-4 font-sans">
                <div className="prose prose-invert max-w-none">
                  <Markdown>{contentBody}</Markdown>
                </div>
              </div>

              {/* Tag Cloud */}
              {resource.tags && resource.tags.length > 0 && (
                <div className="pt-4 border-t border-[#1C1C1C] flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-[#666] flex items-center gap-1">
                    <Tag className="w-3 h-3 text-[#C5A059]" /> Tag:
                  </span>
                  {resource.tags.map((t, idx) => (
                    <span
                      key={`reader-tag-${idx}-${t}`}
                      className="text-xs font-mono bg-[#141414] text-[#AAA] border border-[#222] px-2.5 py-0.5 rounded"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "graph_links" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="text-xs text-[#888] font-mono flex items-center justify-between">
                  <span>Collegamenti ontologici OKF v0.2 dichiarati:</span>
                  <span className="text-[10px] text-[#C5A059]">{linkedResources.length} relazioni</span>
                </div>

                {linkedResources.length === 0 ? (
                  <div className="p-6 text-center bg-[#0F0F0F] border border-dashed border-[#222] rounded-xl text-[#666] text-xs">
                    Nessuna relazione esplicita dichiarata nei metadati di questo documento.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {linkedResources.map((item, idx) => (
                      <div
                        key={`reader-linked-${idx}-${item.relation.targetTitle}`}
                        onClick={() => item.targetResource && onNavigateToResource(item.targetResource)}
                        className={`p-4 rounded-xl border transition-all ${
                          item.targetResource
                            ? "bg-[#111] hover:bg-[#161616] border-[#222] hover:border-[#C5A059] cursor-pointer"
                            : "bg-[#0A0A0A] border-[#1A1A1A] opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                          <span className="text-[#C5A059] uppercase bg-[#181818] px-2 py-0.5 rounded border border-[#262626]">
                            rel:{item.relation.relationType}
                          </span>
                          <span className="text-[#666]">
                            Peso: {item.relation.weight || 0.8}
                          </span>
                        </div>

                        <h4 className="text-sm font-serif text-white font-medium flex items-center justify-between">
                          <span>{item.relation.targetTitle}</span>
                          {item.targetResource && <ArrowRight className="w-3.5 h-3.5 text-[#C5A059]" />}
                        </h4>

                        {item.targetResource ? (
                          <p className="text-[11px] text-[#777] line-clamp-2 mt-1.5">
                            {item.targetResource.summary}
                          </p>
                        ) : (
                          <p className="text-[10px] text-[#555] font-mono mt-1">
                            (Entità esterna non ancora catalogata nel Vault)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Correlated Resources in the Vault (Semantic Affinity Engine) */}
              {correlatedResources.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[#1C1C1C]">
                  <div className="text-xs text-[#888] font-mono flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-teal-400">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                      <span>Documenti correlati nel Vault (Tag & Contenuto condiviso):</span>
                    </span>
                    <span className="text-[10px] text-teal-400 font-semibold">{correlatedResources.length} correlati</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {correlatedResources.map((item, idx) => (
                      <div
                        key={`reader-corr-${idx}-${item.resource.id || item.resource.title}`}
                        className="p-4 rounded-xl bg-[#0F1414] hover:bg-[#121919] border border-teal-900/40 hover:border-teal-500/60 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {item.sharedTags.slice(0, 2).map((tg) => (
                                <span key={tg} className="text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                                  #{tg}
                                </span>
                              ))}
                              {item.overlappingTerms.slice(0, 2).map((term) => (
                                <span key={term} className="text-teal-300 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800/40">
                                  {term}
                                </span>
                              ))}
                            </div>
                            <span className="text-teal-300 font-semibold bg-teal-950/90 px-2 py-0.5 rounded border border-teal-700/60">
                              {item.score}% affinità
                            </span>
                          </div>

                          <h4 
                            onClick={() => onNavigateToResource(item.resource)}
                            className="text-sm font-serif text-white hover:text-teal-300 font-medium flex items-center justify-between cursor-pointer"
                          >
                            <span className="truncate mr-2">{item.resource.title}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                          </h4>

                          <p className="text-[11px] text-[#888] line-clamp-2 mt-1.5 leading-relaxed">
                            {item.explanation || item.resource.summary}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 mt-3 border-t border-teal-950/70 text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => onNavigateToResource(item.resource)}
                            className="text-teal-400 hover:text-teal-200 underline cursor-pointer"
                          >
                            Apri Documento
                          </button>
                          {onViewInGraph && (
                            <button
                              type="button"
                              onClick={() => onViewInGraph(item.resource)}
                              className="text-teal-400 hover:text-teal-200 underline cursor-pointer flex items-center gap-1"
                            >
                              <Network className="w-3 h-3 text-teal-400" />
                              <span>Nel Grafo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "okf_spec" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#888]">
                <span>Sorgente serializzata YAML Frontmatter + Markdown OKF v0.2:</span>
                <span className="text-[10px] font-mono text-[#C5A059]">UTF-8 Markdown</span>
              </div>
              <pre className="p-4 bg-[#060606] border border-[#1C1C1C] rounded-xl text-xs font-mono text-[#D5B069] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {rawMarkdown}
              </pre>
            </div>
          )}

          {activeTab === "raw_source" && resource.metadata?.rawSourceDocument && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#121212] border border-[#222] rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span className="font-bold text-white">Fonte Originale Grezza (Audit Trail)</span>
                  <span className="text-[#777] font-mono text-[11px]">
                    ({resource.metadata.rawSourceDocument.length} caratteri • {resource.metadata.rawSourceDocument.split(/\s+/).filter(Boolean).length} parole)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(resource.metadata?.rawSourceDocument || "");
                      setCopiedRaw(true);
                      setTimeout(() => setCopiedRaw(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] text-[#AAA] hover:text-white px-2.5 py-1 rounded-lg bg-[#1C1C1C] hover:bg-[#252525] border border-[#333] transition-colors cursor-pointer"
                  >
                    {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{copiedRaw ? "Copiato" : "Copia Fonte Originale"}</span>
                  </button>
                  {onOpenComparison && (
                    <button
                      onClick={() => onOpenComparison(resource)}
                      className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-white px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/50 transition-colors cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Confronta Side-by-Side</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-[#080808] border border-[#1E1E1E] rounded-xl p-4 overflow-x-auto">
                <pre className="font-mono text-xs text-[#AAA] whitespace-pre-wrap leading-relaxed break-words font-normal">
                  {resource.metadata.rawSourceDocument}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
