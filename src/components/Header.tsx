import React, { useRef, useEffect, useState } from "react";
import { 
  Search, 
  Menu, 
  Plus, 
  LayoutGrid, 
  List, 
  Network, 
  Terminal, 
  Printer, 
  X, 
  ArrowUpDown,
  MoreVertical,
  FileText,
  Command,
  Check,
  Focus,
  ShieldAlert,
  ShieldCheck,
  Activity,
  FileUp,
  Download,
  HardDrive,
  RefreshCw,
  GitBranch,
  Server,
  Headphones
} from "lucide-react";
import { ViewMode, SortOption } from "../types";
import { User } from "firebase/auth";
import { StatusCapsule } from "./StatusCapsule";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  onOpenAddModal: () => void;
  onOpenMobileMenu: () => void;
  onOpenDiagnostic?: () => void;
  onOpenExport?: () => void;
  onOpenPrintDossier?: () => void;
  onOpenGoogleDrive?: () => void;
  onOpenCekikjInspector?: () => void;
  onOpenKnowledgeUpload?: () => void;
  onOpenOkfSync?: () => void;
  onOpenMcpServer?: () => void;
  onOpenAudioOverview?: () => void;
  onOpenWebhookModal?: () => void;
  onSeedDemo?: () => void;
  isSeeding?: boolean;
  user: User | null;
  onSignIn: () => void;
  totalCount: number;
  userResourcesCount?: number;
  systemResourcesCount?: number;
  rawFilesCount?: number;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  // Status Capsule props
  quotaExceeded?: boolean;
  isSyncing?: boolean;
  lastSyncTime?: Date | null;
  onManualSync?: () => void;
  onExportBackup?: () => void;
  hasPendingConflicts?: boolean;
  conflictCount?: number;
  onOpenConflictModal?: () => void;
  onOpenRecoveryModal?: () => void;
  onOpenQuotaTelemetry?: () => void;
  onOpenPersistenceStatus?: () => void;
  onOpenDiscrepancyInspector?: () => void;
  onOpenVaultHealthCheck?: () => void;
  unsyncedCount?: number;
  onUploadUnsynced?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortByChange,
  onOpenAddModal,
  onOpenMobileMenu,
  onOpenDiagnostic,
  onOpenExport,
  onOpenPrintDossier,
  onOpenGoogleDrive,
  onOpenCekikjInspector,
  onOpenKnowledgeUpload,
  onOpenOkfSync,
  onOpenMcpServer,
  onOpenAudioOverview,
  onOpenWebhookModal,
  onSeedDemo,
  isSeeding = false,
  totalCount,
  userResourcesCount,
  systemResourcesCount,
  rawFilesCount = 0,
  isZenMode = false,
  onToggleZenMode,
  quotaExceeded = false,
  isSyncing = false,
  lastSyncTime = null,
  onManualSync,
  onExportBackup,
  hasPendingConflicts = false,
  conflictCount = 0,
  onOpenConflictModal,
  onOpenRecoveryModal,
  onOpenQuotaTelemetry,
  onOpenPersistenceStatus,
  onOpenDiscrepancyInspector,
  onOpenVaultHealthCheck,
  unsyncedCount = 0,
  onUploadUnsynced,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const sortMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts: "/" for search, Cmd/Ctrl + Shift + F for Zen Focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === "input" || activeTag === "textarea";

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (onToggleZenMode) onToggleZenMode();
      } else if (e.key === "/" && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setIsSortOpen(false);
        setIsMoreMenuOpen(false);
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleZenMode]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sortOptions: { id: SortOption; label: string }[] = [
    { id: "newest", label: "Più recenti" },
    { id: "oldest", label: "Meno recenti" },
    { id: "title", label: "Titolo (A-Z)" },
    { id: "title_desc", label: "Titolo (Z-A)" },
    { id: "type", label: "Per Tipologia" },
    { id: "favorites", label: "Prima Preferiti" },
  ];

  const currentSortLabel = sortOptions.find((s) => s.id === sortBy)?.label || "Ordina";

  return (
    <header className="h-14 border-b border-[#1A1A1A] bg-[#0A0A0A]/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-5 shrink-0 z-20 gap-3">
      {/* Left side: Mobile menu toggle + Modern Omnibar */}
      <div className="flex items-center gap-2.5 flex-1 max-w-xl min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 text-[#888] hover:text-white bg-[#121212] hover:bg-[#1A1A1A] border border-[#242424] rounded-lg shrink-0 transition-colors"
          aria-label="Apri menu laterale"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Omnibar Input */}
        <div className="relative w-full min-w-0 flex items-center">
          <Search className={`absolute left-3 w-4 h-4 transition-colors ${
            isSearchFocused ? "text-[#C5A059]" : "text-[#555]"
          }`} />
          
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cerca per titolo, testo, entità o tag..."
            className="w-full bg-[#111111] hover:bg-[#141414] focus:bg-[#141414] border border-[#202020] focus:border-[#C5A059]/70 rounded-lg py-1.5 pl-9 pr-24 text-xs text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-[#C5A059]/30 transition-all font-sans"
          />

          {/* Right badges inside Omnibar */}
          <div className="absolute right-2 flex items-center gap-1.5 pointer-events-none">
            {searchQuery ? (
              <>
                <span className="text-[10px] font-mono text-[#C5A059] bg-[#C5A059]/10 px-1.5 py-0.5 rounded border border-[#C5A059]/20 pointer-events-auto">
                  {totalCount} {totalCount === 1 ? "risultato" : "risultati"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSearchChange("");
                    searchInputRef.current?.focus();
                  }}
                  className="pointer-events-auto text-[#666] hover:text-[#DDD] p-0.5 rounded transition-colors"
                  aria-label="Cancella ricerca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono text-[#555] bg-[#161616] px-1.5 py-0.5 rounded border border-[#222]">
                <Command className="w-2.5 h-2.5" />
                <span>K</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Sort, Views, More Menu & Primary CTA */}
      <div className="flex items-center gap-2 shrink-0">
        
        {/* Sort Menu Dropdown */}
        <div className="relative" ref={sortMenuRef}>
          <button
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#222] bg-[#111] hover:bg-[#161616] hover:border-[#333] text-xs font-mono text-[#999] hover:text-[#DDD] transition-all"
            title="Ordina le risorse del Vault"
          >
            <ArrowUpDown className="w-3 h-3 text-[#C5A059]" />
            <span className="truncate max-w-[120px]">{currentSortLabel}</span>
          </button>

          {isSortOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-[#111111] border border-[#222222] rounded-lg shadow-xl py-1 z-30 font-sans text-xs">
              <div className="px-3 py-1 text-[10px] font-mono text-[#555] uppercase tracking-wider border-b border-[#1A1A1A]">
                Ordina risorse
              </div>
              {sortOptions.map((opt) => {
                const isSelected = opt.id === sortBy;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSortByChange(opt.id);
                      setIsSortOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#1A1A1A] transition-colors text-left ${
                      isSelected ? "text-[#E5C170] font-medium bg-[#16130B]" : "text-[#AAA]"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#C5A059]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* View Mode Toggle: Grid / Table / Graph */}
        <div className="flex items-center bg-[#111111] border border-[#202020] rounded-lg p-0.5 shrink-0 shadow-xs" role="radiogroup" aria-label="Modalità di visualizzazione">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`p-2 sm:p-1.5 min-w-[34px] min-h-[34px] rounded-md text-xs font-mono flex items-center justify-center gap-1 transition-all cursor-pointer ${
              viewMode === "grid"
                ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/60 shadow-xs font-semibold"
                : "text-[#888] hover:text-[#EEE] hover:bg-[#181818]"
            }`}
            title="Vista Schede a Griglia (Alt+1)"
            aria-label="Vista Griglia"
            aria-checked={viewMode === "grid"}
            role="radio"
          >
            <LayoutGrid className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="hidden md:inline text-[10.5px]">Griglia</span>
          </button>

          <button
            onClick={() => onViewModeChange("table")}
            className={`p-2 sm:p-1.5 min-w-[34px] min-h-[34px] rounded-md text-xs font-mono flex items-center justify-center gap-1 transition-all cursor-pointer ${
              viewMode === "table"
                ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/60 shadow-xs font-semibold"
                : "text-[#888] hover:text-[#EEE] hover:bg-[#181818]"
            }`}
            title="Vista Elenco a Tabella (Alt+2)"
            aria-label="Vista Tabella"
            aria-checked={viewMode === "table"}
            role="radio"
          >
            <List className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="hidden md:inline text-[10.5px]">Tabella</span>
          </button>

          <button
            onClick={() => onViewModeChange("graph")}
            className={`p-2 sm:p-1.5 min-w-[34px] min-h-[34px] rounded-md text-xs font-mono flex items-center justify-center gap-1 transition-all cursor-pointer ${
              viewMode === "graph"
                ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/60 shadow-xs font-semibold"
                : "text-[#888] hover:text-[#EEE] hover:bg-[#181818]"
            }`}
            title="Vista Grafo Ontologico OKF (Alt+3)"
            aria-label="Vista Grafo"
            aria-checked={viewMode === "graph"}
            role="radio"
          >
            <Network className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="hidden md:inline text-[10.5px]">Grafo</span>
          </button>
        </div>

        {/* Zen / ADHD Focus Mode Toggle */}
        {onToggleZenMode && (
          <button
            onClick={onToggleZenMode}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              isZenMode
                ? "bg-[#251B0A] border-[#C5A059] text-[#E5C170] shadow-sm font-semibold ring-1 ring-[#C5A059]/50"
                : "bg-[#111] hover:bg-[#161616] border-[#222] hover:border-[#333] text-[#888] hover:text-[#DDD]"
            }`}
            title={
              isZenMode 
                ? "Esci dalla Modalità Focus Zen (Esc o ⌘⇧F)" 
                : "Attiva Modalità Focus Zen (⌘⇧F) - Rimuove la sidebar e isola il canvas per massima concentrazione cognitiva"
            }
            aria-label="Modalità Focus Zen"
          >
            <Focus className={`w-3.5 h-3.5 ${isZenMode ? "text-[#C5A059] animate-pulse" : "text-[#777]"}`} />
            <span className="hidden sm:inline">{isZenMode ? "Zen Attivo" : "Focus"}</span>
          </button>
        )}

        {/* Subtle Visual Divider between Views and Governance/Diagnostics */}
        <div className="hidden xl:block h-4 w-px bg-[#262626] mx-0.5" />

        {/* Governance & Diagnostics Cluster */}
        <div className="hidden xl:flex items-center gap-1.5">
          {/* Cekikj Zero-Guessing Epistemic Inspector */}
          {onOpenCekikjInspector && (
            <button
              onClick={onOpenCekikjInspector}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#C5A059]/40 bg-[#161208] hover:bg-[#20180B] text-[#E5C170] hover:text-white text-xs font-mono transition-all shadow-xs cursor-pointer"
              title="Architettura Epistemica Cekikj: Motore Bounded Loop, Contradiction Gate e Grounding Verifier"
              aria-label="Cekikj Epistemic Engine"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Cekikj Gate</span>
            </button>
          )}

          {/* Server MCP Nativo Quick Action */}
          {onOpenMcpServer && (
            <button
              onClick={onOpenMcpServer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#3A2D1B] bg-[#141009] hover:bg-[#1E170E] hover:border-[#C5A059]/50 text-[#C5A059] hover:text-[#E5C170] text-xs font-mono transition-all shadow-xs cursor-pointer"
              title="Server MCP Nativo: Connetti Claude Desktop, Cursor o agenti esterni al Knowledge Vault tramite JSON-RPC 2.0"
              aria-label="Server MCP Nativo"
            >
              <Server className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Server MCP</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </button>
          )}

          {/* Vault Health Check Deep Comparison Trigger */}
          {onOpenVaultHealthCheck && (
            <button
              onClick={onOpenVaultHealthCheck}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#C5A059]/40 bg-[#161208] hover:bg-[#20180B] text-[#E5C170] hover:text-white text-xs font-mono transition-all shadow-xs cursor-pointer"
              title="Vault Health Check: Confronto profondo memoria locale vs query raw Firestore"
              aria-label="Vault Health Check"
            >
              <Activity className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Health Check</span>
            </button>
          )}
        </div>

        {/* Subtle Visual Divider before Status */}
        <div className="hidden sm:block h-4 w-px bg-[#262626] mx-0.5" />

        {/* Integrated Status & Persistence Capsule */}
        {onManualSync && (
          <StatusCapsule
            quotaExceeded={quotaExceeded}
            isSyncing={isSyncing}
            lastSyncTime={lastSyncTime}
            onManualSync={onManualSync}
            resourceCount={totalCount}
            userResourcesCount={userResourcesCount}
            systemResourcesCount={systemResourcesCount}
            rawFilesCount={rawFilesCount}
            onExportBackup={onExportBackup}
            hasPendingConflicts={hasPendingConflicts}
            conflictCount={conflictCount}
            onOpenConflictModal={onOpenConflictModal}
            onOpenRecoveryModal={onOpenRecoveryModal}
            onOpenQuotaTelemetry={onOpenQuotaTelemetry}
            onOpenPersistenceStatus={onOpenPersistenceStatus}
            onOpenDiscrepancyInspector={onOpenDiscrepancyInspector}
            onOpenVaultHealthCheck={onOpenVaultHealthCheck}
            unsyncedCount={unsyncedCount}
            onUploadUnsynced={onUploadUnsynced}
          />
        )}

        {/* Secondary Tools Menu (··· Altro) */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            className="p-1.5 text-[#888] hover:text-white bg-[#111] hover:bg-[#181818] border border-[#202020] rounded-lg transition-colors"
            title="Strumenti aggiuntivi ed esportazioni"
            aria-label="Altri strumenti"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMoreMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-[#111111] border border-[#222222] rounded-xl shadow-2xl py-1.5 z-30 font-sans text-xs divide-y divide-[#1A1A1A]">
              {/* Sezione 1: Dati & File */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider flex items-center justify-between">
                  <span>Dati & File</span>
                  <span className="text-[9px] text-[#444]">Vault</span>
                </div>

                {/* Importa Doc (.md / OKF) */}
                {onOpenKnowledgeUpload && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenKnowledgeUpload();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <FileUp className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <span className="font-medium truncate">Importa Doc</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#666] group-hover:text-[#C5A059] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      .md / OKF
                    </span>
                  </button>
                )}

                {/* Esporta Backup (JSON) */}
                {(onOpenExport || onExportBackup) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      if (onOpenExport) onOpenExport();
                      else if (onExportBackup) onExportBackup();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Download className="w-3.5 h-3.5 text-[#888] group-hover:text-white shrink-0 transition-colors" />
                      <span className="font-medium truncate">Esporta Backup</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#666] group-hover:text-[#DDD] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      JSON
                    </span>
                  </button>
                )}

                {/* Google Drive & Docs Hub */}
                {onOpenGoogleDrive && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenGoogleDrive();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                      <span className="font-medium truncate">Google Drive & Docs</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#666] group-hover:text-[#38BDF8] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      Hub
                    </span>
                  </button>
                )}

                {/* Stampa / Dossier PDF */}
                {onOpenPrintDossier && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenPrintDossier();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Printer className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <span className="font-medium truncate">Stampa / Dossier</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#666] group-hover:text-[#C5A059] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      PDF
                    </span>
                  </button>
                )}
              </div>

              {/* Sezione 2: Epistemica & Protezione */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider flex items-center justify-between">
                  <span>Integrazioni & Epistemica</span>
                </div>

                {/* Server MCP Nativo */}
                {onOpenMcpServer && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenMcpServer();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#E5C170] hover:text-white hover:bg-[#1C160B] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Server className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-semibold truncate">Server MCP Nativo</span>
                        <span className="text-[9.5px] text-[#A68848]">Claude Desktop, Cursor & JSON-RPC</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      MCP
                    </span>
                  </button>
                )}

                {/* Audio Overview & Voice Briefing */}
                {onOpenAudioOverview && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenAudioOverview();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#E5C170] hover:text-white hover:bg-[#1C160B] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Headphones className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-semibold truncate">Audio Overview & Briefing</span>
                        <span className="text-[9.5px] text-[#A68848]">Podcast Executive & Sintesi Vocale</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-[#C5A059] bg-[#C5A059]/20 px-1.5 py-0.2 rounded border border-[#C5A059]/30 flex items-center gap-1">
                      Audio
                    </span>
                  </button>
                )}

                {/* Remote Webhook & Capture API */}
                {onOpenWebhookModal && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenWebhookModal();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#E5C170] hover:text-white hover:bg-[#1C160B] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Terminal className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-semibold truncate">Remote Webhook & API</span>
                        <span className="text-[9.5px] text-[#A68848]">Browser Extension, cURL & CI/CD</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/30 flex items-center gap-1">
                      API
                    </span>
                  </button>
                )}

                {/* Zero-Guessing (Cekikj) */}
                {onOpenCekikjInspector && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenCekikjInspector();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#E5C170] hover:text-white hover:bg-[#1C160B] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-semibold truncate">Zero-Guessing (Cekikj)</span>
                        <span className="text-[9.5px] text-[#A68848]">Contradiction Gate & Trace</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-[#C5A059] bg-[#C5A059]/20 px-1.5 py-0.2 rounded border border-[#C5A059]/30">
                      Gate
                    </span>
                  </button>
                )}

                {/* Centro di Recupero & Protezione */}
                {onOpenRecoveryModal && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenRecoveryModal();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-medium truncate">Centro di Recupero Dati</span>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/30">
                      Attivo
                    </span>
                  </button>
                )}

                {/* Audit Integrità & Ciclo di Vita */}
                {onOpenDiscrepancyInspector && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenDiscrepancyInspector();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-medium truncate">Audit Ciclo di Vita</span>
                        <span className="text-[9.5px] text-[#888]">Trace Discrepanze & Inserimenti</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-[#C5A059] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      Audit
                    </span>
                  </button>
                )}

                {/* Stato Persistenza Multi-Livello */}
                {onOpenPersistenceStatus && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenPersistenceStatus();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <HardDrive className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <span className="font-medium truncate">Stato Persistenza</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#777] group-hover:text-[#DDD] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      3 Livelli
                    </span>
                  </button>
                )}
              </div>

              {/* Sezione 3: Diagnostica & Sistema */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider flex items-center justify-between">
                  <span>Diagnostica & Sistema</span>
                </div>

                {/* Monitor Quote & Telemetria */}
                {onOpenQuotaTelemetry && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenQuotaTelemetry();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Activity className={`w-3.5 h-3.5 ${quotaExceeded ? "text-amber-400 animate-pulse" : "text-[#C5A059]"} shrink-0`} />
                      <span className="font-medium truncate">Monitor Quote</span>
                    </div>
                    <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      quotaExceeded
                        ? "bg-amber-950/60 text-amber-300 border-amber-800/50"
                        : "bg-[#161616] text-emerald-400 border-emerald-900/40"
                    }`}>
                      {quotaExceeded ? "Blocco" : "Live"}
                    </span>
                  </button>
                )}

                {/* Vault Health Check (Memoria vs Firestore Raw) */}
                {onOpenVaultHealthCheck && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenVaultHealthCheck();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Activity className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-medium text-white truncate">Vault Health Check</span>
                        <span className="text-[9.5px] text-[#888]">Memoria vs Firestore Raw</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-[#E5C170] bg-[#241C0E] px-1.5 py-0.2 rounded border border-[#C5A059]/30">
                      Deep
                    </span>
                  </button>
                )}

                {/* Console Log & Tracing */}
                {onOpenDiagnostic && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenDiagnostic();
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Terminal className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <span className="font-medium truncate">Console Log & Tracing</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#777] group-hover:text-[#DDD] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      Debug
                    </span>
                  </button>
                )}

                {/* Sincronizza OKF (GitHub / Specifiche di Sistema) */}
                {(onOpenOkfSync || onSeedDemo) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      if (onOpenOkfSync) {
                        onOpenOkfSync();
                      } else if (onSeedDemo) {
                        onSeedDemo();
                      }
                    }}
                    disabled={isSeeding}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[#AAA] hover:text-[#E5C170] hover:bg-[#16130B] transition-colors text-left group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <GitBranch className={`w-3.5 h-3.5 text-[#C5A059] shrink-0 ${isSeeding ? "animate-spin" : ""}`} />
                      <span className="font-medium truncate">Sincronizza OKF (GitHub / Sistema)</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#666] group-hover:text-[#C5A059] bg-[#161616] px-1.5 py-0.2 rounded border border-[#222]">
                      Git/OKF
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button: Add Resource */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs py-1.5 px-3 sm:px-3.5 rounded-lg transition-all shadow-md shadow-[#C5A059]/15 active:scale-95 shrink-0 cursor-pointer"
          title="Aggiungi o Ingerisci nuova Risorsa nel Vault (Scorciatoia: Alt+N)"
          aria-label="Aggiungi nuova risorsa"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline font-medium">Nuova</span>
          <span className="hidden md:inline-block text-[9px] font-mono font-normal opacity-70 bg-black/20 px-1 py-0.2 rounded ml-0.5">
            Alt+N
          </span>
        </button>
      </div>
    </header>
  );
};
