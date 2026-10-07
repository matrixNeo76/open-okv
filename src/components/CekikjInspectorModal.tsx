import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  Search,
  BookOpen,
  ArrowRight,
  GitCommit,
  Copy,
  Clock,
  ExternalLink,
  FlaskConical,
  Check,
  XCircle,
  HelpCircle,
  Scale,
  Unlock,
  Lock,
  FileCheck,
  Plus,
  ScanSearch,
  Download
} from "lucide-react";
import { executeBoundedCekikjLoop } from "../lib/cekikj/boundedEngine";
import { dualLayerStore } from "../lib/cekikj/dualLayerStore";
import { runCekikjValidationSuite, ValidationSuiteReport } from "../lib/cekikj/testRunner";
import { CekikjEngineResult, ContradictionRecord, ResourceItem } from "../types";
import { CekikjDecisionDag } from "./cekikj/CekikjDecisionDag";
import { CekikjSplitViewConflict } from "./cekikj/CekikjSplitViewConflict";
import { CekikjClaimInspector } from "./cekikj/CekikjClaimInspector";
import { CekikjNewContradictionModal } from "./cekikj/CekikjNewContradictionModal";
import { CekikjResourceScannerModal } from "./cekikj/CekikjResourceScannerModal";
import { downloadCekikjAuditFile } from "../lib/cekikj/auditExporter";

interface CekikjInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotification?: (typeOrMsg: "success" | "error" | "info" | string, maybeMsg?: string) => void;
  resources?: ResourceItem[];
}

