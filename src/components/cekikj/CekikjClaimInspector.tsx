import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  FileText,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { CekikjEngineResult, EvidenceChunk } from '../../types';

interface CekikjClaimInspectorProps {
  result: CekikjEngineResult;
}

export const CekikjClaimInspector: React.FC<CekikjClaimInspectorProps> = ({ result }) => {
  const [selectedChunk, setSelectedChunk] = useState<EvidenceChunk | null>(null);
  const [copiedClaim, setCopiedClaim] = useState<string | null>(null);

  const isSuccess = result.status === 'SUCCESS';
  const isRefusal = result.status === 'REFUSAL_CONTRADICTION';
  const isInsufficient = result.status === 'INSUFFICIENT_KNOWLEDGE';

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedClaim(id);
    setTimeout(() => setCopiedClaim(null), 2000);
  };

  // Extract claims from grounding report or fallback to paragraphs of answerText
  const claims = result.groundingReport?.claims && result.groundingReport.claims.length > 0
    ? result.groundingReport.claims
    : result.answerText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => ({
          claim: p,
          verified: isSuccess,
          supportingEvidenceIds: result.evidenceItems?.map(e => e.id) || []
        }));

  const groundingPercent = Math.round((result.groundingReport?.groundingScore ?? (isSuccess ? 1 : 0)) * 100);

  return (
    <div id="cekikj-claim-inspector" className="space-y-4">
      {/* Header Metric Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg">
        <div className="flex items-center gap-2">
          {isSuccess && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
          {isRefusal && <ShieldAlert className="w-5 h-5 text-rose-400" />}
          {isInsufficient && <HelpCircle className="w-5 h-5 text-amber-400" />}
          <div>
            <h4 className="text-xs font-semibold text-slate-200">
              {isSuccess && 'Asserzioni Grounded & Verificate (Zero-Guessing)'}
              {isRefusal && 'Rifiuto Epistemico Mandatorio (Contradiction Gate)'}
              {isInsufficient && 'Dichiarazione Esplicita di Insufficienza Dati'}
            </h4>
            <p className="text-[11px] text-slate-400">
              {isSuccess && `${result.evidenceItems?.length || 0} evidenze e relazioni ontologiche verificate senza speculazioni`}
              {isRefusal && 'La sintesi è stata interrotta per impedire allucinazioni su policy contrastanti'}
              {isInsufficient && 'Rifiutata la generazione iterativa per assenza di chunk nel Vault'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
            Grounding: {groundingPercent}%
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
            {result.evidenceItems?.length || 0} Chunks
          </span>
        </div>
      </div>

      {/* Atomic Claims List */}
      <div className="space-y-2.5">
        {claims.map((c, idx) => {
          const claimId = `claim-${idx}`;
          const isCopied = copiedClaim === claimId;
          const isVerified = c.verified;

          return (
            <div
              key={claimId}
              className={`p-3.5 rounded-lg border transition-all ${
                isVerified
                  ? 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/40'
                  : isRefusal
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : 'bg-amber-950/20 border-amber-900/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      CLAIM #{idx + 1}
                    </span>
                    {isVerified && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Grounded 100%
                      </span>
                    )}
                    {isRefusal && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        Gate Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-200 select-text whitespace-pre-wrap">
                    {c.claim}
                  </p>
                </div>

                <button
                  onClick={() => handleCopyText(c.claim, claimId)}
                  className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 transition-colors shrink-0"
                  title="Copia asserzione"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Verified Sources / Footnotes for this claim */}
              {c.supportingEvidenceIds && c.supportingEvidenceIds.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 font-mono">Fonti Ancorate:</span>
                  {c.supportingEvidenceIds.map((evId, fIdx) => {
                    const matchedChunk = result.evidenceItems?.find(e => e.id === evId);
                    if (!matchedChunk) return null;
                    return (
                      <button
                        key={fIdx}
                        onClick={() => setSelectedChunk(matchedChunk)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-emerald-500/60 text-slate-300 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                      >
                        <FileText className="w-2.5 h-2.5 text-emerald-400" />
                        <span>{matchedChunk.documentTitle}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Chunk Evidence Modal / Drawer Callout */}
      {selectedChunk && (
        <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-lg shadow-lg relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                EVIDENCE CHUNK
              </span>
              <span className="text-xs font-semibold text-slate-200">{selectedChunk.documentTitle}</span>
            </div>
            <button
              onClick={() => setSelectedChunk(null)}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
            >
              Chiudi
            </button>
          </div>

          <p className="text-xs text-slate-300 bg-slate-900/90 p-3 rounded border border-slate-800 font-mono leading-relaxed mb-3">
            "{selectedChunk.text}"
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                Validità: {selectedChunk.validFrom || '1970-01-01'} → {selectedChunk.validTo || '2099-12-31'}
              </span>
              <span className="font-mono text-slate-500">•</span>
              <span>Token st.: {selectedChunk.tokenCount || 0}</span>
            </div>
            {selectedChunk.canonicalEntityAnchors && selectedChunk.canonicalEntityAnchors.length > 0 && (
              <div className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-indigo-400" />
                <span className="text-indigo-300 truncate max-w-[200px]">
                  {selectedChunk.canonicalEntityAnchors.join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
