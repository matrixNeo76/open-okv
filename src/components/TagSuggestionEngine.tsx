import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Cpu,
  Check,
  Plus,
  RefreshCw,
  Info,
  Wrench,
  Layers,
  BrainCircuit,
  Bookmark,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { ResourceItem, SuggestedTag, TagCategory } from "../types";
import { fetchMlTagSuggestions, cleanTag } from "../lib/tagSuggestionEngine";

interface TagSuggestionEngineProps {
  resource: ResourceItem;
  currentTags: string[];
  onAddTag: (tag: string) => void;
  onAddMultipleTags?: (tags: string[]) => void;
  vaultTags?: string[];
  activeTitle?: string;
  activeSummary?: string;
  activeContent?: string;
  compact?: boolean;
}

export const TagSuggestionEngine: React.FC<TagSuggestionEngineProps> = ({
  resource,
  currentTags,
  onAddTag,
  onAddMultipleTags,
  vaultTags = [],
  activeTitle,
  activeSummary,
  activeContent,
  compact = false,
}) => {
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<"gemini" | "local_nlp">("local_nlp");
  const [modelUsed, setModelUsed] = useState<string>("");
  const [addedTags, setAddedTags] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Set of lowercase current tags
  const currentTagsSet = new Set(currentTags.map((t) => cleanTag(t)));

  const runAnalysis = useCallback(
    async (forceAi = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchMlTagSuggestions({
          resource,
          vaultTags,
          activeTitle,
          activeSummary,
          activeContent,
          activeTags: currentTags,
        });

        setSuggestions(result.suggestedTags);
        setSource(result.source);
        setModelUsed(result.modelUsed || "");
      } catch (err: any) {
        console.warn("[TagSuggestionEngine] Errore analisi:", err);
        setError("Impossibile completare l'analisi dei tag.");
      } finally {
        setIsLoading(false);
      }
    },
    [resource, vaultTags, activeTitle, activeSummary, activeContent, currentTags]
  );

  // Initial analysis on mount or when resource identity changes
  useEffect(() => {
    runAnalysis();
  }, [resource.id]);

  const handleAddSingle = (tag: string) => {
    const norm = cleanTag(tag);
    if (!norm) return;
    onAddTag(norm);
    setAddedTags((prev) => new Set(prev).add(norm));
  };

  const handleAcceptAllHighConfidence = () => {
    const unaddedHigh = suggestions.filter(
      (s) => s.confidence >= 75 && !currentTagsSet.has(cleanTag(s.tag))
    );

    if (unaddedHigh.length === 0) return;

    if (onAddMultipleTags) {
      onAddMultipleTags(unaddedHigh.map((s) => cleanTag(s.tag)));
    } else {
      unaddedHigh.forEach((s) => onAddTag(cleanTag(s.tag)));
    }

    setAddedTags((prev) => {
      const next = new Set(prev);
      unaddedHigh.forEach((s) => next.add(cleanTag(s.tag)));
      return next;
    });
  };

  const getCategoryIcon = (category: TagCategory) => {
    switch (category) {
      case "technology":
        return <Cpu className="w-2.5 h-2.5 text-sky-400" />;
      case "framework":
        return <Layers className="w-2.5 h-2.5 text-purple-400" />;
      case "concept":
        return <BrainCircuit className="w-2.5 h-2.5 text-[#C5A059]" />;
      case "domain":
        return <Bookmark className="w-2.5 h-2.5 text-amber-400" />;
      case "problem":
        return <Wrench className="w-2.5 h-2.5 text-orange-400" />;
      case "system":
        return <Cpu className="w-2.5 h-2.5 text-emerald-400" />;
      case "methodology":
      default:
        return <Sparkles className="w-2.5 h-2.5 text-teal-400" />;
    }
  };

  const getCategoryLabel = (category: TagCategory) => {
    switch (category) {
      case "technology":
        return "Tech";
      case "framework":
        return "Framework";
      case "concept":
        return "Concetto";
      case "domain":
        return "Dominio";
      case "problem":
        return "Diagnostica";
      case "system":
        return "Sistema";
      case "methodology":
      default:
        return "Metodo";
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 85) {
      return "bg-emerald-950/70 border-emerald-700/60 text-emerald-300";
    }
    if (confidence >= 70) {
      return "bg-[#1E180B] border-[#C5A059]/50 text-[#E5C170]";
    }
    return "bg-[#161616] border-[#333] text-[#AAA]";
  };

  const unaddedCount = suggestions.filter(
    (s) => !currentTagsSet.has(cleanTag(s.tag)) && !addedTags.has(cleanTag(s.tag))
  ).length;

  const highConfidenceUnadded = suggestions.filter(
    (s) => s.confidence >= 75 && !currentTagsSet.has(cleanTag(s.tag)) && !addedTags.has(cleanTag(s.tag))
  );

  return (
    <div
      id="tag-suggestion-engine-panel"
      className={`rounded-xl border transition-all ${
        compact
          ? "bg-[#0E0E0E] border-[#222] p-3"
          : "bg-[#110E0A] border-[#C5A059]/30 p-3.5 sm:p-4 shadow-sm"
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-[#1C160B] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-serif font-medium text-white">
                Suggeritore Tag Intelligente (ML & NLP)
              </span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.2 rounded border flex items-center gap-1 shrink-0 ${
                  source === "gemini"
                    ? "bg-emerald-950/50 border-emerald-800/50 text-emerald-300"
                    : "bg-[#18150F] border-[#382E1E] text-[#D4B97B]"
                }`}
                title={
                  source === "gemini"
                    ? `Elaborato con modello generativo Gemini: ${modelUsed}`
                    : "Elaborato con motore statistico NLP locale (TF-IDF & Ontologia OKF)"
                }
              >
                <Zap className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>{source === "gemini" ? "AI Gemini 3.7" : "NLP Ontologico"}</span>
              </span>
            </div>
            <p className="text-[10px] text-[#777] truncate">
              {isLoading
                ? "Analisi semantica del contenuto in corso..."
                : suggestions.length > 0
                ? `${suggestions.length} tag raccomandati dall'analisi del testo e tassonomia`
                : "Nessun tag suggerito per questo contenuto."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {highConfidenceUnadded.length > 1 && (
            <button
              type="button"
              onClick={handleAcceptAllHighConfidence}
              className="px-2 py-1 rounded bg-[#1C170A] hover:bg-[#2A2210] border border-[#C5A059]/50 text-[#E5C170] hover:text-white text-[11px] font-mono font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
              title="Aggiungi automaticamente tutti i tag con confidenza elevata (≥75%)"
            >
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Accetta Tutti ({highConfidenceUnadded.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => runAnalysis(true)}
            disabled={isLoading}
            className="p-1.5 rounded bg-[#161616] hover:bg-[#222] border border-[#2B2B2B] text-[#AAA] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Rianalizza il contenuto corrente per estrarre nuovi tag"
            aria-label="Rianalizza tag"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#C5A059]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error notification if any */}
      {error && (
        <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2 mb-2">
          {error}
        </div>
      )}

      {/* Suggested Tags Grid / Chips */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-3 px-2 text-xs font-mono text-[#888]">
          <div className="w-3.5 h-3.5 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin shrink-0" />
          <span>Analisi semantica TF-IDF & co-occorrenza ontologica in corso...</span>
        </div>
      ) : suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((item, idx) => {
            const norm = cleanTag(item.tag);
            const isAlreadyAdded = currentTagsSet.has(norm) || addedTags.has(norm);

            return (
              <div
                key={`sug-${norm}-${idx}`}
                className={`group relative inline-flex items-center gap-1.5 rounded-lg text-xs transition-all ${
                  isAlreadyAdded
                    ? "bg-[#141814] border border-emerald-900/40 text-emerald-300 opacity-80"
                    : "bg-[#15130D] hover:bg-[#201C12] border border-[#2C2415] hover:border-[#C5A059]/60 text-[#DDD] hover:text-white"
                } px-2 py-1`}
                title={`${item.rationale} • Confidenza: ${item.confidence}% • Categoria: ${item.category}`}
              >
                {/* Category Icon */}
                <span className="shrink-0" title={`Categoria: ${getCategoryLabel(item.category)}`}>
                  {getCategoryIcon(item.category)}
                </span>

                {/* Tag Name */}
                <span className="font-mono text-[11px] font-medium tracking-tight">
                  #{item.tag}
                </span>

                {/* Confidence Badge */}
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded border font-semibold shrink-0 ${getConfidenceBadge(
                    item.confidence
                  )}`}
                >
                  {item.confidence}%
                </span>

                {/* Action button */}
                {isAlreadyAdded ? (
                  <span className="flex items-center text-emerald-400 shrink-0 ml-0.5" title="Già inserito nella risorsa">
                    <CheckCircle2 className="w-3 h-3" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAddSingle(item.tag)}
                    className="p-0.5 rounded hover:bg-[#C5A059] hover:text-black text-[#888] hover:text-black transition-colors cursor-pointer ml-0.5"
                    title={`Aggiungi #${item.tag} ai tag della risorsa`}
                    aria-label={`Aggiungi tag ${item.tag}`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[11px] text-[#666] py-2 italic font-sans flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#555] shrink-0" />
          <span>
            Compila il titolo, il sommario o il corpo markdown della risorsa per visualizzare i tag consigliati dall'AI.
          </span>
        </div>
      )}

      {/* Footer explanation note */}
      {suggestions.length > 0 && !compact && (
        <div className="mt-2.5 pt-2 border-t border-[#1C1810] flex items-center justify-between text-[10px] text-[#666] font-mono">
          <span>
            {unaddedCount > 0
              ? `${unaddedCount} tag ancora non assegnati alla risorsa`
              : "Tutti i tag suggeriti sono stati associati con successo"}
          </span>
          <span className="text-[#888]">
            Clicca su <Plus className="w-2.5 h-2.5 inline mx-0.5 text-[#C5A059]" /> per includere
          </span>
        </div>
      )}
    </div>
  );
};
