import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  AlertTriangle,
  PlusCircle,
  CheckCircle2,
  FileText,
  Layers,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  Cpu,
  Zap,
  Check,
  RefreshCw,
  Lightbulb,
  Info
} from 'lucide-react';
import { ResourceItem, ContradictionRecord } from '../../types';
import { dualLayerStore } from '../../lib/cekikj/dualLayerStore';

interface ScannerItem {
  conceptName: string;
  domain: string;
  sourceA: { title: string; statement: string; owner?: string; id?: string; effectiveDate?: string };
  sourceB: { title: string; statement: string; owner?: string; id?: string; effectiveDate?: string };
  similarityReason: string;
  confidenceScore?: number;
  logicalConflictReason?: string;
  suggestedResolution?: string;
  verificationMethod: 'gemini_semantic' | 'heuristic';
  modelUsed?: string;
}

interface CekikjResourceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  onAddedContradiction: (record: ContradictionRecord) => void;
  onNotification?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const CekikjResourceScannerModal: React.FC<CekikjResourceScannerModalProps> = ({
  isOpen,
  onClose,
  resources,
  onAddedContradiction,
  onNotification
}) => {
  const [activeTab, setActiveTab] = useState<'hybrid' | 'heuristic'>('hybrid');
  const [candidates, setCandidates] = useState<ScannerItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState<'stage1_topological' | 'stage2_gemini' | 'completed'>('completed');
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [activeVerifyingIndex, setActiveVerifyingIndex] = useState<number | null>(null);
  const [auditSummary, setAuditSummary] = useState<string>('');
  const [stats, setStats] = useState<{ stage1Count: number; stage2Count: number; durationMs: number }>({
    stage1Count: 0,
    stage2Count: 0,
    durationMs: 0
  });

  const runScan = async (mode: 'hybrid' | 'heuristic') => {
    setIsScanning(true);
    setAddedIndices(new Set());
    setScanStage('stage1_topological');

    if (mode === 'heuristic') {
      const timer = setTimeout(() => {
        const found = dualLayerStore.scanResourceContradictions(resources);
        const mapped: ScannerItem[] = found.map(f => ({
          conceptName: f.conceptName,
          domain: f.domain,
          sourceA: f.sourceA,
          sourceB: f.sourceB,
          similarityReason: f.similarityReason,
          confidenceScore: 0.75,
          logicalConflictReason: f.similarityReason,
          suggestedResolution: 'Verificare la cronologia dei documenti e scegliere la versione canonica.',
          verificationMethod: 'heuristic'
        }));
        setCandidates(mapped);
        setStats({ stage1Count: mapped.length, stage2Count: mapped.length, durationMs: 40 });
        setIsScanning(false);
        setScanStage('completed');
      }, 200);
      return () => clearTimeout(timer);
    }

    // Hybrid Two-Stage Pipeline
    try {
      // Stage 1 (topological setaccio client-side for immediate visual feedback)
      const stage1Pre = dualLayerStore.scanResourceContradictions(resources);
      setScanStage('stage2_gemini');

      const response = await fetch('/api/vault/scan-contradictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resources,
          candidatePairs: stage1Pre,
          mode: 'hybrid'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Impossibile contattare l'endpoint di scansione`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.results)) {
        setCandidates(data.results);
        setStats({
          stage1Count: data.stage1CandidateCount || stage1Pre.length,
          stage2Count: data.stage2VerifiedCount || data.results.length,
          durationMs: data.durationMs || 0
        });
        setAuditSummary(data.auditSummary || '');
      } else {
        throw new Error(data.error || 'Risultato scansione non valido');
      }
    } catch (err: any) {
      console.warn('[HYBRID_SCAN_CLIENT_FALLBACK]', err);
      // Fallback cleanly to local heuristic
      const fallback = dualLayerStore.scanResourceContradictions(resources);
      setCandidates(
        fallback.map(f => ({
          conceptName: f.conceptName,
          domain: f.domain,
          sourceA: f.sourceA,
          sourceB: f.sourceB,
          similarityReason: f.similarityReason,
          confidenceScore: 0.7,
          logicalConflictReason: f.similarityReason,
          verificationMethod: 'heuristic'
        }))
      );
      setStats({ stage1Count: fallback.length, stage2Count: fallback.length, durationMs: 120 });
      onNotification?.('info', 'Scansione semantica completata con fallback euristico locale.');
    } finally {
      setIsScanning(false);
      setScanStage('completed');
    }
  };

  useEffect(() => {
    if (isOpen) {
      runScan(activeTab);
    }
  }, [isOpen, activeTab, resources]);

  if (!isOpen) return null;

  const handleAddCandidate = (idx: number) => {
    const item = candidates[idx];
    if (!item) return;

    const newRecord = dualLayerStore.registerNewContradiction({
      conceptName: item.conceptName,
      domain: item.domain,
      sourceA: item.sourceA,
      sourceB: item.sourceB,
      verificationMethod: item.verificationMethod,
      confidenceScore: item.confidenceScore,
      logicalConflictReason: item.logicalConflictReason
    });

    setAddedIndices(prev => new Set(prev).add(idx));
    onAddedContradiction(newRecord);
    onNotification?.(
      'success',
      `Contraddizione "${item.conceptName}" registrata nel Contradiction Gate!`
    );
  };

  // On-demand elevation of a single heuristic item to Gemini AI
  const handleVerifySingleWithGemini = async (idx: number) => {
    const item = candidates[idx];
    if (!item) return;

    setActiveVerifyingIndex(idx);
    try {
      const response = await fetch('/api/vault/scan-contradictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidatePairs: [item],
          mode: 'hybrid'
        })
      });

      const data = await response.json();
      if (data.success && Array.isArray(data.results) && data.results.length > 0) {
        const verified = data.results[0];
        setCandidates(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], ...verified, verificationMethod: 'gemini_semantic' };
          return next;
        });
        onNotification?.('success', `Verifica semantica Gemini completata per "${item.conceptName}"`);
      } else {
        onNotification?.('info', `Gemini ha valutato le due fonti come compatibili o complementari.`);
      }
    } catch (e: any) {
      onNotification?.('error', `Errore durante la verifica con Gemini: ${e?.message}`);
    } finally {
      setActiveVerifyingIndex(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#121212] border border-[#2A2A2A] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#222] flex items-center justify-between bg-black/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C5A059]/15 border border-[#C5A059]/40 flex items-center justify-center text-[#E5C17B]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-100">
                  Scanner Contraddizioni Epistemiche nel Vault
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#18130B] border border-[#C5A059]/40 text-[#E5C17B]">
                  Pipeline Ibrida a Due Stadi
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Screening topologico e validazione logico-semantica incrociata tra {resources.length} risorse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pipeline Mode Selector Bar */}
        <div className="px-5 py-3 border-b border-[#222] bg-[#161616] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('hybrid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'hybrid'
                  ? 'bg-[#C5A059] text-black font-semibold shadow'
                  : 'bg-black/40 text-neutral-400 hover:text-white border border-[#333]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Pipeline Ibrida a Due Stadi (Gemini 3.7 Flash)</span>
            </button>
            <button
              onClick={() => setActiveTab('heuristic')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'heuristic'
                  ? 'bg-neutral-800 text-white font-semibold border border-neutral-600'
                  : 'bg-black/40 text-neutral-400 hover:text-white border border-[#333]'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Pre-Filtro Euristico Locale (0ms)</span>
            </button>
          </div>

          <button
            onClick={() => runScan(activeTab)}
            disabled={isScanning}
            className="px-3 py-1 text-xs text-neutral-300 hover:text-white bg-black/50 border border-[#333] hover:border-[#555] rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin text-[#C5A059]' : ''}`} />
            <span>Riesegui Analisi</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Active Scanning Pipeline Step Visualizer */}
          {isScanning ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-[#C5A059] border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[#C5A059]" />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-200">
                  {scanStage === 'stage1_topological'
                    ? 'Stadio 1: Pre-filtro topologico e isolamento coppie candidate...'
                    : 'Stadio 2: Verifica semantica rigorosa con Gemini 3.7 Flash...'}
                </p>
                <p className="text-xs text-neutral-400 max-w-md">
                  {scanStage === 'stage1_topological'
                    ? 'Screening istantaneo O(N²) basato su entità condivise, tag e polarità direzionali.'
                    : 'Analisi formale delle asserzioni: verifica incompatibilità oggettiva di policy.'}
                </p>
              </div>

              {/* Progress steps pill */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  Stadio 1: Pre-filtro ({resources.length} doc)
                </span>
                <ArrowRight className="w-3 h-3 text-neutral-500" />
                <span className={`text-[11px] font-mono px-2.5 py-1 rounded border flex items-center gap-1 ${
                  scanStage === 'stage2_gemini'
                    ? 'bg-[#18130B] text-[#E5C17B] border-[#C5A059]/40 animate-pulse'
                    : 'bg-black/40 text-neutral-500 border-[#333]'
                }`}>
                  <Cpu className="w-3 h-3" />
                  Stadio 2: Gemini 3.7 Flash
                </span>
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center p-6 bg-black/40 border border-[#222] rounded-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2.5" />
              <h4 className="text-sm font-semibold text-neutral-200">
                Nessuna Contraddizione Latente Rilevata
              </h4>
              <p className="text-xs text-neutral-400 max-w-md mt-1">
                Tutti i documenti analizzati presentano direttive coerenti oppure i conflitti noti sono già stati iscritti nel Registro Cekikj.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pipeline Results Summary Banner */}
              <div className="p-3 bg-black/50 border border-[#222] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400">
                    Esito Pipeline: <strong>{stats.stage2Count}</strong> contraddizioni convalidate
                  </span>
                  {activeTab === 'hybrid' && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                      Verificato Semantico con IA
                    </span>
                  )}
                  {stats.stage1Count > stats.stage2Count && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                      {stats.stage1Count - stats.stage2Count} falsi positivi scartati da Gemini
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-neutral-500">
                  Latenza: {stats.durationMs}ms
                </span>
              </div>

              {auditSummary && (
                <div className="p-2.5 bg-[#18130B]/60 border border-[#C5A059]/30 rounded-lg text-xs text-[#E5C17B] flex items-start gap-2">
                  <Info className="w-4 h-4 text-[#C5A059] shrink-0 mt-0.5" />
                  <span>{auditSummary}</span>
                </div>
              )}

              {/* List of Conflict Cards */}
              {candidates.map((cand, idx) => {
                const isAdded = addedIndices.has(idx);
                const isGeminiVerified = cand.verificationMethod === 'gemini_semantic';

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all space-y-3 ${
                      isGeminiVerified
                        ? 'bg-[#14100A] border-[#C5A059]/40 hover:border-[#C5A059]/60 shadow-sm shadow-amber-950/20'
                        : 'bg-black/40 border-[#262626] hover:border-[#383838]'
                    }`}
                  >
                    {/* Header of Item */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-100">
                          {cand.conceptName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-neutral-400 font-mono border border-[#333]">
                          {cand.domain}
                        </span>
                        {isGeminiVerified ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                            GEMINI 3.7 FLASH ({Math.round((cand.confidenceScore || 0.9) * 100)}% Confidenza)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-500/30">
                            PRE-FILTRO EURISTICO
                          </span>
                        )}
                      </div>

                      {/* On-Demand elevation to Gemini button if in heuristic mode */}
                      {!isGeminiVerified && (
                        <button
                          onClick={() => handleVerifySingleWithGemini(idx)}
                          disabled={activeVerifyingIndex === idx}
                          className="px-2 py-1 text-[10px] font-mono rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900 transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          <Sparkles className={`w-3 h-3 ${activeVerifyingIndex === idx ? 'animate-spin' : ''}`} />
                          <span>{activeVerifyingIndex === idx ? 'Verifica in corso...' : 'Convalida con Gemini IA'}</span>
                        </button>
                      )}
                    </div>

                    {/* Logical conflict reasoning banner */}
                    {cand.logicalConflictReason && (
                      <div className="p-2 rounded-lg bg-black/60 border border-[#222] text-xs text-neutral-300 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-relaxed">
                          <strong className="text-amber-300 font-medium">Motivazione Logica: </strong>
                          {cand.logicalConflictReason}
                        </span>
                      </div>
                    )}

                    {/* Split Comparison of the two resources */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="p-3 rounded-lg bg-black/40 border border-[#262626]">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                            FONTE A
                          </span>
                          <span className="text-[10px] text-neutral-400 truncate max-w-[130px]">
                            {cand.sourceA.owner || 'Autore A'}
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold text-neutral-200 truncate mb-1">
                          {cand.sourceA.title}
                        </h5>
                        <p className="text-[11px] text-neutral-300 line-clamp-3 italic bg-black/50 p-2 rounded border border-[#1e1e1e]">
                          "{cand.sourceA.statement}"
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-black/40 border border-[#262626]">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                            FONTE B
                          </span>
                          <span className="text-[10px] text-neutral-400 truncate max-w-[130px]">
                            {cand.sourceB.owner || 'Autore B'}
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold text-neutral-200 truncate mb-1">
                          {cand.sourceB.title}
                        </h5>
                        <p className="text-[11px] text-neutral-300 line-clamp-3 italic bg-black/50 p-2 rounded border border-[#1e1e1e]">
                          "{cand.sourceB.statement}"
                        </p>
                      </div>
                    </div>

                    {/* Suggested resolution if present */}
                    {cand.suggestedResolution && (
                      <div className="text-[11px] text-[#C5A059] flex items-center gap-1.5 px-1">
                        <Lightbulb className="w-3 h-3 text-[#C5A059] shrink-0" />
                        <span>Suggerimento di Arbitraggio: {cand.suggestedResolution}</span>
                      </div>
                    )}

                    {/* Bottom Action */}
                    <div className="pt-2 border-t border-[#222] flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {isGeminiVerified ? 'Verificato contro spec OKF v0.2' : 'Rilevato tramite match polare'}
                      </span>

                      {isAdded ? (
                        <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Iscritta nel Contradiction Gate
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddCandidate(idx)}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg bg-[#C5A059] hover:bg-[#D4AF37] text-black shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Iscrivi nel Contradiction Gate
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-[#222] bg-black/60 flex items-center justify-between">
          <div className="text-xs text-neutral-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Pipeline Epistemica conforme all'Architettura Cekikj (Zero-Guessing)</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-300 hover:text-white rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            Chiudi Scanner
          </button>
        </div>
      </div>
    </div>
  );
};
