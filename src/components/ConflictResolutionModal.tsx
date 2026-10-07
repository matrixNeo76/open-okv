import React, { useState } from "react";
import {
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  GitMerge,
  Clock,
  Sparkles,
  CloudUpload,
  CloudDownload,
  Database,
  X,
  FileText,
  ChevronRight,
  RotateCw
} from "lucide-react";
import { ResourceItem } from "../types";
import { ConflictAnalysisResult, ConflictItem, ResolutionChoice } from "../lib/conflictResolver";
import { formatDate } from "../lib/dateUtils";

interface ConflictResolutionModalProps {
  analysis: ConflictAnalysisResult;
  isOpen: boolean;
  onClose: () => void;
  onApplyMerge: (resolvedItems: ResourceItem[], toUpload: ResourceItem[]) => Promise<void>;
  isApplying?: boolean;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  analysis,
  isOpen,
  onClose,
  onApplyMerge,
  isApplying = false,
}) => {
  // Allow per-item custom overrides if the user wants granular control
  const [customResolutions, setCustomResolutions] = useState<Record<string, ResolutionChoice>>({});
  const [activeTab, setActiveTab] = useState<"all" | "local" | "remote" | "identical">("all");

  if (!isOpen) return null;

  const handleToggleResolution = (id: string, current: ResolutionChoice) => {
    setCustomResolutions((prev) => ({
      ...prev,
      [id]: current === "use_local" ? "use_remote" : "use_local",
    }));
  };

  // Compute final resolved items based on default resolution or user override
  const getFinalPlan = () => {
    const finalItems: ResourceItem[] = [];
    const itemsToUpload: ResourceItem[] = [];

    analysis.items.forEach((item) => {
      const choice = customResolutions[item.id] || item.resolution;
      let chosenResource: ResourceItem;

      if (choice === "use_local") {
        chosenResource = item.localResource || item.remoteResource!;
        if (item.localResource) {
          itemsToUpload.push(item.localResource);
        }
      } else {
        chosenResource = item.remoteResource || item.localResource!;
      }

      finalItems.push(chosenResource);
    });

    return { finalItems, itemsToUpload };
  };

  const { finalItems, itemsToUpload } = getFinalPlan();

  const filteredItems = analysis.items.filter((item) => {
    if (activeTab === "local") return item.status === "local_newer" || item.status === "local_only";
    if (activeTab === "remote") return item.status === "remote_newer" || item.status === "remote_only";
    if (activeTab === "identical") return item.status === "identical";
    return true;
  });

  const handleExecuteAutoMerge = () => {
    onApplyMerge(analysis.mergedResources, analysis.itemsToUploadToFirestore);
  };

  const handleExecuteCustomMerge = () => {
    onApplyMerge(finalItems, itemsToUpload);
  };

  const handleForceLocalAll = () => {
    const locals: ResourceItem[] = analysis.items
      .map((i) => i.localResource)
      .filter((r): r is ResourceItem => !!r);
    onApplyMerge(locals, locals);
  };

  const handleForceRemoteAll = () => {
    const remotes: ResourceItem[] = analysis.items
      .map((i) => i.remoteResource)
      .filter((r): r is ResourceItem => !!r);
    onApplyMerge(remotes, []);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#111111] border border-[#2D2D2D] rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans text-[#E0E0E0]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222] bg-[#161616] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center text-[#E5C170]">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">
                  Allineamento & Sincronizzazione Cloud
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-medium">
                  Stato Risorse
                </span>
              </div>
              <p className="text-xs text-[#888] mt-0.5">
                Verifica della coerenza tra la copia locale nel tuo dispositivo e la replica Google Cloud Firestore.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="text-[#777] hover:text-white p-1.5 rounded-md hover:bg-[#222] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Summary Cards */}
        <div className="p-6 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Local Newer / Only */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#888] font-mono flex items-center gap-1.5">
                <CloudUpload className="w-3.5 h-3.5 text-[#C5A059]" />
                Modifiche Locali
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#C5A059]/15 text-[#E5C170] text-xs font-bold font-mono">
                {analysis.localNewerCount + analysis.localOnlyCount}
              </span>
            </div>
            <div className="text-[11px] text-[#777] leading-relaxed">
              {analysis.localOnlyCount > 0 && `${analysis.localOnlyCount} nuove create offline. `}
              {analysis.localNewerCount > 0 && `${analysis.localNewerCount} con modifiche recenti.`}
              {analysis.localOnlyCount === 0 && analysis.localNewerCount === 0 && "Nessuna modifica locale in sospeso."}
            </div>
          </div>

          {/* Remote Newer / Only */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#888] font-mono flex items-center gap-1.5">
                <CloudDownload className="w-3.5 h-3.5 text-cyan-400" />
                Aggiornamenti Cloud
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950/40 text-cyan-400 text-xs font-bold font-mono">
                {analysis.remoteNewerCount + analysis.remoteOnlyCount}
              </span>
            </div>
            <div className="text-[11px] text-[#777] leading-relaxed">
              {analysis.remoteOnlyCount > 0 && `${analysis.remoteOnlyCount} nuovi dal database. `}
              {analysis.remoteNewerCount > 0 && `${analysis.remoteNewerCount} versioni cloud più recenti.`}
              {analysis.remoteOnlyCount === 0 && analysis.remoteNewerCount === 0 && "Nessuna novità remota."}
            </div>
          </div>

          {/* Identical / In-Sync */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#888] font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Già Sincronizzati
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 text-xs font-bold font-mono">
                {analysis.identicalCount}
              </span>
            </div>
            <div className="text-[11px] text-[#777] leading-relaxed">
              Risorse perfettamente allineate tra memoria locale e Firestore.
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="px-6 py-2 flex items-center gap-2 border-b border-[#222] text-xs font-mono">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === "all" ? "bg-[#252525] text-white font-medium" : "text-[#777] hover:text-[#BBB]"
            }`}
          >
            Tutti ({analysis.items.length})
          </button>
          <button
            onClick={() => setActiveTab("local")}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === "local" ? "bg-[#252525] text-[#E5C170] font-medium" : "text-[#777] hover:text-[#BBB]"
            }`}
          >
            Da Caricare ({analysis.localNewerCount + analysis.localOnlyCount})
          </button>
          <button
            onClick={() => setActiveTab("remote")}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === "remote" ? "bg-[#252525] text-cyan-400 font-medium" : "text-[#777] hover:text-[#BBB]"
            }`}
          >
            Da Scaricare ({analysis.remoteNewerCount + analysis.remoteOnlyCount})
          </button>
          <button
            onClick={() => setActiveTab("identical")}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === "identical" ? "bg-[#252525] text-emerald-400 font-medium" : "text-[#777] hover:text-[#BBB]"
            }`}
          >
            Allineati ({analysis.identicalCount})
          </button>
        </div>

        {/* Conflict Items Table / List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2 divide-y divide-[#1C1C1C]">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-[#666] text-xs font-mono">
              Nessun elemento in questa categoria.
            </div>
          ) : (
            filteredItems.map((item) => {
              const currentChoice = customResolutions[item.id] || item.resolution;
              const isLocalChosen = currentChoice === "use_local";

              return (
                <div key={item.id} className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white truncate max-w-md" title={item.title}>
                        {item.title}
                      </span>
                      <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-[#202020] text-[#999] border border-[#2E2E2E]">
                        {item.type}
                      </span>
                      {item.domain && (
                        <span className="text-[10px] text-[#666] font-mono">
                          [{item.domain}]
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[11px] text-[#777] font-mono flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#555]" />
                        Locale: <span className={item.status === "local_newer" ? "text-[#E5C170] font-medium" : "text-[#888]"}>
                          {item.localUpdatedAt ? formatDate(item.localUpdatedAt, "full") : "Non presente"}
                        </span>
                      </span>
                      <span className="text-[#444]">|</span>
                      <span>
                        Firestore: <span className={item.status === "remote_newer" ? "text-cyan-400 font-medium" : "text-[#888]"}>
                          {item.remoteUpdatedAt ? formatDate(item.remoteUpdatedAt, "full") : "Non presente"}
                        </span>
                      </span>
                    </div>

                    {item.diffSummary && (
                      <div className="text-[11px] text-[#888] mt-0.5">
                        ↳ <span className="italic">{item.diffSummary}</span>
                      </div>
                    )}
                  </div>

                  {/* Resolution Selector Pill */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "identical" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-600/30 text-emerald-400 text-[11px] font-mono">
                        <CheckCircle2 className="w-3 h-3" /> In Sincronia
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggleResolution(item.id, currentChoice)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-mono transition-all ${
                          isLocalChosen
                            ? "bg-[#C5A059]/15 border-[#C5A059]/50 text-[#E5C170] hover:bg-[#C5A059]/25"
                            : "bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60"
                        }`}
                        title="Clicca per invertire la versione scelta"
                      >
                        {isLocalChosen ? (
                          <>
                            <CloudUpload className="w-3.5 h-3.5" />
                            <span>Usa Locale (Upload)</span>
                          </>
                        ) : (
                          <>
                            <CloudDownload className="w-3.5 h-3.5" />
                            <span>Usa Firestore (Download)</span>
                          </>
                        )}
                        <span className="text-[9px] text-[#888] bg-black/30 px-1 rounded">inverti</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#222] bg-[#141414] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleForceLocalAll}
              disabled={isApplying}
              className="text-xs text-[#888] hover:text-[#CCC] px-2 py-1 rounded hover:bg-[#202020] transition-colors"
            >
              Forza tutto Locale
            </button>
            <span className="text-[#444]">•</span>
            <button
              onClick={handleForceRemoteAll}
              disabled={isApplying}
              className="text-xs text-[#888] hover:text-[#CCC] px-2 py-1 rounded hover:bg-[#202020] transition-colors"
            >
              Forza tutto Firestore
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-3.5 py-1.5 rounded-lg border border-[#2B2B2B] hover:bg-[#202020] text-xs font-medium text-[#AAA] hover:text-white transition-colors"
            >
              Rivedi più tardi
            </button>

            <button
              onClick={Object.keys(customResolutions).length > 0 ? handleExecuteCustomMerge : handleExecuteAutoMerge}
              disabled={isApplying}
              className="px-4 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D4AF37] text-black font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Allineamento in corso...</span>
                </>
              ) : (
                <>
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>
                    {Object.keys(customResolutions).length > 0
                      ? `Conferma Selezione (${finalItems.length})`
                      : `Conferma e Allinea (${analysis.mergedResources.length} risorse)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
