import React, { useState, useEffect } from "react";
import { 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  Star, 
  ExternalLink, 
  Copy, 
  Check, 
  Terminal, 
  ChevronRight,
  BrainCircuit,
  FileCode,
  FileText,
  Globe,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Award,
  ThumbsUp,
  ThumbsDown,
  Target,
  Languages,
  Zap,
  Wrench,
  ListChecks,
  Users,
  AlertTriangle,
  Printer,
  FileDown,
  Loader2,
  GraduationCap,
  Rss,
  StickyNote,
  Headphones,
  Edit3,
  BookMarked,
  Image as ImageIcon,
  Video,
  Workflow,
  Layers
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { isReadLaterResource, getReadLaterPriority } from "../lib/readLaterUtils";
import { fetchOpenGraphData, OpenGraphResult } from "../lib/ogUtils";
import { generateAndDownloadResourcePdf } from "../lib/pdfExport";

interface ResourceCardProps {
  resource: ResourceItem;
  onToggleFavorite: (id: string, currentFav: boolean) => void;
  onOpenDetail: (resource: ResourceItem) => void;
  onOpenEdit?: (resource: ResourceItem) => void;
  onUpdateProgress?: (id: string, progress: number) => void;
  onPrintPreview?: (resource: ResourceItem) => void;
  onExportGoogleDoc?: (resource: ResourceItem) => void;
  onDownloadPdf?: (resource: ResourceItem) => void;
  onOpenAudioOverview?: (resource: ResourceItem) => void;
  onSelectTag?: (tag: string) => void;
  selectedTag?: string | null;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  isSelectionActive?: boolean;
  onToggleReadLater?: (id: string, currentlyInQueue: boolean) => void;
  onUpdateResource?: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onToggleFavorite,
  onOpenDetail,
  onOpenEdit,
  onUpdateProgress,
  onPrintPreview,
  onExportGoogleDoc,
  onDownloadPdf,
  onOpenAudioOverview,
  onSelectTag,
  selectedTag,
  isSelected = false,
  onToggleSelect,
  isSelectionActive = false,
  onToggleReadLater,
  onUpdateResource,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [ogData, setOgData] = useState<OpenGraphResult | null>(null);
  const [isLoadingOg, setIsLoadingOg] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeSuccess, setReanalyzeSuccess] = useState(false);

  // Direct client-side generation of offline PDF reference document
  const handleDirectPdfDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGeneratingPdf) return;

    if (onDownloadPdf) {
      onDownloadPdf(resource);
      return;
    }

    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      await generateAndDownloadResourcePdf(resource);
      setPdfDownloaded(true);
      setTimeout(() => setPdfDownloaded(false), 2500);
    } catch (err) {
      console.error("Errore generazione PDF:", err);
      setPdfError("Errore");
      setTimeout(() => setPdfError(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Read-It-Later determination
  const isReadLater = isReadLaterResource(resource);
  const readLaterPriority = getReadLaterPriority(resource);

  // Current reading progress state with optimistic local sync
  const currentProgress = resource.metadata?.readingProgress ?? (resource as any).readingProgress ?? 0;
  const [localProgress, setLocalProgress] = useState<number>(currentProgress);

  useEffect(() => {
    setLocalProgress(resource.metadata?.readingProgress ?? (resource as any).readingProgress ?? 0);
  }, [resource.metadata?.readingProgress, (resource as any).readingProgress]);

  const handleProgressChange = (newProgress: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newProgress)));
    setLocalProgress(clamped);
    if (onUpdateProgress) {
      onUpdateProgress(resource.id, clamped);
    }
  };

  // Fetch Open Graph data dynamically if not already present in resource metadata
  useEffect(() => {
    if (
      (resource.type === "article" || resource.type === "link") && 
      resource.url && 
      (resource.url.startsWith("http://") || resource.url.startsWith("https://"))
    ) {
      // If resource already has description/summary and favicon or domain, avoid extra network calls
      if ((resource.metadata?.ogDescription || resource.summary) && (resource.metadata?.favicon || resource.metadata?.domain)) {
        return;
      }

      let isMounted = true;
      setIsLoadingOg(true);
      fetchOpenGraphData(resource.url)
        .then((data) => {
          if (isMounted && data) {
            setOgData(data);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setIsLoadingOg(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [resource.type, resource.url, resource.metadata?.ogDescription, resource.metadata?.favicon, resource.metadata?.domain, resource.summary]);

  // Derived Open Graph values
  let domain = resource.metadata?.domain || ogData?.domain;
  if (!domain && resource.url) {
    try {
      domain = new URL(resource.url.startsWith("http") ? resource.url : `https://${resource.url}`).hostname.replace(/^www\./, "");
    } catch {}
  }

  const siteName = resource.metadata?.siteName || ogData?.siteName || domain;
  const metaDescription = resource.metadata?.ogDescription || ogData?.ogDescription;
  const author = resource.metadata?.author || ogData?.author;
  const readingTimeMin = resource.metadata?.readingTimeMin;
  
  const rawFavicon = resource.metadata?.favicon || ogData?.favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);
  const favicon = faviconError ? (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null) : rawFavicon;

  const getTypeBadge = (type: ResourceType) => {
    switch (type) {
      case "knowledge":
        return {
          label: "OKF Knowledge",
          icon: <BrainCircuit className="w-3 h-3 text-[#C5A059]" />,
          bg: "bg-[#14120D] border border-[#C5A059]/35 text-[#E5C170]",
        };
      case "troubleshooting":
        return {
          label: "Problemi & Fix",
          icon: <Wrench className="w-3 h-3 text-[#F97316]" />,
          bg: "bg-[#16100B] border border-[#F97316]/35 text-[#FB923C]",
        };
      case "procedure":
        return {
          label: "Procedura / SOP",
          icon: <Workflow className="w-3 h-3 text-[#22D3EE]" />,
          bg: "bg-[#09171C] border border-[#22D3EE]/35 text-[#67E8F9]",
        };
      case "paper":
        return {
          label: "Paper Scientifico",
          icon: <GraduationCap className="w-3 h-3 text-[#818CF8]" />,
          bg: "bg-[#101124] border border-[#818CF8]/35 text-[#A5B4FC]",
        };
      case "rss":
        return {
          label: "Feed RSS",
          icon: <Rss className="w-3 h-3 text-[#FB923C]" />,
          bg: "bg-[#18110B] border border-[#FB923C]/35 text-[#FDBA74]",
        };
      case "note":
        return {
          label: "Nota Rapida",
          icon: <StickyNote className="w-3 h-3 text-[#FBBF24]" />,
          bg: "bg-[#18160B] border border-[#FBBF24]/35 text-[#FDE047]",
        };
      case "github_repo":
        return {
          label: "GitHub Repo",
          icon: <Github className="w-3 h-3 text-[#A855F7]" />,
          bg: "bg-[#140F18] border border-[#A855F7]/30 text-[#C084FC]",
        };
      case "mcp_server":
        return {
          label: "MCP Server",
          icon: <Cpu className="w-3 h-3 text-[#38BDF8]" />,
          bg: "bg-[#0E151C] border border-[#38BDF8]/30 text-[#7DD3FC]",
        };
      case "ai_skill":
        return {
          label: "AI Skill",
          icon: <Sparkles className="w-3 h-3 text-[#10B981]" />,
          bg: "bg-[#0E1713] border border-[#10B981]/30 text-[#34D399]",
        };
      case "link":
        return {
          label: "Link Web",
          icon: <Globe className="w-3 h-3 text-[#06B6D4]" />,
          bg: "bg-[#0A161A] border border-[#06B6D4]/30 text-[#22D3EE]",
        };
      case "article":
      default:
        return {
          label: "Articolo",
          icon: <BookOpen className="w-3 h-3 text-[#F59E0B]" />,
          bg: "bg-[#16130B] border border-[#F59E0B]/30 text-[#FACC15]",
        };
    }
  };

  const badge = getTypeBadge(resource.type);

  // Quick Copy source URL or permanent link to clipboard
  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const linkToCopy = resource.url || resource.metadata?.feedUrl || (typeof window !== "undefined" ? `${window.location.origin}/#resource-${resource.id}` : "");
    if (linkToCopy) {
      navigator.clipboard.writeText(linkToCopy);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const displayDate = formatDate(resource.createdAt) || formatDate(resource.updatedAt) || formatDate(new Date());

  const score = typeof resource.metadata?.score === "number" ? resource.metadata.score : null;
  const scoreRationale = resource.metadata?.scoreRationale || "";

  // Analysis & Content Completion Flags (scannable indicators instead of cognitive text walls)
  const hasExecutiveSummary = Boolean(resource.metadata?.aiExecutiveSummary);
  const keyTakeawaysCount = resource.metadata?.aiKeyTakeaways?.length || 0;
  const hasKeyTakeaways = keyTakeawaysCount > 0;
  const solutionStepsCount = resource.metadata?.solutionSteps?.length || 0;
  const hasTroubleshooting = resource.type === "troubleshooting" || Boolean(resource.metadata?.affectedSystem || resource.metadata?.rootCause || solutionStepsCount > 0);
  const hasProcedure = resource.type === "procedure" || Boolean(resource.metadata?.procedureType || (resource.metadata?.stepsCount && resource.metadata.stepsCount > 0));
  const hasUserNotes = Boolean(resource.metadata?.userNotes);
  const prosCount = resource.metadata?.pros?.length || 0;
  const consCount = resource.metadata?.cons?.length || 0;
  const hasEvaluation = Boolean(prosCount > 0 || consCount > 0 || (resource.metadata?.useCases && resource.metadata.useCases.length > 0));
  const relationsCount = resource.metadata?.relations?.length || 0;
  const entitiesCount = resource.metadata?.entities?.length || 0;
  const hasGraphLinks = relationsCount > 0 || entitiesCount > 0;
  const hasItalianTranslation = Boolean(resource.metadata?.translatedSummary || resource.metadata?.translatedTitle || resource.metadata?.translatedContent);

  // Ingestion Health Indicator: Detect resources currently lacking AI-generated metadata (description or executive synthesis)
  const isCorruptedOrMinimalSummary =
    !resource.summary ||
    resource.summary.trim() === "" ||
    resource.summary.trim() === resource.url?.trim() ||
    resource.summary.trim() === resource.rawInput?.trim() ||
    resource.summary.startsWith("Collegamento web a ") ||
    resource.summary.includes("failed_as_link") ||
    resource.summary.includes("Nota: Il parser") ||
    resource.summary.includes("I link web non costituiscono") ||
    (resource.type === "article" && resource.summary.length < 90 && !hasExecutiveSummary) ||
    (resource.summary.length < 50 && !hasExecutiveSummary);

  const isPendingIntelligence =
    !hasExecutiveSummary && (isCorruptedOrMinimalSummary || !resource.summary);

  // Resolved display abstract: prefer rich executive summary if summary is short, empty, or corrupted
  const displayAbstract =
    resource.metadata?.aiExecutiveSummary && (!resource.summary || resource.summary.length < 90 || isCorruptedOrMinimalSummary)
      ? resource.metadata.aiExecutiveSummary
      : (resource.summary || "Nessuna descrizione o abstract preliminare disponibile.");

  const handleTriggerIntelligenceReanalysis = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReanalyzing) return;

    setIsReanalyzing(true);
    try {
      const res = await fetch("/api/summarize-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (data && data.summaryResult) {
        const {
          executiveSummary,
          keyTakeaways = [],
          targetAudience,
          actionItems = [],
          estimatedReadingTime,
          summarizedAt,
        } = data.summaryResult;

        const updatedMetadata: Record<string, any> = {
          ...(resource.metadata || {}),
          aiExecutiveSummary: executiveSummary,
          aiKeyTakeaways: keyTakeaways,
          aiTargetAudience: targetAudience,
          aiActionItems: actionItems,
          aiSummarizedAt: summarizedAt || new Date().toISOString(),
          ...(estimatedReadingTime ? { readingTimeMin: estimatedReadingTime } : {}),
          ...(data.extractedContent && (!resource.metadata?.markdownContent || resource.metadata.markdownContent.length < 200)
            ? { markdownContent: data.extractedContent }
            : {}),
        };

        const updateData: Partial<ResourceItem> = {
          metadata: updatedMetadata,
        };

        // Prefer high-density executive summary if existing summary is minimal or short
        const candidateSummary =
          executiveSummary && executiveSummary.trim().length > 50
            ? executiveSummary.slice(0, 320)
            : data.cleanedSummary;

        if (
          candidateSummary &&
          (!resource.summary ||
            resource.summary.length < 90 ||
            isCorruptedOrMinimalSummary ||
            resource.summary.startsWith("http") ||
            resource.summary.startsWith("Collegamento web a"))
        ) {
          updateData.summary = candidateSummary;
        }

        if (
          data.cleanedTitle &&
          data.cleanedTitle.trim().length > 3 &&
          (resource.title.startsWith("http") ||
            resource.title === "Nuova Risorsa" ||
            resource.title === "Collegamento Web" ||
            resource.title === "Medium" ||
            resource.title.toLowerCase().includes("wiht") ||
            resource.title.toLowerCase() === data.cleanedTitle.toLowerCase())
        ) {
          updateData.title = data.cleanedTitle;
        }

        if (onUpdateResource) {
          await onUpdateResource(resource.id, updateData);
        }

        setReanalyzeSuccess(true);
        setTimeout(() => setReanalyzeSuccess(false), 3500);
      }
    } catch (err: any) {
      console.error("Failed to re-run intelligence analysis:", err);
    } finally {
      setIsReanalyzing(false);
    }
  };

  return (
    <div 
      onClick={() => onOpenDetail(resource)}
      className={`group border p-4 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-200 cursor-pointer relative ${
        isSelected
          ? "border-[#C5A059] bg-[#141008] shadow-[0_0_20px_rgba(197,160,89,0.18)] ring-1 ring-[#C5A059]/40 opacity-100"
          : isPendingIntelligence
            ? "border-dashed border-amber-500/35 hover:border-amber-500/70 bg-[#0C0B08]/85 hover:bg-[#120F09] opacity-75 hover:opacity-100 shadow-[inset_0_1px_0_0_rgba(245,158,11,0.08)] hover:shadow-lg hover:shadow-amber-500/5"
            : "bg-[#0C0C0C] hover:bg-[#101010] border-[#1C1C1C] hover:border-[#C5A059]/40 hover:shadow-lg opacity-100"
      }`}
    >
      <div>
        {/* Top Header: Badge, Status, Date, Favorite */}
        <div className="flex justify-between items-center mb-3 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`text-[10.5px] px-2.5 py-1 rounded-md font-mono font-medium flex items-center gap-1.5 shrink-0 ${badge.bg}`}>
              {badge.icon}
              {badge.label}
            </span>

            {/* OKF Document Badge for ANY resource structured in OKF v0.2 */}
            {(resource.metadata?.okfVersion || resource.metadata?.markdownContent) && (
              <span
                className="text-[10px] bg-[#17140B] text-[#E5C170] border border-[#C5A059]/40 px-2 py-0.5 rounded-md font-mono font-medium flex items-center gap-1 shrink-0"
                title={`Documento con ontologia OKF ${resource.metadata?.okfVersion ? `v${resource.metadata.okfVersion}` : "v0.2"} (Frontmatter YAML, Entità e Relazioni)`}
              >
                <BrainCircuit className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>OKF {resource.metadata?.okfVersion ? `v${resource.metadata.okfVersion}` : "v0.2"}</span>
              </span>
            )}

            {/* Ingestion Health: Top-level Pending Intelligence Flag */}
            {isPendingIntelligence && (
              <button
                type="button"
                onClick={handleTriggerIntelligenceReanalysis}
                disabled={isReanalyzing}
                className="text-[10px] bg-[#231505] hover:bg-[#341F08] text-[#FBBF24] border border-[#F59E0B]/50 hover:border-[#F59E0B] px-2 py-0.5 rounded-md font-mono font-medium flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs group/intel"
                title="Ingestion Health: Sintesi o metadati AI mancanti. Clicca per generare con Gemini AI"
              >
                {isReanalyzing ? (
                  <>
                    <Loader2 className="w-2.5 h-2.5 text-[#F59E0B] animate-spin shrink-0" />
                    <span>Elaborazione...</span>
                  </>
                ) : reanalyzeSuccess ? (
                  <>
                    <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300 font-semibold">Pronta!</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                    <BrainCircuit className="w-2.5 h-2.5 text-[#F59E0B] group-hover/intel:scale-110 transition-transform shrink-0" />
                    <span>Pending Intelligence</span>
                    <Sparkles className="w-2 h-2 text-[#F59E0B]/80" />
                  </>
                )}
              </button>
            )}

            {/* Draft / Bozza Status Badge */}
            {(resource.metadata?.status === "draft" || resource.metadata?.isDraft) && (
              <span
                className="text-[10px] bg-[#221706] text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-mono font-medium flex items-center gap-1 shrink-0"
                title={resource.metadata?.draftReason || "Bozza: documento in attesa di completamento dei campi obbligatori OKF v0.2"}
              >
                <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                <span>Bozza (Draft)</span>
              </span>
            )}

            {/* Uncategorized Status Badge */}
            {(resource.metadata?.uncategorized || resource.metadata?.isUncategorized || resource.metadata?.domain === "Uncategorized") && (
              <span
                className="text-[10px] bg-[#161616] text-[#A0A0A0] border border-[#333] px-2 py-0.5 rounded-md font-mono font-medium flex items-center gap-1 shrink-0"
                title="Non categorizzato: dominio ontologico in attesa di classificazione"
              >
                <span>Non categorizzato</span>
              </span>
            )}

            {/* Read-It-Later Status Badge */}
            {isReadLater && (
              <span 
                className="text-[10px] bg-[#0C1524] text-[#7DD3FC] border border-[#38BDF8]/40 px-2 py-0.5 rounded font-mono flex items-center gap-1 shrink-0 font-medium"
                title={`Risorsa differita in Coda Read-It-Later (${readLaterPriority} priorità)`}
              >
                <BookMarked className="w-2.5 h-2.5 text-[#38BDF8]" />
                <span>Read Later</span>
              </span>
            )}

            {resource.type === "article" && localProgress === 100 && (
              <span className="text-[10px] bg-[#0E1712] text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                Letto
              </span>
            )}

            {resource.type === "article" && localProgress > 0 && localProgress < 100 && (
              <span className="text-[10px] bg-[#161208] text-[#E5C170] border border-[#C5A059]/30 px-1.5 py-0.5 rounded font-mono shrink-0">
                {localProgress}%
              </span>
            )}

            {(resource.metadata?.translatedSummary || resource.metadata?.translatedContent) && (
              <span 
                className="text-[10px] bg-[#0E1712] text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 shrink-0"
                title="Traduzione in italiano disponibile"
              >
                <Languages className="w-2.5 h-2.5 text-emerald-400" />
                <span>IT</span>
              </span>
            )}

            {(resource.metadata?.mediaType === "image" || resource.metadata?.imageUrl || (resource.metadata?.sourceFileType && ["png", "jpg", "jpeg", "webp", "gif"].includes(resource.metadata.sourceFileType.toLowerCase()))) && (
              <span 
                className="text-[10px] bg-[#1A160E] text-[#E5C170] border border-[#C5A059]/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 shrink-0"
                title="Risorsa originata da screenshot o immagine multimodale"
              >
                <ImageIcon className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Screenshot</span>
              </span>
            )}

            {(resource.metadata?.mediaType === "video" || (resource.url && (resource.url.includes("youtube.com") || resource.url.includes("youtu.be")))) && (
              <span 
                className="text-[10px] bg-[#160E1A] text-purple-300 border border-purple-800/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 shrink-0"
                title="Tech Talk o video multimediale"
              >
                <Video className="w-2.5 h-2.5 text-purple-400" />
                <span>Video Talk</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[#666] text-[10px] font-mono">
              {displayDate}
            </span>

            {/* Quick Copy Link (Graffetta) Icon Button - Always available in header beside PDF */}
            <button
              type="button"
              onClick={handleCopyLink}
              className={`p-1 rounded transition-colors cursor-pointer ${
                copiedLink
                  ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800/40"
                  : "text-[#555] hover:text-[#C5A059] hover:bg-[#181818]"
              }`}
              title={copiedLink ? "Link copiato negli appunti!" : resource.url ? "Copia link sorgente" : "Copia permalink risorsa"}
              aria-label="Copia link risorsa"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <LinkIcon className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Quick Download PDF Icon Button */}
            <button
              type="button"
              onClick={handleDirectPdfDownload}
              disabled={isGeneratingPdf}
              className={`p-1 rounded transition-colors cursor-pointer ${
                pdfDownloaded
                  ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800/40"
                  : isGeneratingPdf
                  ? "text-[#C5A059] bg-[#1A150A] animate-pulse"
                  : "text-[#555] hover:text-[#C5A059] hover:bg-[#181818]"
              }`}
              title={
                pdfDownloaded
                  ? "PDF scaricato con successo!"
                  : isGeneratingPdf
                  ? "Generazione PDF in corso..."
                  : "Scarica documento PDF offline"
              }
              aria-label="Scarica PDF offline"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 text-[#C5A059] animate-spin" />
              ) : pdfDownloaded ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Quick Audio Briefing Button */}
            {onOpenAudioOverview && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAudioOverview(resource);
                }}
                className="p-1 text-[#555] hover:text-[#E5C170] hover:bg-[#181818] rounded transition-colors cursor-pointer"
                title="Ascolta Audio Briefing di questa risorsa"
                aria-label="Ascolta Audio Briefing"
              >
                <Headphones className="w-3.5 h-3.5 text-[#C5A059]" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(resource.id, !!resource.isFavorite);
              }}
              className="p-1 text-[#444] hover:text-[#C5A059] transition-colors cursor-pointer"
              title={resource.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            >
              <Star 
                className={`w-4 h-4 ${resource.isFavorite ? "fill-[#C5A059] text-[#C5A059]" : ""}`} 
              />
            </button>

            {/* Read-It-Later Toggle Button */}
            {onToggleReadLater && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReadLater(resource.id, isReadLater);
                }}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isReadLater
                    ? "text-[#38BDF8] bg-[#38BDF8]/15 border border-[#38BDF8]/40 hover:bg-[#38BDF8]/25 shadow-xs"
                    : "text-[#444] hover:text-[#38BDF8] hover:bg-[#181818]"
                }`}
                title={
                  isReadLater
                    ? "Rimuovi dalla Coda Read-It-Later (Ripristina nei Progetti Attivi)"
                    : "Sposta in Read-It-Later (Conserva per dopo e libera la vista principale)"
                }
                aria-label={isReadLater ? "Rimuovi da Read-It-Later" : "Sposta in Read-It-Later"}
              >
                <BookMarked
                  className={`w-4 h-4 ${isReadLater ? "fill-[#38BDF8]/30 text-[#38BDF8]" : ""}`}
                />
              </button>
            )}

            {/* Selection Checkbox */}
            {onToggleSelect && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(resource.id);
                }}
                className={`p-1 rounded transition-all cursor-pointer ${
                  isSelected
                    ? "text-[#C5A059] bg-[#C5A059]/20 border border-[#C5A059]/60 opacity-100"
                    : isSelectionActive
                    ? "text-[#666] hover:text-[#C5A059] bg-[#161616] border border-[#333] opacity-100"
                    : "text-[#555] hover:text-[#C5A059] opacity-0 group-hover:opacity-100 bg-[#141414] border border-[#262626]"
                }`}
                title={isSelected ? "Deseleziona risorsa" : "Seleziona risorsa per azioni in blocco"}
                aria-label={isSelected ? "Deseleziona risorsa" : "Seleziona risorsa"}
              >
                <div
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                    isSelected
                      ? "bg-[#C5A059] border-[#C5A059]"
                      : "border-[#555] group-hover:border-[#888]"
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-black stroke-[3]" />}
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className={`text-base sm:text-lg font-serif transition-colors leading-snug mb-1.5 line-clamp-2 ${
          isPendingIntelligence ? "text-[#DDD] group-hover:text-amber-300" : "text-white group-hover:text-[#C5A059]"
        }`}>
          {resource.title}
        </h3>

        {/* Summary (Clean & scannable 2-line abstract) */}
        <p className={`text-xs leading-relaxed mb-3 line-clamp-2 ${
          isPendingIntelligence ? "text-[#7A7468] italic" : "text-[#888]"
        }`}>
          {displayAbstract}
        </p>

        {/* Visual Image / Screenshot Thumbnail Preview */}
        {resource.metadata?.imageUrl && (
          <div className="mb-3 rounded-lg overflow-hidden border border-[#222] bg-black/40 max-h-32 flex items-center justify-center p-1">
            <img 
              src={resource.metadata.imageUrl} 
              alt={resource.title} 
              className="max-h-28 w-auto object-contain rounded"
              loading="lazy"
            />
          </div>
        )}

        {/* Ingestion Health Visual Queue Prompt */}
        {isPendingIntelligence && (
          <div
            onClick={handleTriggerIntelligenceReanalysis}
            className="mb-3 px-2.5 py-1.5 rounded-lg bg-[#1D1408]/90 hover:bg-[#2A1D0B] border border-dashed border-[#F59E0B]/40 hover:border-[#F59E0B]/75 transition-all flex items-center justify-between gap-2 cursor-pointer group/prompt shadow-xs select-none"
            title="Ingestion Health: La risorsa è priva di sintesi e metadati AI completi. Clicca per estrarre e sintetizzare con Gemini AI."
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 rounded bg-amber-500/15 text-[#FBBF24] shrink-0 group-hover/prompt:scale-110 transition-transform">
                <BrainCircuit className="w-3.5 h-3.5 text-[#F59E0B]" />
              </div>
              <div className="truncate">
                <div className="text-[11px] font-mono font-semibold text-[#FBBF24] leading-tight flex items-center gap-1.5">
                  <span>Metadata AI Mancanti</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                </div>
                <div className="text-[10px] text-[#A89878] truncate">
                  Clicca per generare sintesi e punti chiave
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isReanalyzing}
              className="px-2 py-0.5 rounded bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 border border-[#F59E0B]/40 text-[#FBBF24] text-[10px] font-mono font-semibold flex items-center gap-1 shrink-0 transition-colors"
            >
              {isReanalyzing ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Elaborazione...</span>
                </>
              ) : reanalyzeSuccess ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-300">Pronta!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Genera AI</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Feature & Analysis Completion Indicators */}
        {(isPendingIntelligence || hasExecutiveSummary || hasKeyTakeaways || hasTroubleshooting || hasProcedure || hasUserNotes || hasGraphLinks) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3 select-none">
            {/* Ingestion Health Indicator: Pending Intelligence Action */}
            {isPendingIntelligence && (
              <button
                type="button"
                onClick={handleTriggerIntelligenceReanalysis}
                disabled={isReanalyzing}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#231505] hover:bg-[#341F08] border border-[#F59E0B]/50 hover:border-[#F59E0B] text-[#FBBF24] transition-all cursor-pointer group shadow-xs shrink-0"
                title="Ingestion Health: Descrizione o sintesi AI non elaborata • Clicca per generare l'intelligence con Gemini AI"
              >
                {isReanalyzing ? (
                  <>
                    <Loader2 className="w-2.5 h-2.5 text-[#F59E0B] animate-spin shrink-0" />
                    <span>Analisi AI in corso...</span>
                  </>
                ) : reanalyzeSuccess ? (
                  <>
                    <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Intelligence Pronta!</span>
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-2.5 h-2.5 text-[#F59E0B] group-hover:scale-110 transition-transform shrink-0" />
                    <span className="font-semibold">Pending Intelligence</span>
                    <Sparkles className="w-2.5 h-2.5 text-[#F59E0B]/80" />
                  </>
                )}
              </button>
            )}

            {/* Punti Chiave o Sintesi Esecutiva AI */}
            {hasKeyTakeaways ? (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16140B] border border-[#C5A059]/30 text-[#D8B96E]"
                title={`${keyTakeawaysCount} Punti chiave estratti dall'AI • Clicca per visualizzare nella scheda`}
              >
                <ListChecks className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>{keyTakeawaysCount} Punti Chiave</span>
              </span>
            ) : hasExecutiveSummary ? (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#181308] border border-[#C5A059]/35 text-[#E5C170]"
                title="Sintesi esecutiva AI elaborata • Clicca per visualizzare nella scheda"
              >
                <Zap className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Sintesi AI</span>
              </span>
            ) : null}

            {/* Scheda Diagnostica & Fix */}
            {hasTroubleshooting && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#180E08] border border-[#F97316]/35 text-[#FB923C]"
                title={`Scheda diagnostica problema & fix presente${solutionStepsCount > 0 ? ` (${solutionStepsCount} passaggi verificati)` : ''} • Clicca per visualizzare nella scheda`}
              >
                <Wrench className="w-2.5 h-2.5 text-[#F97316]" />
                <span>Fix{solutionStepsCount > 0 ? ` (${solutionStepsCount} step)` : ' Registrato'}</span>
              </span>
            )}

            {/* Playbook / Procedura Standard */}
            {hasProcedure && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#09171C] border border-[#22D3EE]/35 text-[#67E8F9]"
                title={`Playbook operativo SOP${resource.metadata?.targetSystem ? ` • Sistema: ${resource.metadata.targetSystem}` : ""}${resource.metadata?.estimatedDuration ? ` • Durata: ${resource.metadata.estimatedDuration}` : ""}${resource.metadata?.riskLevel ? ` • Rischio: ${resource.metadata.riskLevel}` : ""} • Clicca per visualizzare la checklist`}
              >
                <Workflow className="w-2.5 h-2.5 text-[#22D3EE]" />
                <span>
                  SOP{solutionStepsCount > 0 || resource.metadata?.stepsCount ? ` (${solutionStepsCount || resource.metadata?.stepsCount} step)` : ""}
                  {resource.metadata?.estimatedDuration ? ` • ${resource.metadata.estimatedDuration}` : ""}
                </span>
                {(resource.metadata?.riskLevel === "high" || resource.metadata?.riskLevel === "critical") && (
                  <span className="text-red-400 font-bold ml-0.5" title="Procedura ad alto rischio operativo">⚠️</span>
                )}
              </span>
            )}

            {/* Note Personali Archiviate */}
            {hasUserNotes && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#14120D] border border-[#2D2211] text-[#D4B97B]"
                title="Note personali archiviate • Clicca per visualizzare nella scheda"
              >
                <FileText className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Note</span>
              </span>
            )}

            {/* Connessioni Grafo (Relazioni ontologiche o Entità concettuali per qualsiasi risorsa) */}
            {hasGraphLinks && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#14120D] border border-[#C5A059]/30 text-[#E5C170]"
                title={
                  relationsCount > 0
                    ? `${relationsCount} connessioni ontologiche dirette registrate nel grafo`
                    : `${entitiesCount} entità collegate nel grafo ontologico interattivo`
                }
              >
                <BrainCircuit className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>{relationsCount > 0 ? `${relationsCount} Link Grafo` : `${entitiesCount} Entità Grafo`}</span>
              </span>
            )}
          </div>
        )}

        {/* Web Article Source Header (Clean single line without dense meta-descriptions) */}
        {resource.type === "article" && resource.url && (
          <div className="mb-3 bg-[#0A0A0A] border border-[#1C1C1C] rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {favicon ? (
                <img
                  src={favicon}
                  alt={domain || "Favicon"}
                  className="w-3.5 h-3.5 rounded-sm shrink-0 object-contain bg-black/40"
                  referrerPolicy="no-referrer"
                  onError={() => setFaviconError(true)}
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              )}
              <span className="text-[11px] font-mono text-[#C5A059] font-medium truncate">
                {siteName || domain || "Articolo Web"}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {author && (
                <span className="text-[10px] text-[#777] font-mono truncate max-w-[100px]" title={`Autore: ${author}`}>
                  {author}
                </span>
              )}
              {readingTimeMin && (
                <span className="text-[10px] text-[#666] font-mono bg-[#141414] px-1.5 py-0.5 rounded border border-[#222]">
                  {readingTimeMin}m read
                </span>
              )}
            </div>
          </div>
        )}

        {/* Compact Reading Progress for Articles */}
        {resource.type === "article" && (
          <div 
            className="mb-3 bg-[#0C0C0C] border border-[#1A1A1A] rounded-lg px-2.5 py-2 flex items-center justify-between gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {localProgress === 100 ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : localProgress > 0 ? (
                <Clock className="w-3 h-3 text-[#C5A059] shrink-0" />
              ) : (
                <BookOpen className="w-3 h-3 text-[#666] shrink-0" />
              )}
              <span className={localProgress === 100 ? "text-emerald-400 font-medium" : localProgress > 0 ? "text-[#C5A059]" : "text-[#777]"}>
                {localProgress === 100 ? "Letto (100%)" : localProgress > 0 ? `${localProgress}% letto` : "Da leggere"}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="w-16 sm:w-20 h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${localProgress === 100 ? "bg-emerald-400" : localProgress > 0 ? "bg-[#C5A059]" : "bg-transparent"}`}
                  style={{ width: `${localProgress}%` }}
                />
              </div>

              {localProgress === 100 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProgressChange(0);
                  }}
                  className="text-[10px] font-mono text-[#666] hover:text-[#BBB] px-1 py-0.5 rounded transition-colors"
                  title="Reimposta a non letto"
                >
                  Reset
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProgressChange(100);
                  }}
                  className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800/40 transition-colors flex items-center gap-1"
                  title="Segna come completato"
                >
                  <Check className="w-2.5 h-2.5" />
                  <span>Segna Letto</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Paper Specific Details: Authors & arXiv pill */}
        {resource.type === "paper" && (
          <div className="mb-3 bg-[#090A14] border border-[#1A1E38] rounded-md px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#818CF8] overflow-hidden gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <GraduationCap className="w-3.5 h-3.5 text-[#818CF8] shrink-0" />
              <span className="truncate text-[#CBD5E1]">
                {resource.metadata?.authors && resource.metadata.authors.length > 0 
                  ? resource.metadata.authors.join(", ")
                  : "Ricerca Accademica"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {resource.metadata?.publishedYear && (
                <span className="text-[10px] bg-[#14182E] text-[#94A3B8] px-1.5 py-0.5 rounded border border-[#273059]">
                  {resource.metadata.publishedYear}
                </span>
              )}
              {resource.metadata?.arxivId && (
                <span className="text-[10px] bg-[#1E1B4B] text-[#A5B4FC] font-semibold px-1.5 py-0.5 rounded border border-[#3730A3]">
                  arXiv:{resource.metadata.arxivId}
                </span>
              )}
            </div>
          </div>
        )}

        {/* RSS Feed Specific Details */}
        {resource.type === "rss" && (
          <div className="mb-3 bg-[#110B07] border border-[#29170E] rounded-md px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#FB923C] overflow-hidden gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <Rss className="w-3 h-3 text-[#FB923C] shrink-0" />
              <span className="truncate text-[#FED7AA]">
                {resource.metadata?.feedUrl || resource.url || "Feed Canale"}
              </span>
            </div>
            <span className="text-[10px] bg-[#2C1810] text-[#FB923C] px-1.5 py-0.5 rounded border border-[#432315] uppercase">
              {resource.metadata?.feedFormat || "RSS"}
            </span>
          </div>
        )}

        {/* Note Scratchpad Specific Details */}
        {resource.type === "note" && (
          <div className="mb-3 bg-[#121008] border border-[#2A2412] rounded-md px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#FBBF24] overflow-hidden gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <StickyNote className="w-3 h-3 text-[#FBBF24] shrink-0" />
              <span className="text-[#FEF08A] uppercase text-[10px] font-semibold tracking-wide">
                {resource.metadata?.noteCategory || "Scratchpad Memo"}
              </span>
            </div>
            <span className="text-[10px] text-[#A1A1AA]">
              Nota Rapida
            </span>
          </div>
        )}

        {/* Code snippet preview if MCP or GitHub */}
        {resource.metadata?.command && (
          <div className="mb-3 bg-[#080808] border border-[#181818] rounded-md px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#AAA] overflow-hidden">
            <div className="flex items-center gap-1.5 truncate">
              <Terminal className="w-3 h-3 text-[#C5A059] shrink-0" />
              <span className="truncate">{resource.metadata.command}</span>
            </div>
          </div>
        )}

        {/* AI Evaluation & Score Visual Card */}
        {(score !== null || hasEvaluation) && (
          <div className="mb-3 bg-[#0E0C06] border border-[#C5A059]/30 rounded-lg p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[#C5A059]" />
                <span className="text-[11px] font-mono font-medium text-[#E5C170]">Valutazione AI</span>
              </div>
              {score !== null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-[#222] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-[#C5A059]" : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      score >= 80 ? "text-emerald-400" : score >= 60 ? "text-[#E5C170]" : "text-rose-400"
                    }`}
                  >
                    {score}/100
                  </span>
                </div>
              )}
            </div>

            {/* Score Rationale */}
            {scoreRationale ? (
              <p className="text-[11px] text-[#A89874] italic leading-snug line-clamp-2 mb-1.5 font-sans">
                &ldquo;{scoreRationale}&rdquo;
              </p>
            ) : null}

            {/* Pros / Cons / Use Cases Highlights */}
            {(prosCount > 0 || consCount > 0 || (resource.metadata?.useCases && resource.metadata.useCases.length > 0)) && (
              <div className="flex flex-wrap gap-1 mt-1 text-[10px] font-mono">
                {prosCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-emerald-400/90 bg-emerald-950/40 border border-emerald-900/40 px-1.5 py-0.5 rounded">
                    <Check className="w-2.5 h-2.5" />
                    <span>{prosCount} Punti di Forza</span>
                  </span>
                )}
                {consCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-400/90 bg-rose-950/40 border border-rose-900/40 px-1.5 py-0.5 rounded">
                    <span>{consCount} Limiti</span>
                  </span>
                )}
                {resource.metadata?.useCases && resource.metadata.useCases.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[#C5A059] bg-[#C5A059]/10 border border-[#C5A059]/30 px-1.5 py-0.5 rounded truncate max-w-[200px]" title={resource.metadata.useCases[0]}>
                    <Target className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{resource.metadata.useCases[0]}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tags & ML Tag Suggester Quick Access */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {resource.tags && resource.tags.length > 0 ? (
            <>
              {resource.tags.slice(0, 4).map((tag, idx) => (
                <button
                  key={`tag-${resource.id || 'res'}-${tag}-${idx}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTag?.(tag);
                  }}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    selectedTag === tag.toLowerCase()
                      ? "bg-[#C5A059]/20 text-[#C5A059] border-[#C5A059]/50"
                      : "bg-[#141414] text-[#888] hover:text-[#CCC] border-[#1F1F1F] hover:border-[#333]"
                  }`}
                  title={`Filtra per tag #${tag}`}
                >
                  #{tag}
                </button>
              ))}
              {resource.tags.length > 4 && (
                <span className="text-[10px] font-mono text-[#555] px-1 py-0.5">
                  +{resource.tags.length - 4}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] font-mono text-[#555] italic">Nessun tag</span>
          )}

          {onOpenEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEdit(resource);
              }}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-[#888] hover:text-[#E5C170] bg-[#14120A] hover:bg-[#20190D] border border-[#2D2312] hover:border-[#C5A059]/60 px-1.5 py-0.5 rounded transition-all group/mltag cursor-pointer"
              title="Apri Modifica per visualizzare i tag consigliati dal motore ML basato sui contenuti"
            >
              <Sparkles className="w-2.5 h-2.5 text-[#C5A059] group-hover/mltag:animate-pulse" />
              <span className="text-[9px]">Tag ML</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Footer Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[#181818] mt-auto gap-2">
        <div className="flex items-center gap-1.5 truncate max-w-[50%] min-w-0">
          {resource.metadata?.domain ? (
            <span className="text-[11px] text-[#777] font-mono truncate flex items-center gap-1.5" title={resource.metadata.domain}>
              <Layers className="w-3 h-3 text-[#C5A059]/70 shrink-0" />
              <span className="truncate">{resource.metadata.domain}</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Google Docs Export or Direct Open Button */}
          {resource.metadata?.gdocUrl ? (
            <a
              href={resource.metadata.gdocUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-[#4285F4] hover:text-white bg-[#4285F4]/10 hover:bg-[#4285F4]/30 border border-[#4285F4]/30 px-2 py-1 rounded transition-colors"
              title="Apri Google Doc su Google Drive (cartella 'knowledge')"
            >
              <FileText className="w-3 h-3 text-[#4285F4]" />
              <span className="hidden sm:inline font-medium">GDoc</span>
            </a>
          ) : onExportGoogleDoc ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExportGoogleDoc(resource);
              }}
              className="p-1.5 text-[#777] hover:text-[#4285F4] bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] rounded transition-colors"
              title="Esporta su Google Doc nella cartella 'knowledge'"
              aria-label="Crea Google Doc"
            >
              <FileText className="w-3.5 h-3.5 text-[#AAA] hover:text-[#4285F4]" />
            </button>
          ) : null}

          {/* Print Preview Button */}
          {onPrintPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrintPreview(resource);
              }}
              className="p-1.5 text-[#777] hover:text-[#C5A059] bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] rounded transition-colors"
              title="Anteprima di Stampa / Salva in PDF"
              aria-label="Stampa scheda"
            >
              <Printer className="w-3.5 h-3.5 text-[#AAA] hover:text-[#C5A059]" />
            </button>
          )}

          {/* Edit & Suggest Tags Button */}
          {onOpenEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEdit(resource);
              }}
              className="p-1.5 text-[#888] hover:text-[#C5A059] bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] hover:border-[#C5A059]/50 rounded transition-colors"
              title="Modifica risorsa e gestisci tag con l'engine ML"
              aria-label="Modifica risorsa e tag ML"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#AAA] hover:text-[#C5A059]" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(resource);
            }}
            className="px-2.5 py-1 rounded bg-[#18140B] hover:bg-[#251E0E] border border-[#C5A059]/40 hover:border-[#C5A059] text-[#E5C170] hover:text-white text-xs font-medium flex items-center gap-1 transition-all ml-0.5 shadow-xs"
            title="Apri scheda dettagliata"
          >
            <span>Dettagli</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#C5A059]" />
          </button>
        </div>
      </div>
    </div>
  );
};
