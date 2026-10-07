import React, { useState, useMemo } from "react";
import {
  BookMarked,
  Clock,
  CheckCircle2,
  BookOpen,
  Flame,
  Zap,
  Leaf,
  Filter,
  ArrowUpDown,
  Search,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  Check,
  Star,
  BrainCircuit,
  GraduationCap,
  Github,
  Cpu,
  StickyNote,
  Rss,
  FileText,
  Trash2,
  FolderInput,
  Sparkles,
  Edit3,
  BookmarkX,
  Plus
} from "lucide-react";
import { ResourceItem, ReadLaterPriority, ReadLaterSortOption } from "../types";
import {
  isReadLaterResource,
  getReadLaterPriority,
  getReadingStatus,
  estimateReadingTimeMin,
  formatReadingTime,
  sortReadLaterQueue
} from "../lib/readLaterUtils";
import { formatDate } from "../lib/dateUtils";

interface ReadItLaterQueueProps {
  resources: ResourceItem[];
  onUpdateResource: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
  onOpenDetail: (resource: ResourceItem) => void;
  onOpenKnowledgeReader?: (resource: ResourceItem) => void;
  onBackToMainVault: () => void;
}

export const ReadItLaterQueue: React.FC<ReadItLaterQueueProps> = ({
  resources,
  onUpdateResource,
  onOpenDetail,
  onOpenKnowledgeReader,
  onBackToMainVault,
}) => {
  // Filter and Sort states
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "in_progress" | "completed">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ReadLaterPriority>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<ReadLaterSortOption>("priority_recommended");

  // Selection for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Quick note editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>("");

  // Filtered and sorted queue items
  const queueItems = useMemo(() => {
    return resources.filter((item) => {
      // 0. Only items belonging to Read-It-Later queue
      if (!isReadLaterResource(item)) return false;

      // 1. Status Filter
      const status = getReadingStatus(item);
      if (statusFilter !== "all" && status !== statusFilter) return false;

      // 2. Priority Filter
      const priority = getReadLaterPriority(item);
      if (priorityFilter !== "all" && priority !== priorityFilter) return false;

      // 3. Type Filter
      if (typeFilter !== "all" && item.type !== typeFilter) return false;

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSummary = (item.summary || "").toLowerCase().includes(q);
        const matchesTags = (item.tags || []).some((t) => t.toLowerCase().includes(q));
        const matchesNotes = (item.metadata?.readLaterNotes || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesSummary && !matchesTags && !matchesNotes) return false;
      }

      return true;
    });
  }, [resources, statusFilter, priorityFilter, typeFilter, searchQuery]);

  const sortedQueueItems = useMemo(() => {
    return sortReadLaterQueue(queueItems, sortBy);
  }, [queueItems, sortBy]);

  // Queue Analytics
  const queueStats = useMemo(() => {
    let unreadCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let highPriorityCount = 0;
    let totalMinutesUncompleted = 0;

    const rilResources = resources.filter(isReadLaterResource);

    for (const item of rilResources) {
      const status = getReadingStatus(item);
      const priority = getReadLaterPriority(item);
      const time = estimateReadingTimeMin(item);

      if (status === "unread") unreadCount++;
      else if (status === "in_progress") inProgressCount++;
      else if (status === "completed") completedCount++;

      if (priority === "high") highPriorityCount++;

      if (status !== "completed") {
        totalMinutesUncompleted += time;
      }
    }

    return {
      total: rilResources.length,
      unreadCount,
      inProgressCount,
      completedCount,
      highPriorityCount,
      totalMinutesUncompleted,
      formattedTotalTime: formatReadingTime(totalMinutesUncompleted),
    };
  }, [resources]);

  // Action: Move resource from Read-It-Later back to Main Vault
  const handleMoveToMainVault = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = resources.find((r) => r.id === id);
    if (!item) return;

    // Filter out read-later tags
    const cleanedTags = (item.tags || []).filter(
      (t) => !["read-later", "read_later", "readlater", "da-leggere", "coda-lettura", "reading-list"].includes(t.toLowerCase())
    );

    await onUpdateResource(id, {
      tags: cleanedTags,
      metadata: {
        ...(item.metadata || {}),
        readLater: false,
      },
    });

    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Action: Toggle Reading Progress / Complete
  const handleUpdateProgress = async (id: string, progress: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = resources.find((r) => r.id === id);
    if (!item) return;

    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    const status: "unread" | "in_progress" | "completed" =
      clamped === 100 ? "completed" : clamped > 0 ? "in_progress" : "unread";

    await onUpdateResource(id, {
      metadata: {
        ...(item.metadata || {}),
        readingProgress: clamped,
        readingStatus: status,
      },
    });
  };

  // Action: Change Priority
  const handleChangePriority = async (id: string, nextPriority: ReadLaterPriority, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = resources.find((r) => r.id === id);
    if (!item) return;

    await onUpdateResource(id, {
      metadata: {
        ...(item.metadata || {}),
        readLaterPriority: nextPriority,
      },
    });
  };

  // Action: Save Note
  const handleSaveNote = async (id: string) => {
    const item = resources.find((r) => r.id === id);
    if (!item) return;

    await onUpdateResource(id, {
      metadata: {
        ...(item.metadata || {}),
        readLaterNotes: tempNoteText.trim(),
      },
    });

    setEditingNoteId(null);
    setTempNoteText("");
  };

  // Bulk: Move all selected to Main Vault
  const handleBulkMoveToMain = async () => {
    for (const id of selectedIds) {
      await handleMoveToMainVault(id);
    }
    setSelectedIds(new Set());
  };

  // Bulk: Mark selected as completed
  const handleBulkMarkCompleted = async () => {
    for (const id of selectedIds) {
      await handleUpdateProgress(id, 100);
    }
    setSelectedIds(new Set());
  };

  // Type Icon helper
  const renderTypeIcon = (type: string) => {
    switch (type) {
      case "knowledge":
        return <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" />;
      case "paper":
        return <GraduationCap className="w-3.5 h-3.5 text-[#818CF8]" />;
      case "github_repo":
        return <Github className="w-3.5 h-3.5 text-[#C084FC]" />;
      case "mcp_server":
        return <Cpu className="w-3.5 h-3.5 text-[#7DD3FC]" />;
      case "note":
        return <StickyNote className="w-3.5 h-3.5 text-[#FBBF24]" />;
      case "rss":
        return <Rss className="w-3.5 h-3.5 text-[#FB923C]" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-[#FDE047]" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-5 animate-in fade-in duration-200">
      {/* 1. Header Banner & Queue Metrics */}
      <div className="bg-gradient-to-r from-[#12141A] via-[#101116] to-[#14120D] border border-[#2A2B33] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-[#38BDF8]/5 to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#161F2E] border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shadow-inner shrink-0">
              <BookMarked className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-serif font-bold text-white tracking-tight">
                  Coda di Lettura • Read-It-Later
                </h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#38BDF8]/15 text-[#7DD3FC] border border-[#38BDF8]/30 font-semibold">
                  {queueStats.total} {queueStats.total === 1 ? "risorsa archiviata" : "risorse archiviate"}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1 max-w-2xl leading-relaxed">
                Archivio di studio differito. Gli elementi in questa coda vengono isolati dalla vista principale del Vault per consentirti di mantenere la massima concentrazione operativa sui tuoi progetti attivi.
              </p>
            </div>
          </div>

          {/* Quick Return to Main Vault */}
          <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
            <button
              onClick={onBackToMainVault}
              className="px-3.5 py-2 rounded-xl bg-[#161618] hover:bg-[#202025] border border-[#2E303B] hover:border-[#38BDF8]/40 text-xs font-mono text-[#CBD5E1] hover:text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <FolderInput className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Torna ai Progetti Attivi</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#22242D]">
          {/* Da Leggere */}
          <div className="bg-[#0C0D11] border border-[#1E202A] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#181924] border border-[#2B2D3C] flex items-center justify-center text-[#94A3B8] shrink-0">
              <BookOpen className="w-4 h-4 text-[#94A3B8]" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#64748B]">Da Leggere</div>
              <div className="text-base font-mono font-bold text-white">
                {queueStats.unreadCount}
              </div>
            </div>
          </div>

          {/* In Lettura */}
          <div className="bg-[#0C0D11] border border-[#1E202A] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#241B0D] border border-[#C5A059]/30 flex items-center justify-center text-[#E5C170] shrink-0">
              <Clock className="w-4 h-4 text-[#C5A059]" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#A89874]">In Corso</div>
              <div className="text-base font-mono font-bold text-[#E5C170]">
                {queueStats.inProgressCount}
              </div>
            </div>
          </div>

          {/* Tempo Totale */}
          <div className="bg-[#0C0D11] border border-[#1E202A] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#112028] border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
              <Clock className="w-4 h-4 text-[#38BDF8]" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#7DD3FC]">Tempo Stimato</div>
              <div className="text-base font-mono font-bold text-white">
                {queueStats.formattedTotalTime}
              </div>
            </div>
          </div>

          {/* Alta Priorità */}
          <div className="bg-[#0C0D11] border border-[#1E202A] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#271010] border border-[#EF4444]/30 flex items-center justify-center text-[#F87171] shrink-0">
              <Flame className="w-4 h-4 text-[#EF4444]" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#F87171]">Alta Priorità</div>
              <div className="text-base font-mono font-bold text-white">
                {queueStats.highPriorityCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls, Status Tabs & Search Filter Bar */}
      <div className="bg-[#0E0F14] border border-[#1E202A] rounded-xl p-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-sm">
        {/* Status Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 cursor-pointer ${
              statusFilter === "all"
                ? "bg-[#1C202C] text-[#7DD3FC] border border-[#38BDF8]/40 font-semibold shadow-xs"
                : "text-[#8892B0] hover:text-white hover:bg-[#161822]"
            }`}
          >
            Tutti ({resources.length})
          </button>
          <button
            onClick={() => setStatusFilter("unread")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 cursor-pointer ${
              statusFilter === "unread"
                ? "bg-[#1C202C] text-[#7DD3FC] border border-[#38BDF8]/40 font-semibold shadow-xs"
                : "text-[#8892B0] hover:text-white hover:bg-[#161822]"
            }`}
          >
            Da Leggere ({queueStats.unreadCount})
          </button>
          <button
            onClick={() => setStatusFilter("in_progress")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 cursor-pointer ${
              statusFilter === "in_progress"
                ? "bg-[#251B0D] text-[#E5C170] border border-[#C5A059]/40 font-semibold shadow-xs"
                : "text-[#8892B0] hover:text-white hover:bg-[#161822]"
            }`}
          >
            In Corso ({queueStats.inProgressCount})
          </button>
          <button
            onClick={() => setStatusFilter("completed")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 cursor-pointer ${
              statusFilter === "completed"
                ? "bg-[#0E2018] text-[#34D399] border border-[#10B981]/40 font-semibold shadow-xs"
                : "text-[#8892B0] hover:text-white hover:bg-[#161822]"
            }`}
          >
            Completati ({queueStats.completedCount})
          </button>
        </div>

        {/* Search & Sort and Filters */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Quick Search */}
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca nella coda..."
              className="w-full bg-[#14161F] border border-[#262836] focus:border-[#38BDF8]/50 rounded-lg py-1.5 pl-8 pr-3 text-xs text-[#E2E8F0] placeholder-[#64748B] focus:outline-none font-mono"
            />
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="bg-[#14161F] border border-[#262836] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#CBD5E1] focus:outline-none focus:border-[#38BDF8]/50 cursor-pointer"
          >
            <option value="all">Priorità: Tutte</option>
            <option value="high">🔥 Alta Priorità</option>
            <option value="medium">⚡ Media Priorità</option>
            <option value="low">🌱 Bassa Priorità</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ReadLaterSortOption)}
            className="bg-[#14161F] border border-[#262836] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#CBD5E1] focus:outline-none focus:border-[#38BDF8]/50 cursor-pointer"
          >
            <option value="priority_recommended">⚡ Priorità Consigliata</option>
            <option value="reading_time_asc">⏱️ Letture Rapide (&lt;10m)</option>
            <option value="reading_time_desc">📚 Approfondimenti Lunghi</option>
            <option value="progress_desc">📈 In Corso di Lettura</option>
            <option value="added_desc">🕒 Aggiunti di recente</option>
            <option value="added_asc">📅 I primi in coda</option>
          </select>
        </div>
      </div>

      {/* 3. Bulk Action Bar (when items are selected) */}
      {selectedIds.size > 0 && (
        <div className="bg-[#141724] border border-[#38BDF8]/40 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-mono shadow-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-[#7DD3FC]">
            <CheckCircle2 className="w-4 h-4 text-[#38BDF8]" />
            <span className="font-semibold">{selectedIds.size} selezionati</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleBulkMoveToMain}
              className="px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-[#2D3B52] text-[#38BDF8] border border-[#38BDF8]/30 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>Sposta nei Progetti Attivi</span>
            </button>
            <button
              onClick={handleBulkMarkCompleted}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/40 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Segna come Letti</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              Deseleziona
            </button>
          </div>
        </div>
      )}

      {/* 4. Queue Items List */}
      {sortedQueueItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#262836] rounded-2xl bg-[#0B0C10] my-4">
          <div className="w-12 h-12 rounded-full bg-[#141622] border border-[#2B2E42] flex items-center justify-center text-[#38BDF8] mb-4">
            <BookMarked className="w-6 h-6" />
          </div>
          <h3 className="text-base font-serif text-white mb-1">
            {resources.length === 0
              ? "Coda Read-It-Later Vuota"
              : "Nessuna risorsa corrisponde ai filtri selezionati"}
          </h3>
          <p className="text-xs text-[#94A3B8] max-w-md mb-5 leading-relaxed">
            {resources.length === 0
              ? "Tutte le tue risorse sono attualmente nei Progetti Attivi. Puoi inviare qualsiasi risorsa qui cliccando sull'icona segnalibro 'Sposta in Read-It-Later' presente su ogni scheda."
              : "Prova a modificare i filtri di stato o la ricerca per visualizzare le altre risorse nella coda."}
          </p>
          <button
            onClick={onBackToMainVault}
            className="px-4 py-2 rounded-xl bg-[#38BDF8] hover:bg-[#60A5FA] text-black font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <FolderInput className="w-3.5 h-3.5" />
            <span>Vai ai Progetti Attivi</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedQueueItems.map((item) => {
            const priority = getReadLaterPriority(item);
            const status = getReadingStatus(item);
            const estTime = estimateReadingTimeMin(item);
            const progress = Number(item.metadata?.readingProgress ?? 0);
            const isSelected = selectedIds.has(item.id);
            const hasNotes = !!item.metadata?.readLaterNotes;

            return (
              <div
                key={item.id}
                className={`bg-[#0C0D12] border rounded-xl p-4 transition-all duration-200 relative group hover:border-[#38BDF8]/40 ${
                  status === "completed"
                    ? "border-[#1E202A] opacity-75 bg-[#090A0E]"
                    : priority === "high"
                    ? "border-[#3A2222] bg-gradient-to-r from-[#140C0C]/50 to-[#0C0D12]"
                    : "border-[#1E202A]"
                } ${isSelected ? "ring-1 ring-[#38BDF8] border-[#38BDF8]" : ""}`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  {/* Left Column: Checkbox, Type, Title, Summary */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                      className="mt-1 w-4 h-4 rounded border-[#2E3245] bg-[#141622] text-[#38BDF8] focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      {/* Top Chips: Type, Priority, Time, Date */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {/* Type Chip */}
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#161824] border border-[#262A3C] text-[10.5px] font-mono text-[#CBD5E1]">
                          {renderTypeIcon(item.type)}
                          <span className="capitalize">{item.type.replace("_", " ")}</span>
                        </div>

                        {/* Priority Selector Pill */}
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const cycle: Record<ReadLaterPriority, ReadLaterPriority> = {
                                high: "medium",
                                medium: "low",
                                low: "high",
                              };
                              handleChangePriority(item.id, cycle[priority]);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono flex items-center gap-1 border transition-all cursor-pointer ${
                              priority === "high"
                                ? "bg-[#2A1010] text-[#F87171] border-[#EF4444]/40 hover:bg-[#3D1414]"
                                : priority === "medium"
                                ? "bg-[#261E0A] text-[#FBBF24] border-[#F59E0B]/40 hover:bg-[#382B0E]"
                                : "bg-[#101E17] text-[#34D399] border-[#10B981]/40 hover:bg-[#162D22]"
                            }`}
                            title="Clicca per cambiare priorità (Alta → Media → Bassa)"
                          >
                            {priority === "high" && <Flame className="w-3 h-3 text-[#EF4444]" />}
                            {priority === "medium" && <Zap className="w-3 h-3 text-[#F59E0B]" />}
                            {priority === "low" && <Leaf className="w-3 h-3 text-[#10B981]" />}
                            <span className="capitalize font-semibold">{priority} priorità</span>
                          </button>
                        </div>

                        {/* Estimated Reading Time */}
                        <span className="flex items-center gap-1 text-[10.5px] font-mono text-[#94A3B8] bg-[#141622] px-2 py-0.5 rounded-md border border-[#25283A]">
                          <Clock className="w-3 h-3 text-[#38BDF8]" />
                          <span>{formatReadingTime(estTime)}</span>
                        </span>

                        {/* Status Chip */}
                        {status === "completed" ? (
                          <span className="flex items-center gap-1 text-[10.5px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-800/40 font-semibold">
                            <Check className="w-3 h-3" />
                            <span>Completato</span>
                          </span>
                        ) : status === "in_progress" ? (
                          <span className="flex items-center gap-1 text-[10.5px] font-mono text-[#E5C170] bg-[#241B0D] px-2 py-0.5 rounded-md border border-[#C5A059]/40 font-semibold">
                            <span>{progress}% in corso</span>
                          </span>
                        ) : null}
                      </div>

                      {/* Resource Title */}
                      <h4
                        onClick={() => {
                          if (item.type === "knowledge" && onOpenKnowledgeReader) {
                            onOpenKnowledgeReader(item);
                          } else {
                            onOpenDetail(item);
                          }
                        }}
                        className={`text-sm font-semibold text-white hover:text-[#38BDF8] cursor-pointer transition-colors line-clamp-2 ${
                          status === "completed" ? "line-through text-[#94A3B8]" : ""
                        }`}
                      >
                        {item.title}
                      </h4>

                      {/* Summary */}
                      {item.summary && (
                        <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2 leading-relaxed">
                          {item.summary}
                        </p>
                      )}

                      {/* Read Later Personal Notes / Takeaway */}
                      {editingNoteId === item.id ? (
                        <div className="mt-2.5 p-2 bg-[#12141F] border border-[#38BDF8]/40 rounded-lg">
                          <textarea
                            value={tempNoteText}
                            onChange={(e) => setTempNoteText(e.target.value)}
                            placeholder="Aggiungi una nota o obiettivo di studio per questa risorsa..."
                            className="w-full bg-transparent text-xs text-[#E2E8F0] placeholder-[#64748B] focus:outline-none font-mono resize-none"
                            rows={2}
                          />
                          <div className="flex items-center justify-end gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="text-[10px] font-mono text-[#94A3B8] hover:text-white px-2 py-1"
                            >
                              Annulla
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveNote(item.id)}
                              className="text-[10px] font-mono bg-[#38BDF8] text-black font-semibold px-2.5 py-1 rounded hover:bg-[#60A5FA]"
                            >
                              Salva Nota
                            </button>
                          </div>
                        </div>
                      ) : hasNotes ? (
                        <div
                          onClick={() => {
                            setEditingNoteId(item.id);
                            setTempNoteText(item.metadata?.readLaterNotes || "");
                          }}
                          className="mt-2 text-xs font-mono text-[#7DD3FC] bg-[#121A28] border border-[#38BDF8]/30 rounded-md px-2.5 py-1.5 flex items-start gap-2 cursor-pointer hover:border-[#38BDF8]/60 transition-colors"
                          title="Clicca per modificare la nota di lettura"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#38BDF8] shrink-0 mt-0.5" />
                          <span className="line-clamp-2 italic">
                            "{item.metadata?.readLaterNotes}"
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(item.id);
                            setTempNoteText("");
                          }}
                          className="mt-1.5 text-[10.5px] font-mono text-[#64748B] hover:text-[#38BDF8] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Aggiungi nota di lettura...</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Progress Control & Actions */}
                  <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1E202A]">
                    {/* Progress Slider & Quick Buttons */}
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-[#181A26] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            status === "completed"
                              ? "bg-emerald-400"
                              : progress > 0
                              ? "bg-[#38BDF8]"
                              : "bg-transparent"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Quick progress actions */}
                      {status === "completed" ? (
                        <button
                          type="button"
                          onClick={(e) => handleUpdateProgress(item.id, 0, e)}
                          className="text-[10px] font-mono text-[#64748B] hover:text-[#CBD5E1] px-1.5 py-0.5 rounded border border-[#25283C] transition-colors cursor-pointer"
                          title="Reimposta stato a non letto"
                        >
                          Riapri
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleUpdateProgress(item.id, 50, e)}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                              progress === 50
                                ? "bg-[#38BDF8]/20 text-[#7DD3FC] border-[#38BDF8]/40 font-semibold"
                                : "text-[#64748B] hover:text-[#CBD5E1] border-[#25283C]"
                            }`}
                            title="Segna al 50%"
                          >
                            50%
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleUpdateProgress(item.id, 100, e)}
                            className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40 transition-colors flex items-center gap-1 cursor-pointer font-semibold"
                            title="Segna come letto"
                          >
                            <Check className="w-2.5 h-2.5" />
                            <span>Letto</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* Move back to Main Active Vault */}
                      <button
                        type="button"
                        onClick={(e) => handleMoveToMainVault(item.id, e)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#141622] hover:bg-[#1E2236] border border-[#2A2E44] hover:border-[#38BDF8]/50 text-xs font-mono text-[#CBD5E1] hover:text-[#7DD3FC] transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Sposta nuovamente nei Progetti Attivi del Vault principale"
                      >
                        <FolderInput className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span className="hidden sm:inline">Nei Progetti Attivi</span>
                      </button>

                      {/* Read Now / Open Detail */}
                      <button
                        type="button"
                        onClick={() => {
                          if (item.type === "knowledge" && onOpenKnowledgeReader) {
                            onOpenKnowledgeReader(item);
                          } else {
                            onOpenDetail(item);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#38BDF8] hover:bg-[#60A5FA] text-black font-semibold text-xs font-mono transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Leggi Ora</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
