import React, { useState, useEffect, useMemo } from "react";
import {
  Rss,
  RefreshCw,
  Search,
  ExternalLink,
  Calendar,
  User,
  Plus,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  AlertCircle,
  Tag,
  Radio,
  BookOpen
} from "lucide-react";

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  pubDate?: string;
  relativeTime?: string;
  author?: string;
  summary: string;
  content?: string;
  categories: string[];
  pdfUrl?: string;
}

export interface FeedData {
  title: string;
  description: string;
  feedUrl: string;
  siteUrl?: string;
  format: "rss" | "atom";
  lastUpdated?: string;
  items: FeedItem[];
}

interface RssFeedViewerProps {
  feedUrl: string;
  resourceTitle?: string;
  onIngestItem?: (item: FeedItem) => void;
  className?: string;
}

export const RssFeedViewer: React.FC<RssFeedViewerProps> = ({
  feedUrl,
  resourceTitle,
  onIngestItem,
  className = "",
}) => {
  const [feedData, setFeedData] = useState<FeedData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [ingestedMap, setIngestedMap] = useState<Record<string, boolean>>({});

  const fetchFeed = async (forceRefresh = false) => {
    if (!feedUrl) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/fetch-feed-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl, limit: 50, force: forceRefresh }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossibile caricare il feed RSS.");
      }

      setFeedData(data.feed);
    } catch (err: any) {
      setError(err?.message || "Errore di connessione o formato feed non riconosciuto.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [feedUrl]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleIngest = (item: FeedItem) => {
    if (onIngestItem) {
      onIngestItem(item);
      setIngestedMap((prev) => ({ ...prev, [item.id]: true }));
    }
  };

  // Collect unique categories across items
  const allCategories = useMemo(() => {
    if (!feedData?.items) return [];
    const set = new Set<string>();
    feedData.items.forEach((item) => {
      item.categories?.forEach((cat) => set.add(cat));
    });
    return Array.from(set).slice(0, 15);
  }, [feedData]);

  // Filter items by search query and category
  const filteredItems = useMemo(() => {
    if (!feedData?.items) return [];
    return feedData.items.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.author && item.author.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        !selectedCategory || item.categories.includes(selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [feedData, searchQuery, selectedCategory]);

  return (
    <div className={`bg-[#0C0804] border border-[#2D1A0E] rounded-xl overflow-hidden flex flex-col ${className}`}>
      {/* Header Bar */}
      <div className="bg-[#170E07] border-b border-[#2D1A0E] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#29140A] border border-[#4E2412] flex items-center justify-center text-[#FB923C] shrink-0 mt-0.5">
              <Rss className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {feedData?.title || resourceTitle || "Lettore Feed RSS Live"}
                </h3>
                <span className="text-[10px] font-mono uppercase bg-[#29140A] text-[#FB923C] border border-[#4E2412] px-2 py-0.5 rounded">
                  {feedData?.format ? feedData.format.toUpperCase() : "LIVE STREAM"}
                </span>
                {feedData && (
                  <span className="text-[10px] font-mono text-[#A87250] bg-[#1B0F08] px-2 py-0.5 rounded border border-[#2D1A0E]">
                    {feedData.items.length} articoli
                  </span>
                )}
              </div>
              {feedData?.description && (
                <p className="text-xs text-[#C49B7E] line-clamp-1 mt-1 max-w-xl">
                  {feedData.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => handleCopy(feedUrl, "feed_header")}
              title="Copia URL Feed"
              className="p-2 bg-[#211108] hover:bg-[#2F180B] text-[#D88958] hover:text-[#FB923C] border border-[#3D1E0F] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              {copiedLink === "feed_header" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{copiedLink === "feed_header" ? "Copiato" : "URL"}</span>
            </button>

            {feedData?.siteUrl && (
              <a
                href={feedData.siteUrl}
                target="_blank"
                rel="noreferrer"
                title="Apri sito originale del feed"
                className="p-2 bg-[#211108] hover:bg-[#2F180B] text-[#D88958] hover:text-[#FB923C] border border-[#3D1E0F] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sito</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => fetchFeed(true)}
              disabled={isLoading}
              title="Aggiorna feed in tempo reale"
              className="px-3 py-2 bg-[#FB923C] hover:bg-[#F97316] text-[#0C0804] font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>{isLoading ? "Aggiornamento..." : "Aggiorna"}</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-4 pt-3 border-t border-[#2D1A0E] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#885533]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca per titolo, autore, parola chiave o tema..."
              className="w-full pl-9 pr-8 py-1.5 bg-[#0C0804] border border-[#2D1A0E] focus:border-[#FB923C] rounded-lg text-xs text-white placeholder-[#784A2E] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#885533] hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Category Chips */}
          {allCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none max-w-full sm:max-w-md">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`px-2 py-1 rounded text-[10px] font-mono shrink-0 transition-colors ${
                  selectedCategory === null
                    ? "bg-[#FB923C] text-black font-bold"
                    : "bg-[#1E1109] text-[#A87250] hover:text-[#FB923C] border border-[#2D1A0E]"
                }`}
              >
                Tutti
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`px-2 py-1 rounded text-[10px] font-mono shrink-0 transition-colors ${
                    selectedCategory === cat
                      ? "bg-[#FB923C] text-black font-bold"
                      : "bg-[#1E1109] text-[#A87250] hover:text-[#FB923C] border border-[#2D1A0E]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 max-h-[600px] overflow-y-auto space-y-3.5 divide-y divide-[#1D1109]">
        {/* Loading Skeleton */}
        {isLoading && !feedData && (
          <div className="space-y-4 py-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-[#140C07] border border-[#26140A] rounded-xl p-4 animate-pulse space-y-3">
                <div className="h-4 bg-[#2D1A0E] rounded w-3/4" />
                <div className="h-3 bg-[#201209] rounded w-1/2" />
                <div className="h-14 bg-[#1A0E08] rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-5 bg-[#260C0A] border border-[#591C17] rounded-xl flex items-start gap-3 my-2 text-[#FCA5A5]">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-red-300">
                Impossibile visualizzare gli articoli del feed
              </div>
              <p className="text-xs text-red-200/90">{error}</p>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchFeed(true)}
                  className="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded text-xs font-mono transition-colors"
                >
                  Riprova caricamento
                </button>
                <a
                  href={feedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-[#1A0E08] hover:bg-[#29140A] text-[#FB923C] border border-[#4E2412] rounded text-xs font-mono transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Apri XML nel browser</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredItems.length === 0 && (
          <div className="py-12 text-center space-y-2">
            <Radio className="w-8 h-8 text-[#5E361D] mx-auto animate-pulse" />
            <p className="text-xs font-mono text-[#8C522C]">
              {searchQuery || selectedCategory
                ? "Nessun articolo corrisponde ai filtri impostati."
                : "Nessun elemento trovato in questo flusso RSS."}
            </p>
            {(searchQuery || selectedCategory) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory(null);
                }}
                className="text-xs text-[#FB923C] hover:underline"
              >
                Azzera filtri di ricerca
              </button>
            )}
          </div>
        )}

        {/* Item Cards List */}
        {!isLoading &&
          filteredItems.map((item, idx) => {
            const isExpanded = expandedItemId === item.id;
            const isIngested = Boolean(ingestedMap[item.id]);

            return (
              <div
                key={item.id || idx}
                className="pt-3.5 first:pt-0 group transition-all"
              >
                <div className="bg-[#110A06] hover:bg-[#160D08] border border-[#26140A] hover:border-[#FB923C]/40 rounded-xl p-3.5 sm:p-4 space-y-3 transition-colors">
                  {/* Top Meta Line */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono text-[#A87250]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.relativeTime && (
                        <span className="flex items-center gap-1 text-[#FB923C] bg-[#211108] border border-[#3D1E0F] px-2 py-0.5 rounded">
                          <Calendar className="w-3 h-3" />
                          <span>{item.relativeTime}</span>
                        </span>
                      )}
                      {item.author && (
                        <span className="flex items-center gap-1 text-[#C49B7E] truncate max-w-[200px] sm:max-w-[320px]">
                          <User className="w-3 h-3 text-[#A87250]" />
                          <span>{item.author}</span>
                        </span>
                      )}
                    </div>

                    {/* Category Tags */}
                    {item.categories && item.categories.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {item.categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className="px-1.5 py-0.5 bg-[#1B0F08] hover:bg-[#29140A] border border-[#331C10] rounded text-[10px] text-[#A87250] hover:text-[#FB923C] cursor-pointer transition-colors"
                          >
                            #{cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <h4 className="text-sm font-semibold text-white group-hover:text-[#FDBA74] leading-snug tracking-tight">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline flex items-start gap-1.5"
                    >
                      <span>{item.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-[#A87250] shrink-0 mt-0.5 group-hover:text-[#FB923C]" />
                    </a>
                  </h4>

                  {/* Summary / Abstract Body */}
                  {item.summary && (
                    <div className="text-xs text-[#D8B498] leading-relaxed">
                      <p className={isExpanded ? "" : "line-clamp-3"}>
                        {item.summary}
                      </p>
                      {item.summary.length > 220 && (
                        <button
                          type="button"
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                          className="mt-1.5 text-[11px] font-mono text-[#FB923C] hover:text-[#FDBA74] flex items-center gap-1 font-semibold"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              <span>Comprimi abstract</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              <span>Espandi abstract completo</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action Bar for this item */}
                  <div className="pt-2 border-t border-[#231208] flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {item.pdfUrl && (
                        <a
                          href={item.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-[#1F1209] hover:bg-[#2D1A0E] text-[#FB923C] border border-[#4E2412] rounded text-xs font-mono flex items-center gap-1 transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          <span>PDF arXiv</span>
                        </a>
                      )}

                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-[#140C07] hover:bg-[#211108] text-[#C49B7E] hover:text-white border border-[#2D1A0E] rounded text-xs font-mono flex items-center gap-1 transition-colors"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>Leggi Sorgente</span>
                      </a>
                    </div>

                    {/* One-Click Ingestion into Knowledge Vault */}
                    {onIngestItem && (
                      <button
                        type="button"
                        onClick={() => handleIngest(item)}
                        disabled={isIngested}
                        className={`px-3 py-1 rounded text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                          isIngested
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 cursor-default"
                            : "bg-[#29140A] hover:bg-[#FB923C] text-[#FB923C] hover:text-[#0C0804] border border-[#4E2412] hover:border-[#FB923C]"
                        }`}
                      >
                        {isIngested ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Inviato al Vault</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Acquisisci nel Vault</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Footer Status */}
      <div className="bg-[#120B06] border-t border-[#26140A] px-4 py-2.5 flex items-center justify-between text-[11px] font-mono text-[#8C522C]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Feed sincronizzato</span>
          {feedData?.lastUpdated && (
            <span className="hidden sm:inline">• Build: {feedData.lastUpdated}</span>
          )}
        </div>
        <div>
          Mostrati {filteredItems.length} di {feedData?.items.length || 0} elementi
        </div>
      </div>
    </div>
  );
};
