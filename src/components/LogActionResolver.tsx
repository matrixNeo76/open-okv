import React, { useState } from "react";
import { 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Loader2, 
  X, 
  ArrowRight,
  Database,
  Download,
  RefreshCw,
  Zap,
  Info
} from "lucide-react";
import { DiagnosticLog, DiagnosticAnalysisResult, DiagnosticActionProposal } from "../types";
import { 
  analyzeDiagnosticLog, 
  executeDiagnosticAction, 
  DiagnosticActionContext, 
  ActionResult 
} from "../lib/diagnosticActions";

interface LogActionResolverProps {
  log: DiagnosticLog;
  context: DiagnosticActionContext;
  compact?: boolean;
}

export const LogActionResolver: React.FC<LogActionResolverProps> = ({
  log,
  context,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<DiagnosticAnalysisResult | null>(null);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null);

  const handleOpenAndAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    if (!analysis) {
      setIsLoading(true);
      try {
        const res = await analyzeDiagnosticLog(log, {
          isQuotaExceeded: context.isQuotaExceeded,
          totalResources: context.resources?.length,
        });
        setAnalysis(res);
      } catch (err) {
        console.error("Analysis failed:", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleExecuteAction = async (action: DiagnosticActionProposal, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutingActionId(action.id);
    setLastActionResult(null);

    try {
      const res = await executeDiagnosticAction(action.id, context);
      setLastActionResult(res);
    } catch (err: any) {
      setLastActionResult({
        success: false,
        actionId: action.id,
        message: err?.message || "Errore durante l'esecuzione",
      });
    } finally {
      setExecutingActionId(null);
    }
  };

  const getActionIcon = (id: string) => {
    switch (id) {
      case "RESET_OFFLINE_LOCK":
        return <RefreshCw className="w-3.5 h-3.5" />;
      case "FORCE_SERVER_BACKUP":
        return <Database className="w-3.5 h-3.5" />;
      case "TEST_CONNECTIVITY":
        return <Zap className="w-3.5 h-3.5" />;
      case "EXPORT_EMERGENCY_JSON":
        return <Download className="w-3.5 h-3.5" />;
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
      case "high":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-950/60 border border-rose-800/80 text-rose-300 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Rischio Alto
          </span>
        );
      case "medium":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-950/60 border border-amber-800/80 text-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Rischio Medio
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Rischio Basso
          </span>
        );
    }
  };

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      {/* Trigger Button */}
      <button
        onClick={handleOpenAndAnalyze}
        className={`inline-flex items-center gap-1.5 rounded-md font-mono transition-all shrink-0 cursor-pointer ${
          isOpen
            ? "bg-[#C5A059] text-black font-semibold shadow-sm"
            : log.level === "error"
            ? "bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 hover:border-rose-700"
            : log.level === "warn"
            ? "bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 hover:border-amber-700"
            : "bg-[#18130B] hover:bg-[#251D10] text-[#D5B069] border border-[#3E3017] hover:border-[#C5A059]/60"
        } ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
        title="Analizza questo evento e proponi azioni di auto-risoluzione con Gemini AI"
      >
        <Sparkles className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} ${isOpen ? "text-black" : "text-[#C5A059]"}`} />
        <span>{compact ? "AI Azione" : "Risolvi con AI"}</span>
      </button>

      {/* Expanded Resolution Card */}
      {isOpen && (
        <div className="mt-2 w-full max-w-lg bg-[#110E09] border border-[#2F2414] rounded-xl p-3.5 shadow-2xl space-y-3 font-sans text-left animate-fade-in z-20">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[#221B0F] pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 rounded bg-[#C5A059]/15 text-[#C5A059] border border-[#C5A059]/30 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-white truncate">
                Assistente Diagnostico Knowledge Vault
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {analysis && getSeverityBadge(analysis.severity)}
              <button
                onClick={() => setIsOpen(false)}
                className="text-[#777] hover:text-white p-1 rounded hover:bg-[#1C160E] transition-colors"
                title="Chiudi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          {isLoading ? (
            <div className="py-6 flex flex-col items-center justify-center text-center gap-2">
              <Loader2 className="w-5 h-5 text-[#C5A059] animate-spin" />
              <p className="text-xs text-[#AAA]">Analisi del messaggio con Gemini 3.7 & regole OKF...</p>
            </div>
          ) : analysis ? (
            <div className="space-y-3">
              {/* Explanation in plain human Italian */}
              <div className="bg-[#18130B] border border-[#2B2010] rounded-lg p-3 text-xs leading-relaxed text-[#DDD]">
                {analysis.explanation}
              </div>

              {/* Data Safety Note */}
              <div className="flex items-start gap-2 bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-2.5 text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{analysis.dataSafetyNote}</span>
              </div>

              {/* Action Buttons List */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-mono text-[#888] uppercase tracking-wider flex items-center justify-between">
                  <span>Azioni Consigliate</span>
                  <span className="text-[10px] text-[#666]">
                    Fonte: {analysis.source === "gemini" ? "Gemini 3.7 Flash" : "Euristica Locale"}
                  </span>
                </div>

                {analysis.suggestedActions.map((action) => {
                  const isExecuting = executingActionId === action.id;
                  const wasThisAction = lastActionResult?.actionId === action.id;

                  return (
                    <div 
                      key={action.id}
                      className={`p-2.5 rounded-lg border transition-all ${
                        action.isPrimary
                          ? "bg-[#1E170C] border-[#C5A059]/40 hover:border-[#C5A059]"
                          : "bg-[#14100A] border-[#291F0F] hover:border-[#3D2E16]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={action.isPrimary ? "text-[#C5A059]" : "text-[#AAA]"}>
                              {getActionIcon(action.id)}
                            </span>
                            <span className="text-xs font-medium text-white">
                              {action.label}
                            </span>
                            {action.isPrimary && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#C5A059]/20 text-[#D5B069] border border-[#C5A059]/30">
                                Primaria
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#888] mt-0.5 leading-tight">
                            {action.description}
                          </p>
                        </div>

                        <button
                          disabled={!!executingActionId}
                          onClick={(e) => handleExecuteAction(action, e)}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                            action.isPrimary
                              ? "bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold shadow-sm"
                              : "bg-[#221B0F] hover:bg-[#2F2414] text-white border border-[#3E3017]"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {isExecuting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Eseguo...</span>
                            </>
                          ) : (
                            <>
                              <span>Applica</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>

                      {/* Result feedback for this action */}
                      {wasThisAction && lastActionResult && (
                        <div className={`mt-2 pt-2 border-t text-[11px] flex items-center gap-1.5 ${
                          lastActionResult.success 
                            ? "border-emerald-900/50 text-emerald-300" 
                            : "border-rose-900/50 text-rose-300"
                        }`}>
                          {lastActionResult.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{lastActionResult.message}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-[#777]">
              Impossibile recuperare la diagnosi.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
