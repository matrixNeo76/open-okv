import React, { useState } from 'react';
import {
  Search,
  Cpu,
  Layers,
  ShieldAlert,
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  Info,
  XCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { CekikjEngineResult } from '../../types';

interface CekikjDecisionDagProps {
  isRunning: boolean;
  result: CekikjEngineResult | null;
}

interface DagStep {
  id: string;
  number: string;
  name: string;
  category: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  getStatus: (isRunning: boolean, result: CekikjEngineResult | null) => {
    state: 'idle' | 'running' | 'success' | 'blocked' | 'insufficient';
    label: string;
    details?: string;
  };
}

const DAG_STEPS: DagStep[] = [
  {
    id: 'ingestion',
    number: '01',
    name: 'Query Ingestion',
    category: 'Input Normalizer',
    description: 'Sanitizzazione stringa, token budget check e mapping entità semantiche.',
    icon: Search,
    getStatus: (running, res) => {
      if (running) return { state: 'running', label: 'Analisi...', details: 'Parsing intent e filtri ontologici' };
      if (!res) return { state: 'idle', label: 'Pronto' };
      return { state: 'success', label: 'Completato', details: `Target: "${res.query.slice(0, 30)}..."` };
    }
  },
  {
    id: 'fsm_dispatch',
    number: '02',
    name: 'Typed Tools FSM',
    category: 'Hard Bounds Loop',
    description: 'Suite di 8 strumenti formali in sola lettura con limite rigido di max 8 round.',
    icon: Cpu,
    getStatus: (running, res) => {
      if (running) return { state: 'running', label: 'Esecuzione FSM...', details: 'Invocazione tool tipizzati' };
      if (!res) return { state: 'idle', label: 'Pronto' };
      return {
        state: 'success',
        label: `${res.trace.roundsCount}/8 Round`,
        details: `${res.trace.toolCalls.length} tool calls eseguite`
      };
    }
  },
  {
    id: 'dual_layer',
    number: '03',
    name: 'Dual-Layer Retrieval',
    category: 'Persistent Storage',
    description: 'Incrocio simultaneo tra Evidence Chunks testuali e Ontologia concettuale.',
    icon: Layers,
    getStatus: (running, res) => {
      if (running) return { state: 'running', label: 'Query Store...', details: 'Chunks + Relazioni ontologiche' };
      if (!res) return { state: 'idle', label: 'Pronto' };
      return {
        state: 'success',
        label: `${res.evidenceItems?.length || 0} Chunks`,
        details: `${res.entities?.length || 0} entità analizzate`
      };
    }
  },
  {
    id: 'contradiction_gate',
    number: '04',
    name: 'Contradiction Gate',
    category: 'Safety Decoupled Gate',
    description: 'Audit del Registro delle Contraddizioni: rifiuto categorico su conflitti aperti.',
    icon: ShieldAlert,
    getStatus: (running, res) => {
      if (running) return { state: 'running', label: 'Verifica Conflitti...', details: 'Scansione registro contraddizioni' };
      if (!res) return { state: 'idle', label: 'Pronto' };
      if (res.status === 'REFUSAL_CONTRADICTION') {
        const conflict = res.gateEvaluation?.conflictsDetected?.[0];
        return {
          state: 'blocked',
          label: 'BLOCCATO',
          details: `Rilevata contraddizione aperta: ${conflict?.conceptName || 'Politica contesa'}`
        };
      }
      return { state: 'success', label: 'Nessun Conflitto', details: 'Gate approvato (conflitto mitigato o assente)' };
    }
  },
  {
    id: 'grounding_verifier',
    number: '05',
    name: 'Grounding Verifier',
    category: 'Zero-Guessing Guard',
    description: 'Verifica rigorosa di ancoraggio a singola passata contro i chunk del Vault.',
    icon: ShieldCheck,
    getStatus: (running, res) => {
      if (running) return { state: 'running', label: 'Audit Prove...', details: 'Calcolo ratio ancoraggio claim' };
      if (!res) return { state: 'idle', label: 'Pronto' };
      if (res.status === 'INSUFFICIENT_KNOWLEDGE') {
        return { state: 'insufficient', label: 'INSUFFICIENTE', details: 'Dati nel Vault non sufficienti per comporre la risposta' };
      }
      if (res.status === 'REFUSAL_CONTRADICTION') {
        return { state: 'idle', label: 'Bypassato', details: 'Fermato a monte dal Contradiction Gate' };
      }
      const score = res.groundingReport?.groundingScore ?? 1;
      const count = res.groundingReport?.verifiedClaimsCount ?? 0;
      return {
        state: 'success',
        label: `${Math.round(score * 100)}% Grounded`,
        details: `${count} claim verificati formalmente`
      };
    }
  },
  {
    id: 'out_of_loop',
    number: '06',
    name: 'Compositore Out-of-Loop',
    category: 'Deterministic Output',
    description: 'Composizione finale isolata fuori dal ciclo generativo per prevenire allucinazioni.',
    icon: FileCheck,
    getStatus: (running, res) => {
      if (running) return { state: 'running', label: 'Sintesi...', details: 'Generazione deterministica' };
      if (!res) return { state: 'idle', label: 'Pronto' };
      if (res.status === 'REFUSAL_CONTRADICTION') return { state: 'blocked', label: 'Rifiuto Epistemico' };
      if (res.status === 'INSUFFICIENT_KNOWLEDGE') return { state: 'insufficient', label: 'Dichiarazione Insufficienza' };
      return { state: 'success', label: 'Output Verificato', details: `${res.answerText?.length || 0} caratteri` };
    }
  }
];

export const CekikjDecisionDag: React.FC<CekikjDecisionDagProps> = ({ isRunning, result }) => {
  const [selectedStep, setSelectedStep] = useState<DagStep | null>(null);

  return (
    <div id="cekikj-decision-dag" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-inner">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Cekikj Epistemic Decision DAG (Pipeline a 6 Fasi)
          </span>
        </div>
        {result && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {result.trace.totalDurationMs}ms
            </span>
            <span className="font-mono text-slate-500">•</span>
            <span className="font-mono font-medium text-slate-300">
              {result.status === 'SUCCESS' && (
                <span className="text-emerald-400 font-semibold">100% Zero-Guessing Grounded</span>
              )}
              {result.status === 'REFUSAL_CONTRADICTION' && (
                <span className="text-rose-400 font-semibold">Bloccato da Contradiction Gate</span>
              )}
              {result.status === 'INSUFFICIENT_KNOWLEDGE' && (
                <span className="text-amber-400 font-semibold">Evidenze Insufficienti</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* DAG Stage Grid / Track */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 relative">
        {DAG_STEPS.map((step, idx) => {
          const status = step.getStatus(isRunning, result);
          const Icon = step.icon;

          let badgeColor = 'border-slate-800 bg-slate-950/60 text-slate-400';
          let iconBg = 'bg-slate-800 text-slate-400';
          let statusDot = 'bg-slate-600';

          if (status.state === 'running') {
            badgeColor = 'border-indigo-500/60 bg-indigo-950/40 text-indigo-300 shadow-sm shadow-indigo-500/10';
            iconBg = 'bg-indigo-600 text-white animate-pulse';
            statusDot = 'bg-indigo-400 animate-ping';
          } else if (status.state === 'success') {
            badgeColor = 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300';
            iconBg = 'bg-emerald-950 text-emerald-400 border border-emerald-600/40';
            statusDot = 'bg-emerald-500';
          } else if (status.state === 'blocked') {
            badgeColor = 'border-rose-500/50 bg-rose-950/30 text-rose-300';
            iconBg = 'bg-rose-950 text-rose-400 border border-rose-600/40';
            statusDot = 'bg-rose-500';
          } else if (status.state === 'insufficient') {
            badgeColor = 'border-amber-500/50 bg-amber-950/30 text-amber-300';
            iconBg = 'bg-amber-950 text-amber-400 border border-amber-600/40';
            statusDot = 'bg-amber-500';
          }

          return (
            <div
              key={step.id}
              onClick={() => setSelectedStep(step)}
              className={`flex flex-col p-2.5 rounded-lg border transition-all cursor-pointer hover:border-slate-600 relative group ${badgeColor}`}
            >
              {/* Header inside node */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-bold text-slate-500 group-hover:text-slate-300">
                  {step.number}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              </div>

              {/* Icon and Title */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${iconBg}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold leading-tight text-slate-200 truncate">
                    {step.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 truncate">{step.category}</p>
                </div>
              </div>

              {/* Current status outcome badge */}
              <div className="mt-auto pt-1.5 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-medium truncate">{status.label}</span>
                <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Popover / Callout if a step is selected */}
      {selectedStep && (
        <div className="mt-3 p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex items-start justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">
                  Fase {selectedStep.number}: {selectedStep.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {selectedStep.category}
                </span>
              </div>
              <p className="text-slate-400 mt-1">{selectedStep.description}</p>
              {result && (
                <div className="mt-2 text-slate-300 bg-slate-900/90 p-2 rounded border border-slate-800/80 font-mono text-[11px]">
                  <strong>Stato Operativo: </strong>
                  {selectedStep.getStatus(isRunning, result).details || selectedStep.getStatus(isRunning, result).label}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedStep(null)}
            className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded bg-slate-900 border border-slate-800"
          >
            Chiudi
          </button>
        </div>
      )}
    </div>
  );
};
