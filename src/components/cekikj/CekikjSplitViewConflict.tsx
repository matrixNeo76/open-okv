import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  ExternalLink,
  Scale,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Check,
  RotateCcw,
  Sparkles,
  Trash2
} from 'lucide-react';
import { ContradictionRecord, ConflictingSourceItem } from '../../types';

export interface CekikjSplitViewConflictProps {
  conflict: ContradictionRecord;
  onArbitrate?: (conflict: ContradictionRecord, chosenSourceTitle?: string) => void;
  onResolve?: (conflictId: string, notes: string, resolvedBy?: string, chosenSource?: string) => void;
  onReopen: (conflictId: string) => void;
  onDelete?: (conflictId: string) => void;
  onTestQuery?: (conceptName: string) => void;
  onTestInRunner?: (conceptName: string) => void;
}

export const CekikjSplitViewConflict: React.FC<CekikjSplitViewConflictProps> = ({
  conflict,
  onArbitrate,
  onResolve,
  onReopen,
  onDelete,
  onTestQuery,
  onTestInRunner
}) => {
  const [isArbitratingInline, setIsArbitratingInline] = useState(false);
  const [chosenSource, setChosenSource] = useState<string>(conflict.conflictingSources[0]?.sourceTitle || "");
  const [notes, setNotes] = useState<string>("");

  const sourceA = conflict.conflictingSources[0];
  const sourceB = conflict.conflictingSources[1];
  const isResolved = conflict.status === 'resolved';

  const handleTest = () => {
    if (onTestInRunner) {
      onTestInRunner(conflict.conceptName);
    } else if (onTestQuery) {
      onTestQuery(conflict.conceptName);
    }
  };

  const handleQuickAdopt = (source: ConflictingSourceItem) => {
    if (onResolve) {
      onResolve(
        conflict.id,
        `Adottata la fonte "${source.sourceTitle}" come canone ufficiale nel Knowledge Vault. Statement: "${source.statement}"`,
        "Architetto del Vault (Utente)",
        source.sourceTitle
      );
    } else if (onArbitrate) {
      onArbitrate(conflict, source.sourceTitle);
    }
  };

  const handleConfirmInlineResolution = () => {
    const finalNotes = notes.trim() || `Conflitto arbitrato a favore di "${chosenSource}".`;
    if (onResolve) {
      onResolve(conflict.id, finalNotes, "Architetto del Vault (Utente)", chosenSource);
    } else if (onArbitrate) {
      onArbitrate(conflict, chosenSource);
    }
    setIsArbitratingInline(false);
  };

  return (
    <div
      id={`conflict-card-${conflict.id}`}
      className={`border rounded-xl transition-all overflow-hidden ${
        isResolved
          ? 'bg-[#0E1411] border-[#10B981]/30'
          : 'bg-[#141210] border-[#DC2626]/40 shadow-sm shadow-red-950/20'
      }`}
    >
      {/* Card Header Bar */}
      <div className="p-4 border-b border-[#222] flex flex-wrap items-center justify-between gap-3 bg-black/40">
        <div className="flex items-center gap-2.5">
          {isResolved ? (
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-neutral-100">{conflict.conceptName}</h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  isResolved
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                }`}
              >
                {isResolved ? 'RESOLVED (GATE SBLOCCATO)' : 'OPEN (GATE ATTIVO)'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">
              ID: {conflict.id} • Registrato il {conflict.registeredAt?.split('T')[0] || 'N/D'}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            className="px-2.5 py-1 text-xs font-mono rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Invia una query al motore per testare il Contradiction Gate"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Testa nel Runner</span>
          </button>

          {isResolved ? (
            <button
              type="button"
              onClick={() => onReopen(conflict.id)}
              className="px-2.5 py-1 text-xs font-mono rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Riapri Conflitto</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (onArbitrate) {
                  onArbitrate(conflict);
                } else {
                  setIsArbitratingInline(!isArbitratingInline);
                }
              }}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-[#C5A059] hover:bg-[#D4AF37] text-black shadow transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Arbitra / Mitiga</span>
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(conflict.id)}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Elimina dal registro"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Resolution Notes Banner if resolved */}
      {isResolved && conflict.resolutionNotes && (
        <div className="p-3 bg-emerald-950/30 border-b border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-emerald-200">Risoluzione Applicata: </span>
            <span>{conflict.resolutionNotes}</span>
            <div className="text-[10px] text-emerald-400/80 mt-1 font-mono">
              Risolto da: {conflict.resolvedBy || 'Architetto'} • Data: {conflict.resolvedAt ? new Date(conflict.resolvedAt).toLocaleDateString() : 'N/D'}
            </div>
          </div>
        </div>
      )}

      {/* Inline Arbitration Panel if open */}
      {isArbitratingInline && !isResolved && (
        <div className="p-4 bg-[#18130B] border-b border-[#C5A059]/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#E5C17B] flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-[#C5A059]" />
              <span>Arbitraggio Diretto delle Fonti</span>
            </span>
            <button
              type="button"
              onClick={() => setIsArbitratingInline(false)}
              className="text-neutral-400 hover:text-white text-xs"
            >
              Chiudi
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-neutral-300 font-medium">1. Seleziona la fonte canonica:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {conflict.conflictingSources.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setChosenSource(s.sourceTitle)}
                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                    chosenSource === s.sourceTitle
                      ? 'bg-[#C5A059]/20 border-[#C5A059] text-white font-semibold'
                      : 'bg-black/50 border-[#333] text-neutral-300 hover:border-[#555]'
                  }`}
                >
                  <div className="font-semibold text-[#C5A059] truncate">{s.sourceTitle}</div>
                  <div className="text-[10px] text-neutral-400">Owner: {s.owner || 'N/D'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-neutral-300 font-medium">2. Motivazione / Decisione:</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full p-2 bg-black border border-[#333] rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-[#C5A059]"
              placeholder="Spiega la motivazione della scelta di policy..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsArbitratingInline(false)}
              className="px-3 py-1 rounded bg-[#222] text-neutral-300 text-xs"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleConfirmInlineResolution}
              className="px-4 py-1 rounded bg-[#C5A059] hover:bg-[#D4AF37] text-black text-xs font-semibold"
            >
              Conferma Risoluzione
            </button>
          </div>
        </div>
      )}

      {/* Split-View Side-by-Side Sources */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source A Column */}
        {sourceA && (
          <div className="flex flex-col p-3.5 rounded-lg border border-[#262626] bg-black/40 relative group hover:border-[#404040] transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#222] text-neutral-300">
                FONTE A
              </span>
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <Calendar className="w-3 h-3 text-neutral-500" />
                <span>{sourceA.effectiveDate || sourceA.validFrom || 'Decorrenza N/D'}</span>
              </div>
            </div>

            <h4 className="text-xs font-semibold text-neutral-200 line-clamp-1 mb-2">
              {sourceA.sourceTitle}
            </h4>

            {/* Statement Quote */}
            <div className="p-2.5 rounded bg-black/60 border border-[#222] text-xs text-neutral-300 italic mb-3 flex-1">
              "{sourceA.statement}"
            </div>

            {/* Metadata Footer */}
            <div className="pt-2 border-t border-[#222] flex items-center justify-between text-[11px] text-neutral-400">
              <span className="flex items-center gap-1 truncate max-w-[180px]">
                <User className="w-3 h-3 text-neutral-500" />
                {sourceA.owner || 'Owner non specificato'}
              </span>
              {!isResolved && (
                <button
                  type="button"
                  onClick={() => handleQuickAdopt(sourceA)}
                  className="px-2 py-1 text-[10px] font-medium rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-900 transition-colors cursor-pointer"
                >
                  Adotta come Canone
                </button>
              )}
            </div>
          </div>
        )}

        {/* Source B Column */}
        {sourceB && (
          <div className="flex flex-col p-3.5 rounded-lg border border-[#262626] bg-black/40 relative group hover:border-[#404040] transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#222] text-neutral-300">
                FONTE B
              </span>
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <Calendar className="w-3 h-3 text-neutral-500" />
                <span>{sourceB.effectiveDate || sourceB.validFrom || 'Decorrenza N/D'}</span>
              </div>
            </div>

            <h4 className="text-xs font-semibold text-neutral-200 line-clamp-1 mb-2">
              {sourceB.sourceTitle}
            </h4>

            {/* Statement Quote */}
            <div className="p-2.5 rounded bg-black/60 border border-[#222] text-xs text-neutral-300 italic mb-3 flex-1">
              "{sourceB.statement}"
            </div>

            {/* Metadata Footer */}
            <div className="pt-2 border-t border-[#222] flex items-center justify-between text-[11px] text-neutral-400">
              <span className="flex items-center gap-1 truncate max-w-[180px]">
                <User className="w-3 h-3 text-neutral-500" />
                {sourceB.owner || 'Owner non specificato'}
              </span>
              {!isResolved && (
                <button
                  type="button"
                  onClick={() => handleQuickAdopt(sourceB)}
                  className="px-2 py-1 text-[10px] font-medium rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-900 transition-colors cursor-pointer"
                >
                  Adotta come Canone
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