export const CekikjInspectorModal: React.FC<CekikjInspectorModalProps> = ({
  isOpen,
  onClose,
  onNotification,
  resources = []
}) => {
  const [activeTab, setActiveTab] = useState<"runner" | "registry" | "tests" | "guide" | "spec">("runner");
  const [queryInput, setQueryInput] = useState("Qual è la regola per la memorizzazione e sicurezza delle API Key?");
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CekikjEngineResult | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Registry mitigation state
  const [registryRevision, setRegistryRevision] = useState(0);
  const [isNewContradictionOpen, setIsNewContradictionOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Test suite state
  const [testReport, setTestReport] = useState<ValidationSuiteReport | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  // Unified notify helper supporting both (msg) and (type, msg)
  const notify = (type: "success" | "error" | "info", msg: string) => {
    if (!onNotification) return;
    try {
      (onNotification as any)(type, msg);
    } catch {
      (onNotification as any)(msg);
    }
  };

  if (!isOpen) return null;

  // Reactively re-read when registryRevision changes
  const allContradictions: ContradictionRecord[] = dualLayerStore.getAllContradictions();
  const openConflictsCount = allContradictions.filter(c => c.status === 'open').length;
  const resolvedConflictsCount = allContradictions.filter(c => c.status === 'resolved').length;

  const handleRunQuery = async (customQuery?: string) => {
    const q = customQuery || queryInput;
    if (!q.trim()) return;

    setIsRunning(true);
    try {
      const res = await executeBoundedCekikjLoop(q);
      setLastResult(res);
      if (res.status === 'REFUSAL_CONTRADICTION') {
        notify("info", "Contradiction Gate: sintesi bloccata su conflitto documentato.");
      } else if (res.status === 'INSUFFICIENT_KNOWLEDGE') {
        notify("info", "Zero-Guessing: dati insufficienti per comporre una risposta.");
      } else {
        notify("success", `Esecuzione completata in ${res.trace.totalDurationMs}ms (${res.trace.roundsCount}/8 round).`);
      }
    } catch (err: any) {
      notify("error", `Errore durante il ciclo epistemico: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleResolveConflict = (conflictId: string, notes: string, resolvedBy?: string, chosenSource?: string) => {
    dualLayerStore.resolveContradiction(conflictId, notes, resolvedBy || "Architetto del Vault (Utente)", chosenSource);
    setRegistryRevision(prev => prev + 1);
    notify("success", "Contraddizione mitigata e risolta! Il Contradiction Gate è ora sbloccato per questo argomento.");
  };

  const handleReopenConflict = (conflictId: string) => {
    dualLayerStore.reopenContradiction(conflictId);
    setRegistryRevision(prev => prev + 1);
    notify("info", "Conflitto riaperto. Il Contradiction Gate tornerà a bloccare le sintesi arbitrarie su questo tema.");
  };

  const handleDeleteConflict = (conflictId: string) => {
    dualLayerStore.deleteContradiction(conflictId);
    setRegistryRevision(prev => prev + 1);
    notify("info", "Contraddizione rimossa definitivamente dal registro.");
  };

  const handleTestConflictQuery = (conceptName: string) => {
    let q = `Qual è la regola per ${conceptName}?`;
    if (conceptName.toLowerCase().includes("api")) {
      q = "Qual è la regola per la memorizzazione e sicurezza delle API Key?";
    } else if (conceptName.toLowerCase().includes("okf") || conceptName.toLowerCase().includes("domain")) {
      q = "Qual è il formato corretto per il campo domain e le entità in OKF?";
    } else if (conceptName.toLowerCase().includes("cache") || conceptName.toLowerCase().includes("storage")) {
      q = "Qual è la strategia di memorizzazione e caching delle risorse nel Vault?";
    }
    setQueryInput(q);
    setActiveTab("runner");
    setTimeout(() => {
      handleRunQuery(q);
    }, 150);
  };

  const handleRunTestSuite = async () => {
    setIsRunningTests(true);
    try {
      const report = await runCekikjValidationSuite();
      setTestReport(report);
      if (report.allPassed) {
        onNotification?.("success", `Tutti i ${report.totalTests} test epistemici sono stati superati con successo!`);
      } else {
        onNotification?.("error", `${report.failedTests} test epistemici non hanno superato i criteri.`);
      }
    } catch (err: any) {
      onNotification?.("error", `Errore nella suite di test: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  const copyAnswer = () => {
    if (!lastResult) return;
    navigator.clipboard.writeText(lastResult.answerText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
    onNotification?.("info", "Risposta copiata negli appunti");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <div 
        id="cekikj-inspector-modal"
        className="relative w-full max-w-5xl bg-[#0D0D0D] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-neutral-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222] bg-[#121212]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#C5A059]/15 border border-[#C5A059]/30 text-[#C5A059]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-wide text-neutral-100">
                  Motore Epistemico Cekikj (Zero-Guessing Layer)
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#C5A059]/20 text-[#E5C17B] border border-[#C5A059]/40">
                  Hard Bounds & Contradiction Gate
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Architettura Cekikj • Typed Tools (8) • Gate Esterno • Grounding Check
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#1A1A1A] p-1 rounded-lg border border-[#2E2E2E]">
              <button
                type="button"
                onClick={() => setActiveTab("runner")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "runner"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Trace & Console
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("registry")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "registry"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <span>Registro Contraddizioni</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  openConflictsCount > 0 ? "bg-[#DC2626]/40 text-[#FCA5A5]" : "bg-[#10B981]/30 text-[#A7F3D0]"
                }`}>
                  {openConflictsCount} aperti
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("guide")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "guide"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                <span>Come Usarlo</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tests")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "tests"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <FlaskConical className="w-3 h-3" />
                <span>Test Suite</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("spec")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "spec"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                I 5 Pilastri
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#222] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {activeTab === "runner" && (
            <div className="space-y-6">
              {/* Query & Presets */}
              <div className="space-y-3 bg-[#141414] p-4 rounded-xl border border-[#222]">
                <label className="text-xs font-mono uppercase tracking-wider text-[#C5A059] flex items-center justify-between">
                  <span>Prompt di Interrogazione Epistemica</span>
                  <span className="text-[11px] text-neutral-400 lowercase font-sans">
                    Rifiuta di indovinare in assenza di evidenza certa
                  </span>
                </label>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="Poni una domanda tecnica o testa un conflitto noto..."
                      className="w-full pl-9 pr-4 py-2 bg-[#0A0A0A] border border-[#2E2E2E] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#C5A059]"
                      onKeyDown={(e) => e.key === "Enter" && handleRunQuery()}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRunQuery()}
                    disabled={isRunning}
                    className="px-4 py-2 bg-[#C5A059] hover:bg-[#D4AF37] disabled:opacity-50 text-black font-semibold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {isRunning ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifica in corso...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Esegui Bounded Loop</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Preset Buttons for Quick Testing */}
                <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-neutral-400 font-mono text-[11px]">Test Suite Immediata:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const q = "Qual è la regola per la memorizzazione e sicurezza delle API Key?";
                      setQueryInput(q);
                      handleRunQuery(q);
                    }}
                    className="px-2.5 py-1 rounded bg-[#221A0F] text-[#F97316] border border-[#F97316]/30 hover:bg-[#F97316]/20 transition-colors"
                  >
                    ⚡ Refusal Test (Conflitto API Key)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const q = "Cosa prescrive lo standard Open Knowledge Format OKF?";
                      setQueryInput(q);
                      handleRunQuery(q);
                    }}
                    className="px-2.5 py-1 rounded bg-[#102018] text-[#34D399] border border-[#34D399]/30 hover:bg-[#34D399]/20 transition-colors"
                  >
                    📘 Concetto Verificato (OKF Spec)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const q = "Come si configura il cluster Quantum Fusion Vault 9.9?";
                      setQueryInput(q);
                      handleRunQuery(q);
                    }}
                    className="px-2.5 py-1 rounded bg-[#1A1A1A] text-neutral-300 border border-[#333] hover:bg-[#252525] transition-colors"
                  >
                    🚫 Insufficient Data (Zero-Guessing)
                  </button>
                </div>
              </div>

              {/* Epistemic Decision DAG Pipeline */}
              <CekikjDecisionDag isRunning={isRunning} result={lastResult} />

              {/* Execution Results */}
              {lastResult && (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                    lastResult.status === 'REFUSAL_CONTRADICTION'
                      ? 'bg-[#26120D] border-[#DC2626]/50 text-red-200'
                      : lastResult.status === 'INSUFFICIENT_KNOWLEDGE'
                      ? 'bg-[#1C1A0E] border-[#FBBF24]/40 text-amber-200'
                      : 'bg-[#0E1E14] border-[#10B981]/40 text-emerald-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {lastResult.status === 'REFUSAL_CONTRADICTION' ? (
                        <ShieldAlert className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
                      ) : lastResult.status === 'INSUFFICIENT_KNOWLEDGE' ? (
                        <AlertTriangle className="w-5 h-5 text-[#FBBF24] shrink-0 mt-0.5" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span>
                            {lastResult.status === 'REFUSAL_CONTRADICTION' && "Contradiction Gate: Rifiuto di Sintesi Eseguito"}
                            {lastResult.status === 'INSUFFICIENT_KNOWLEDGE' && "Dati Insufficienti (Zero-Guessing Attivo)"}
                            {lastResult.status === 'SUCCESS' && "Risposta Verificata con Grounding Superato"}
                            {lastResult.status === 'BOUNDS_EXCEEDED_PARTIAL' && "Hard Bounds Scattati: Risposta su Dati Parziali"}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-current">
                            Status: {lastResult.status}
                          </span>
                        </div>
                        <p className="text-xs opacity-85 mt-1">
                          {lastResult.status === 'REFUSAL_CONTRADICTION' &&
                            "Rilevata collisione tra policy attive. Il sistema ha bloccato la composizione libera per impedire iterated guessing."}
                          {lastResult.status === 'INSUFFICIENT_KNOWLEDGE' &&
                            "Nessun chunk o nodo ontologico corrispondente trovato. Dichiarato insufficient: true."}
                          {lastResult.status === 'SUCCESS' &&
                            "Tutti i claim atomici mappano a evidenze o relazioni verificate nella trace."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          downloadCekikjAuditFile(lastResult, allContradictions);
                          notify("success", "Dossier di Audit Epistemico (.md) scaricato con successo!");
                        }}
                        className="px-3 py-1.5 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Esporta dossier completo di audit in Markdown"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Scarica Audit (.md)</span>
                      </button>

                      <button
                        type="button"
                        onClick={copyAnswer}
                        className="px-3 py-1.5 rounded bg-black/40 hover:bg-black/60 border border-current text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedText ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedText ? "Copiato" : "Copia Output"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Hard Bounds Metrics Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Rounds di Tool-Call</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {lastResult.trace.roundsCount} <span className="text-xs text-neutral-500 font-normal">/ {lastResult.trace.maxRoundsLimit} max</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Tempo Wall-Clock</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {lastResult.trace.totalDurationMs} <span className="text-xs text-neutral-500 font-normal">ms</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Grounding Score</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {Math.round(lastResult.groundingReport.groundingScore * 100)}%
                        <span className="text-xs text-neutral-500 font-normal ml-1">
                          ({lastResult.groundingReport.verifiedClaimsCount}/{lastResult.groundingReport.totalClaims})
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Archi & Nodi Esplorati</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {lastResult.entities.length} <span className="text-xs text-neutral-500 font-normal">nodi, {lastResult.traversedEdges.length} archi</span>
                      </div>
                    </div>
                  </div>

                  {/* Output Text */}
                  <div className="p-4 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-2">
                    <div className="text-xs font-mono uppercase text-[#C5A059] flex items-center justify-between">
                      <span>Testo di Risposta Composto dal Compositore</span>
                      <span className="text-[10px] text-neutral-500">Out-of-Loop Protected</span>
                    </div>
                    <pre className="text-xs font-mono leading-relaxed text-neutral-200 whitespace-pre-wrap max-h-60 overflow-y-auto bg-black/50 p-3 rounded-lg border border-[#1F1F1F]">
                      {lastResult.answerText}
                    </pre>
                  </div>

                  {/* Atomic Claims Inspector (Zero-Guessing Assertions) */}
                  <CekikjClaimInspector result={lastResult} />

                  {/* Tool Call Trace Timeline */}
                  <div className="p-4 rounded-xl bg-[#141414] border border-[#222] space-y-3">
                    <div className="text-xs font-mono uppercase text-neutral-400 flex items-center justify-between">
                      <span>Trace Sequenziale di Esecuzione Tool (FSM)</span>
                      <span className="text-[10px] text-neutral-500">{lastResult.trace.toolCalls.length} invocazioni</span>
                    </div>

                    <div className="space-y-2">
                      {lastResult.trace.toolCalls.map((step, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-[#0A0A0A] border border-[#1E1E1E] flex items-center justify-between gap-4 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#222] text-neutral-300 flex items-center justify-center text-[10px]">
                              {step.round}
                            </span>
                            <span className="font-semibold text-[#C5A059]">{step.tool}()</span>
                            <span className="text-neutral-400 truncate max-w-xs">{step.resultSummary}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {step.insufficient ? (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-[#EF4444]/20 text-[#F87171] border border-[#EF4444]/40">
                                insufficient: true
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/40">
                                ok
                              </span>
                            )}
                            <span className="text-neutral-500 text-[10px]">{step.executionMs}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "registry" && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#141414] p-4 rounded-xl border border-[#222]">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#C5A059]" />
                    <span>Registro Ufficiale delle Contraddizioni & Mitigazione (Split-View)</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Quando due documenti esprimono policy o direttive opposte, il Gate blocca l'AI finché non mitighi il conflitto decidendo la fonte canonica.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#DC2626]/20 text-[#FCA5A5] border border-[#DC2626]/30">
                    {openConflictsCount} Aperti
                  </span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#10B981]/20 text-[#A7F3D0] border border-[#10B981]/30">
                    {resolvedConflictsCount} Risolti
                  </span>

                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Scansiona le risorse del Vault per conflitti semantici"
                  >
                    <ScanSearch className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Scansiona Vault</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsNewContradictionOpen(true)}
                    className="px-3 py-1 rounded bg-[#C5A059] hover:bg-[#D4AF37] text-black text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nuova Contraddizione</span>
                  </button>
                </div>
              </div>

              {/* Explanatory Banner for Mitigation */}
              <div className="p-3.5 rounded-xl bg-[#0D1612] border border-[#10B981]/30 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-emerald-300">
                    Come Funziona la Mitigazione e Arbitraggio Split-View
                  </div>
                  <p className="text-neutral-300 leading-relaxed">
                    Usa il confronto affiancato <strong>(Split-View)</strong> per comparare le due asserzioni contrapposte, i rispettivi proprietari e la decorrenza bitemporale.
                    Clicca su <strong>"Adotta come Canone"</strong> per risolvere in 1 clic la policy, oppure digita una nota personalizzata. Non appena lo stato diventa <strong>RESOLVED</strong>, il Contradiction Gate si sblocca!
                  </p>
                </div>
              </div>

              {/* Contradiction Cards with Split View */}
              <div className="space-y-4">
                {allContradictions.length === 0 ? (
                  <div className="p-8 text-center bg-[#111] rounded-xl border border-[#222] space-y-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <div className="text-sm font-semibold text-neutral-200">
                      Nessuna contraddizione nel registro
                    </div>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto">
                      Tutte le policy sono allineate o non sono stati rilevati conflitti documentali. Puoi registrare manualmente un conflitto o scansionare il Vault.
                    </p>
                    <div className="flex justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsScannerOpen(true)}
                        className="px-3 py-1.5 rounded bg-slate-800 text-xs font-mono text-slate-200 hover:bg-slate-700"
                      >
                        Scansiona Risorse
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsNewContradictionOpen(true)}
                        className="px-3 py-1.5 rounded bg-[#C5A059] text-xs font-semibold text-black hover:bg-[#D4AF37]"
                      >
                        + Aggiungi Conflitto
                      </button>
                    </div>
                  </div>
                ) : (
                  allContradictions.map((conflict) => (
                    <CekikjSplitViewConflict
                      key={conflict.id}
                      conflict={conflict}
                      onResolve={handleResolveConflict}
                      onReopen={handleReopenConflict}
                      onDelete={handleDeleteConflict}
                      onTestInRunner={handleTestConflictQuery}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: USER GUIDE (COME USARLO) */}
          {activeTab === "guide" && (
            <div className="space-y-5">
              <div className="bg-[#141414] p-5 rounded-xl border border-[#222] space-y-4">
                <div className="flex items-center gap-3 border-b border-[#222] pb-3">
                  <div className="p-2 rounded-lg bg-[#C5A059]/20 text-[#C5A059]">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Guida Pratica: Cos'è il Zero-Guessing e Come Mitigare le Contraddizioni
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Il manuale rapido per comprendere il valore epistemico nel lavoro di ogni giorno.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#222] space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C5A059] font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#C5A059]/20 flex items-center justify-center font-mono text-[11px]">1</span>
                      <span>Il Problema dei Modelli AI</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Se un modello di linguaggio standard trova due documenti aziendali che dicono cose opposte, oppure se gli fai una domanda su qualcosa che non è presente nel vault, <strong>tira a indovinare</strong> (guessing). Genera una risposta allucinata o sceglie a caso una fonte, inducendo errori critici.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#222] space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C5A059] font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#C5A059]/20 flex items-center justify-center font-mono text-[11px]">2</span>
                      <span>Il Zero-Guessing Layer</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Il motore Cekikj adotta un principio radicale: <strong>meglio rifiutarsi che mentire</strong>.
                      Se i dati mancano risponde con <code>insufficient: true</code>. Se c'è una contraddizione aperta tra due policy, il <strong>Contradiction Gate</strong> intercetta la richiesta ed espone il contrasto senza inventare nulla.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#222] space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C5A059] font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#C5A059]/20 flex items-center justify-center font-mono text-[11px]">3</span>
                      <span>Come Risolverle (Mitigazione)</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Nel <strong>Registro Contraddizioni</strong> vedi l'elenco dei conflitti aperti. Clicchi su <strong>"Arbitra / Mitiga"</strong>, indichi quale fonte è la regola ufficiale e registri la policy. Il Gate passa a <strong>RESOLVED</strong> e l'agente ricomincia a rispondere seguendo la norma vincente!
                    </p>
                  </div>
                </div>

                {/* Practical Step-by-Step Exercise */}
                <div className="p-4 rounded-xl bg-[#12161A] border border-[#38BDF8]/30 space-y-3">
                  <span className="text-xs font-semibold text-[#38BDF8] uppercase font-mono tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Esperimento Pratico da Provare Adesso</span>
                  </span>
                  <ol className="list-decimal list-inside text-xs text-neutral-200 space-y-2 leading-relaxed">
                    <li>
                      <strong>Passo 1</strong>: Vai nella tab <em>Trace & Console</em> e premi il pulsante arancione <strong>"Conflitto API Key"</strong>. Vedrai il Gate rifiutare la risposta ed esporti le due policy discordanti (VITE client vs Express server).
                    </li>
                    <li>
                      <strong>Passo 2</strong>: Spostati nella tab <em>Registro Contraddizioni</em>. Troverai la card rossa <strong>"API Key Security Policy"</strong>. Clicca su <strong>"Arbitra / Mitiga"</strong>, scegli la fonte <em>RFC-004 Server-Side</em> e clicca <em>Salva Risoluzione</em>. La card diventerà verde (RESOLVED).
                    </li>
                    <li>
                      <strong>Passo 3</strong>: Clicca <strong>"Testa nel Runner"</strong> sulla card appena risolta. Noterai che ora il Gate lascia passare la richiesta e l'AI sintetizza con successo la risposta canonica con ancoraggio al 100%!
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {activeTab === "tests" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between bg-[#141414] p-4 rounded-xl border border-[#222]">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-[#C5A059]" />
                    <span>Suite di Certificazione Epistemica (Refusal & Grounding Tests)</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Verifica automatizzata dei 5 requisiti formali: Refusal Gate, Flag Insufficient, Hard Bounds, Bitemporalità, Grounding.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunTestSuite}
                  disabled={isRunningTests}
                  className="px-4 py-2 bg-[#C5A059] hover:bg-[#D4AF37] disabled:opacity-50 text-black font-semibold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {isRunningTests ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Esecuzione in corso...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Esegui i 5 Test di Conformità</span>
                    </>
                  )}
                </button>
              </div>

              {testReport && (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    testReport.allPassed 
                      ? 'bg-[#0E1E14] border-[#10B981]/40 text-emerald-200' 
                      : 'bg-[#26120D] border-[#DC2626]/40 text-red-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {testReport.allPassed ? (
                        <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
                      ) : (
                        <XCircle className="w-5 h-5 text-[#EF4444]" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">
                          {testReport.allPassed 
                            ? 'Certificazione Epistemica Superata (100% Pass)' 
                            : `${testReport.failedTests} Fallimenti Rilevati`}
                        </div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {testReport.passedTests}/{testReport.totalTests} test completati con successo in osservanza della specifica Cekikj.
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-mono px-3 py-1 rounded bg-black/40 border border-current">
                      {testReport.allPassed ? 'CEKIKJ-COMPLIANT' : 'NON-COMPLIANT'}
                    </span>
                  </div>

                  {/* Test Cards List */}
                  <div className="space-y-2.5">
                    {testReport.results.map((test) => (
                      <div
                        key={test.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          test.passed
                            ? 'bg-[#0C140F] border-[#163623]'
                            : 'bg-[#180C0A] border-[#3B1512]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-1 rounded mt-0.5 ${
                              test.passed ? 'bg-[#10B981]/20 text-[#34D399]' : 'bg-[#EF4444]/20 text-[#F87171]'
                            }`}>
                              {test.passed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-200 text-xs">{test.name}</span>
                                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#1C1C1C] text-neutral-400">
                                  {test.pillar}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-400 mt-1 font-mono leading-relaxed">
                                {test.details}
                              </p>
                            </div>
                          </div>

                          <span className="text-[11px] font-mono text-neutral-500 shrink-0">
                            {test.durationMs}ms
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "spec" && (
            <div className="space-y-4 max-w-3xl">
              <h3 className="text-sm font-semibold text-neutral-200">
                I 5 Pilastri di Conformità Architetturale Cekikj
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    <span>1. Dual-Layer Knowledge (Evidence ◄► Ontology)</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Nessun retrieval opera solo su vettori o chunk grezzi isolati. Ogni evidenza testuale è ancorata a entità e concetti risolti con relazioni tipizzate.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    <span>2. Suite degli 8 Typed Tools con Flag Insufficient</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    search_evidence, search_knowledge, resolve_entity, traverse, timeline, diff, list_contradictions, get_source. Nessuna chiamata a testo libero senza schema rigido.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>3. Bitemporalità & Intervalli di Vigenza</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Tracciamento esplicito delle date di validità (valid_from / valid_to). Il sistema risponde a "cosa valeva alla data X" senza confondere versioni storiche con lo stato attuale.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>4. The Contradiction Gate (Governance Out-of-Loop)</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Il gate vive fuori dal loop di reasoning. Se due policy collidono, il compositore a valle blocca la risposta arbitraria ed espone entrambe le fonti con owner e date.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <GitCommit className="w-4 h-4" />
                    <span>5. Hard Bounds & Grounding Verificato</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Massimo 8 round di tool call, massimo 2 hop nel grafo, timeout wall-clock. Singola passata di verifica claim post-sintesi con rimozione di claim non provati.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#222] bg-[#121212] text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Gate Active</span>
            </span>
            <span>•</span>
            <span>Max Rounds: 8</span>
            <span>•</span>
            <span>Max Hops: 2</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[#222] hover:bg-[#333] text-neutral-200 text-xs font-sans transition-colors cursor-pointer"
          >
            Chiudi Console
          </button>
        </div>
      </div>

      {/* Manual New Contradiction Registration Modal */}
      <CekikjNewContradictionModal
        isOpen={isNewContradictionOpen}
        onClose={() => setIsNewContradictionOpen(false)}
        onCreated={(newRecord) => {
          setRegistryRevision(p => p + 1);
          notify("success", `Contraddizione "${newRecord.conceptName}" registrata nel Vault!`);
        }}
      />

      {/* Vault Resources Heuristic Conflict Scanner Modal */}
      <CekikjResourceScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        resources={resources}
        onAddedContradiction={(newRecord) => {
          setRegistryRevision(p => p + 1);
          notify("success", `Rilevata e registrata nel Vault: "${newRecord.conceptName}"`);
        }}
      />
    </div>
  );
};
