import React, { useState, useMemo } from "react";
import { 
  X, 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Edit3, 
  Save, 
  Terminal,
  Code2,
  Calendar,
  Star,
  BrainCircuit,
  FileCode,
  Globe,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Award,
  ThumbsUp,
  ThumbsDown,
  Target,
  Loader2,
  Languages,
  Zap,
  ListChecks,
  Users,
  RotateCcw,
  FileText,
  Wrench,
  AlertTriangle,
  Network,
  Share2,
  ArrowRight,
  ChevronRight,
  Tag,
  Plus,
  Download,
  FileDown,
  Eye,
  Printer,
  GraduationCap,
  Rss,
  StickyNote,
  BookMarked,
  ChevronDown,
  ChevronUp,
  Pencil,
  Radio,
  Image as ImageIcon,
  Video,
  Workflow,
  CheckSquare,
  Square,
  ShieldAlert
} from "lucide-react";
import Markdown from "react-markdown";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { fetchOpenGraphData, OpenGraphResult } from "../lib/ogUtils";
import { isReadLaterResource } from "../lib/readLaterUtils";
import {
  identifyRelatedResources,
  calculateResourceAffinity,
  RelatedResourceMatch,
  createOkfRelationFromAffinity,
} from "../lib/relatedResourcesEngine";
import { TagSuggestionEngine } from "./TagSuggestionEngine";
import { cleanTag } from "../lib/tagSuggestionEngine";
import { RssFeedViewer, FeedItem } from "./RssFeedViewer";
import { generateAndDownloadResourcePdf } from "../lib/pdfExport";

interface ResourceModalProps {
  resource: ResourceItem | null;
  allResources?: ResourceItem[];
  initialEdit?: boolean;
  onClose: () => void;
  onUpdate: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onToggleFavorite?: (id: string, currentFav: boolean) => void;
  onNavigateToResource?: (resource: ResourceItem) => void;
  onViewInGraph?: (resource: ResourceItem) => void;
  onPrintPreview?: (resource: ResourceItem) => void;
  onExportGoogleDoc?: (resource: ResourceItem) => void;
  onToggleReadLater?: (id: string, currentlyInQueue: boolean) => void;
  onIngestFeedItem?: (item: FeedItem) => void;
}

