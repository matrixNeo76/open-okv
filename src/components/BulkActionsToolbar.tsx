import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Tag, 
  Layers, 
  Trash2, 
  Star, 
  X, 
  Check, 
  Plus, 
  AlertTriangle,
  BrainCircuit,
  BookOpen,
  Github,
  Cpu,
  Sparkles,
  Wrench,
  GraduationCap,
  Rss,
  StickyNote,
  Globe,
  Loader2,
  ListChecks
} from "lucide-react";
import { ResourceType, ResourceItem } from "../types";

interface BulkActionsToolbarProps {
  selectedIds: Set<string>;
  totalVisibleCount: number;
  selectedResources: ResourceItem[];
  allTags: string[];
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onBulkAddTag: (tag: string) => Promise<boolean>;
  onBulkRemoveTag: (tag: string) => Promise<boolean>;
  onBulkCategorize: (type: ResourceType) => Promise<boolean>;
  onBulkDelete: () => Promise<boolean>;
  onBulkToggleFavorite: (favorite: boolean) => Promise<boolean>;
}

const CATEGORY_OPTIONS: { type: ResourceType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: "knowledge", label: "OKF Knowledge", icon: <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" />, color: "border-[#C5A059]/40 hover:bg-[#1A160E]" },
  { type: "article", label: "Articolo Tecnico", icon: <BookOpen className="w-3.5 h-3.5 text-blue-400" />, color: "border-blue-500/30 hover:bg-blue-950/30" },
  { type: "github_repo", label: "Repository GitHub", icon: <Github className="w-3.5 h-3.5 text-purple-400" />, color: "border-purple-500/30 hover:bg-purple-950/30" },
  { type: "mcp_server", label: "Server MCP", icon: <Cpu className="w-3.5 h-3.5 text-emerald-400" />, color: "border-emerald-500/30 hover:bg-emerald-950/30" },
  { type: "ai_skill", label: "AI Skill & Prompt", icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />, color: "border-amber-500/30 hover:bg-amber-950/30" },
  { type: "troubleshooting", label: "Problema & Soluzione", icon: <Wrench className="w-3.5 h-3.5 text-orange-400" />, color: "border-orange-500/30 hover:bg-orange-950/30" },
  { type: "paper", label: "Paper Scientifico", icon: <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />, color: "border-indigo-500/30 hover:bg-indigo-950/30" },
  { type: "rss", label: "Feed RSS", icon: <Rss className="w-3.5 h-3.5 text-orange-300" />, color: "border-orange-500/30 hover:bg-orange-950/30" },
  { type: "note", label: "Nota Rapida", icon: <StickyNote className="w-3.5 h-3.5 text-yellow-300" />, color: "border-yellow-500/30 hover:bg-yellow-950/30" },
  { type: "link", label: "Collegamento Web", icon: <Globe className="w-3.5 h-3.5 text-cyan-400" />, color: "border-cyan-500/30 hover:bg-cyan-950/30" },
];

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedIds,
  totalVisibleCount,
  selectedResources,
  allTags,
  onSelectAllVisible,
  onClearSelection,
  onBulkAddTag,
  onBulkRemoveTag,
  onBulkCategorize,
  onBulkDelete,
  onBulkToggleFavorite,
}) => {
  const [activeMenu, setActiveMenu] = useState<"tag" | "category" | "delete" | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [isOperating, setIsOperating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedCount = selectedIds.size;
  const isAllSelected = selectedCount > 0 && selectedCount === totalVisibleCount;

  // Aggregate tags from currently selected resources to allow quick deletion or inspection
  const commonTags = Array.from(
    new Set(
      selectedResources.flatMap((r) => (Array.isArray(r.tags) ? r.tags : []))
    )
  ).slice(0, 15);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeMenu]);

  // Keyboard shortcut: Escape clears selection or closes menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeMenu) {
          setActiveMenu(null);
        } else if (selectedCount > 0) {
          onClearSelection();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMenu, selectedCount, onClearSelection]);

  const handleApplyTag = async (tagToAdd?: string) => {
    const tag = (tagToAdd || newTagInput).trim().toLowerCase().replace(/^#/, "");
    if (!tag) return;
    setIsOperating(true);
    try {
      await onBulkAddTag(tag);
      setNewTagInput("");
      setActiveMenu(null);
    } finally {
      setIsOperating(false);
    }
  };

  const handleRemoveExistingTag = async (tagToRemove: string) => {
    setIsOperating(true);
    try {
      await onBulkRemoveTag(tagToRemove);
    } finally {
      setIsOperating(false);
    }
  };

  const handleApplyCategory = async (type: ResourceType) => {
    setIsOperating(true);
    try {
      await onBulkCategorize(type);
      setActiveMenu(null);
    } finally {
      setIsOperating(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsOperating(true);
    try {
      await onBulkDelete();
      setActiveMenu(null);
    } finally {
      setIsOperating(false);
    }
  };

  const areAllFavorites = selectedResources.length > 0 && selectedResources.every((r) => !!r.isFavorite);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[94%] sm:w-auto">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.96 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative bg-[#0F0F0F]/95 backdrop-blur-md border border-[#C5A059]/40 shadow-[0_12px_36px_rgba(0,0,0,0.85)] rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-2.5 flex items-center gap-2 sm:gap-3 text-xs text-white"
        ref={menuRef}
      >
        {/* Selected Counter & Master Toggle */}
        <div className="flex items-center gap-2 pr-1.5 border-r border-[#262626]">
          <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#C5A059] text-black font-mono font-bold text-[11px]">
            {selectedCount}
          </span>
          <span className="hidden sm:inline font-medium text-[#D5D5D5] text-[11px] whitespace-nowrap">
            {selectedCount === 1 ? "risorsa selezionata" : "risorse selezionate"}
          </span>

          <button
            type="button"
            onClick={isAllSelected ? onClearSelection : onSelectAllVisible}
            className="text-[10.5px] text-[#A0A0A0] hover:text-[#E5C170] px-1.5 py-0.5 rounded hover:bg-[#1A1A1A] transition-colors whitespace-nowrap cursor-pointer"
            title={isAllSelected ? "Deseleziona tutte" : "Seleziona tutte le risorse visibili"}
          >
            {isAllSelected ? "Deseleziona" : `Tutte (${totalVisibleCount})`}
          </button>
        </div>

        {/* Bulk Actions Button Group */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
          {/* 1. Tagging */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === "tag" ? null : "tag")}
              disabled={isOperating}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                activeMenu === "tag"
                  ? "bg-[#C5A059]/20 border-[#C5A059] text-[#E5C170]"
                  : "bg-[#171717] border-[#2A2A2A] hover:border-[#C5A059]/50 hover:bg-[#202020] text-[#D5D5D5]"
              }`}
              title="Aggiungi o rimuovi tag alle risorse selezionate"
            >
              <Tag className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="font-medium">Tag</span>
            </button>

            {/* Tagging Popover */}
            <AnimatePresence>
              {activeMenu === "tag" && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-3 left-0 sm:left-auto sm:-translate-x-1/4 w-72 sm:w-80 bg-[#121212] border border-[#C5A059]/40 shadow-2xl rounded-xl p-3.5 z-50 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-[#222] pb-2">
                    <span className="text-[11.5px] font-medium text-white flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#C5A059]" />
                      Gestisci Tag in Blocco ({selectedCount})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveMenu(null)}
                      className="p-1 text-[#666] hover:text-white rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Add Tag Input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleApplyTag();
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      type="text"
                      placeholder="Nuovo tag (es. ai, typescript)..."
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-[#0A0A0A] border border-[#2B2B2B] rounded-lg text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#C5A059]"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!newTagInput.trim() || isOperating}
                      className="px-2.5 py-1.5 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                    >
                      {isOperating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
                      Aggiungi
                    </button>
                  </form>

                  {/* Existing Tags on Selected Items */}
                  {commonTags.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-mono text-[#888]">
                        Tag presenti sulle risorse selezionate:
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                        {commonTags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 bg-[#181818] border border-[#2D2D2D] text-[#DDD] text-[10.5px] px-2 py-0.5 rounded-md"
                          >
                            #{t}
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingTag(t)}
                              className="text-[#888] hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                              title={`Rimuovi tag #${t} da tutte le risorse selezionate`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions from allTags */}
                  {allTags.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-[#1F1F1F]">
                      <span className="text-[10px] uppercase font-mono text-[#888]">
                        Suggerimenti dal Vault:
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                        {allTags
                          .filter((t) => !commonTags.includes(t))
                          .slice(0, 10)
                          .map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => handleApplyTag(t)}
                              className="bg-[#141414] hover:bg-[#222] border border-[#222] hover:border-[#C5A059]/40 text-[#BBB] hover:text-[#E5C170] text-[10px] px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                            >
                              +# {t}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 2. Categorization */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === "category" ? null : "category")}
              disabled={isOperating}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                activeMenu === "category"
                  ? "bg-[#C5A059]/20 border-[#C5A059] text-[#E5C170]"
                  : "bg-[#171717] border-[#2A2A2A] hover:border-[#C5A059]/50 hover:bg-[#202020] text-[#D5D5D5]"
              }`}
              title="Riclassifica la categoria per tutte le risorse selezionate"
            >
              <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="font-medium">Categoria</span>
            </button>

            {/* Categorization Popover */}
            <AnimatePresence>
              {activeMenu === "category" && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-3 left-0 sm:left-1/2 sm:-translate-x-1/2 w-64 sm:w-72 bg-[#121212] border border-[#C5A059]/40 shadow-2xl rounded-xl p-3 z-50 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between border-b border-[#222] pb-2">
                    <span className="text-[11.5px] font-medium text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
                      Imposta Categoria ({selectedCount})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveMenu(null)}
                      className="p-1 text-[#666] hover:text-white rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                    {CATEGORY_OPTIONS.map((cat) => (
                      <button
                        key={cat.type}
                        type="button"
                        onClick={() => handleApplyCategory(cat.type)}
                        disabled={isOperating}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${cat.color}`}
                      >
                        <div className="flex items-center gap-2">
                          {cat.icon}
                          <span className="text-xs text-[#E5E5E5] font-medium">{cat.label}</span>
                        </div>
                        <span className="text-[10px] text-[#777] font-mono">{cat.type}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 3. Favorite Toggle */}
          <button
            type="button"
            onClick={() => onBulkToggleFavorite(!areAllFavorites)}
            disabled={isOperating}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
              areAllFavorites
                ? "bg-amber-950/40 border-amber-500/50 text-amber-300"
                : "bg-[#171717] border-[#2A2A2A] hover:border-amber-500/40 hover:bg-[#202020] text-[#D5D5D5]"
            }`}
            title={areAllFavorites ? "Rimuovi dai preferiti" : "Aggiungi tutte le risorse selezionate ai preferiti"}
          >
            <Star className={`w-3.5 h-3.5 ${areAllFavorites ? "text-amber-400 fill-amber-400" : "text-[#777]"}`} />
            <span className="font-medium hidden sm:inline">
              {areAllFavorites ? "Rimuovi Pref." : "Preferiti"}
            </span>
          </button>

          {/* 4. Delete Action */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === "delete" ? null : "delete")}
              disabled={isOperating}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-900/40 bg-red-950/20 hover:bg-red-950/50 hover:border-red-600/60 text-red-300 transition-all cursor-pointer"
              title="Elimina definitivamente le risorse selezionate"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span className="font-medium">Elimina</span>
            </button>

            {/* Delete Confirmation Popover */}
            <AnimatePresence>
              {activeMenu === "delete" && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-3 right-0 w-72 sm:w-80 bg-[#140D0D] border border-red-800/50 shadow-2xl rounded-xl p-3.5 z-50 flex flex-col gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-red-950/70 border border-red-800/60 text-red-400 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-red-200">
                        Elimina {selectedCount} {selectedCount === 1 ? "risorsa" : "risorse"}?
                      </h4>
                      <p className="text-[11px] text-[#A57A7A] mt-1 leading-relaxed">
                        Questa operazione cancellerà permanentemente gli elementi selezionati dal Vault locale e da Firestore.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-red-900/30">
                    <button
                      type="button"
                      onClick={() => setActiveMenu(null)}
                      className="px-3 py-1.5 bg-[#201515] hover:bg-[#2A1C1C] border border-[#402828] text-[#CCC] text-[11px] rounded-lg transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isOperating}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isOperating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Conferma Eliminazione
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Clear / Close Button */}
        <button
          type="button"
          onClick={onClearSelection}
          className="p-1.5 text-[#777] hover:text-white hover:bg-[#202020] rounded-lg transition-colors cursor-pointer ml-1"
          title="Deseleziona tutto (Esc)"
          aria-label="Chiudi selezione"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
};
