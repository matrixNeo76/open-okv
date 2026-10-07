import React, { useState, useEffect, useMemo } from "react";
import { 
  FolderArchive, 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  Star, 
  LogOut, 
  LogIn, 
  X, 
  RefreshCw, 
  BrainCircuit, 
  Download, 
  Globe, 
  Wrench, 
  FileUp, 
  Paperclip, 
  FileText, 
  ShieldCheck,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Tag,
  UploadCloud,
  HardDrive,
  Activity,
  GraduationCap,
  Rss,
  StickyNote,
  ChevronDown,
  GitBranch,
  BookMarked,
  Workflow,
  Image as ImageIcon
} from "lucide-react";
import { ResourceType, NavCategory } from "../types";
import { User } from "firebase/auth";

interface SidebarProps {
  currentCategory: NavCategory;
  onSelectCategory: (cat: NavCategory) => void;
  quotaExceeded?: boolean;
  counts: {
    all: number;
    knowledge: number;
    procedure?: number;
    troubleshooting?: number;
    paper?: number;
    rss?: number;
    note?: number;
    mcp_server: number;
    github_repo: number;
    ai_skill: number;
    article: number;
    link?: number;
    favorites: number;
    raw_files?: number;
    read_later?: number;
    read_later_unread?: number;
    media_files?: number;
  };
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenOkfSync?: () => void;
  onSeedDemo: () => void;
  isSeeding: boolean;
  onOpenKnowledgeUpload: () => void;
  onOpenExport?: () => void;
  onOpenGoogleDrive?: () => void;
  onOpenRecovery?: () => void;
  onOpenPersistenceStatus?: () => void;
  onOpenVaultHealthCheck?: () => void;
  onOpenCekikjInspector?: () => void;
  unsyncedCount?: number;
  onUploadUnsynced?: () => void;
  // Modern 2026 UX extensions
  selectedTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
  availableTags?: string[];
  onDropFiles?: (files: FileList) => void;
  isZenMode?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCategory,
  onSelectCategory,
  quotaExceeded = false,
  counts,
  user,
  onSignIn,
  onSignOut,
  isOpenMobile,
  onCloseMobile,
  onOpenOkfSync,
  onSeedDemo,
  isSeeding,
  onOpenKnowledgeUpload,
  onOpenExport,
  onOpenGoogleDrive,
  onOpenRecovery,
  onOpenPersistenceStatus,
  onOpenVaultHealthCheck,
  onOpenCekikjInspector,
  unsyncedCount = 0,
  onUploadUnsynced,
  selectedTag,
  onSelectTag,
  availableTags = [],
  onDropFiles,
  isZenMode = false,
}) => {
  // Collapsed / Expanded state (Compact Rail Mode)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("KV_SIDEBAR_COLLAPSED") === "true";
    }
    return false;
  });

  // Collapsible Tools section state (defaults to false / collapsed to avoid taking excessive space)
  const [isToolsOpen, setIsToolsOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("KV_SIDEBAR_TOOLS_OPEN") === "true";
    }
    return false;
  });

  const toggleToolsOpen = () => {
    setIsToolsOpen((prev) => {
      const next = !prev;
      localStorage.setItem("KV_SIDEBAR_TOOLS_OPEN", String(next));
      return next;
    });
  };

  // Category quick filter in sidebar
  const [categoryFilter, setCategoryFilter] = useState("");
  // Drag & drop highlight state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("KV_SIDEBAR_COLLAPSED", String(next));
      return next;
    });
  };

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. Primary Overview Items
  const primaryNavItems: {
    id: NavCategory;
    label: string;
    icon: React.ReactNode;
    count: number;
    badgeText?: string;
  }[] = [
    {
      id: "all",
      label: "Tutte le Risorse",
      icon: <FolderArchive className="w-4 h-4 text-[#C5A059]" />,
      count: counts.all,
    },
    {
      id: "favorites",
      label: "Preferiti",
      icon: <Star className="w-4 h-4 text-[#E5C170] fill-[#E5C170]/20" />,
      count: counts.favorites,
    },
    {
      id: "media_files" as NavCategory,
      label: "Documenti & Immagini",
      icon: <ImageIcon className="w-4 h-4 text-[#F59E0B]" />,
      count: counts.media_files || 0,
      badgeText: counts.media_files ? `${counts.media_files}` : undefined,
    },
    {
      id: "read_later" as NavCategory,
      label: "Read-It-Later",
      icon: <BookMarked className="w-4 h-4 text-[#38BDF8]" />,
      count: counts.read_later || 0,
      badgeText: counts.read_later_unread && counts.read_later_unread > 0 ? `${counts.read_later_unread} nuovi` : undefined,
    },
    ...((counts.raw_files ?? 0) > 0
      ? [
          {
            id: "raw_files" as NavCategory,
            label: "Buffer File Grezzi",
            icon: <Paperclip className="w-4 h-4 text-[#A89874]" />,
            count: counts.raw_files!,
            badgeText: "Inbox",
          },
        ]
      : []),
  ];

  // 2. Structured Resource Categories
  const categoryNavItems: {
    id: ResourceType;
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      id: "knowledge",
      label: "Knowledge & Documenti (OKF)",
      icon: <BrainCircuit className="w-4 h-4 text-[#C5A059]" />,
      count: counts.knowledge || 0,
    },
    {
      id: "paper",
      label: "Paper Scientifici",
      icon: <GraduationCap className="w-4 h-4 text-[#818CF8]" />,
      count: counts.paper || 0,
    },
    {
      id: "troubleshooting",
      label: "Problemi & Soluzioni",
      icon: <Wrench className="w-4 h-4 text-[#E59866]" />,
      count: counts.troubleshooting || 0,
    },
    {
      id: "procedure",
      label: "Procedure & Playbook",
      icon: <Workflow className="w-4 h-4 text-[#22D3EE]" />,
      count: counts.procedure || 0,
    },
    {
      id: "note",
      label: "Note & Scratchpad",
      icon: <StickyNote className="w-4 h-4 text-[#FBBF24]" />,
      count: counts.note || 0,
    },
    {
      id: "rss",
      label: "Feed RSS & Canali",
      icon: <Rss className="w-4 h-4 text-[#FB923C]" />,
      count: counts.rss || 0,
    },
    {
      id: "mcp_server",
      label: "MCP Servers & Tools",
      icon: <Cpu className="w-4 h-4 text-[#7DD3FC]" />,
      count: counts.mcp_server || 0,
    },
    {
      id: "github_repo",
      label: "GitHub Repositories",
      icon: <Github className="w-4 h-4 text-[#C084FC]" />,
      count: counts.github_repo || 0,
    },
    {
      id: "ai_skill",
      label: "AI Skills & Prompts",
      icon: <Sparkles className="w-4 h-4 text-[#34D399]" />,
      count: counts.ai_skill || 0,
    },
    {
      id: "article",
      label: "Guide & Articoli",
      icon: <BookOpen className="w-4 h-4 text-[#FDE047]" />,
      count: counts.article || 0,
    },
    {
      id: "link",
      label: "Link & Web Tools",
      icon: <Globe className="w-4 h-4 text-[#38BDF8]" />,
      count: counts.link || 0,
    },
  ];

  // Filtered categories based on search
  const filteredCategoryItems = useMemo(() => {
    if (!categoryFilter.trim()) return categoryNavItems;
    const term = categoryFilter.toLowerCase();
    return categoryNavItems.filter((c) => c.label.toLowerCase().includes(term));
  }, [categoryFilter, categoryNavItems]);

  // Top prominent tags
  const topTags = useMemo(() => {
    return availableTags.slice(0, 5);
  }, [availableTags]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (onDropFiles) {
        onDropFiles(e.dataTransfer.files);
      } else {
        onOpenKnowledgeUpload();
      }
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 bg-[#0A0A0A] border-r border-[#1B1B1B] flex flex-col transition-all duration-300 ease-in-out ${
          isOpenMobile
            ? "translate-x-0 w-72"
            : "-translate-x-full lg:translate-x-0"
        } ${
          isZenMode
            ? "lg:-translate-x-full lg:w-0 lg:border-r-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none"
            : isCollapsed
            ? "lg:w-16"
            : "lg:w-68"
        } ${
          isDraggingOver ? "ring-2 ring-[#C5A059] ring-inset bg-[#12100A]" : ""
        }`}
      >
        {/* Header: Logo, Title and Collapse Toggle */}
        <div className="p-3 border-b border-[#1A1A1A] flex items-center justify-between bg-[#0C0C0C]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div
              onClick={() => {
                if (isCollapsed) toggleCollapsed();
              }}
              className="w-8 h-8 rounded-lg bg-[#18140B] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shadow-xs shrink-0 cursor-pointer hover:border-[#C5A059]"
              title="Knowledge Vault OKF v0.2 (Clicca per espandere/comprimere)"
            >
              <FolderArchive className="w-4 h-4" />
            </div>

            {!isCollapsed && (
              <div className="overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-serif italic text-[#E5C170] tracking-tight font-semibold truncate">
                    Knowledge Vault
                  </h1>
                  <span className="text-[9px] font-mono font-bold bg-[#C5A059]/15 text-[#C5A059] border border-[#C5A059]/30 px-1 py-0.2 rounded shrink-0">
                    v0.2
                  </span>
                </div>
                <p className="text-[9.5px] uppercase tracking-[0.14em] text-[#666] font-mono truncate">
                  OKF Architecture
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Collapse / Expand Toggle */}
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex p-1 text-[#666] hover:text-[#C5A059] hover:bg-[#141414] rounded-md transition-colors"
              title={isCollapsed ? "Espandi Sidebar (⌘B)" : "Riduci a icone (⌘B)"}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden text-[#666] hover:text-white p-1 rounded-md hover:bg-[#1A1A1A] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drag & Drop Feedback Banner */}
        {isDraggingOver && !isCollapsed && (
          <div className="mx-3 my-2 p-2 rounded-lg border border-dashed border-[#C5A059] bg-[#1F190E] text-center text-xs text-[#E5C170] flex items-center justify-center gap-2 animate-pulse font-mono">
            <UploadCloud className="w-4 h-4" />
            <span>Rilascia file qui per importare</span>
          </div>
        )}

        {/* Quick Filter (solo in modalità estesa) */}
        {!isCollapsed && (
          <div className="px-3 pt-2.5 pb-1">
            <div className="relative">
              <Search className="w-3 h-3 text-[#555] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                placeholder="Filtra categorie..."
                className="w-full bg-[#121212] text-xs text-[#DDD] placeholder-[#555] rounded-md pl-7 pr-2 py-1 border border-[#1E1E1E] focus:border-[#C5A059]/40 focus:outline-hidden transition-all font-sans"
              />
              {categoryFilter && (
                <button
                  onClick={() => setCategoryFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-white text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Navigation Body */}
        <div className={`flex-1 ${isCollapsed ? "px-2" : "px-3"} py-2 space-y-4 overflow-y-auto custom-scrollbar`}>
          
          {/* Section 1: Navigazione Principale */}
          <div>
            {!isCollapsed && (
              <div className="text-[10px] uppercase tracking-widest text-[#555] px-2 mb-1 font-mono font-semibold">
                Filtri Principali
              </div>
            )}
            <div className="space-y-0.5">
              {primaryNavItems.map((item) => {
                const isActive = currentCategory === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectCategory(item.id);
                      onCloseMobile();
                    }}
                    title={isCollapsed ? `${item.label} (${item.count})` : undefined}
                    className={`w-full flex items-center ${
                      isCollapsed ? "justify-center p-2" : "justify-between px-2.5 py-1.5"
                    } rounded-md text-xs transition-all ${
                      isActive
                        ? "bg-[#1C160B] border border-[#C5A059]/50 text-white font-medium shadow-xs"
                        : "text-[#999] hover:text-[#E0E0E0] hover:bg-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="shrink-0">{item.icon}</span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!isCollapsed && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          isActive
                            ? "bg-[#C5A059]/25 text-[#E5C170] font-semibold"
                            : "text-[#777]"
                        }`}
                      >
                        {item.badgeText !== undefined ? item.badgeText : item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Ontologia OKF */}
          <div>
            {!isCollapsed && (
              <div className="text-[10px] uppercase tracking-widest text-[#555] px-2 mb-1 font-mono font-semibold">
                Ontologia OKF
              </div>
            )}
            <div className="space-y-0.5">
              {filteredCategoryItems.map((item) => {
                const isActive = currentCategory === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectCategory(item.id);
                      onCloseMobile();
                    }}
                    title={isCollapsed ? `${item.label} (${item.count})` : undefined}
                    className={`w-full flex items-center ${
                      isCollapsed ? "justify-center p-2" : "justify-between px-2.5 py-1.5"
                    } rounded-md text-xs transition-all ${
                      isActive
                        ? "bg-[#1C160B] border border-[#C5A059]/50 text-white font-medium shadow-xs"
                        : "text-[#888] hover:text-[#DDD] hover:bg-[#121212]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="shrink-0">{item.icon}</span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!isCollapsed && (
                      <span
                        className={`text-[10.5px] font-mono px-1.5 py-0.2 rounded shrink-0 ml-1 ${
                          isActive
                            ? "bg-[#C5A059]/25 text-[#E5C170] font-semibold"
                            : item.count > 0
                              ? "bg-[#161616] text-[#777]"
                              : "text-[#3D3D3D]"
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2.5: Top Domini / Tag (Contextual Pivoting) */}
          {!isCollapsed && topTags.length > 0 && onSelectTag && (
            <div className="pt-2 border-t border-[#181818]">
              <div className="text-[10px] uppercase tracking-widest text-[#555] px-2 mb-1.5 font-mono font-semibold flex items-center justify-between">
                <span>Top Tag</span>
                {selectedTag && (
                  <button
                    onClick={() => onSelectTag(null)}
                    className="text-[9.5px] font-mono text-[#C5A059] hover:underline"
                  >
                    Tutti
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 px-1">
                {topTags.map((tag) => {
                  const isSelected = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => onSelectTag(isSelected ? null : tag)}
                      className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded-md border transition-all flex items-center gap-1 ${
                        isSelected
                          ? "bg-[#C5A059]/20 border-[#C5A059] text-[#E5C170]"
                          : "bg-[#111] border-[#222] text-[#888] hover:text-white hover:border-[#333]"
                      }`}
                    >
                      <Tag className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[90px]">{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Strumenti Vault (Collassabile) */}
          <div className="pt-2 border-t border-[#181818]">
            {isCollapsed ? (
              <div className="flex justify-center p-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsCollapsed(false);
                    setIsToolsOpen(true);
                  }}
                  title="Espandi Strumenti Vault"
                  className="p-2 rounded-md text-[#777] hover:text-[#C5A059] hover:bg-[#121212] transition-colors cursor-pointer"
                >
                  <Wrench className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={toggleToolsOpen}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider text-[#777] hover:text-[#C5A059] hover:bg-[#121212] transition-colors group cursor-pointer select-none"
                  title="Espandi o collassa gli strumenti della sidebar (tutti disponibili anche nel menu ··· in alto a destra)"
                >
                  <div className="flex items-center gap-1.5">
                    <Wrench className="w-3 h-3 text-[#C5A059]/80 group-hover:text-[#C5A059]" />
                    <span className="font-semibold text-[#888] group-hover:text-[#E5C170]">Strumenti</span>
                    <span className="text-[8.5px] text-[#555] font-normal lowercase tracking-normal">
                      {isToolsOpen ? "" : "(menu ···)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#161616] text-[#666] group-hover:text-[#AAA]">
                      {isToolsOpen ? "Nascondi" : "6 tool"}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#555] group-hover:text-[#C5A059] transition-transform duration-200 ${
                        isToolsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {isToolsOpen && (
                  <div className="space-y-1 mt-1 pl-0.5">
                    {/* Sincronizza OKF (GitHub / Specifiche di Sistema) */}
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] text-[#666]">
                      <span className="font-mono">Sincronizza OKF</span>
                      <button
                        onClick={() => {
                          if (onOpenOkfSync) onOpenOkfSync();
                          else onSeedDemo();
                        }}
                        disabled={isSeeding}
                        title="Sincronizza file OKF da GitHub o installa specifiche di sistema"
                        className="text-[#666] hover:text-[#C5A059] p-0.5 rounded transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <GitBranch className={`w-3 h-3 ${isSeeding ? "animate-spin text-[#C5A059]" : ""}`} />
                      </button>
                    </div>

                    {/* Google Drive */}
                    {onOpenGoogleDrive && (
                      <button
                        onClick={() => {
                          onOpenGoogleDrive();
                          onCloseMobile();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#121212] hover:bg-[#181818] border border-[#1E1E1E] hover:border-[#38BDF8]/40 text-[#BBB] hover:text-white text-xs transition-all group text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                          <span className="truncate font-medium">Google Drive</span>
                        </div>
                        <span className="text-[9px] font-mono text-[#555] group-hover:text-[#38BDF8] transition-colors">
                          Docs
                        </span>
                      </button>
                    )}

                    {/* Ingestione Doc / Paper */}
                    <button
                      onClick={() => {
                        onOpenKnowledgeUpload();
                        onCloseMobile();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#121212] hover:bg-[#181818] border border-[#1E1E1E] hover:border-[#C5A059]/40 text-[#BBB] hover:text-white text-xs transition-all group text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Workflow className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                        <span className="truncate font-medium">Ingestione Doc</span>
                      </div>
                      <span className="text-[9px] font-mono text-[#555] group-hover:text-[#C5A059] transition-colors">
                        6 Agenti
                      </span>
                    </button>

                    {/* Centro Recupero */}
                    {onOpenRecovery && (
                      <button
                        onClick={() => {
                          onOpenRecovery();
                          onCloseMobile();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#121212] hover:bg-[#181818] border border-[#1E1E1E] hover:border-[#E5C170]/40 text-[#BBB] hover:text-white text-xs transition-all group text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#E5C170] shrink-0" />
                          <span className="truncate font-medium">Centro Recupero</span>
                        </div>
                        <span className="text-[9px] font-mono text-emerald-500/80 bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-800/30">
                          Attivo
                        </span>
                      </button>
                    )}

                    {/* Zero-Guessing */}
                    {onOpenCekikjInspector && (
                      <button
                        onClick={() => {
                          onOpenCekikjInspector();
                          onCloseMobile();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#161208] hover:bg-[#20180B] border border-[#C5A059]/40 hover:border-[#C5A059] text-[#E5C170] hover:text-white text-xs transition-all group text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ShieldAlert className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                          <span className="truncate font-medium">Zero-Guessing</span>
                        </div>
                        <span className="text-[9px] font-mono text-[#C5A059] bg-[#C5A059]/20 px-1 py-0.2 rounded border border-[#C5A059]/40">
                          Gate
                        </span>
                      </button>
                    )}

                    {/* Monitor Quote */}
                    <button
                      onClick={() => {
                        onSelectCategory("quota_monitor");
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all cursor-pointer ${
                        currentCategory === "quota_monitor"
                          ? "bg-[#1C160B] border border-[#C5A059]/50 text-white font-medium"
                          : "text-[#888] hover:text-[#DDD] hover:bg-[#121212]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Activity className={`w-3.5 h-3.5 ${quotaExceeded ? "text-amber-400 animate-pulse" : "text-[#C5A059]"} shrink-0`} />
                        <span className="truncate">Monitor Quote</span>
                      </div>
                      <span className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                        quotaExceeded
                          ? "bg-amber-950/60 text-amber-300 border-amber-800/50"
                          : "bg-[#161616] text-emerald-400 border-emerald-900/40"
                      }`}>
                        {quotaExceeded ? "Bloccata" : "Live"}
                      </span>
                    </button>

                    {/* Buffer File Grezzi */}
                    {(counts.raw_files ?? 0) > 0 && (
                      <button
                        onClick={() => {
                          onSelectCategory("raw_files");
                          onCloseMobile();
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all cursor-pointer ${
                          currentCategory === "raw_files"
                            ? "bg-[#1C160B] border border-[#C5A059]/50 text-white font-medium"
                            : "text-[#888] hover:text-[#DDD] hover:bg-[#121212]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-[#A89874] shrink-0" />
                          <span className="truncate">File Grezzi</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#161616] text-[#777]">
                          {counts.raw_files}
                        </span>
                      </button>
                    )}

                    {/* Esporta Backup */}
                    {onOpenExport && (
                      <button
                        onClick={() => {
                          onOpenExport();
                          onCloseMobile();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#121212] hover:bg-[#181818] border border-[#1E1E1E] hover:border-[#888]/40 text-[#999] hover:text-white text-xs transition-all group text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Download className="w-3.5 h-3.5 text-[#888] group-hover:text-white shrink-0 transition-colors" />
                          <span className="truncate font-medium">Esporta Backup</span>
                        </div>
                        <span className="text-[9px] font-mono text-[#555] group-hover:text-[#888] transition-colors">
                          JSON
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Persistence Status & Unsynced Warning Banner */}
        {unsyncedCount > 0 && !isCollapsed && (
          <div 
            onClick={onOpenPersistenceStatus}
            className="px-2.5 py-1 bg-[#141008] hover:bg-[#1E170C] border-t border-[#2A1E0D] flex items-center justify-between gap-1.5 text-[10px] text-[#C5A059] cursor-pointer transition-colors"
            title="Clicca per visualizzare lo stato della persistenza"
          >
            <div className="flex items-center gap-1.5 truncate min-w-0">
              <RefreshCw className="w-2.5 h-2.5 text-[#C5A059] animate-spin shrink-0" />
              <span className="truncate">Auto-sync cloud attivo ({unsyncedCount})</span>
            </div>
            <span className="text-[9.5px] text-[#888] font-mono shrink-0">Stato →</span>
          </div>
        )}

        {/* User Account & Persistence Health Monitor Footer */}
        <div className={`p-3 pb-4 border-t border-[#1A1A1A] bg-[#070707] shrink-0 ${isCollapsed ? "flex flex-col items-center" : ""}`}>
          <div className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "justify-between gap-2"}`}>
            <div 
              className="flex items-center space-x-2.5 overflow-hidden min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
              onClick={onOpenPersistenceStatus}
              title="Clicca per visualizzare lo stato della persistenza a 3 livelli (IndexedDB, Server, Firestore)"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="w-7 h-7 rounded-full border border-[#C5A059]/40 object-cover shrink-0"
                />
              ) : (
                <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  user?.isAnonymous 
                    ? "bg-[#181309] border-amber-800/50 text-[#C5A059]" 
                    : "bg-[#1A150C] border-[#C5A059]/40 text-[#C5A059]"
                }`}>
                  {user?.isAnonymous ? "?" : (user?.displayName ? user.displayName.slice(0, 1).toUpperCase() : "G")}
                </div>
              )}

              {!isCollapsed && (
                <div className="text-xs truncate min-w-0 flex-1">
                  <p className="text-white font-medium truncate text-[11px] leading-tight">
                    {user?.isAnonymous ? "Ospite (Sessione Locale)" : (user ? (user.displayName || user.email || "Utente Google") : "Modalità Locale")}
                  </p>
                  <div className="flex items-center gap-1.5 text-[9px] text-[#777] mt-0.5 font-mono">
                    <ShieldCheck className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    <span className="text-[#AAA] truncate" title={`${counts.all} protetti • ${user?.isAnonymous ? "Ospite" : "Google Cloud"}`}>
                      {counts.all} protetti • {user?.isAnonymous ? "Ospite" : "Google Cloud"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Vault Health Check Button */}
              {onOpenVaultHealthCheck && (
                <button
                  onClick={onOpenVaultHealthCheck}
                  title="Vault Health Check: Confronto Memoria vs Firestore Raw"
                  className="p-1.5 text-[#888] hover:text-[#E5C170] hover:bg-[#141414] rounded-md transition-colors"
                >
                  <Activity className="w-3.5 h-3.5 text-[#C5A059]" />
                </button>
              )}

              {/* Button to open Persistence Status */}
              {onOpenPersistenceStatus && (
                <button
                  onClick={onOpenPersistenceStatus}
                  title="Stato Persistenza a 3 Livelli"
                  className="p-1.5 text-[#888] hover:text-[#C5A059] hover:bg-[#141414] rounded-md transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Login or Logout */}
              {user && !user.isAnonymous ? (
                <button
                  onClick={onSignOut}
                  title={`Disconnetti account (${user.email})`}
                  className="p-1.5 text-[#777] hover:text-rose-400 hover:bg-[#161616] rounded-md transition-colors shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={onSignIn}
                  title="Accedi con Google per sincronizzare con Firestore"
                  className="flex items-center gap-1 px-2 py-1 bg-[#C5A059]/15 hover:bg-[#C5A059]/25 text-[#E5C170] border border-[#C5A059]/40 rounded-md transition-all text-[10.5px] font-semibold shrink-0"
                >
                  <LogIn className="w-3 h-3" />
                  {!isCollapsed && <span>Accedi</span>}
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