export const ResourceModal: React.FC<ResourceModalProps> = ({
  resource,
  allResources = [],
  initialEdit = false,
  onClose,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onNavigateToResource,
  onViewInGraph,
  onPrintPreview,
  onExportGoogleDoc,
  onToggleReadLater,
  onIngestFeedItem,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ogData, setOgData] = useState<OpenGraphResult | null>(null);
  const [faviconError, setFaviconError] = useState(false);

  // RSS Feed Discovery states for links & articles
  const [discoveredFeedUrl, setDiscoveredFeedUrl] = useState<string | null>(null);
  const [isDiscoveringFeed, setIsDiscoveringFeed] = useState<boolean>(false);
  const [isFeedDiscoveryDrawerOpen, setIsFeedDiscoveryDrawerOpen] = useState<boolean>(false);
  const [feedDiscoveryStatus, setFeedDiscoveryStatus] = useState<string | null>(null);

  // View language toggle: 'original' or 'italian'
  const [viewLanguage, setViewLanguage] = useState<"original" | "italian">("original");

  // AI action loadings & messages
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationMessage, setTranslationMessage] = useState<string | null>(null);

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightMessage, setInsightMessage] = useState<string | null>(null);

  const [isExpandingDoc, setIsExpandingDoc] = useState(false);
  const [expandDocMessage, setExpandDocMessage] = useState<string | null>(null);

  // Active view tab inside dialog: 'overview' | 'doc' | 'graph' | 'evaluation'
  const [activeModalTab, setActiveModalTab] = useState<"overview" | "doc" | "graph" | "evaluation">("overview");

  // Fetch OG if article and missing
  React.useEffect(() => {
    if (resource?.type === "article" && resource.url) {
      if (resource.metadata?.ogDescription && resource.metadata?.favicon) {
        return;
      }
      fetchOpenGraphData(resource.url).then((data) => {
        if (data) setOgData(data);
      });
    }
  }, [resource?.type, resource?.url, resource?.metadata?.ogDescription, resource?.metadata?.favicon]);

  // Editable form state
  const [title, setTitle] = useState(resource?.title || "");
  const [url, setUrl] = useState(resource?.url || "");
  const [summary, setSummary] = useState(resource?.summary || "");
  const [tagsStr, setTagsStr] = useState((resource?.tags || []).join(", "));
  const [type, setType] = useState<ResourceType>(resource?.type || "article");
  const [mcpConfig, setMcpConfig] = useState(resource?.metadata?.configSnippet || "");
  const [systemPrompt, setSystemPrompt] = useState(resource?.metadata?.systemPrompt || "");
  const [installCommand, setInstallCommand] = useState(resource?.metadata?.installCommand || "");
  const [affectedSystem, setAffectedSystem] = useState(resource?.metadata?.affectedSystem || "");
  const [rootCause, setRootCause] = useState(resource?.metadata?.rootCause || "");
  const [attemptedFixesStr, setAttemptedFixesStr] = useState((resource?.metadata?.attemptedFixes || []).join("\n"));
  const [solutionStepsStr, setSolutionStepsStr] = useState((resource?.metadata?.solutionSteps || []).join("\n"));
  const [markdownContent, setMarkdownContent] = useState(resource?.metadata?.markdownContent || "");
  const [readingProgress, setReadingProgress] = useState<number>(resource?.metadata?.readingProgress ?? (resource as any)?.readingProgress ?? 0);

  // Procedure, Playbook & SOP metadata
  const [targetSystem, setTargetSystem] = useState(resource?.metadata?.targetSystem || "");
  const [estimatedDuration, setEstimatedDuration] = useState(resource?.metadata?.estimatedDuration || "");
  const [riskLevel, setRiskLevel] = useState<string>(resource?.metadata?.riskLevel || "low");
  const [procedureType, setProcedureType] = useState(resource?.metadata?.procedureType || "maintenance");
  const [prerequisitesStr, setPrerequisitesStr] = useState((resource?.metadata?.prerequisites || []).join("\n"));
  const [requiredToolsStr, setRequiredToolsStr] = useState((resource?.metadata?.requiredTools || []).join("\n"));
  const [safetyWarningsStr, setSafetyWarningsStr] = useState((resource?.metadata?.safetyWarnings || []).join("\n"));
  const [rollbackPlan, setRollbackPlan] = useState(resource?.metadata?.rollbackPlan || "");

  // Interactive Checklist Protocol state (persisted per-resource)
  const [checkedStepIndices, setCheckedStepIndices] = useState<Set<number>>(() => {
    if (typeof window !== "undefined" && resource?.id) {
      try {
        const raw = localStorage.getItem(`sop_checked_${resource.id}`);
        if (raw) return new Set(JSON.parse(raw));
      } catch {}
    }
    return new Set();
  });

  const toggleStepCheck = (index: number) => {
    setCheckedStepIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      if (resource?.id) {
        localStorage.setItem(`sop_checked_${resource.id}`, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  const handleResetChecklist = () => {
    setCheckedStepIndices(new Set());
    if (resource?.id) {
      localStorage.removeItem(`sop_checked_${resource.id}`);
    }
  };

  const handleCompleteAllSteps = (count: number) => {
    const all = new Set(Array.from({ length: count }, (_, i) => i));
    setCheckedStepIndices(all);
    if (resource?.id) {
      localStorage.setItem(`sop_checked_${resource.id}`, JSON.stringify(Array.from(all)));
    }
  };

  // Paper scientific metadata
  const [paperAuthorsStr, setPaperAuthorsStr] = useState((resource?.metadata?.authors || []).join(", "));
  const [paperArxivId, setPaperArxivId] = useState(resource?.metadata?.arxivId || "");
  const [paperDoi, setPaperDoi] = useState(resource?.metadata?.doi || "");
  const [paperPdfUrl, setPaperPdfUrl] = useState(resource?.metadata?.pdfUrl || "");
  const [paperVenue, setPaperVenue] = useState(resource?.metadata?.venue || "");
  const [paperPublishedYear, setPaperPublishedYear] = useState<string>(
    resource?.metadata?.publishedYear ? String(resource.metadata.publishedYear) : ""
  );
  const [paperTldr, setPaperTldr] = useState(resource?.metadata?.tldr || "");

  // Raw input collapsible drawer state (collapsed by default if markdown content is present)
  const [isRawInputExpanded, setIsRawInputExpanded] = useState(false);

  // Insights & Evaluation state
  const [useCasesStr, setUseCasesStr] = useState((resource?.metadata?.useCases || []).join("\n"));
  const [prosStr, setProsStr] = useState((resource?.metadata?.pros || []).join("\n"));
  const [consStr, setConsStr] = useState((resource?.metadata?.cons || []).join("\n"));
  const [score, setScore] = useState<number>(resource?.metadata?.score ?? 0);
  const [scoreRationale, setScoreRationale] = useState(resource?.metadata?.scoreRationale || "");

  // Translation & Summary state
  const [translatedTitle, setTranslatedTitle] = useState(resource?.metadata?.translatedTitle || "");
  const [translatedSummary, setTranslatedSummary] = useState(resource?.metadata?.translatedSummary || "");
  const [translatedContent, setTranslatedContent] = useState(resource?.metadata?.translatedContent || "");
  const [aiExecutiveSummary, setAiExecutiveSummary] = useState(resource?.metadata?.aiExecutiveSummary || "");
  const [aiKeyTakeawaysStr, setAiKeyTakeawaysStr] = useState((resource?.metadata?.aiKeyTakeaways || []).join("\n"));
  const [aiTargetAudience, setAiTargetAudience] = useState(resource?.metadata?.aiTargetAudience || "");
  const [aiActionItemsStr, setAiActionItemsStr] = useState((resource?.metadata?.aiActionItems || []).join("\n"));
  const [userNotes, setUserNotes] = useState(resource?.metadata?.userNotes || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // PDF & Markdown Export State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [markdownDownloaded, setMarkdownDownloaded] = useState(false);

  // Auto-linking & OKF correlation state
  const [linkingMatchId, setLinkingMatchId] = useState<string | null>(null);
  const [linkedSuccessIds, setLinkedSuccessIds] = useState<Set<string>>(new Set());

  // Automatically identified related resources via semantic affinity engine
  const autoRelatedMatches = useMemo(() => {
    if (!resource) return [];
    return identifyRelatedResources(resource, allResources, { limit: 6, minScore: 18 });
  }, [resource, allResources]);

  // Unique tags across the entire vault for cluster taxonomy and ML matching
  const vaultTags = useMemo(() => {
    const set = new Set<string>();
    allResources.forEach((r) => {
      if (Array.isArray(r.tags)) {
        r.tags.forEach((t) => {
          const norm = cleanTag(t);
          if (norm) set.add(norm);
        });
      }
    });
    return Array.from(set);
  }, [allResources]);

  // Parsed current tags list from tagsStr
  const currentTagsList = useMemo(() => {
    return tagsStr
      .split(",")
      .map((t) => cleanTag(t))
      .filter((t) => t.length > 0);
  }, [tagsStr]);

  const handleAddSuggestedTag = (newTag: string) => {
    const norm = cleanTag(newTag);
    if (!norm) return;
    if (!currentTagsList.includes(norm)) {
      const updated = [...currentTagsList, norm];
      setTagsStr(updated.join(", "));
    }
  };

  const handleAddMultipleSuggestedTags = (newTags: string[]) => {
    const updated = [...currentTagsList];
    newTags.forEach((t) => {
      const norm = cleanTag(t);
      if (norm && !updated.includes(norm)) {
        updated.push(norm);
      }
    });
    setTagsStr(updated.join(", "));
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const norm = cleanTag(tagToRemove);
    const updated = currentTagsList.filter((t) => t !== norm);
    setTagsStr(updated.join(", "));
  };

  const handleLinkAsOkfRelation = async (match: RelatedResourceMatch) => {
    if (!resource || !onUpdate) return;
    setLinkingMatchId(match.resource.id);
    try {
      const newRel = createOkfRelationFromAffinity(match);
      const existingRelations = Array.isArray(resource.metadata?.relations)
        ? [...resource.metadata.relations]
        : [];

      const alreadyLinked = existingRelations.some(
        (r) => r.targetId === match.resource.id || r.targetTitle.toLowerCase().trim() === match.resource.title.toLowerCase().trim()
      );

      if (!alreadyLinked) {
        existingRelations.push(newRel);
        await onUpdate(resource.id, {
          metadata: {
            ...resource.metadata,
            relations: existingRelations,
          },
        });
        setLinkedSuccessIds((prev) => new Set(prev).add(match.resource.id));
      }
    } catch (err) {
      console.error("Errore salvataggio relazione automatica:", err);
    } finally {
      setLinkingMatchId(null);
    }
  };

  // Synchronize form when resource changes
  const prevResourceIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (resource) {
      const isSwitchingResource = prevResourceIdRef.current !== resource.id;
      prevResourceIdRef.current = resource.id;

      if (isSwitchingResource) {
        setTitle(resource.title || "");
        setUrl(resource.url || "");
        setSummary(resource.summary || "");
        setTagsStr((resource.tags || []).join(", "));
        setType(resource.type || "article");
        setMcpConfig(resource.metadata?.configSnippet || "");
        setSystemPrompt(resource.metadata?.systemPrompt || "");
        setInstallCommand(resource.metadata?.installCommand || "");
        setAffectedSystem(resource.metadata?.affectedSystem || "");
        setRootCause(resource.metadata?.rootCause || "");
        setAttemptedFixesStr((resource.metadata?.attemptedFixes || []).join("\n"));
        setSolutionStepsStr((resource.metadata?.solutionSteps || []).join("\n"));
        setMarkdownContent(resource.metadata?.markdownContent || "");
        setReadingProgress(resource.metadata?.readingProgress ?? (resource as any)?.readingProgress ?? 0);
        setTargetSystem(resource.metadata?.targetSystem || "");
        setEstimatedDuration(resource.metadata?.estimatedDuration || "");
        setRiskLevel(resource.metadata?.riskLevel || "low");
        setProcedureType(resource.metadata?.procedureType || "maintenance");
        setPrerequisitesStr((resource.metadata?.prerequisites || []).join("\n"));
        setRequiredToolsStr((resource.metadata?.requiredTools || []).join("\n"));
        setSafetyWarningsStr((resource.metadata?.safetyWarnings || []).join("\n"));
        setRollbackPlan(resource.metadata?.rollbackPlan || "");
        if (typeof window !== "undefined" && resource.id) {
          try {
            const raw = localStorage.getItem(`sop_checked_${resource.id}`);
            setCheckedStepIndices(raw ? new Set(JSON.parse(raw)) : new Set());
          } catch {
            setCheckedStepIndices(new Set());
          }
        } else {
          setCheckedStepIndices(new Set());
        }
        setUseCasesStr((resource.metadata?.useCases || []).join("\n"));
        setProsStr((resource.metadata?.pros || []).join("\n"));
        setConsStr((resource.metadata?.cons || []).join("\n"));
        setScore(resource.metadata?.score ?? 0);
        setScoreRationale(resource.metadata?.scoreRationale || "");
        setTranslatedTitle(resource.metadata?.translatedTitle || "");
        setTranslatedSummary(resource.metadata?.translatedSummary || "");
        setTranslatedContent(resource.metadata?.translatedContent || "");
        setAiExecutiveSummary(resource.metadata?.aiExecutiveSummary || "");
        setAiKeyTakeawaysStr((resource.metadata?.aiKeyTakeaways || []).join("\n"));
        setAiTargetAudience(resource.metadata?.aiTargetAudience || "");
        setAiActionItemsStr((resource.metadata?.aiActionItems || []).join("\n"));
        setUserNotes(resource.metadata?.userNotes || "");
        setPaperAuthorsStr((resource.metadata?.authors || []).join(", "));
        setPaperArxivId(resource.metadata?.arxivId || "");
        setPaperDoi(resource.metadata?.doi || "");
        setPaperPdfUrl(resource.metadata?.pdfUrl || "");
        setPaperVenue(resource.metadata?.venue || "");
        setPaperPublishedYear(resource.metadata?.publishedYear ? String(resource.metadata.publishedYear) : "");
        setPaperTldr(resource.metadata?.tldr || "");
        setIsRawInputExpanded(false);
        setDiscoveredFeedUrl(null);
        setIsDiscoveringFeed(false);
        setIsFeedDiscoveryDrawerOpen(false);
        setFeedDiscoveryStatus(null);
        setIsEditing(Boolean(initialEdit));
        setInsightMessage(null);
        setTranslationMessage(null);
        setSummaryMessage(null);

        // If translation is already available, default view to Italian if preferred, otherwise original
        if (resource.metadata?.translatedSummary || resource.metadata?.translatedContent) {
          setViewLanguage("italian");
        } else {
          setViewLanguage("original");
        }
      } else {
        // Same resource: merge incoming updates selectively without clobbering active state
        if (resource.title) setTitle(resource.title);
        if (resource.url) setUrl(resource.url);
        if (resource.summary) setSummary(resource.summary);
        if (resource.tags && resource.tags.length > 0) setTagsStr(resource.tags.join(", "));
        if (resource.type) setType(resource.type);
        if (resource.metadata?.markdownContent) setMarkdownContent(resource.metadata.markdownContent);
        if (resource.metadata?.score !== undefined && resource.metadata.score !== null && resource.metadata.score > 0) {
          setScore(resource.metadata.score);
        }
        if (resource.metadata?.scoreRationale) setScoreRationale(resource.metadata.scoreRationale);
        if (resource.metadata?.useCases && resource.metadata.useCases.length > 0) {
          setUseCasesStr(resource.metadata.useCases.join("\n"));
        }
        if (resource.metadata?.pros && resource.metadata.pros.length > 0) {
          setProsStr(resource.metadata.pros.join("\n"));
        }
        if (resource.metadata?.cons && resource.metadata.cons.length > 0) {
          setConsStr(resource.metadata.cons.join("\n"));
        }
        if (resource.metadata?.aiExecutiveSummary) setAiExecutiveSummary(resource.metadata.aiExecutiveSummary);
        if (resource.metadata?.aiKeyTakeaways && resource.metadata.aiKeyTakeaways.length > 0) {
          setAiKeyTakeawaysStr(resource.metadata.aiKeyTakeaways.join("\n"));
        }
        if (resource.metadata?.translatedSummary || resource.metadata?.translatedContent) {
          if (resource.metadata.translatedTitle) setTranslatedTitle(resource.metadata.translatedTitle);
          if (resource.metadata.translatedSummary) setTranslatedSummary(resource.metadata.translatedSummary);
          if (resource.metadata.translatedContent) setTranslatedContent(resource.metadata.translatedContent);
        }
        if (resource.metadata?.authors) setPaperAuthorsStr(resource.metadata.authors.join(", "));
        if (resource.metadata?.arxivId) setPaperArxivId(resource.metadata.arxivId);
        if (resource.metadata?.doi) setPaperDoi(resource.metadata.doi);
        if (resource.metadata?.pdfUrl) setPaperPdfUrl(resource.metadata.pdfUrl);
        if (resource.metadata?.venue) setPaperVenue(resource.metadata.venue);
        if (resource.metadata?.publishedYear) setPaperPublishedYear(String(resource.metadata.publishedYear));
        if (resource.metadata?.tldr) setPaperTldr(resource.metadata.tldr);
      }
    }
  }, [resource, initialEdit]);

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!resource) return null;

  const handleCopy = (text: string, sectionKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // AI Translation Handler
  const handleTranslate = async (forceRegenerate = false) => {
    if (!resource) return;

    if (!forceRegenerate && resource.metadata?.translatedSummary && resource.metadata?.translatedContent) {
      setViewLanguage("italian");
      return;
    }

    setIsTranslating(true);
    setTranslationMessage(null);
    try {
      const res = await fetch("/api/translate-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (data && data.translation) {
        const { translatedTitle: tTitle, translatedSummary: tSummary, translatedContent: tContent, language, translatedAt } = data.translation;
        const fetchedOrig = data.fetchedOriginalContent;

        setTranslatedTitle(tTitle || "");
        setTranslatedSummary(tSummary || "");
        setTranslatedContent(tContent || "");
        if (fetchedOrig && !markdownContent) {
          setMarkdownContent(fetchedOrig);
        }

        const newMeta: Record<string, any> = {
          ...resource.metadata,
          translatedTitle: tTitle,
          translatedSummary: tSummary,
          translatedContent: tContent,
          translationLanguage: language || "it",
          translatedAt: translatedAt || new Date().toISOString(),
        };

        if (fetchedOrig && (!resource.metadata?.markdownContent || resource.metadata.markdownContent.trim().length === 0)) {
          newMeta.markdownContent = fetchedOrig;
        }

        await onUpdate(resource.id, {
          metadata: newMeta,
        });

        setViewLanguage("italian");
        setTranslationMessage("🇮🇹 Traduzione integrale in italiano dell'articolo completata e salvata nel Vault!");
        setTimeout(() => setTranslationMessage(null), 4000);
      } else {
        setTranslationMessage("⚠️ Impossibile completare la traduzione.");
      }
    } catch (err: any) {
      console.error("Translation error:", err);
      setTranslationMessage("⚠️ Errore durante la traduzione: " + (err.message || ""));
    } finally {
      setIsTranslating(false);
    }
  };

  // AI Executive Summary Handler
  const handleSummarize = async () => {
    if (!resource) return;
    setIsSummarizing(true);
    setSummaryMessage(null);
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

        setAiExecutiveSummary(executiveSummary || "");
        setAiKeyTakeawaysStr(keyTakeaways.join("\n"));
        setAiTargetAudience(targetAudience || "");
        setAiActionItemsStr(actionItems.join("\n"));

        const updates: any = {
          metadata: {
            ...resource.metadata,
            aiExecutiveSummary: executiveSummary,
            aiKeyTakeaways: keyTakeaways,
            aiTargetAudience: targetAudience,
            aiActionItems: actionItems,
            aiSummarizedAt: summarizedAt || new Date().toISOString(),
            ...(estimatedReadingTime ? { readingTimeMin: estimatedReadingTime } : {}),
            ...(data.extractedContent && (!resource.metadata?.markdownContent || resource.metadata.markdownContent.length < 200)
              ? { markdownContent: data.extractedContent }
              : {}),
          },
        };

        const isCorrupted = (s: string) =>
          !s ||
          s.includes("Nota: Il parser") ||
          s.includes("Il parser ha tentato") ||
          s.includes("I link web non costituiscono") ||
          s.length < 90;

        if (executiveSummary && (!resource.summary || isCorrupted(resource.summary))) {
          const newSummary = executiveSummary.slice(0, 320);
          updates.summary = newSummary;
          setSummary(newSummary);
        } else if (data.cleanedSummary && isCorrupted(resource.summary)) {
          updates.summary = data.cleanedSummary;
          setSummary(data.cleanedSummary);
        }

        if (
          data.cleanedTitle &&
          (resource.title.includes("levelup.gitconnected.com") ||
            resource.title === "Collegamento Web" ||
            resource.title === "Medium" ||
            resource.title.toLowerCase().includes("wiht") ||
            resource.title.toLowerCase() === data.cleanedTitle.toLowerCase())
        ) {
          updates.title = data.cleanedTitle;
          setTitle(data.cleanedTitle);
        }

        await onUpdate(resource.id, updates);

        setSummaryMessage("⚡ Riassunto Esecutivo & Key Takeaways AI memorizzati nel Vault!");
        setTimeout(() => setSummaryMessage(null), 4000);
      } else {
        setSummaryMessage("⚠️ Impossibile generare il riassunto esecutivo.");
      }
    } catch (err: any) {
      console.error("Summary error:", err);
      setSummaryMessage("⚠️ Errore durante la sintesi: " + (err.message || ""));
    } finally {
      setIsSummarizing(false);
    }
  };

  // AI Technical Insights Handler
  const handleGenerateInsights = async () => {
    if (!resource) return;
    setIsGeneratingInsights(true);
    setInsightMessage(null);
    try {
      const res = await fetch("/api/generate-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (data && data.insights) {
        const { useCases = [], pros = [], cons = [], score: s = 85, scoreRationale: sRationale = "" } = data.insights;
        
        // 1. Update component local state immediately
        setUseCasesStr(useCases.join("\n"));
        setProsStr(pros.join("\n"));
        setConsStr(cons.join("\n"));
        setScore(s);
        setScoreRationale(sRationale);

        // 2. Mutate resource object reference in-place immediately for instant consistency
        if (!resource.metadata) {
          resource.metadata = {};
        }
        resource.metadata.useCases = useCases;
        resource.metadata.pros = pros;
        resource.metadata.cons = cons;
        resource.metadata.score = s;
        resource.metadata.scoreRationale = sRationale;

        // 3. Persist update to parent / Firestore
        await onUpdate(resource.id, {
          metadata: {
            ...resource.metadata,
            useCases,
            pros,
            cons,
            score: s,
            scoreRationale: sRationale,
          },
        });
        setInsightMessage("✨ Valutazione AI (Casi d'Uso, Pro/Contro, Voto) completata e salvata!");
        setTimeout(() => setInsightMessage(null), 4000);
      } else {
        setInsightMessage("⚠️ Impossibile generare l'analisi.");
      }
    } catch (err: any) {
      console.error("AI Insights generation error:", err);
      setInsightMessage("⚠️ Errore durante la generazione dell'analisi.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // AI Documentation Deepening & Expansion Handler
  const handleExpandDocumentation = async () => {
    if (!resource) return;
    setIsExpandingDoc(true);
    setExpandDocMessage(null);
    try {
      const res = await fetch("/api/expand-documentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource,
          existingResources: allResources?.slice(0, 25) || [],
        }),
      });
      const data = await res.json();
      if (data?.success && data?.data) {
        const { markdownContent: expandedMd, summary: newSummary, domain, docType, entities, relations } = data.data;

        setMarkdownContent(expandedMd);
        setSummary(newSummary || summary);

        await onUpdate(resource.id, {
          summary: newSummary || resource.summary,
          metadata: {
            ...resource.metadata,
            markdownContent: expandedMd,
            domain: domain || resource.metadata?.domain,
            docType: docType || resource.metadata?.docType,
            entities: entities || resource.metadata?.entities,
            relations: relations || resource.metadata?.relations,
          },
        });
        setExpandDocMessage("✨ Documentazione tecnica OKF v0.2 approfondita ed estesa con successo!");
        setActiveModalTab("doc");
        setTimeout(() => setExpandDocMessage(null), 4000);
      } else {
        setExpandDocMessage("⚠️ Impossibile espandere la documentazione.");
      }
    } catch (err: any) {
      console.error("Expand documentation error:", err);
      setExpandDocMessage("⚠️ Errore durante l'espansione della documentazione.");
    } finally {
      setIsExpandingDoc(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf || !resource) return;
    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      await generateAndDownloadResourcePdf(resource);
      setPdfDownloaded(true);
      setTimeout(() => setPdfDownloaded(false), 2500);
    } catch (err) {
      console.error("Errore generazione PDF:", err);
      setPdfError("Errore PDF");
      setTimeout(() => setPdfError(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const rawContent = resource.metadata?.markdownContent || markdownContent || `# ${resource.title}\n\n${resource.summary}`;
    const filename = `${resource.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.okf.md`;
    const blob = new Blob([rawContent], { type: "text/markdown;charset=utf-8;" });
    const urlBlob = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = urlBlob;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(urlBlob);
    setMarkdownDownloaded(true);
    setTimeout(() => setMarkdownDownloaded(false), 2500);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const tagsArray = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const useCasesArr = useCasesStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const prosArr = prosStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const consArr = consStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const takeawaysArr = aiKeyTakeawaysStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•\d.]\s*/, ""))
      .filter(Boolean);

    const actionItemsArr = aiActionItemsStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•\d.]\s*/, ""))
      .filter(Boolean);

    const updatedMetadata = {
      ...resource.metadata,
      ...(affectedSystem ? { affectedSystem: affectedSystem.trim() } : {}),
      ...(rootCause ? { rootCause: rootCause.trim() } : {}),
      ...(attemptedFixesStr ? {
        attemptedFixes: attemptedFixesStr
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      } : {}),
      ...(solutionStepsStr ? {
        solutionSteps: solutionStepsStr
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      } : {}),
      ...(mcpConfig ? { configSnippet: mcpConfig } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(installCommand ? { installCommand } : {}),
      ...(markdownContent ? { markdownContent } : {}),
      ...(score > 0 ? { score } : { score: undefined }),
      ...(scoreRationale ? { scoreRationale: scoreRationale.trim() } : {}),
      useCases: useCasesArr.length > 0 ? useCasesArr : undefined,
      pros: prosArr.length > 0 ? prosArr : undefined,
      cons: consArr.length > 0 ? consArr : undefined,
      ...(translatedTitle ? { translatedTitle: translatedTitle.trim() } : {}),
      ...(translatedSummary ? { translatedSummary: translatedSummary.trim() } : {}),
      ...(translatedContent ? { translatedContent: translatedContent.trim() } : {}),
      ...(aiExecutiveSummary ? { aiExecutiveSummary: aiExecutiveSummary.trim() } : {}),
      ...(takeawaysArr.length > 0 ? { aiKeyTakeaways: takeawaysArr } : {}),
      ...(aiTargetAudience ? { aiTargetAudience: aiTargetAudience.trim() } : {}),
      ...(actionItemsArr.length > 0 ? { aiActionItems: actionItemsArr } : {}),
      ...(userNotes ? { userNotes: userNotes.trim() } : {}),
      ...(type === "article" ? {
        readingProgress: readingProgress,
        readingStatus: (readingProgress === 100 ? "completed" : readingProgress > 0 ? "in_progress" : "unread") as "unread" | "in_progress" | "completed",
      } : {}),
      ...(type === "paper" ? {
        authors: paperAuthorsStr.split(",").map((a) => a.trim()).filter(Boolean),
        ...(paperArxivId ? { arxivId: paperArxivId.trim() } : {}),
        ...(paperDoi ? { doi: paperDoi.trim() } : {}),
        ...(paperPdfUrl ? { pdfUrl: paperPdfUrl.trim() } : {}),
        ...(paperVenue ? { venue: paperVenue.trim() } : {}),
        ...(paperPublishedYear ? { publishedYear: Number(paperPublishedYear) } : {}),
        ...(paperTldr ? { tldr: paperTldr.trim() } : {}),
      } : {}),
      ...(type === "procedure" ? {
        targetSystem: targetSystem.trim() || undefined,
        estimatedDuration: estimatedDuration.trim() || undefined,
        riskLevel: riskLevel as any,
        procedureType: procedureType.trim() || undefined,
        prerequisites: prerequisitesStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean),
        requiredTools: requiredToolsStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean),
        safetyWarnings: safetyWarningsStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean),
        rollbackPlan: rollbackPlan.trim() || undefined,
        stepsCount: solutionStepsStr.split("\n").map((s) => s.trim()).filter(Boolean).length || undefined,
      } : {}),
    };

    const success = await onUpdate(resource.id, {
      title: title.trim(),
      url: url.trim() || "",
      summary: summary.trim(),
      tags: tagsArray,
      type,
      metadata: updatedMetadata,
    });

    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleQuickConvertToArticle = async () => {
    setIsSaving(true);
    try {
      setType("article");
      const cleanTags = (resource.tags || []).filter((t) => t !== "paper" && t !== "arxiv" && t !== "scientific-paper");
      if (!cleanTags.includes("article")) cleanTags.push("article");
      const ok = await onUpdate(resource.id, {
        type: "article",
        tags: cleanTags,
      });
      if (ok) {
        setTranslationMessage("Risorsa riclassificata con successo come Articolo Tecnico!");
        setTimeout(() => setTranslationMessage(null), 3500);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckWebsiteFeed = async () => {
    if (!resource?.url) return;
    if (isFeedDiscoveryDrawerOpen) {
      setIsFeedDiscoveryDrawerOpen(false);
      return;
    }
    setIsDiscoveringFeed(true);
    setFeedDiscoveryStatus("Scansione della pagina web in cerca di feed RSS o Atom...");
    try {
      const res = await fetch("/api/discover-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: resource.url }),
      });
      const data = await res.json();
      if (data && data.discovered && data.feedUrl) {
        setDiscoveredFeedUrl(data.feedUrl);
        setFeedDiscoveryStatus(null);
        setIsFeedDiscoveryDrawerOpen(true);
      } else {
        setFeedDiscoveryStatus("Nessun feed RSS o Atom standard rilevato sul sito.");
        setTimeout(() => setFeedDiscoveryStatus(null), 4000);
      }
    } catch {
      setFeedDiscoveryStatus("Errore durante la verifica del feed.");
      setTimeout(() => setFeedDiscoveryStatus(null), 4000);
    } finally {
      setIsDiscoveringFeed(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const success = await onDelete(resource.id);
    setIsDeleting(false);
    if (success) {
      onClose();
    }
  };

  const getTypeIcon = (t: ResourceType) => {
    switch (t) {
      case "troubleshooting":
        return <Wrench className="w-4 h-4 text-[#F97316]" />;
      case "procedure":
        return <Workflow className="w-4 h-4 text-[#22D3EE]" />;
      case "paper":
        return <GraduationCap className="w-4 h-4 text-[#818CF8]" />;
      case "rss":
        return <Rss className="w-4 h-4 text-[#FB923C]" />;
      case "note":
        return <StickyNote className="w-4 h-4 text-[#FBBF24]" />;
      case "knowledge":
        return <BrainCircuit className="w-4 h-4 text-[#C5A059]" />;
      case "github_repo":
        return <Github className="w-4 h-4 text-[#A855F7]" />;
      case "link":
        return <Globe className="w-4 h-4 text-[#06B6D4]" />;
      case "mcp_server":
        return <Cpu className="w-4 h-4 text-[#38BDF8]" />;
      case "ai_skill":
        return <Sparkles className="w-4 h-4 text-[#10B981]" />;
      case "article":
      default:
        return <BookOpen className="w-4 h-4 text-[#F59E0B]" />;
    }
  };

  const displayDate = formatDate(resource.createdAt || resource.updatedAt || new Date(), "full");

  // Determine active displayed text based on viewLanguage
  const hasTranslation = !!(resource.metadata?.translatedSummary || resource.metadata?.translatedContent || resource.metadata?.translatedTitle);
  const isItalianView = viewLanguage === "italian" && hasTranslation;

  const currentDisplayTitle = isItalianView && resource.metadata?.translatedTitle ? resource.metadata.translatedTitle : (title || resource.title);
  const currentDisplaySummary = isItalianView && resource.metadata?.translatedSummary ? resource.metadata.translatedSummary : (summary || resource.summary);
  const currentDisplayMarkdown = isItalianView && resource.metadata?.translatedContent ? resource.metadata.translatedContent : (markdownContent || resource.metadata?.markdownContent);

  const displayExecutiveSummary = aiExecutiveSummary || resource.metadata?.aiExecutiveSummary;
  const displayKeyTakeaways = (aiKeyTakeawaysStr ? aiKeyTakeawaysStr.split("\n").filter(Boolean) : resource.metadata?.aiKeyTakeaways) || [];
  const displayTargetAudience = aiTargetAudience || resource.metadata?.aiTargetAudience;
  const displayActionItems = (aiActionItemsStr ? aiActionItemsStr.split("\n").filter(Boolean) : resource.metadata?.aiActionItems) || [];

  const isLegacyFallbackSummary = Boolean(
    displayExecutiveSummary &&
    (displayExecutiveSummary.includes("è una risorsa di tipo Articolo Tecnico. Fornisce strumenti e metodologie essenziali") ||
     displayExecutiveSummary.includes("failed_as_link") ||
     displayExecutiveSummary.includes("Nota: Il parser") ||
     displayKeyTakeaways.some((t: string) => t.includes("Nota: Il parser ha tentato") || t.includes("Pronto per l'adozione e il collegamento semantico")))
  );

  const hasExecutiveSummary = !!(displayExecutiveSummary || (displayKeyTakeaways && displayKeyTakeaways.length > 0));

  // Evaluation & Insights computed states (reactive to local state first, fallback to resource metadata)
  const metaScore = (typeof score === "number" && score > 0)
    ? score
    : (typeof resource.metadata?.score === "number" && resource.metadata.score > 0 ? resource.metadata.score : 0);

  const metaRationale = (scoreRationale && scoreRationale.trim().length > 0)
    ? scoreRationale.trim()
    : (resource.metadata?.scoreRationale || "");

  const metaUseCases: string[] = (() => {
    if (useCasesStr && useCasesStr.trim().length > 0) {
      return useCasesStr.split("\n").map((s) => s.trim().replace(/^[-*•\d.]\s*/, "")).filter(Boolean);
    }
    return Array.isArray(resource.metadata?.useCases) ? resource.metadata.useCases : [];
  })();

  const metaPros: string[] = (() => {
    if (prosStr && prosStr.trim().length > 0) {
      return prosStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean);
    }
    return Array.isArray(resource.metadata?.pros) ? resource.metadata.pros : [];
  })();

  const metaCons: string[] = (() => {
    if (consStr && consStr.trim().length > 0) {
      return consStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean);
    }
    return Array.isArray(resource.metadata?.cons) ? resource.metadata.cons : [];
  })();

  const hasEvaluationScore = metaScore > 0;
  const hasEvaluationUseCases = metaUseCases.length > 0;
  const hasEvaluationPros = metaPros.length > 0;
  const hasEvaluationCons = metaCons.length > 0;
  const hasEvaluationInsights = hasEvaluationScore || hasEvaluationUseCases || hasEvaluationPros || hasEvaluationCons || Boolean(metaRationale);

  const hasPaperMetadata = Boolean(
    (resource.metadata?.authors && resource.metadata.authors.length > 0) ||
    resource.metadata?.arxivId ||
    resource.metadata?.pdfUrl ||
    resource.metadata?.venue ||
    resource.metadata?.publishedYear ||
    resource.metadata?.tldr ||
    resource.metadata?.doi
  );

  const renderEvaluationCard = () => (
    <div id="technical-evaluation-card" className="bg-[#0E0C08] border border-[#C5A059]/30 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header with AI trigger */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
          <Award className="w-4 h-4 text-[#C5A059]" />
          <span>Analisi Tecnica & Valutazione AI</span>
        </div>

        <button
          type="button"
          onClick={handleGenerateInsights}
          disabled={isGeneratingInsights}
          className="flex items-center gap-1.5 text-xs font-mono bg-[#221A0C] hover:bg-[#332610] text-[#E5C170] hover:text-white border border-[#C5A059]/40 px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer"
          title="Calcola o rigenera casi d'uso, pro, contro e voto tramite Google Gemini AI"
        >
          {isGeneratingInsights ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
              <span>Elaborazione Gemini AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>{hasEvaluationInsights ? "Rigenera con AI" : "Calcola con AI"}</span>
            </>
          )}
        </button>
      </div>

      {/* Status feedback message */}
      {insightMessage && (
        <div className="text-xs font-mono text-[#E5C170] bg-[#1E170A] border border-[#C5A059]/30 px-3 py-2 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span>{insightMessage}</span>
        </div>
      )}

      {hasEvaluationInsights ? (
        <div className="space-y-4">
          {/* Score & Rationale Block */}
          {hasEvaluationScore && (
            <div className="bg-[#141009] border border-[#2B2110] rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm px-2.5 py-0.5 rounded font-mono font-bold border ${
                      metaScore >= 85
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                        : metaScore >= 70
                        ? "bg-[#2A210F] text-[#E5C170] border-[#C5A059]/50"
                        : "bg-[#1E1E1E] text-[#CCC] border-[#333]"
                    }`}
                  >
                    {metaScore}/100
                  </span>
                  <span className="text-xs font-mono text-[#AAA]">
                    {metaScore >= 85
                      ? "Alta Utilità / Altamente Raccomandato"
                      : metaScore >= 70
                      ? "Molto Buono / Raccomandato"
                      : metaScore >= 50
                      ? "Utile per Scenari Specifici"
                      : "Sperimentale / Da Valutare"}
                  </span>
                </div>

                <span className="text-[11px] font-mono text-[#777]">Indice di Rilevanza</span>
              </div>

              {/* Score progress bar */}
              <div className="h-2 w-full bg-[#0A0A0A] rounded-full overflow-hidden border border-[#221B0E]">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    metaScore >= 85
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                      : metaScore >= 70
                      ? "bg-gradient-to-r from-[#B38F46] to-[#E3BE70]"
                      : "bg-gradient-to-r from-[#666] to-[#999]"
                  }`}
                  style={{ width: `${metaScore}%` }}
                />
              </div>

              {metaRationale && (
                <p className="text-xs text-[#CCC] font-sans leading-relaxed italic border-l-2 border-[#C5A059]/40 pl-2.5 my-1">
                  "{metaRationale}"
                </p>
              )}
            </div>
          )}

          {/* Use Cases / Scenarios */}
          {hasEvaluationUseCases && (
            <div>
              <div className="text-[11px] font-mono uppercase text-[#999] mb-2 flex items-center gap-1.5 tracking-wider">
                <Target className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Casi di Utilizzo & Scenari Applicativi:</span>
              </div>
              <div className="space-y-1.5">
                {metaUseCases.map((useCase, idx) => (
                  <div
                    key={`modal-usecase-${resource.id || "res"}-${idx}`}
                    className="bg-[#15120B] border border-[#2A2214] hover:border-[#3D301B] p-2.5 rounded-lg flex items-start gap-2 text-xs text-[#DDD] transition-colors"
                  >
                    <span className="text-[#C5A059] font-mono font-bold text-xs mt-0.5 shrink-0">
                      0{idx + 1}.
                    </span>
                    <span className="leading-relaxed">{useCase}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pros & Cons Columns */}
          {(hasEvaluationPros || hasEvaluationCons) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Pros Box */}
              <div className="bg-[#0A140F] border border-emerald-900/40 rounded-lg p-3 space-y-2">
                <div className="text-xs font-mono uppercase text-emerald-400 font-medium flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>Punti di Forza (Pro)</span>
                </div>
                {hasEvaluationPros ? (
                  <ul className="space-y-1.5 text-xs text-emerald-200/90 font-sans">
                    {metaPros.map((pro, idx) => (
                      <li key={`modal-pro-${resource.id || "res"}-${idx}`} className="flex items-start gap-1.5 leading-snug">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#666] font-mono">Nessun pro registrato.</p>
                )}
              </div>

              {/* Cons Box */}
              <div className="bg-[#140F08] border border-[#C5A059]/25 rounded-lg p-3 space-y-2">
                <div className="text-xs font-mono uppercase text-[#E5C170] font-medium flex items-center gap-1.5">
                  <ThumbsDown className="w-3.5 h-3.5" />
                  <span>Limiti / Considerazioni (Contro)</span>
                </div>
                {hasEvaluationCons ? (
                  <ul className="space-y-1.5 text-xs text-[#DDD] font-sans">
                    {metaCons.map((con, idx) => (
                      <li key={`modal-con-${resource.id || "res"}-${idx}`} className="flex items-start gap-1.5 leading-snug">
                        <span className="text-[#C5A059] font-bold text-xs shrink-0 mt-0.5">•</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#666] font-mono">Nessun contro registrato.</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty State with CTA */
        <div className="bg-[#141009] border border-[#281F0E] rounded-lg p-4 text-center space-y-2.5">
          <p className="text-xs text-[#AAA] leading-relaxed max-w-lg mx-auto">
            Nessuna analisi tecnica ancora registrata. Puoi inserire i casi d'uso, pro, contro e il voto in modalità <strong className="text-white">Modifica</strong> oppure cliccare sul pulsante qui sotto per calcolarli istantaneamente con Google Gemini.
          </p>
          <button
            type="button"
            onClick={handleGenerateInsights}
            disabled={isGeneratingInsights}
            className="inline-flex items-center gap-2 text-xs font-mono bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg cursor-pointer"
          >
            {isGeneratingInsights ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Generazione in corso...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-black" />
                <span>Genera Analisi Completa con AI</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#0A0A0A] border border-[#242424] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-3 sm:p-4 border-b border-[#1C1C1C] bg-[#080808] shrink-0">
          {/* Main Top Row: Type & Favorite on left, Actions & Close X on right */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md bg-[#141414] border border-[#262626] text-[#C5A059] text-xs font-mono font-medium shrink-0">
                {getTypeIcon(resource.type)}
                <span className="capitalize">
                  {resource.type === "knowledge" 
                    ? "OKF Knowledge" 
                    : resource.type === "paper"
                    ? "Paper Scientifico"
                    : resource.type === "rss"
                    ? "Feed RSS"
                    : resource.type === "note"
                    ? "Nota Rapida"
                    : resource.type === "troubleshooting"
                    ? "Problema & Soluzione"
                    : resource.type === "procedure"
                    ? "Procedura / SOP"
                    : resource.type.replace("_", " ")}
                </span>
              </span>

              {/* Favorite Star Button in Modal */}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(resource.id, !!resource.isFavorite)}
                  className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center gap-1.5 text-xs font-mono ${
                    resource.isFavorite
                      ? "bg-[#251D0C] border-[#C5A059]/50 text-[#C5A059]"
                      : "bg-[#141414] border-[#262626] text-[#666] hover:text-[#C5A059] hover:border-[#383838]"
                  }`}
                  title={resource.isFavorite ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
                >
                  <Star className={`w-3.5 h-3.5 ${resource.isFavorite ? "fill-[#C5A059] text-[#C5A059]" : ""}`} />
                  <span className="hidden md:inline">{resource.isFavorite ? "Preferito" : "Salva"}</span>
                </button>
              )}

              {displayDate && (
                <span className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-[#777] truncate">
                  <Calendar className="w-3 h-3 shrink-0 text-[#555]" />
                  {displayDate}
                </span>
              )}
            </div>

            {/* Desktop Action Group + Desktop Close Button */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {/* AI Documentation Deepening Button */}
              <button
                type="button"
                onClick={handleExpandDocumentation}
                disabled={isExpandingDoc}
                className="flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold shadow-sm"
                title="Genera o approfondisci la documentazione tecnica OKF v0.2 con Google Gemini"
              >
                {isExpandingDoc ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span className="hidden xs:inline">Espansione AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-black" />
                    <span className="hidden xs:inline">Approfondisci AI</span>
                  </>
                )}
              </button>

              {/* AI Translation Button */}
              <button
                type="button"
                onClick={() => handleTranslate(false)}
                disabled={isTranslating}
                className={`flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                  hasTranslation
                    ? viewLanguage === "italian"
                      ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/60 shadow-sm"
                      : "bg-[#141414] text-[#AAA] hover:text-white border-[#2A2A2A]"
                    : "bg-[#161616] hover:bg-[#222] text-[#CCC] hover:text-white border-[#2D2D2D]"
                }`}
                title={hasTranslation ? "Visualizza o rigenera traduzione in italiano" : "Traduci articolo e note in italiano con Google Gemini"}
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span className="hidden xs:inline">Traduzione...</span>
                  </>
                ) : (
                  <>
                    <Languages className={`w-3.5 h-3.5 ${hasTranslation ? "text-emerald-400" : "text-[#C5A059]"}`} />
                    <span className="hidden xs:inline">{hasTranslation ? (viewLanguage === "italian" ? "🇮🇹 Italiano" : "Traduci (IT)") : "Traduci AI"}</span>
                  </>
                )}
              </button>

              {/* AI Executive Summary Button */}
              <button
                type="button"
                onClick={handleSummarize}
                disabled={isSummarizing}
                className={`flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                  hasExecutiveSummary
                    ? "bg-[#251E0E] text-[#E5C170] border-[#C5A059]/50"
                    : "bg-[#161616] hover:bg-[#222] text-[#CCC] hover:text-white border-[#2D2D2D]"
                }`}
                title="Genera sintesi esecutiva, punti chiave e prossimi passi con Google Gemini"
              >
                {isSummarizing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                    <span className="hidden xs:inline">Sintesi AI...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span className="hidden xs:inline">{hasExecutiveSummary ? "⚡ Riassunto" : "Riassumi AI"}</span>
                  </>
                )}
              </button>

              {/* Google Drive / Google Docs Action */}
              {onExportGoogleDoc && (
                <button
                  type="button"
                  onClick={() => onExportGoogleDoc(resource)}
                  className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono ${
                    resource.metadata?.gdocUrl
                      ? "bg-[#4285F4]/20 border-[#4285F4]/40 text-[#4285F4] hover:bg-[#4285F4]/30"
                      : "bg-[#141414] hover:bg-[#1E1E1E] border-[#2B2B2B] text-[#AAA] hover:text-[#4285F4]"
                  }`}
                  title={resource.metadata?.gdocUrl ? "Apri o aggiorna Google Doc in cartella 'knowledge'" : "Esporta in Google Doc nella cartella 'knowledge'"}
                >
                  <FileText className="w-3.5 h-3.5 text-[#4285F4]" />
                  <span className="hidden sm:inline">{resource.metadata?.gdocUrl ? "Google Doc" : "Crea GDoc"}</span>
                </button>
              )}

              {/* Read-It-Later Header Toggle */}
              {onToggleReadLater && (
                <button
                  type="button"
                  onClick={() => {
                    const inQueue = isReadLaterResource(resource);
                    onToggleReadLater(resource.id, inQueue);
                  }}
                  className={`flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                    isReadLaterResource(resource)
                      ? "bg-[#0C1524] text-[#38BDF8] border-[#38BDF8]/60 shadow-xs font-medium"
                      : "bg-[#141414] hover:bg-[#1E1E1E] text-[#888] hover:text-[#38BDF8] border-[#2B2B2B]"
                  }`}
                  title={
                    isReadLaterResource(resource)
                      ? "Rimuovi dalla Coda Read-It-Later (Ripristina nei Progetti Attivi)"
                      : "Sposta in Coda Read-It-Later (Conserva per dopo e mantieni il Vault concentrato)"
                  }
                >
                  <BookMarked
                    className={`w-3.5 h-3.5 ${
                      isReadLaterResource(resource) ? "fill-[#38BDF8]/30 text-[#38BDF8]" : "text-[#777]"
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {isReadLaterResource(resource) ? "In Read Later" : "+ Read Later"}
                  </span>
                </button>
              )}

              {/* Quick Copy Link (Graffetta) Icon Button */}
              {resource.url && (
                <button
                  type="button"
                  onClick={() => handleCopy(resource.url!, "top_link")}
                  className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer ${
                    copiedSection === "top_link"
                      ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                      : "bg-[#141414] hover:bg-[#1E1E1E] text-[#AAA] hover:text-[#C5A059] border-[#2B2B2B]"
                  }`}
                  title={copiedSection === "top_link" ? "Link copiato negli appunti!" : "Copia link sorgente negli appunti"}
                  aria-label="Copia link sorgente"
                >
                  {copiedSection === "top_link" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <LinkIcon className="w-3.5 h-3.5 text-[#C5A059]" />
                  )}
                  <span className="hidden sm:inline">Link</span>
                </button>
              )}

              {/* Direct PDF Download Button */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer ${
                  pdfDownloaded
                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                    : isGeneratingPdf
                    ? "bg-[#1A140B] text-[#C5A059] border-[#C5A059]/40"
                    : pdfError
                    ? "bg-rose-950/60 text-rose-400 border-rose-800/50"
                    : "bg-[#141414] hover:bg-[#1E1E1E] text-[#AAA] hover:text-[#C5A059] border-[#2B2B2B]"
                }`}
                title={
                  pdfDownloaded
                    ? "PDF scaricato con successo!"
                    : isGeneratingPdf
                    ? "Generazione PDF in corso..."
                    : pdfError
                    ? "Errore durante la generazione PDF"
                    : "Scarica documento PDF per consultazione offline"
                }
                aria-label="Scarica PDF offline"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#C5A059] animate-spin" />
                ) : pdfDownloaded ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-[#C5A059]" />
                )}
                <span className="hidden md:inline font-mono">
                  {isGeneratingPdf ? "PDF..." : pdfDownloaded ? "Scaricato!" : "Scarica PDF"}
                </span>
              </button>

              {/* Download .okf.md */}
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className={`p-1.5 sm:p-2 border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer ${
                  markdownDownloaded
                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                    : "text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border-[#2B2B2B]"
                }`}
                title="Scarica documento OKF in formato .okf.md (.md)"
                aria-label="Scarica file markdown OKF"
              >
                {markdownDownloaded ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                )}
                <span className="hidden lg:inline text-[10px] text-[#888]">
                  {markdownDownloaded ? "Scaricato!" : ".md"}
                </span>
              </button>

              {/* Print & PDF Preview */}
              {onPrintPreview && (
                <button
                  type="button"
                  onClick={() => onPrintPreview(resource)}
                  className="p-1.5 sm:p-2 text-[#AAA] hover:text-[#C5A059] bg-[#141414] hover:bg-[#1E1E1E] border border-[#2B2B2B] rounded-lg transition-colors shrink-0"
                  title="Anteprima di Stampa & Stampa / Salva in PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-[#C5A059]" />
                </button>
              )}

              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1F1F1F] border border-[#262626] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Modifica</span>
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? "Salvataggio..." : "Salva"}</span>
                </button>
              )}

              <button
                onClick={() => setShowDeleteConfirm((prev) => !prev)}
                disabled={isDeleting}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${
                  showDeleteConfirm
                    ? "bg-rose-950/80 text-rose-300 border border-rose-800/60"
                    : "text-[#666] hover:text-rose-400 hover:bg-rose-500/10"
                }`}
                title="Elimina risorsa"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="h-5 w-[1px] bg-[#2A2A2A] mx-1" />

              <button
                onClick={onClose}
                aria-label="Chiudi finestra"
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1C1C1C] hover:bg-[#2A2A2A] text-[#EEE] hover:text-white border border-[#333] transition-colors shrink-0 cursor-pointer"
                title="Chiudi finestra (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Top Controls: Edit/Save + Pinned Prominent Close Button */}
            <div className="flex sm:hidden items-center gap-2 shrink-0">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-xs text-[#AAA] hover:text-white bg-[#141414] border border-[#2A2A2A] px-2.5 py-2 rounded-lg transition-colors shrink-0"
                  title="Modifica risorsa"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span className="text-[11px] font-mono">Modifica</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium px-2.5 py-2 rounded-lg transition-colors shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-mono">{isSaving ? "..." : "Salva"}</span>
                </button>
              )}

              {/* Mobile Close Button: ALWAYS visible, prominent, high contrast & 44px touch target */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi finestra"
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#222] hover:bg-[#2E2E2E] active:bg-[#383838] text-white border border-[#444] shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
                title="Chiudi finestra"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Mobile Secondary Action Ribbon: scrollable horizontally so no buttons wrap or hide the close button */}
          <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto pt-2.5 pb-0.5 border-t border-[#181818] mt-2.5 -mx-1 px-1 text-xs scrollbar-none">
            {/* AI Documentation Deepening */}
            <button
              type="button"
              onClick={handleExpandDocumentation}
              disabled={isExpandingDoc}
              className="flex items-center gap-1 text-xs font-mono px-2.5 py-1.5 rounded-lg border transition-all shrink-0 bg-[#C5A059] text-black font-semibold shadow-xs"
            >
              {isExpandingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Approfondisci AI</span>
            </button>

            {/* AI Translation */}
            <button
              type="button"
              onClick={() => handleTranslate(false)}
              disabled={isTranslating}
              className={`flex items-center gap-1 text-xs font-mono px-2.5 py-1.5 rounded-lg border transition-all shrink-0 ${
                hasTranslation && viewLanguage === "italian"
                  ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/60"
                  : "bg-[#141414] text-[#CCC] border-[#2A2A2A]"
              }`}
            >
              {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Languages className="w-3.5 h-3.5 text-[#C5A059]" />}
              <span>{hasTranslation ? (viewLanguage === "italian" ? "🇮🇹 IT" : "Traduci") : "Traduci"}</span>
            </button>

            {/* AI Summary */}
            <button
              type="button"
              onClick={handleSummarize}
              disabled={isSummarizing}
              className={`flex items-center gap-1 text-xs font-mono px-2.5 py-1.5 rounded-lg border transition-all shrink-0 ${
                hasExecutiveSummary
                  ? "bg-[#251E0E] text-[#E5C170] border-[#C5A059]/50"
                  : "bg-[#141414] text-[#CCC] border-[#2A2A2A]"
              }`}
            >
              {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" /> : <Zap className="w-3.5 h-3.5 text-[#C5A059]" />}
              <span>Riassunto</span>
            </button>

            {/* Google Doc */}
            {onExportGoogleDoc && (
              <button
                type="button"
                onClick={() => onExportGoogleDoc(resource)}
                className="p-1.5 border rounded-lg shrink-0 flex items-center gap-1 text-xs font-mono bg-[#141414] border-[#2A2A2A] text-[#AAA]"
              >
                <FileText className="w-3.5 h-3.5 text-[#4285F4]" />
                <span>Doc</span>
              </button>
            )}

            {/* Read Later */}
            {onToggleReadLater && (
              <button
                type="button"
                onClick={() => {
                  const inQueue = isReadLaterResource(resource);
                  onToggleReadLater(resource.id, inQueue);
                }}
                className={`flex items-center gap-1 text-xs font-mono px-2 py-1.5 rounded-lg border shrink-0 ${
                  isReadLaterResource(resource)
                    ? "bg-[#0C1524] text-[#38BDF8] border-[#38BDF8]/60"
                    : "bg-[#141414] text-[#888] border-[#2B2B2B]"
                }`}
              >
                <BookMarked className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>{isReadLaterResource(resource) ? "In Read Later" : "Read Later"}</span>
              </button>
            )}

            {/* Quick Copy Link (Graffetta) Icon Button */}
            {resource.url && (
              <button
                type="button"
                onClick={() => handleCopy(resource.url!, "top_link")}
                className="p-1.5 text-[#888] bg-[#141414] border border-[#262626] rounded-lg shrink-0"
                title="Copia link"
                aria-label="Copia link sorgente"
              >
                {copiedSection === "top_link" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <LinkIcon className="w-3.5 h-3.5 text-[#C5A059]" />}
              </button>
            )}

            {/* Download PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className={`p-1.5 border rounded-lg shrink-0 flex items-center gap-1 ${
                pdfDownloaded
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                  : isGeneratingPdf
                  ? "bg-[#1A140B] text-[#C5A059] border-[#C5A059]/40"
                  : "bg-[#141414] text-[#AAA] border-[#2A2A2A]"
              }`}
              title="Scarica PDF offline"
              aria-label="Scarica PDF offline"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 text-[#C5A059] animate-spin" />
              ) : pdfDownloaded ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-[#C5A059]" />
              )}
            </button>

            {/* Download .okf.md */}
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className={`p-1.5 border rounded-lg shrink-0 ${
                markdownDownloaded
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                  : "bg-[#141414] text-[#AAA] border-[#2A2A2A]"
              }`}
              title="Scarica .okf.md"
              aria-label="Scarica .okf.md"
            >
              {markdownDownloaded ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-[#C5A059]" />
              )}
            </button>

            {/* Print */}
            {onPrintPreview && (
              <button
                type="button"
                onClick={() => onPrintPreview(resource)}
                className="p-1.5 text-[#AAA] bg-[#141414] border border-[#2A2A2A] rounded-lg shrink-0"
                title="Stampa"
              >
                <Printer className="w-3.5 h-3.5 text-[#C5A059]" />
              </button>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm((prev) => !prev)}
              disabled={isDeleting}
              className="p-1.5 text-[#666] hover:text-rose-400 bg-[#141414] border border-[#2A2A2A] rounded-lg shrink-0"
              title="Elimina"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Delete Confirmation In-Modal Banner */}
        {showDeleteConfirm && (
          <div className="px-4 py-3 bg-rose-950/90 border-b border-rose-800/60 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2.5 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-sans font-medium">Sei sicuro di voler eliminare definitivamente questa risorsa dal database?</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1 bg-[#141414] hover:bg-[#222] text-[#AAA] hover:text-white rounded-lg text-xs font-mono border border-[#333] transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? "Eliminazione..." : "Conferma Eliminazione"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Status / Feedback Banners */}
        {expandDocMessage && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{expandDocMessage}</span>
            </div>
            <button 
              onClick={() => setExpandDocMessage(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {translationMessage && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{translationMessage}</span>
            </div>
            <button 
              onClick={() => setTranslationMessage(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {summaryMessage && (
          <div className="px-4 py-2 bg-[#251D0C] border-b border-[#C5A059]/40 text-[#E5C170] text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#C5A059] shrink-0" />
              <span>{summaryMessage}</span>
            </div>
            <button 
              onClick={() => setSummaryMessage(null)}
              className="text-[#C5A059] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        {!isEditing && (
          <div className="px-4 sm:px-6 border-b border-[#1A1A1A] bg-[#0A0A0A] flex items-center gap-2 sm:gap-4 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setActiveModalTab("overview")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "overview"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Panoramica</span>
            </button>

            <button
              onClick={() => setActiveModalTab("doc")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "doc"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Documentazione OKF .md</span>
              <span className="text-[10px] font-mono text-[#AAA] bg-[#161616] px-1.5 py-0.2 rounded border border-[#2A2A2A]">
                {((resource.metadata?.markdownContent || markdownContent || "").replace(/^---[\s\S]*?---\n*/, "").trim().split(/\s+/).filter(Boolean).length || 0)} parole
              </span>
            </button>

            <button
              onClick={() => setActiveModalTab("graph")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "graph"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <Network className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Connessioni & Grafo</span>
              {((resource.metadata?.relations?.length || 0) + (resource.metadata?.entities?.length || 0) > 0) && (
                <span className="text-[10px] font-mono text-[#AAA] bg-[#161616] px-1.5 py-0.2 rounded border border-[#2A2A2A]">
                  {(resource.metadata?.relations?.length || 0)} link
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveModalTab("evaluation")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "evaluation"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <Award className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Valutazione & Score</span>
              {hasEvaluationScore && (
                <span className="text-[10px] font-mono text-[#C5A059] bg-[#221A0C] px-1.5 py-0.2 rounded border border-[#C5A059]/40 font-bold">
                  {metaScore}/100
                </span>
              )}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1 text-[#CCC]">
          {isEditing ? (
            /* ================= EDITING FORM ================= */
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Titolo Originale
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  Titolo Tradotto in Italiano (Opzionale)
                </label>
                <input
                  type="text"
                  value={translatedTitle}
                  onChange={(e) => setTranslatedTitle(e.target.value)}
                  placeholder="Es. Introduzione ai Server MCP e Architetture Autonome..."
                  className="w-full bg-[#111] border border-emerald-900/40 rounded-lg p-2.5 text-sm text-emerald-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Categoria
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  >
                    <option value="troubleshooting">Problema & Soluzione (Troubleshooting)</option>
                    <option value="procedure">Procedura / Playbook Operativo (SOP)</option>
                    <option value="paper">Paper Scientifico (arXiv / DOI)</option>
                    <option value="rss">Feed RSS / Atom</option>
                    <option value="note">Nota Rapida / Scratchpad</option>
                    <option value="knowledge">Knowledge (OKF v0.2)</option>
                    <option value="link">Link & Web Tool</option>
                    <option value="article">Articolo</option>
                    <option value="github_repo">GitHub Repo</option>
                    <option value="mcp_server">MCP Server</option>
                    <option value="ai_skill">AI Skill</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    URL / Link
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Sommario / Descrizione Originale
                </label>
                <textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#C5A059] mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Note Personali & Commenti Utente
                </label>
                <textarea
                  rows={3}
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Aggiungi annotazioni, appunti personali o note operative su questa risorsa..."
                  className="w-full bg-[#111] border border-[#2A2315] rounded-lg p-2.5 text-xs text-[#E5C170] focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  Sommario / Descrizione Tradotta in Italiano
                </label>
                <textarea
                  rows={4}
                  value={translatedSummary}
                  onChange={(e) => setTranslatedSummary(e.target.value)}
                  placeholder="Traduzione italiana generata da AI..."
                  className="w-full bg-[#111] border border-emerald-900/40 rounded-lg p-2.5 text-xs text-emerald-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* AI Executive Summary Editor */}
              <div className="bg-[#141009] border border-[#C5A059]/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                  <Zap className="w-4 h-4" />
                  <span>Riassunto Esecutivo AI & Punti Chiave</span>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                    Sintesi Esecutiva (Executive Summary)
                  </label>
                  <textarea
                    rows={3}
                    value={aiExecutiveSummary}
                    onChange={(e) => setAiExecutiveSummary(e.target.value)}
                    placeholder="Sintesi ad alta densità informativa generata da AI..."
                    className="w-full bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2.5 text-xs text-[#E5C170] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                      Punti Chiave (Key Takeaways - uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={aiKeyTakeawaysStr}
                      onChange={(e) => setAiKeyTakeawaysStr(e.target.value)}
                      placeholder={"- Concetto fondamentale 1\n- Architettura modulare\n- Vantaggio operativo"}
                      className="w-full font-mono bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2 text-xs text-[#DDD] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                      Prossimi Passi (Action Items - uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={aiActionItemsStr}
                      onChange={(e) => setAiActionItemsStr(e.target.value)}
                      placeholder={"- Testare il comando nel terminale\n- Integrare nel grafo Vault\n- Condividere col team"}
                      className="w-full font-mono bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2 text-xs text-[#DDD] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                    Profilo Destinatari (Target Audience)
                  </label>
                  <input
                    type="text"
                    value={aiTargetAudience}
                    onChange={(e) => setAiTargetAudience(e.target.value)}
                    placeholder="Es. Sviluppatori Backend, AI Engineers, Team Lead"
                    className="w-full bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              </div>

              {/* Tag Management & Machine-Learning Suggestion Engine */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-mono uppercase text-[#AAA] font-medium flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Tag della Risorsa ({currentTagsList.length})</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#777]">
                    Inserisci manualmente o usa i suggerimenti ML sottostanti
                  </span>
                </div>

                {/* Active Tag Pills with One-Click Remove */}
                {currentTagsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-[#0C0C0C] border border-[#222] rounded-lg">
                    {currentTagsList.map((tag) => (
                      <span
                        key={`active-tag-${tag}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-[#16140E] border border-[#C5A059]/40 text-[#E5C170] shadow-xs"
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-[#888] hover:text-rose-400 transition-colors cursor-pointer p-0.5"
                          title={`Rimuovi #${tag}`}
                          aria-label={`Rimuovi tag ${tag}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Manual tag string input */}
                <div className="relative">
                  <input
                    type="text"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    placeholder="mcp, typescript, ai, okf..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059] font-mono placeholder:text-[#555]"
                  />
                </div>

                {/* Machine-Learning Based Tag Recommendation Engine */}
                <TagSuggestionEngine
                  resource={resource}
                  currentTags={currentTagsList}
                  onAddTag={handleAddSuggestedTag}
                  onAddMultipleTags={handleAddMultipleSuggestedTags}
                  vaultTags={vaultTags}
                  activeTitle={title}
                  activeSummary={summary}
                  activeContent={markdownContent}
                />
              </div>

              {type === "troubleshooting" && (
                <div className="bg-[#140D07] border border-[#F97316]/30 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-mono uppercase text-[#F97316] font-semibold flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Dati Diagnostica & Risoluzione</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#F97316] mb-1">
                      Sistema / Software Coinvolto
                    </label>
                    <input
                      type="text"
                      value={affectedSystem}
                      onChange={(e) => setAffectedSystem(e.target.value)}
                      placeholder="es. PriMus-Av.usBIM (ACCA) / Windows 11"
                      className="w-full bg-[#0C0804] border border-[#331D0F] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#F97316] mb-1">
                      Causa Scatenante / Root Cause
                    </label>
                    <textarea
                      rows={2}
                      value={rootCause}
                      onChange={(e) => setRootCause(e.target.value)}
                      placeholder="es. Smart App Control (SAC) di Windows ha bloccato borlndmm.dll..."
                      className="w-full bg-[#0C0804] border border-[#331D0F] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#888] mb-1">
                      Tentativi Non Risolutivi (uno per riga)
                    </label>
                    <textarea
                      rows={2}
                      value={attemptedFixesStr}
                      onChange={(e) => setAttemptedFixesStr(e.target.value)}
                      placeholder={"- Rigenerazione cartella .Common\n- Scansione SFC"}
                      className="w-full font-mono bg-[#0C0804] border border-[#331D0F] rounded-lg p-2.5 text-xs text-[#AAA] focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1">
                      Procedura Risolutiva (un passaggio per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={solutionStepsStr}
                      onChange={(e) => setSolutionStepsStr(e.target.value)}
                      placeholder={"1. Disattivare Smart App Control\n2. Riavviare il computer\n3. Verificare l'avvio"}
                      className="w-full font-mono bg-[#0C0804] border border-emerald-900/40 rounded-lg p-2.5 text-xs text-[#34D399] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {type === "procedure" && (
                <div className="bg-[#09171C] border border-[#22D3EE]/30 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-mono uppercase text-[#22D3EE] font-semibold flex items-center gap-1.5">
                    <Workflow className="w-3.5 h-3.5" />
                    <span>Dati Procedura Standard (SOP) &amp; Playbook</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#22D3EE] mb-1">
                        Sistema / Apparecchiatura Target
                      </label>
                      <input
                        type="text"
                        value={targetSystem}
                        onChange={(e) => setTargetSystem(e.target.value)}
                        placeholder="es. Kyocera TASKalfa 3253ci / Windows Server"
                        className="w-full bg-[#061014] border border-[#164E63] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#22D3EE] mb-1">
                        Tipologia di Procedura
                      </label>
                      <select
                        value={procedureType}
                        onChange={(e) => setProcedureType(e.target.value)}
                        className="w-full bg-[#061014] border border-[#164E63] rounded-lg p-2.5 text-xs text-[#E0E0E0] focus:outline-none focus:border-[#22D3EE]"
                      >
                        <option value="maintenance">Manutenzione Programmata</option>
                        <option value="deployment">Deploy &amp; Rilascio</option>
                        <option value="installation">Installazione &amp; Setup</option>
                        <option value="onboarding">Onboarding Operativo</option>
                        <option value="customer_support">Assistenza &amp; Supporto Clienti</option>
                        <option value="troubleshooting_workflow">Flusso Diagnostico / Triage</option>
                        <option value="audit">Audit &amp; Ispezione</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#67E8F9] mb-1">
                        Durata Stimata Intervento
                      </label>
                      <input
                        type="text"
                        value={estimatedDuration}
                        onChange={(e) => setEstimatedDuration(e.target.value)}
                        placeholder="es. 20 min, 1 ora, 45 min"
                        className="w-full bg-[#061014] border border-[#164E63] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#67E8F9] mb-1">
                        Livello di Rischio Operativo
                      </label>
                      <select
                        value={riskLevel}
                        onChange={(e) => setRiskLevel(e.target.value)}
                        className="w-full bg-[#061014] border border-[#164E63] rounded-lg p-2.5 text-xs text-[#E0E0E0] focus:outline-none focus:border-[#22D3EE]"
                      >
                        <option value="low">Basso (Nessun impatto su produzione)</option>
                        <option value="medium">Medio (Possibili disconnessioni temporanee)</option>
                        <option value="high">Alto (Downtime programmato o rischio dati)</option>
                        <option value="critical">Critico (Intervento su sistemi core / emergenza)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#888] mb-1">
                        Prerequisiti (uno per riga)
                      </label>
                      <textarea
                        rows={2}
                        value={prerequisitesStr}
                        onChange={(e) => setPrerequisitesStr(e.target.value)}
                        placeholder={"- Credenziali amministratore SMB\n- Firmware aggiornato alla v3.2"}
                        className="w-full font-mono bg-[#061014] border border-[#164E63] rounded-lg p-2.5 text-xs text-[#AAA] focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#888] mb-1">
                        Strumenti / Tool Richiesti (uno per riga)
                      </label>
                      <textarea
                        rows={2}
                        value={requiredToolsStr}
                        onChange={(e) => setRequiredToolsStr(e.target.value)}
                        placeholder={"- Cavo patch RJ45\n- Cacciavite Torx T10\n- Portatile con Wireshark"}
                        className="w-full font-mono bg-[#061014] border border-[#164E63] rounded-lg p-2.5 text-xs text-[#AAA] focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase text-amber-400 mb-1">
                      Avvertenze di Sicurezza / Safety Warnings (una per riga)
                    </label>
                    <textarea
                      rows={2}
                      value={safetyWarningsStr}
                      onChange={(e) => setSafetyWarningsStr(e.target.value)}
                      placeholder={"- Scollegare l'alimentazione prima di aprire il vano fusore\n- Indossare guanti antistatici ESD"}
                      className="w-full font-mono bg-[#061014] border border-amber-900/50 rounded-lg p-2.5 text-xs text-amber-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1">
                      Passaggi Operativi &amp; Checklist (un passaggio per riga)
                    </label>
                    <textarea
                      rows={4}
                      value={solutionStepsStr}
                      onChange={(e) => setSolutionStepsStr(e.target.value)}
                      placeholder={"1. Accedere al pannello web digitando l'indirizzo IP della multifunzione\n2. Effettuare il login come 'Admin'\n3. Navigare su Impostazioni di Rete > Protocolli > SMB\n4. Verificare abilitazione SMBv2/v3 e salvare"}
                      className="w-full font-mono bg-[#061014] border border-emerald-900/40 rounded-lg p-2.5 text-xs text-[#34D399] focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase text-orange-400 mb-1">
                      Piano di Rollback / Ripristino di Emergenza
                    </label>
                    <textarea
                      rows={2}
                      value={rollbackPlan}
                      onChange={(e) => setRollbackPlan(e.target.value)}
                      placeholder="In caso di mancata connessione o errore durante il salvataggio, ripristinare il backup precedente esportato dal menu Manutenzione..."
                      className="w-full font-mono bg-[#061014] border border-orange-900/50 rounded-lg p-2.5 text-xs text-orange-200 focus:outline-none focus:border-orange-400"
                    />
                  </div>
                </div>
              )}

              {type === "paper" && (
                <div className="space-y-3 bg-[#0B0D1B] border border-[#232854] rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-[#818CF8]">
                    <GraduationCap className="w-4 h-4" />
                    <span className="font-semibold uppercase tracking-wider">Metadati Ricerca Scientifica (Paper / arXiv)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                        Autori / Ricercatori (separati da virgola)
                      </label>
                      <input
                        type="text"
                        value={paperAuthorsStr}
                        onChange={(e) => setPaperAuthorsStr(e.target.value)}
                        placeholder="es. Ashish Vaswani, Noam Shazeer..."
                        className="w-full bg-[#070914] border border-[#1E234A] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                        Identificativo arXiv (es. 2401.12345)
                      </label>
                      <input
                        type="text"
                        value={paperArxivId}
                        onChange={(e) => setPaperArxivId(e.target.value)}
                        placeholder="es. 2401.12345"
                        className="w-full bg-[#070914] border border-[#1E234A] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                        Conferenza / Venue
                      </label>
                      <input
                        type="text"
                        value={paperVenue}
                        onChange={(e) => setPaperVenue(e.target.value)}
                        placeholder="es. NeurIPS 2024, ICLR"
                        className="w-full bg-[#070914] border border-[#1E234A] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                        Anno di Pubblicazione
                      </label>
                      <input
                        type="text"
                        value={paperPublishedYear}
                        onChange={(e) => setPaperPublishedYear(e.target.value)}
                        placeholder="es. 2024"
                        className="w-full bg-[#070914] border border-[#1E234A] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                        Link Diretto PDF o DOI
                      </label>
                      <input
                        type="text"
                        value={paperPdfUrl}
                        onChange={(e) => setPaperPdfUrl(e.target.value)}
                        placeholder="https://arxiv.org/pdf/..."
                        className="w-full bg-[#070914] border border-[#1E234A] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                      TL;DR Scientifico / Abstract Sintetico
                    </label>
                    <textarea
                      rows={2}
                      value={paperTldr}
                      onChange={(e) => setPaperTldr(e.target.value)}
                      placeholder="Sintesi formale del contributo metodologico e dei risultati sperimentali..."
                      className="w-full font-mono bg-[#070914] border border-[#1E234A] rounded-lg p-2.5 text-xs text-[#CBD5E1] focus:outline-none focus:border-[#818CF8]"
                    />
                  </div>
                </div>
              )}

              {(type === "knowledge" || type === "article" || type === "paper") && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#AAA] mb-1 flex items-center justify-between">
                    <span>
                      {type === "knowledge" 
                        ? "Contenuto Markdown OKF v0.2" 
                        : type === "paper"
                          ? "Testo Completo / Abstract del Paper"
                          : "Testo Completo / Markdown dell'Articolo"}
                    </span>
                    <span className="text-[10px] text-[#666]">
                      {type === "article" || type === "paper" ? "Utilizzato per la lettura integrale e traduzione" : "YAML Frontmatter supportato"}
                    </span>
                  </label>
                  <textarea
                    rows={8}
                    value={markdownContent}
                    onChange={(e) => setMarkdownContent(e.target.value)}
                    placeholder={type === "knowledge" ? "# Titolo OKF..." : "Incolla o modifica il testo in Markdown..."}
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "mcp_server" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Configurazione JSON MCP
                  </label>
                  <textarea
                    rows={4}
                    value={mcpConfig}
                    onChange={(e) => setMcpConfig(e.target.value)}
                    placeholder='{"mcpServers": { ... }}'
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#C5A059] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "ai_skill" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    System Prompt / Istruzioni Skill
                  </label>
                  <textarea
                    rows={5}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Sei un assistente specializzato in..."
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "github_repo" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Comando di Installazione / Clone
                  </label>
                  <input
                    type="text"
                    value={installCommand}
                    onChange={(e) => setInstallCommand(e.target.value)}
                    placeholder="git clone https://github.com/..."
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "article" && (
                <div className="bg-[#121212] border border-[#222] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#888]">
                      Avanzamento Lettura: <span className="text-[#C5A059] font-bold">{readingProgress}%</span>
                    </label>
                    <span className="text-[10px] font-mono text-[#AAA]">
                      {readingProgress === 100 ? "Completato" : readingProgress > 0 ? "In lettura" : "Non iniziato"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={readingProgress}
                      onChange={(e) => setReadingProgress(Number(e.target.value))}
                      className="w-full accent-[#C5A059] cursor-pointer"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      {[0, 25, 50, 75, 100].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setReadingProgress(val)}
                          className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                            readingProgress === val
                              ? "bg-[#C5A059] text-black border-[#C5A059] font-bold"
                              : "bg-[#181818] text-[#AAA] border-[#2E2E2E] hover:bg-[#252525]"
                          }`}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluation, Insights & Score Editor */}
              <div className="bg-[#12100C] border border-[#C5A059]/30 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                    <Award className="w-4 h-4" />
                    <span>Valutazione Tecnica, Casi d'Uso e Voto</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="flex items-center gap-1.5 text-xs font-mono bg-[#2A210F] hover:bg-[#3D2E14] text-[#E5C170] hover:text-white border border-[#C5A059]/40 px-2.5 py-1 rounded-md transition-colors"
                  >
                    {isGeneratingInsights ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generazione AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Compila con AI</span>
                      </>
                    )}
                  </button>
                </div>

                {insightMessage && (
                  <div className="text-xs font-mono text-[#E5C170] bg-[#1E170A] border border-[#C5A059]/30 px-3 py-2 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>{insightMessage}</span>
                  </div>
                )}

                {/* Score & Rationale Inputs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase text-[#AAA] flex items-center gap-1.5">
                      <span>Voto di Utilità (1-100):</span>
                      <span className={`font-bold font-mono px-2 py-0.5 rounded text-xs border ${
                        score >= 85 
                          ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                          : score >= 70
                          ? "bg-[#2A210F] text-[#E5C170] border-[#C5A059]/50"
                          : score > 0
                          ? "bg-[#1E1E1E] text-[#CCC] border-[#333]"
                          : "bg-transparent text-[#666] border-transparent"
                      }`}>
                        {score > 0 ? `${score} / 100` : "Non valutato"}
                      </span>
                    </label>

                    <div className="flex items-center gap-1">
                      {[50, 70, 85, 95, 100].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setScore(v)}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                            score === v
                              ? "bg-[#C5A059] text-black border-[#C5A059] font-bold"
                              : "bg-[#181818] text-[#888] hover:text-white border-[#2A2A2A]"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-full accent-[#C5A059] cursor-pointer"
                  />

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                      Motivazione Sintetica del Voto
                    </label>
                    <input
                      type="text"
                      value={scoreRationale}
                      onChange={(e) => setScoreRationale(e.target.value)}
                      placeholder="Es. Tool essenziale per il parsing ontologico con ottima documentazione..."
                      className="w-full bg-[#111] border border-[#262626] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                {/* Use Cases Input */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#AAA] mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-[#C5A059]" />
                      Casi di Utilizzo / Scenari (uno per riga)
                    </span>
                    <span className="text-[10px] text-[#666] lowercase">un punto per riga</span>
                  </label>
                  <textarea
                    rows={3}
                    value={useCasesStr}
                    onChange={(e) => setUseCasesStr(e.target.value)}
                    placeholder={"- Integrazione rapida con Claude Desktop\n- Pipeline di analisi ontologica automatizzata\n- Ricerca semantica avanzata"}
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* Pros and Cons Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      Valutazioni Pro (uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={prosStr}
                      onChange={(e) => setProsStr(e.target.value)}
                      placeholder={"- Facile da installare\n- Zero dipendenze esterne\n- Prestazioni eccellenti"}
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#E5C170] mb-1 flex items-center gap-1.5">
                      <ThumbsDown className="w-3.5 h-3.5" />
                      Valutazioni Contro (uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={consStr}
                      onChange={(e) => setConsStr(e.target.value)}
                      placeholder={"- Richiede Node >= 18\n- Documentazione minimale su Windows"}
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#D5B069] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================= READONLY DETAIL VIEW ================= */
            activeModalTab === "evaluation" ? (
              <div className="space-y-4 animate-in fade-in">
                {/* Language Switcher Bar (if translation is available) */}
                {hasTranslation && (
                  <div className="bg-[#0D1510] border border-emerald-800/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-mono text-emerald-300 font-medium">
                        Visualizzazione Lingua:
                      </span>
                      <div className="flex items-center bg-[#070B08] p-1 rounded-lg border border-emerald-900/60 gap-1">
                        <button
                          type="button"
                          onClick={() => setViewLanguage("italian")}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                            viewLanguage === "italian"
                              ? "bg-emerald-600 text-white font-bold shadow-sm"
                              : "text-[#888] hover:text-white"
                          }`}
                        >
                          🇮🇹 Italiano (AI)
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewLanguage("original")}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                            viewLanguage === "original"
                              ? "bg-[#222] text-white font-bold shadow-sm"
                              : "text-[#888] hover:text-white"
                          }`}
                        >
                          🌐 Originale
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Focused Evaluation Header */}
                <div className="bg-[#12100A] border border-[#C5A059]/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/30 uppercase font-semibold">
                        {resource.type}
                      </span>
                      {resource.metadata?.domain && (
                        <span className="text-[11px] font-mono text-[#888]">
                          {resource.metadata.domain}
                        </span>
                      )}
                      {hasEvaluationScore && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50 font-bold">
                          Score: {metaScore}/100
                        </span>
                      )}
                    </div>
                    <h2 className="text-base sm:text-lg font-serif font-bold text-white tracking-wide truncate">
                      {currentDisplayTitle}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab("overview")}
                    className="text-xs font-mono text-[#AAA] hover:text-[#E5C170] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18150E] hover:bg-[#221C11] border border-[#2B2312] shrink-0 transition-colors cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Torna alla Panoramica</span>
                  </button>
                </div>

                {renderEvaluationCard()}
              </div>
            ) : (
              <>
                {/* Language Switcher Bar (if translation is available) */}
              {hasTranslation && (
                <div className="bg-[#0D1510] border border-emerald-800/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-mono text-emerald-300 font-medium">
                      Visualizzazione Lingua:
                    </span>
                    <div className="flex items-center bg-[#070B08] p-1 rounded-lg border border-emerald-900/60 gap-1">
                      <button
                        type="button"
                        onClick={() => setViewLanguage("italian")}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                          viewLanguage === "italian"
                            ? "bg-emerald-600 text-white font-bold shadow-sm"
                            : "text-[#888] hover:text-white"
                        }`}
                      >
                        🇮🇹 Italiano (AI)
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewLanguage("original")}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                          viewLanguage === "original"
                            ? "bg-[#222] text-white font-bold shadow-sm"
                            : "text-[#888] hover:text-white"
                        }`}
                      >
                        🌐 Originale
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTranslate(true)}
                      disabled={isTranslating}
                      className="flex items-center gap-1 text-[11px] font-mono text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/40 px-2.5 py-1 rounded-md transition-colors"
                      title="Rigenera la traduzione italiana con Gemini AI"
                    >
                      {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      <span>Rigenera Traduzione</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(resource.metadata?.translatedSummary || resource.metadata?.translatedContent || "", "it_trans")}
                      className="flex items-center gap-1 text-[11px] font-mono text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#202020] border border-[#2A2A2A] px-2.5 py-1 rounded-md transition-colors"
                    >
                      {copiedSection === "it_trans" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-400" />}
                      <span>{copiedSection === "it_trans" ? "Copiato" : "Copia Traduzione"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Title & URL */}
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {isItalianView && (
                    <span className="text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                      <Languages className="w-3 h-3 text-emerald-400" />
                      Tradotto in Italiano
                    </span>
                  )}
                  {resource.metadata?.domain && (
                    <span className="text-[10px] bg-[#141414] text-[#888] px-2 py-0.5 rounded font-mono">
                      {resource.metadata.domain}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-serif text-white font-medium leading-snug">
                  {currentDisplayTitle}
                </h2>

                {resource.url && (
                  <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#C5A059] hover:underline flex items-center gap-1.5 truncate max-w-[80%]"
                      title={resource.url}
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{resource.url}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopy(resource.url!, "body_link")}
                      className="flex items-center gap-1 text-[11px] font-mono bg-[#141414] hover:bg-[#202020] text-[#AAA] hover:text-white border border-[#2A2A2A] px-2.5 py-1 rounded-md transition-colors shrink-0"
                      title="Copia link sorgente negli appunti"
                    >
                      {copiedSection === "body_link" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Link Copiato!</span>
                        </>
                      ) : (
                        <>
                          <LinkIcon className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia Link</span>
                        </>
                      )}
                    </button>

                    {/* Quick RSS/Atom Discovery Button for articles and links */}
                    {(resource.type === "article" || resource.type === "link" || resource.type === "knowledge") && (
                      <button
                        type="button"
                        onClick={handleCheckWebsiteFeed}
                        disabled={isDiscoveringFeed}
                        className="flex items-center gap-1.5 text-[11px] font-mono bg-[#1C1008] hover:bg-[#2B180C] text-[#FB923C] border border-[#4E2412] px-2.5 py-1 rounded-md transition-colors shrink-0"
                        title="Verifica se il sito sorgente espone un feed RSS o Atom pubblico"
                      >
                        {isDiscoveringFeed ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-[#FB923C]" />
                            <span>Scansione Feed...</span>
                          </>
                        ) : (
                          <>
                            <Rss className="w-3 h-3 text-[#FB923C]" />
                            <span>{isFeedDiscoveryDrawerOpen ? "Chiudi Lettore Feed" : "Rileva / Leggi Feed RSS"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {feedDiscoveryStatus && (
                  <div className="mt-2.5 text-xs font-mono text-[#FB923C] bg-[#1E1108] border border-[#3D1E0F] px-3 py-1.5 rounded-lg flex items-center gap-2 animate-in fade-in">
                    <Radio className="w-3.5 h-3.5 animate-pulse text-[#FB923C] shrink-0" />
                    <span>{feedDiscoveryStatus}</span>
                  </div>
                )}

                {isFeedDiscoveryDrawerOpen && discoveredFeedUrl && (
                  <div className="mt-3 animate-in fade-in">
                    <RssFeedViewer
                      feedUrl={discoveredFeedUrl}
                      resourceTitle={`Feed RSS di ${resource.title}`}
                      onIngestItem={onIngestFeedItem}
                    />
                  </div>
                )}
              </div>

              {/* ================= AI EXECUTIVE SUMMARY BRIEF CARD ================= */}
              {hasExecutiveSummary ? (
                <div className="bg-[#120E07] border border-[#C5A059]/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-lg shadow-black/40">
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-[#2C210E]">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#E5C170] font-semibold">
                      <Zap className="w-4 h-4 text-[#C5A059]" />
                      <span>Sintesi Esecutiva & Key Takeaways AI</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-md transition-all shadow-sm ${
                          isLegacyFallbackSummary
                            ? "text-black font-bold bg-[#C5A059] hover:bg-[#D8B26A] animate-pulse"
                            : "text-[#E5C170] hover:text-white bg-[#261E0F] hover:bg-[#382B14] border border-[#C5A059]/40"
                        }`}
                        title="Rigenera il riassunto con Gemini AI e l'articolo reale"
                      >
                        {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>{isLegacyFallbackSummary ? "Aggiorna con Articolo Reale" : "Rigenera"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(
                          `${displayExecutiveSummary || ""}\n\nKey Takeaways:\n${displayKeyTakeaways.map((t: string) => `• ${t}`).join("\n")}`,
                          "exec_summary"
                        )}
                        className="flex items-center gap-1 text-[11px] font-mono text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#202020] border border-[#2A2A2A] px-2.5 py-1 rounded-md transition-colors"
                      >
                        {copiedSection === "exec_summary" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#C5A059]" />}
                        <span>{copiedSection === "exec_summary" ? "Copiato" : "Copia Brief"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Notice if legacy placeholder detected */}
                  {isLegacyFallbackSummary && (
                    <div className="bg-[#241A0A] border border-[#C5A059]/50 rounded-lg p-3 text-xs text-[#E5C170] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#C5A059] shrink-0" />
                        <span>
                          <strong>Avviso Testo Preliminare:</strong> Questa risorsa conteneva un riassunto generico creato prima del supporto al parsing profondo di Medium. Clicca su <strong>"Aggiorna con Articolo Reale"</strong> per scaricare il testo autentico e rigenerare la sintesi.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        className="px-2.5 py-1 rounded bg-[#C5A059] text-black font-semibold text-[11px] shrink-0 hover:bg-[#D8B26A] transition-colors"
                      >
                        Aggiorna Ora
                      </button>
                    </div>
                  )}

                  {/* Executive Overview */}
                  {displayExecutiveSummary && (
                    <div className="text-xs sm:text-sm text-[#E2D2B5] leading-relaxed font-sans bg-[#1A140A] p-3.5 rounded-lg border border-[#332611]">
                      {displayExecutiveSummary}
                    </div>
                  )}

                  {/* Key Takeaways */}
                  {displayKeyTakeaways && displayKeyTakeaways.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono uppercase text-[#A89060] mb-2 flex items-center gap-1.5 font-medium tracking-wider">
                        <ListChecks className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Punti Chiave & Approfondimenti:</span>
                      </div>
                      <div className="space-y-1.5">
                        {displayKeyTakeaways.map((takeaway: string, idx: number) => (
                          <div
                            key={idx}
                            className="bg-[#18130B] border border-[#2A2011] p-2.5 rounded-lg flex items-start gap-2.5 text-xs text-[#DDD]"
                          >
                            <span className="text-[#C5A059] font-mono font-bold text-xs mt-0.5 shrink-0">
                              0{idx + 1}.
                            </span>
                            <span className="leading-relaxed">{takeaway}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Audience & Action Items in Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {displayTargetAudience && (
                      <div className="bg-[#151008] border border-[#2D2110] rounded-lg p-3 space-y-1.5">
                        <div className="text-[11px] font-mono uppercase text-[#C5A059] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>Profilo Destinatari</span>
                        </div>
                        <p className="text-xs text-[#CCC] leading-relaxed">
                          {displayTargetAudience}
                        </p>
                      </div>
                    )}

                    {displayActionItems && displayActionItems.length > 0 && (
                      <div className="bg-[#151008] border border-[#2D2110] rounded-lg p-3 space-y-1.5">
                        <div className="text-[11px] font-mono uppercase text-emerald-400 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" />
                          <span>Prossimi Passi (Action Items)</span>
                        </div>
                        <ul className="space-y-1 text-xs text-[#CCC]">
                          {displayActionItems.map((item: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Unsummarized Prompt Box */
                <div className="bg-[#0E0C08] border border-[#261E10] rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#C5A059] shrink-0" />
                    <p className="text-xs text-[#AAA]">
                      Vuoi estrarre i punti chiave e l'executive brief di questa risorsa?
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                    className="flex items-center gap-1.5 text-xs font-mono bg-[#2A200F] hover:bg-[#3D2E14] text-[#E5C170] hover:text-white border border-[#C5A059]/40 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    {isSummarizing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                        <span>Generazione Brief...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Genera Riassunto Esecutivo AI</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Reading Progress Indicator for Article Type in Modal */}
              {resource.type === "article" && (() => {
                const prog = resource.metadata?.readingProgress ?? (resource as any).readingProgress ?? 0;
                return (
                  <div className="bg-[#0D0D0D] border border-[#222] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        {prog === 100 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : prog > 0 ? (
                          <Clock className="w-4 h-4 text-[#C5A059]" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-[#666]" />
                        )}
                        <span className={prog === 100 ? "text-emerald-400 font-semibold" : prog > 0 ? "text-[#C5A059] font-semibold" : "text-[#888]"}>
                          Stato Lettura: {prog === 100 ? "Completato (100%)" : prog > 0 ? `In lettura (${prog}%)` : "Da leggere (0%)"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {prog === 100 ? (
                          <button
                            type="button"
                            onClick={() => onUpdate(resource.id, {
                              metadata: { ...resource.metadata, readingProgress: 0, readingStatus: "unread" }
                            })}
                            className="text-xs font-mono text-[#888] hover:text-white bg-[#161616] hover:bg-[#222] px-2.5 py-1 rounded-md border border-[#2A2A2A] transition-colors"
                          >
                            Reimposta a 0%
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUpdate(resource.id, {
                              metadata: { ...resource.metadata, readingProgress: 100, readingStatus: "completed" }
                            })}
                            className="text-xs font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-950/60 hover:bg-emerald-950/90 px-3 py-1 rounded-md border border-emerald-700/50 transition-colors flex items-center gap-1.5 font-medium"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Segna come Completato</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <div className="h-2.5 w-full bg-[#181818] rounded-full overflow-hidden border border-[#282828]">
                        <div
                          className={`h-full transition-[width] duration-500 ease-out rounded-full ${
                            prog === 100
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                              : prog > 0
                              ? "bg-gradient-to-r from-[#B38F46] to-[#E3BE70] shadow-[0_0_10px_rgba(197,160,89,0.3)]"
                              : "bg-transparent"
                          }`}
                          style={{ width: `${prog}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={prog}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdate(resource.id, {
                            metadata: {
                              ...resource.metadata,
                              readingProgress: val,
                              readingStatus: val === 100 ? "completed" : val > 0 ? "in_progress" : "unread"
                            }
                          });
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        aria-label="Regola avanzamento lettura"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      {[0, 25, 50, 75, 100].map((step) => {
                        const isCurrent = prog === step;
                        return (
                          <button
                            key={step}
                            type="button"
                            onClick={() => onUpdate(resource.id, {
                              metadata: {
                                ...resource.metadata,
                                readingProgress: step,
                                readingStatus: step === 100 ? "completed" : step > 0 ? "in_progress" : "unread"
                              }
                            })}
                            className={`flex-1 py-1 text-xs font-mono rounded-md transition-all text-center ${
                              isCurrent
                                ? step === 100
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-600/60 font-semibold"
                                  : step === 0
                                  ? "bg-[#222] text-white border border-[#444] font-semibold"
                                  : "bg-[#2A210F] text-[#E0BA6A] border border-[#C5A059]/60 font-semibold"
                                : "bg-[#141414] hover:bg-[#1E1E1E] text-[#777] hover:text-[#BBB] border border-[#222]"
                            }`}
                          >
                            {step === 0 ? "0%" : `${step}%`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* OKF Ontology Badges if available */}
              {resource.type === "knowledge" && (
                <div className="bg-[#120F0A] border border-[#C5A059]/30 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <BrainCircuit className="w-4 h-4" />
                      <span>Specifiche Ontologiche OKF v0.2</span>
                    </div>

                    {resource.metadata?.domain && (
                      <span className="text-[10px] font-mono bg-[#1A1A1A] border border-[#333] text-[#AAA] px-2 py-0.5 rounded">
                        Dominio: {resource.metadata.domain}
                      </span>
                    )}
                  </div>

                  {resource.metadata?.entities && resource.metadata.entities.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono text-[#777] mb-1.5 uppercase">Entità Estratte:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {resource.metadata.entities.map((ent, idx) => {
                          const name = typeof ent === "string" ? ent : ent.name;
                          const entType = typeof ent === "string" ? "entity" : ent.type;
                          return (
                            <span key={`modal-ent-${resource.id || 'res'}-${idx}-${name}`} className="text-xs font-mono bg-[#1A160E] border border-[#C5A059]/20 text-[#D5B069] px-2 py-0.5 rounded">
                              <span className="text-[#888]">{entType}:</span> {name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {resource.metadata?.relations && resource.metadata.relations.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono text-[#777] mb-1.5 uppercase">Relazioni nel Grafo:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {resource.metadata.relations.map((rel, idx) => {
                          const src = rel.source || rel.sourceTitle || resource.title;
                          const tgt = rel.target || rel.targetTitle || rel.targetId || "";
                          const rType = rel.type || rel.relationType || "relates_to";
                          return (
                            <div key={`modal-rel-${resource.id || 'res'}-${idx}-${tgt}`} className="text-[11px] font-mono bg-[#16130C] border border-[#2D2413] text-[#CCC] p-2 rounded flex items-center justify-between">
                              <span className="font-semibold text-white truncate">{src}</span>
                              <span className="text-[10px] text-[#C5A059] px-1.5 bg-[#000]/40 rounded">{rType}</span>
                              <span className="font-semibold text-white truncate">{tgt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Troubleshooting & Diagnostic Box */}
              {resource.type === "troubleshooting" && (
                <div className="bg-[#140D07] border border-[#F97316]/30 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#F97316]/20 pb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#F97316]">
                      <Wrench className="w-4 h-4" />
                      <span className="font-semibold uppercase tracking-wider">Scheda Diagnostica & Soluzione Problema</span>
                    </div>
                    {resource.metadata?.affectedSystem && (
                      <span className="text-[11px] font-mono bg-[#281508] border border-[#F97316]/40 text-[#FDBA74] px-2.5 py-0.5 rounded-full font-medium">
                        {resource.metadata.affectedSystem}
                      </span>
                    )}
                  </div>

                  {resource.metadata?.errorLog && (
                    <div className="bg-[#0D0505] border border-red-900/40 rounded-lg p-3 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase text-red-400 font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          <span>Errore Rilevato (Trascrizione Screenshot / Log):</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(resource.metadata?.errorLog || "", "troubleshoot_error")}
                          className="text-[10px] font-mono text-red-300 hover:text-white bg-red-950/60 px-2 py-0.5 rounded border border-red-700/40 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedSection === "troubleshoot_error" ? <Check className="w-3 h-3 text-red-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedSection === "troubleshoot_error" ? "Copiato" : "Copia Errore"}</span>
                        </button>
                      </div>
                      <pre className="text-xs font-mono text-red-200/90 whitespace-pre-wrap break-all bg-black/50 p-2.5 rounded border border-red-950/70 max-h-40 overflow-y-auto custom-scrollbar">
                        {resource.metadata.errorLog}
                      </pre>
                    </div>
                  )}

                  {resource.metadata?.problemDescription && resource.metadata.problemDescription !== resource.metadata.errorLog && (
                    <div className="bg-[#0C0804] border border-[#331D0F] rounded-lg p-3 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-amber-500/90 font-semibold">Manifestazione del Problema:</div>
                      <p className="text-xs text-[#E5E5E5] leading-relaxed">{resource.metadata.problemDescription}</p>
                    </div>
                  )}

                  {resource.metadata?.rootCause && (
                    <div className="bg-[#0C0804] border border-[#331D0F] rounded-lg p-3 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#F97316] font-semibold">Causa Scatenante / Root Cause:</div>
                      <p className="text-xs text-[#E5E5E5] leading-relaxed">{resource.metadata.rootCause}</p>
                    </div>
                  )}

                  {resource.metadata?.attemptedFixes && resource.metadata.attemptedFixes.length > 0 && (
                    <div className="bg-[#0C0804] border border-[#331D0F] rounded-lg p-3 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase text-[#A3A3A3] font-semibold flex items-center gap-1.5">
                        <ThumbsDown className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>Tentativi Non Risolutivi / Falsi Positivi:</span>
                      </div>
                      <ul className="space-y-1 text-xs text-[#A3A3A3]">
                        {resource.metadata.attemptedFixes.map((fix, idx) => (
                          <li key={`modal-fix-${resource.id || 'res'}-${idx}`} className="flex items-start gap-2">
                            <span className="text-[#F97316] font-mono">✕</span>
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {resource.metadata?.solutionSteps && resource.metadata.solutionSteps.length > 0 && (
                    <div className="bg-[#06140D] border border-emerald-800/40 rounded-lg p-3 space-y-2">
                      <div className="text-[11px] font-mono uppercase text-emerald-400 font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Procedura Risolutiva Verificata</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(resource.metadata?.solutionSteps?.join("\n") || "", "troubleshoot_solution")}
                          className="text-[10px] font-mono text-emerald-300 hover:text-white bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/40 flex items-center gap-1"
                        >
                          {copiedSection === "troubleshoot_solution" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedSection === "troubleshoot_solution" ? "Copiato" : "Copia Procedura"}</span>
                        </button>
                      </div>
                      <ol className="space-y-1.5 text-xs text-[#D1FAE5]">
                        {resource.metadata.solutionSteps.map((step, idx) => (
                          <li key={`modal-step-${resource.id || 'res'}-${idx}`} className="flex items-start gap-2">
                            <span className="text-emerald-400 font-mono font-bold shrink-0">{idx + 1}.</span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* Standard Operating Procedure (SOP) & Playbook Execution Engine */}
              {resource.type === "procedure" && (
                <div className="bg-[#081318] border border-[#22D3EE]/35 rounded-xl p-4 sm:p-5 space-y-4 shadow-lg">
                  {/* SOP Header with Status & Timing */}
                  <div className="flex items-center justify-between border-b border-[#22D3EE]/20 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#22D3EE]">
                      <Workflow className="w-4 h-4 text-[#22D3EE] animate-pulse" />
                      <span className="font-semibold uppercase tracking-wider">Playbook Operativo &amp; SOP Standard</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {resource.metadata?.procedureType && (
                        <span className="text-[11px] font-mono bg-[#0D242C] border border-[#164E63] text-[#67E8F9] px-2.5 py-0.5 rounded-full capitalize">
                          {resource.metadata.procedureType.replace("_", " ")}
                        </span>
                      )}
                      {resource.metadata?.targetSystem && (
                        <span className="text-[11px] font-mono bg-[#091D24] border border-[#22D3EE]/40 text-[#A5F3FC] px-2.5 py-0.5 rounded-full font-medium">
                          {resource.metadata.targetSystem}
                        </span>
                      )}
                      {resource.metadata?.estimatedDuration && (
                        <span className="text-[11px] font-mono bg-[#141F1A] border border-emerald-800/40 text-emerald-400 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-400" />
                          <span>{resource.metadata.estimatedDuration}</span>
                        </span>
                      )}
                      {resource.metadata?.riskLevel && (
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
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

                  {/* Safety Warnings Banner if any */}
                  {((resource.metadata?.safetyWarnings && resource.metadata.safetyWarnings.length > 0) || resource.metadata?.riskLevel === "high" || resource.metadata?.riskLevel === "critical") && (
                    <div className="bg-[#180A0A] border border-red-800/50 rounded-xl p-3.5 space-y-1.5 animate-in fade-in">
                      <div className="flex items-center gap-2 text-xs font-mono text-red-400 font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>Avvertenze di Sicurezza &amp; Prescrizioni Operative</span>
                      </div>
                      {resource.metadata?.safetyWarnings && resource.metadata.safetyWarnings.length > 0 ? (
                        <ul className="space-y-1 text-xs text-red-200/90 pl-5 list-disc">
                          {resource.metadata.safetyWarnings.map((w, idx) => (
                            <li key={idx} className="leading-relaxed">{w}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-red-200/80 leading-relaxed">
                          Attenzione: operazione ad alto impatto. Prima di procedere verificare il piano di rollback e isolare se necessario i sistemi coinvolti.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Prerequisites and Required Tools Grid */}
                  {((resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0) || (resource.metadata?.requiredTools && resource.metadata.requiredTools.length > 0)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                      {resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0 && (
                        <div className="bg-[#061014] border border-[#164E63]/60 rounded-lg p-3 space-y-1.5">
                          <div className="text-[10px] uppercase text-[#67E8F9] font-bold flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-[#22D3EE]" />
                            <span>Prerequisiti Necessari:</span>
                          </div>
                          <ul className="space-y-1 text-[#CCC]">
                            {resource.metadata.prerequisites.map((p, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-[#22D3EE] font-bold">›</span>
                                <span className="leading-tight">{p}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {resource.metadata?.requiredTools && resource.metadata.requiredTools.length > 0 && (
                        <div className="bg-[#061014] border border-[#164E63]/60 rounded-lg p-3 space-y-1.5">
                          <div className="text-[10px] uppercase text-[#67E8F9] font-bold flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-[#22D3EE]" />
                            <span>Strumenti &amp; Tool Richiesti:</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {resource.metadata.requiredTools.map((t, idx) => (
                              <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-[#091D24] text-[#A5F3FC] border border-[#164E63]">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Checklist Protocol */}
                  {resource.metadata?.solutionSteps && resource.metadata.solutionSteps.length > 0 ? (
                    <div className="bg-[#050D11] border border-[#164E63] rounded-xl p-3.5 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <ListChecks className="w-4 h-4 text-[#22D3EE]" />
                          <span className="text-xs font-mono font-bold uppercase text-[#22D3EE] tracking-wider">
                            Checklist Operativa Eseguibile
                          </span>
                        </div>

                        {/* Progress Counter & Bulk Action Controls */}
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-[11px] px-2 py-0.5 rounded bg-[#091D24] border border-[#164E63] text-[#67E8F9]">
                            {resource.metadata.solutionSteps.filter((_, idx) => checkedStepIndices.has(idx)).length} / {resource.metadata.solutionSteps.length} completati
                            ({Math.round((resource.metadata.solutionSteps.filter((_, idx) => checkedStepIndices.has(idx)).length / resource.metadata.solutionSteps.length) * 100)}%)
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCompleteAllSteps(resource.metadata!.solutionSteps!.length)}
                            className="text-[10px] px-2 py-0.5 rounded bg-[#0D242C] hover:bg-[#12303B] text-[#A5F3FC] border border-[#164E63] transition-colors cursor-pointer"
                            title="Segna tutti i passaggi come eseguiti"
                          >
                            Tutti
                          </button>

                          <button
                            type="button"
                            onClick={handleResetChecklist}
                            className="text-[10px] px-2 py-0.5 rounded bg-[#160E0E] hover:bg-[#251515] text-[#F87171] border border-red-900/40 transition-colors cursor-pointer flex items-center gap-1"
                            title="Reimposta la checklist"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Reset</span>
                          </button>
                        </div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="w-full bg-[#091D24] rounded-full h-1.5 overflow-hidden border border-[#164E63]/50">
                        <div 
                          className="bg-gradient-to-r from-[#06B6D4] to-[#22D3EE] h-full transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (resource.metadata.solutionSteps.filter((_, idx) => checkedStepIndices.has(idx)).length /
                                resource.metadata.solutionSteps.length) *
                                100
                            )}%`
                          }}
                        />
                      </div>

                      {/* Interactive Step Items with Checkboxes */}
                      <div className="space-y-2 pt-1">
                        {resource.metadata.solutionSteps.map((step, idx) => {
                          const isChecked = checkedStepIndices.has(idx);
                          return (
                            <div
                              key={`sop-step-${resource.id}-${idx}`}
                              onClick={() => toggleStepCheck(idx)}
                              className={`group flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? "bg-[#041217]/70 border-emerald-800/40 text-[#86EFAC]/70"
                                  : "bg-[#07171E]/80 border-[#153B47] hover:border-[#22D3EE]/50 text-[#E0F2FE]"
                              }`}
                            >
                              <button
                                type="button"
                                className="shrink-0 mt-0.5 text-base transition-transform group-hover:scale-110"
                                aria-label={isChecked ? "Passaggio completato" : "Segna come completato"}
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-[#22D3EE]/60 group-hover:text-[#22D3EE]" />
                                )}
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className={`text-[11px] font-mono font-bold shrink-0 ${isChecked ? "text-emerald-500/70" : "text-[#22D3EE]"}`}>
                                    Passo {idx + 1}.
                                  </span>
                                  <p className={`text-xs leading-relaxed transition-all ${isChecked ? "line-through opacity-75" : ""}`}>
                                    {step}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Contingency Rollback Plan */}
                  {resource.metadata?.rollbackPlan && (
                    <div className="bg-[#140D05] border border-orange-800/40 rounded-xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-mono uppercase text-orange-400 font-bold">
                          <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                          <span>Piano di Rollback &amp; Contingenza (In caso di anomalia)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(resource.metadata?.rollbackPlan || "", "sop_rollback")}
                          className="text-[10px] font-mono text-orange-300 hover:text-white bg-orange-950/60 px-2 py-0.5 rounded border border-orange-700/40 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedSection === "sop_rollback" ? <Check className="w-3 h-3 text-orange-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedSection === "sop_rollback" ? "Copiato" : "Copia Rollback"}</span>
                        </button>
                      </div>
                      <p className="text-xs text-orange-200/90 leading-relaxed font-sans">
                        {resource.metadata.rollbackPlan}
                      </p>
                    </div>
                  )}

                  {/* Bidirectional Mesh: Related Troubleshooting Nodes in Vault */}
                  {(() => {
                    const relatedFaults = allResources.filter((r) => {
                      if (r.id === resource.id || r.type !== "troubleshooting") return false;
                      const matchesExplicit = resource.metadata?.relatedTroubleshootingIds?.includes(r.id);
                      const target = (resource.metadata?.targetSystem || "").toLowerCase().trim();
                      const affected = (r.metadata?.affectedSystem || "").toLowerCase().trim();
                      const matchesSystem = target && affected && (target.includes(affected) || affected.includes(target));
                      const matchesRelation = (resource.metadata?.relations || []).some(
                        (rel) => rel.targetId === r.id || (rel.targetTitle && rel.targetTitle.toLowerCase() === r.title.toLowerCase())
                      );
                      return Boolean(matchesExplicit || matchesSystem || matchesRelation);
                    });

                    if (relatedFaults.length === 0) return null;

                    return (
                      <div className="bg-[#09151C] border border-[#164E63] rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-mono uppercase text-[#67E8F9] font-bold">
                          <Wrench className="w-3.5 h-3.5 text-[#F97316]" />
                          <span>Schede di Troubleshooting Correlate nel Vault ({relatedFaults.length})</span>
                        </div>
                        <p className="text-[11px] text-[#94A3B8]">
                          Questa procedura previene o risolve le seguenti anomalie censite nel tuo Knowledge Vault:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {relatedFaults.map((fault) => (
                            <button
                              key={`sop-fault-${fault.id}`}
                              type="button"
                              onClick={() => {
                                if (onNavigateToResource) {
                                  onNavigateToResource(fault);
                                }
                              }}
                              className="flex items-start gap-2 p-2 rounded-lg bg-[#0C1E26] hover:bg-[#122D3A] border border-[#164E63] hover:border-[#F97316]/60 text-left transition-all group cursor-pointer"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-white group-hover:text-[#FDBA74] truncate">
                                  {fault.title}
                                </div>
                                {fault.metadata?.affectedSystem && (
                                  <div className="text-[10px] font-mono text-[#94A3B8] truncate">
                                    {fault.metadata.affectedSystem}
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-[#64748B] group-hover:text-white shrink-0 mt-0.5" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Paper Scientifico: Autori, arXiv & Accesso PDF */}
              {resource.type === "paper" && (
                hasPaperMetadata ? (
                  <div className="bg-[#0B0D1B] border border-[#232854] rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-[#232854] pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#818CF8]">
                        <GraduationCap className="w-4 h-4" />
                        <span className="font-semibold uppercase tracking-wider">Scheda Ricerca Scientifica</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {resource.metadata?.venue && (
                          <span className="text-[11px] font-mono bg-[#161B3B] text-[#A5B4FC] px-2.5 py-0.5 rounded border border-[#313975]">
                            {resource.metadata.venue}
                          </span>
                        )}
                        {resource.metadata?.publishedYear && (
                          <span className="text-[11px] font-mono bg-[#161B3B] text-[#94A3B8] px-2 py-0.5 rounded border border-[#313975]">
                            {resource.metadata.publishedYear}
                          </span>
                        )}
                      </div>
                    </div>

                    {resource.metadata?.authors && resource.metadata.authors.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono uppercase text-[#64748B]">Autori / Ricercatori:</div>
                        <div className="text-xs text-[#CBD5E1] font-medium flex flex-wrap gap-1.5">
                          {resource.metadata.authors.map((author, aIdx) => (
                            <span key={aIdx} className="bg-[#141833] border border-[#2A3166] text-[#E2E8F0] px-2 py-0.5 rounded text-[11px]">
                              {author}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {resource.metadata?.arxivId && (
                        <div className="bg-[#070914] border border-[#1E234A] rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <div className="text-[10px] font-mono uppercase text-[#818CF8]">Identificativo arXiv</div>
                            <div className="text-xs font-mono font-bold text-white mt-0.5">
                              arXiv:{resource.metadata.arxivId}
                            </div>
                          </div>
                          <a
                            href={`https://arxiv.org/abs/${resource.metadata.arxivId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-[#1E234A] hover:bg-[#2A3166] text-[#A5B4FC] rounded text-xs font-mono flex items-center gap-1 transition-colors"
                          >
                            <span>Scheda</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {(resource.metadata?.pdfUrl || resource.metadata?.arxivId) && (
                        <div className="bg-[#070914] border border-[#1E234A] rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <div className="text-[10px] font-mono uppercase text-emerald-400">Documento Completo</div>
                            <div className="text-xs font-mono text-[#AAA] mt-0.5">Formato PDF Originale</div>
                          </div>
                          <a
                            href={resource.metadata?.pdfUrl || `https://arxiv.org/pdf/${resource.metadata.arxivId}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/50 text-emerald-300 rounded text-xs font-mono flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            <span>Apri PDF</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {resource.metadata?.tldr && (
                      <div className="bg-[#070914] border border-[#1E234A] rounded-lg p-3 space-y-1">
                        <div className="text-[10px] font-mono uppercase text-[#818CF8] font-semibold">TL;DR Scientifico:</div>
                        <p className="text-xs text-[#CBD5E1] leading-relaxed italic">{resource.metadata.tldr}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#0B0D1B] border border-[#232854] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#232854] pb-2.5 flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#818CF8]">
                        <GraduationCap className="w-4 h-4" />
                        <span className="font-semibold uppercase tracking-wider">Scheda Ricerca Scientifica</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161B3B] text-[#A5B4FC] border border-[#313975]">
                        Metadati accademici assenti
                      </span>
                    </div>

                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      Questa risorsa è attualmente classificata come <strong className="text-white font-mono font-medium">Paper Scientifico</strong>, ma non contiene metadati accademici strutturati (Autori, arXiv ID, DOI, link PDF o Conferenza/Venue). Se si tratta in realtà di un articolo tecnico o di un blog post, puoi convertirlo subito in Articolo con 1 click, oppure compilare i metadati del paper.
                    </p>

                    <div className="flex items-center gap-2.5 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={handleQuickConvertToArticle}
                        disabled={isSaving}
                        className="px-3.5 py-1.5 bg-[#17140B] hover:bg-[#261E0E] text-[#E5C170] border border-[#C5A059]/50 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer font-medium"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Converti in Articolo Tecnico</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-3.5 py-1.5 bg-[#161B3B] hover:bg-[#202754] text-[#A5B4FC] border border-[#313975] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#818CF8]" />
                        <span>Compila Metadati Paper</span>
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Feed RSS: Lettore Live & Stream Articoli */}
              {resource.type === "rss" && (
                <div className="space-y-4">
                  <RssFeedViewer
                    feedUrl={resource.metadata?.feedUrl || resource.url || ""}
                    resourceTitle={resource.title}
                    onIngestItem={onIngestFeedItem}
                  />

                  {/* Scheda Tecnica URL Feed per aggregatori esterni */}
                  <div className="bg-[#150D08] border border-[#331C10] rounded-xl p-3 sm:p-4">
                    <div className="text-[10px] font-mono uppercase text-[#A87250] mb-1.5 flex items-center justify-between flex-wrap gap-2">
                      <span>URL del Canale Feed (per aggregatori come Feedly, Reeder, NetNewsWire):</span>
                      <span className="text-[#FB923C] bg-[#29140A] px-2 py-0.5 rounded border border-[#4E2412]">
                        Formato {resource.metadata?.feedFormat || "RSS 2.0"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 overflow-hidden bg-[#0A0704] border border-[#29140A] rounded-lg p-2.5">
                      <code className="text-xs font-mono text-[#FED7AA] truncate">
                        {resource.metadata?.feedUrl || resource.url || "Non disponibile"}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(resource.metadata?.feedUrl || resource.url || "", "rss_feed_url")}
                        className="px-2.5 py-1 bg-[#29140A] hover:bg-[#3D1E0F] text-[#FB923C] rounded text-xs font-mono flex items-center gap-1 shrink-0 transition-colors"
                      >
                        {copiedSection === "rss_feed_url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSection === "rss_feed_url" ? "Copiato" : "Copia URL"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Note Rapide & Scratchpad */}
              {resource.type === "note" && (
                <div className="bg-[#141208] border border-[#332C10] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#332C10] pb-2.5">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#FBBF24]">
                      <StickyNote className="w-4 h-4" />
                      <span className="font-semibold uppercase tracking-wider">
                        Nota & Appunto Rapido ({resource.metadata?.noteCategory || "Scratchpad"})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(resource.metadata?.markdownContent || resource.summary || "", "quick_note_copy")}
                      className="text-[10px] font-mono text-[#FDE047] hover:text-white bg-[#2B240B] px-2 py-0.5 rounded border border-[#483B12] flex items-center gap-1"
                    >
                      {copiedSection === "quick_note_copy" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSection === "quick_note_copy" ? "Copiato" : "Copia Nota"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Summary & Full Original Text Block */}
              <div className="bg-[#111] border border-[#1C1C1C] rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-[11px] font-mono uppercase text-[#666] tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#888]" />
                    <span>
                      {isItalianView ? "Descrizione & Sintesi (Traduzione Italiana)" : "Descrizione & Sintesi AI"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCopy(currentDisplaySummary, "modal_summary")}
                      className="text-[11px] font-mono text-[#888] hover:text-white flex items-center gap-1"
                      title="Copia testo sommario"
                    >
                      {copiedSection === "modal_summary" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#888]" />}
                      <span>{copiedSection === "modal_summary" ? "Copiato" : "Copia"}</span>
                    </button>

                    {!hasTranslation && (
                      <button
                        type="button"
                        onClick={() => handleTranslate(false)}
                        disabled={isTranslating}
                        className="text-[11px] font-mono text-[#C5A059] hover:text-[#E5C170] flex items-center gap-1 hover:underline"
                      >
                        <Languages className="w-3 h-3" />
                        <span>Traduci con AI</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-sm leading-relaxed text-[#DDD] space-y-2 prose prose-invert max-w-none">
                  <Markdown>{currentDisplaySummary}</Markdown>
                </div>
              </div>

              {/* Original Full Input / Text Captured - Clean non-redundant collapsible drawer when formatted document exists */}
              {resource.rawInput && resource.rawInput.trim().length > 0 && resource.rawInput.trim() !== resource.url && (
                <div className="bg-[#0A0A0A] border border-[#222] rounded-xl p-3.5 sm:p-4 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRawInputExpanded(!isRawInputExpanded)}
                      className="flex items-center gap-2.5 text-left group cursor-pointer"
                    >
                      <div className="p-1 rounded-md bg-[#16140E] border border-[#C5A059]/30 text-[#C5A059] group-hover:border-[#C5A059] transition-colors">
                        <Terminal className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[11px] font-mono uppercase text-[#C5A059] tracking-wider font-semibold flex items-center gap-1.5">
                          <span>Input Grezzo Immesso ({resource.rawInput.length.toLocaleString('it-IT')} caratteri)</span>
                          {currentDisplayMarkdown && (
                            isRawInputExpanded 
                              ? <ChevronUp className="w-3.5 h-3.5 text-[#888]" /> 
                              : <ChevronDown className="w-3.5 h-3.5 text-[#888]" />
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-[#777]">
                          {currentDisplayMarkdown 
                            ? "Snapshot originale salvato per audit & provenienza. Per la lettura formattata, vedi il riquadro sottostante."
                            : "Testo integrale immesso durante la cattura."}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(resource.rawInput || "", "raw_input")}
                        className="text-[11px] font-mono text-[#AAA] hover:text-white flex items-center gap-1 px-2.5 py-1 bg-[#141414] hover:bg-[#1E1E1E] rounded-md border border-[#2A2A2A] transition-colors"
                      >
                        {copiedSection === "raw_input" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#C5A059]" />}
                        <span>{copiedSection === "raw_input" ? "Copiato" : "Copia Testo"}</span>
                      </button>

                      {currentDisplayMarkdown && (
                        <button
                          type="button"
                          onClick={() => setIsRawInputExpanded(!isRawInputExpanded)}
                          className="text-[11px] font-mono text-[#888] hover:text-white px-2.5 py-1 rounded-md bg-[#141414] hover:bg-[#1E1E1E] border border-[#2A2A2A] transition-colors cursor-pointer"
                        >
                          {isRawInputExpanded ? "Comprimi" : "Espandi"}
                        </button>
                      )}
                    </div>
                  </div>

                  {(!currentDisplayMarkdown || isRawInputExpanded) && (
                    <div className="pt-1.5 animate-in fade-in duration-150">
                      <div className="text-xs sm:text-sm font-mono text-[#CCC] bg-[#050505] p-3.5 sm:p-4 rounded-lg border border-[#1C1C1C] overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-[#333]">
                        {resource.rawInput}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User Custom Notes & Annotations if available */}
              {resource.metadata?.userNotes && resource.metadata.userNotes.trim().length > 0 && (
                <div className="bg-[#120F0A] border border-[#C5A059]/40 rounded-xl p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-mono uppercase text-[#E5C170] tracking-wider flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5 text-[#C5A059]" />
                      <span>Note Personali & Commenti Operativi</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(resource.metadata!.userNotes!, "user_notes")}
                      className="text-[11px] font-mono text-[#AAA] hover:text-white flex items-center gap-1"
                    >
                      {copiedSection === "user_notes" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#C5A059]" />}
                      <span>{copiedSection === "user_notes" ? "Copiato" : "Copia Note"}</span>
                    </button>
                  </div>
                  <div className="text-xs sm:text-sm text-[#E2D2B5] leading-relaxed font-sans whitespace-pre-wrap bg-[#1A140A] p-3 rounded-lg border border-[#2D2110]">
                    {resource.metadata.userNotes}
                  </div>
                </div>
              )}

              {/* Technical Evaluation & Insights Card (Score, Use Cases, Pros, Cons) */}
              {renderEvaluationCard()}

              {/* Markdown Content Viewer (OKF / Article / Full Web Doc) */}
              {currentDisplayMarkdown && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <FileCode className="w-4 h-4 text-[#C5A059]" />
                      <span className="font-semibold text-white">
                        {resource.type === "article" 
                          ? "Testo Completo dell'Articolo" 
                          : resource.type === "paper"
                            ? "Testo Completo del Paper Scientifico"
                            : "Documento Integrale"}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${
                        isItalianView 
                          ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/50" 
                          : "bg-[#181818] text-[#888] border-[#2E2E2E]"
                      }`}>
                        {isItalianView ? "🇮🇹 Tradotto in Italiano" : "🌐 Testo Originale"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(currentDisplayMarkdown, "docmd")}
                        className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                      >
                        {copiedSection === "docmd" ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copiato</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-[#C5A059]" />
                            <span>Copia Markdown</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-mono text-[#CCC] bg-[#050505] p-4 sm:p-5 rounded-lg overflow-x-auto border border-[#181818] max-h-96 overflow-y-auto leading-relaxed prose prose-invert max-w-none">
                    <Markdown>{currentDisplayMarkdown}</Markdown>
                  </div>
                </div>
              )}

              {/* MCP Specific Config block */}
              {resource.type === "mcp_server" && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <Code2 className="w-4 h-4" />
                      <span>Configurazione MCP (`claude_desktop_config.json`)</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.configSnippet || resource.metadata?.command || "", "mcp")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "mcp" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="text-xs font-mono text-[#D5B069] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818]">
                    {resource.metadata?.configSnippet || (
                      resource.metadata?.command 
                        ? `// Comando di avvio:\n${resource.metadata.command}` 
                        : "// Nessuna config JSON registrata"
                    )}
                  </pre>

                  {resource.metadata?.toolsProvided && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-[11px] font-mono text-[#666]">Tool forniti:</span>
                      {resource.metadata.toolsProvided.map((tool, idx) => (
                        <span key={idx} className="bg-[#141414] text-[#AAA] font-mono text-[10px] px-2 py-0.5 rounded border border-[#222]">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Skill specific Prompt block */}
              {resource.type === "ai_skill" && resource.metadata?.systemPrompt && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <Sparkles className="w-4 h-4" />
                      <span>System Prompt & Istruzioni Skill</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.systemPrompt || "", "skill")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "skill" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia Prompt</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="text-xs font-mono text-[#CCC] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818] whitespace-pre-wrap leading-relaxed">
                    {resource.metadata.systemPrompt}
                  </pre>

                  {resource.metadata?.recommendedModel && (
                    <div className="mt-2 text-[11px] font-mono text-[#666]">
                      Modello suggerito: <span className="text-[#C5A059]">{resource.metadata.recommendedModel}</span>
                    </div>
                  )}
                </div>
              )}

              {/* GitHub Clone command */}
              {resource.type === "github_repo" && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#AAA]">
                      <Terminal className="w-4 h-4 text-[#C5A059]" />
                      <span>{resource.metadata?.installCommand || `git clone ${resource.url}`}</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.installCommand || `git clone ${resource.url}`, "clone")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "clone" ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#C5A059]" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Article Open Graph preview if article type */}
              {resource.type === "article" && resource.url && (() => {
                let domain = resource.metadata?.domain || ogData?.domain;
                if (!domain && resource.url) {
                  try {
                    domain = new URL(resource.url.startsWith("http") ? resource.url : `https://${resource.url}`).hostname.replace(/^www\./, "");
                  } catch {}
                }
                const siteName = resource.metadata?.siteName || ogData?.siteName || domain;
                const metaDesc = resource.metadata?.ogDescription || ogData?.ogDescription;
                const rawFav = resource.metadata?.favicon || ogData?.favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);
                const fav = faviconError ? (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null) : rawFav;
                const img = resource.metadata?.ogImage || ogData?.ogImage;

                return (
                  <div className="bg-[#0A0A0A] border border-[#222] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                        {fav ? (
                          <img
                            src={fav}
                            alt={domain || "Favicon"}
                            className="w-4 h-4 rounded-sm shrink-0 object-contain bg-black/40"
                            referrerPolicy="no-referrer"
                            onError={() => setFaviconError(true)}
                          />
                        ) : (
                          <Globe className="w-4 h-4" />
                        )}
                        <span>Anteprima Open Graph & Metadati Web</span>
                      </div>

                      {domain && (
                        <span className="text-[10px] font-mono bg-[#141414] border border-[#262626] text-[#AAA] px-2 py-0.5 rounded">
                          {siteName || domain}
                        </span>
                      )}
                    </div>

                    {img && (
                      <div className="rounded-lg overflow-hidden border border-[#222] max-h-48 w-full bg-black/50">
                        <img 
                          src={img} 
                          alt="Open Graph preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {metaDesc && (
                      <div className="bg-[#121212] border border-[#1E1E1E] rounded-lg p-3 text-xs text-[#AAA] italic leading-relaxed">
                        <div className="text-[10px] font-mono uppercase text-[#666] mb-1 not-italic">Meta Description Estratta:</div>
                        "{metaDesc}"
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-[#777] font-mono flex-wrap pt-1">
                      {resource.metadata?.author && (
                        <span>Autore: <span className="text-white">{resource.metadata.author}</span></span>
                      )}
                      {resource.metadata?.readingTimeMin && (
                        <span>Tempo di lettura: <span className="text-[#C5A059]">{resource.metadata.readingTimeMin} min</span></span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Image Asset / Screenshot Preview Card if Image type */}
              {(resource.metadata?.mediaType === "image" || resource.metadata?.imageUrl || (resource.metadata?.sourceFileType && ["png", "jpg", "jpeg", "webp", "gif"].includes(resource.metadata.sourceFileType.toLowerCase()))) && (
                <div className="bg-[#0C0B08] border border-[#C5A059]/30 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#E5C170] font-semibold">
                      <ImageIcon className="w-4 h-4 text-[#C5A059]" />
                      <span>Screenshot & Risorsa Visiva Multimodale</span>
                    </div>
                    {resource.metadata?.sourceFileName && (
                      <span className="text-[10px] font-mono text-[#AAA] bg-[#141414] px-2 py-0.5 rounded border border-[#262626]">
                        {resource.metadata.sourceFileName}
                      </span>
                    )}
                  </div>
                  {resource.metadata?.imageUrl && (
                    <div className="rounded-lg overflow-hidden border border-[#222] bg-black/60 flex items-center justify-center p-2 max-h-80">
                      <img 
                        src={resource.metadata.imageUrl} 
                        alt={resource.title} 
                        className="max-h-72 max-w-full object-contain rounded"
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-[#777] font-mono leading-relaxed">
                    Sottoposto ad analisi OCR e correlazione ontologica OKF v0.2. Gli elementi visivi sono integrati nel grafo e nelle specifiche.
                  </p>
                </div>
              )}

              {/* YouTube Video Player Embed if Video */}
              {(() => {
                const url = resource.url || "";
                const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
                const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
                const videoId = ytMatch ? ytMatch[1] : null;

                if (!videoId && resource.metadata?.mediaType !== "video") return null;

                return (
                  <div className="bg-[#0D0B10] border border-purple-900/40 rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-purple-300 font-semibold">
                        <Video className="w-4 h-4 text-purple-400" />
                        <span>Tech Talk / Video Stream {videoId ? "(YouTube Embedded)" : ""}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#AAA] bg-[#14101A] px-2 py-0.5 rounded border border-purple-900/30">
                        {resource.metadata?.siteName || "Video"}
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
                  </div>
                );
              })()}

              {/* Knowledge Graph Connections & Linked Nodes Explorer */}
              {(() => {
                // Compute all connected resources and relationships
                const connectedItems: {
                  targetResource?: ResourceItem;
                  targetTitle: string;
                  relationType: string;
                  badgeColor: string;
                  reason: string;
                  isInternalDoc: boolean;
                }[] = [];

                const thisEntities = (resource.metadata?.entities || []).map((e: any) => 
                  (typeof e === "string" ? e : e?.name || "").toLowerCase().trim()
                ).filter(Boolean);

                const thisTags = (resource.tags || []).map((t) => t.toLowerCase().trim());
                const thisDomain = resource.metadata?.domain?.toLowerCase().trim();

                // 1. Explicit OKF relations
                if (resource.metadata?.relations && Array.isArray(resource.metadata.relations)) {
                  resource.metadata.relations.forEach((rel) => {
                    const tId = rel.targetId;
                    const tTitle = rel.targetTitle || rel.target || (rel as any).targetName || tId || "Documento";
                    const matchedRes = allResources.find((r) => 
                      (tId && r.id === tId) || 
                      r.title.toLowerCase().trim() === tTitle.toLowerCase().trim() ||
                      (tTitle.length >= 4 && r.title.toLowerCase().includes(tTitle.toLowerCase()))
                    );

                    connectedItems.push({
                      targetResource: matchedRes,
                      targetTitle: matchedRes?.title || tTitle,
                      relationType: rel.relationType || "references",
                      badgeColor: "bg-[#C5A059]/20 text-[#E5C170] border-[#C5A059]/40",
                      reason: rel.description || `Relazione ontologica OKF v0.2: ${rel.relationType || "collegato"}`,
                      isInternalDoc: !!matchedRes,
                    });
                  });
                }

                // 2. Incoming explicit relations from other resources
                allResources.forEach((other) => {
                  if (other.id === resource.id) return;
                  if (other.metadata?.relations && Array.isArray(other.metadata.relations)) {
                    other.metadata.relations.forEach((rel) => {
                      const tId = rel.targetId;
                      const tTitle = (rel.targetTitle || rel.target || (rel as any).targetName || "").toLowerCase().trim();
                      if (
                        (tId && tId === resource.id) ||
                        (tTitle && (resource.title.toLowerCase().trim() === tTitle || resource.title.toLowerCase().includes(tTitle)))
                      ) {
                        if (!connectedItems.some((c) => c.targetResource?.id === other.id)) {
                          connectedItems.push({
                            targetResource: other,
                            targetTitle: other.title,
                            relationType: `Citato da: ${rel.relationType || "references"}`,
                            badgeColor: "bg-purple-950/60 text-purple-300 border-purple-800/40",
                            reason: `"${other.title}" dichiara una relazione verso questa risorsa`,
                            isInternalDoc: true,
                          });
                        }
                      }
                    });
                  }
                });

                // 3. Shared entities and concepts
                allResources.forEach((other) => {
                  if (other.id === resource.id) return;
                  if (connectedItems.some((c) => c.targetResource?.id === other.id)) return;

                  const otherEntities = (other.metadata?.entities || []).map((e: any) => 
                    (typeof e === "string" ? e : e?.name || "").toLowerCase().trim()
                  ).filter(Boolean);

                  const commonEnts = thisEntities.filter((e) => otherEntities.includes(e) && e.length > 2);
                  if (commonEnts.length > 0) {
                    connectedItems.push({
                      targetResource: other,
                      targetTitle: other.title,
                      relationType: "Entità Condivisa",
                      badgeColor: "bg-sky-950/60 text-sky-300 border-sky-800/40",
                      reason: `Entità in comune: ${commonEnts.slice(0, 3).join(", ")}`,
                      isInternalDoc: true,
                    });
                  }
                });

                // 4. Shared tags
                allResources.forEach((other) => {
                  if (other.id === resource.id) return;
                  if (connectedItems.some((c) => c.targetResource?.id === other.id)) return;

                  const otherTags = (other.tags || []).map((t) => t.toLowerCase().trim());
                  const sharedTags = thisTags.filter((t) => otherTags.includes(t) && t.length > 1);

                  if (sharedTags.length >= 1) {
                    connectedItems.push({
                      targetResource: other,
                      targetTitle: other.title,
                      relationType: `#${sharedTags[0]}`,
                      badgeColor: "bg-amber-950/60 text-amber-300 border-amber-800/40",
                      reason: `Tag in comune: ${sharedTags.map((t) => "#" + t).join(", ")}`,
                      isInternalDoc: true,
                    });
                  }
                });

                // 5. Shared Domain (if applicable)
                if (thisDomain && thisDomain !== "general") {
                  allResources.forEach((other) => {
                    if (other.id === resource.id) return;
                    if (connectedItems.some((c) => c.targetResource?.id === other.id)) return;

                    const otherDomain = other.metadata?.domain?.toLowerCase().trim();
                    if (otherDomain && otherDomain === thisDomain) {
                      connectedItems.push({
                        targetResource: other,
                        targetTitle: other.title,
                        relationType: `Dominio: ${resource.metadata?.domain}`,
                        badgeColor: "bg-emerald-950/60 text-emerald-300 border-emerald-800/40",
                        reason: `Stesso dominio concettuale (${resource.metadata?.domain})`,
                        isInternalDoc: true,
                      });
                    }
                  });
                }

                return (
                  <div className="bg-[#0B0B0B] border border-[#242424] rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                        <Network className="w-4 h-4 text-[#C5A059]" />
                        <span>Nodi e Relazioni nel Knowledge Graph ({connectedItems.length} connessioni attive)</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {onViewInGraph && (
                          <button
                            type="button"
                            onClick={() => onViewInGraph(resource)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-teal-950/80 border border-teal-500/60 text-teal-300 hover:bg-teal-900 transition-all cursor-pointer"
                            title="Apri ed evidenzia questo nodo nel Knowledge Graph"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                            <span>Visualizza nel Grafo</span>
                          </button>
                        )}
                        <div className="text-[11px] font-mono text-[#777]">
                          Grafo Topologico OKF
                        </div>
                      </div>
                    </div>

                    {connectedItems.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {connectedItems.map((item, idx) => (
                          <div
                            key={`modal-conn-${resource.id || 'res'}-${idx}-${item.targetTitle}`}
                            onClick={() => {
                              if (item.targetResource && onNavigateToResource) {
                                onNavigateToResource(item.targetResource);
                              }
                            }}
                            className={`p-3 rounded-lg border bg-[#121212] flex flex-col justify-between gap-2 transition-all ${
                              item.targetResource && onNavigateToResource
                                ? "border-[#262626] hover:border-[#C5A059]/60 hover:bg-[#181818] cursor-pointer group"
                                : "border-[#1F1F1F]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-sans text-xs font-medium text-white group-hover:text-[#C5A059] transition-colors line-clamp-2">
                                {item.targetTitle}
                              </div>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${item.badgeColor}`}>
                                {item.relationType}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1C1C1C] text-[11px] text-[#888]">
                              <span className="truncate">{item.reason}</span>
                              {item.targetResource && onNavigateToResource && (
                                <ChevronRight className="w-3.5 h-3.5 text-[#666] group-hover:text-[#C5A059] shrink-0 transition-transform group-hover:translate-x-0.5" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-[#121212] border border-[#1C1C1C] rounded-lg p-3.5 text-center space-y-2">
                        <p className="text-xs text-[#888] font-sans leading-relaxed">
                          Nessun altro documento nel Vault condivide attualmente gli stessi tag, entità o collegamenti diretti con questa risorsa.
                        </p>
                        <div className="text-[11px] font-mono text-[#AAA]">
                          💡 <strong className="text-[#C5A059]">Come collegarlo:</strong> Clicca su <em>Modifica</em> per aggiungere tag comuni ad altre risorse (es. <span className="text-[#C5A059]">#windows</span>, <span className="text-[#C5A059]">#os</span>, <span className="text-[#C5A059]">#tools</span>) o aggiungi altri documenti correlati.
                        </div>
                      </div>
                    )}

                    {/* Sezione Risorse Correlate Automaticamente (Tag & Contenuto Condiviso) */}
                    {autoRelatedMatches.length > 0 && (
                      <div className="pt-3 border-t border-[#1E1E1E] space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="flex items-center gap-1.5 text-teal-400 font-semibold">
                            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                            <span>Affinità Automatica Rilevata ({autoRelatedMatches.length})</span>
                          </span>
                          <span className="text-[10px] text-[#777]">
                            Tag sovrapposti & analisi semantica del testo
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {autoRelatedMatches.map((match) => {
                            const isLinked = 
                              linkedSuccessIds.has(match.resource.id) ||
                              (resource.metadata?.relations || []).some(
                                (r: any) => r.targetId === match.resource.id || r.targetTitle?.toLowerCase().trim() === match.resource.title.toLowerCase().trim()
                              );
                            const isCurrentlyLinking = linkingMatchId === match.resource.id;

                            return (
                              <div
                                key={`auto-rel-${match.resource.id}`}
                                className="p-3 rounded-lg border border-teal-900/40 bg-[#0C1212] hover:border-teal-500/60 transition-all flex flex-col justify-between gap-2.5"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <h5 
                                      onClick={() => onNavigateToResource?.(match.resource)}
                                      className="font-sans text-xs font-medium text-white hover:text-teal-300 cursor-pointer line-clamp-1 flex-1"
                                      title={match.resource.title}
                                    >
                                      {match.resource.title}
                                    </h5>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-teal-950/80 border-teal-700/60 text-teal-300 shrink-0 font-semibold">
                                      {match.score}% affinità
                                    </span>
                                  </div>

                                  {/* Tags & Terms Overlap Badges */}
                                  <div className="flex flex-wrap items-center gap-1 my-1.5">
                                    {match.sharedTags.slice(0, 3).map((tg) => (
                                      <span key={tg} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/40">
                                        #{tg}
                                      </span>
                                    ))}
                                    {match.overlappingTerms.slice(0, 2).map((term) => (
                                      <span key={term} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-teal-950/50 text-teal-300 border border-teal-800/40">
                                        {term}
                                      </span>
                                    ))}
                                  </div>

                                  <p className="text-[11px] text-[#888] line-clamp-2 leading-relaxed">
                                    {match.explanation}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-teal-950/80 text-[10px] font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => onNavigateToResource?.(match.resource)}
                                      className="text-teal-400 hover:text-teal-200 underline cursor-pointer"
                                    >
                                      Apri Scheda
                                    </button>
                                    {onViewInGraph && (
                                      <>
                                        <span className="text-[#444]">·</span>
                                        <button
                                          type="button"
                                          onClick={() => onViewInGraph(match.resource)}
                                          className="text-teal-400 hover:text-teal-200 underline cursor-pointer"
                                        >
                                          Nel Grafo
                                        </button>
                                      </>
                                    )}
                                  </div>

                                  {/* Link as OKF Relation button */}
                                  {isLinked ? (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span>OKF Collegato</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isCurrentlyLinking}
                                      onClick={() => handleLinkAsOkfRelation(match)}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-teal-950 hover:bg-teal-900 border border-teal-700/60 text-teal-300 text-[10px] transition-all cursor-pointer disabled:opacity-50"
                                      title="Aggiungi questa relazione formale al frontmatter OKF"
                                    >
                                      {isCurrentlyLinking ? (
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      ) : (
                                        <Plus className="w-2.5 h-2.5" />
                                      )}
                                      <span>Collega OKF</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Tags */}
              {resource.tags && resource.tags.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase text-[#666] mb-2 tracking-wider">
                    Tag Associati
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {resource.tags.map((t, idx) => (
                      <span
                        key={`modal-tag-${resource.id || 'res'}-${idx}-${t}`}
                        className="text-xs font-mono bg-[#141414] text-[#AAA] border border-[#222] px-2.5 py-1 rounded-md"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              </>
            )
          )}
        </div>

        {/* Modal Sticky Bottom Footer */}
        <div className="p-3 sm:p-3.5 border-t border-[#1C1C1C] bg-[#080808] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#777] min-w-0 flex-1">
            {resource.url ? (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C5A059] hover:underline truncate text-[11px] font-mono flex items-center gap-1.5"
                title="Apri link originale in nuova scheda"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{resource.url}</span>
              </a>
            ) : (
              <span className="text-[11px] font-mono text-[#555] truncate">Vault #{resource.id.slice(0, 8)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C1C1C] hover:bg-[#282828] active:bg-[#333] text-[#EEE] hover:text-white border border-[#333] text-xs font-mono transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
          >
            <X className="w-4 h-4 text-[#AAA]" />
            <span>Chiudi Scheda</span>
          </button>
        </div>
      </div>
    </div>
  );
};
