import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  ShieldAlert,
  Calendar,
  User,
  FileText,
  Check,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { ResourceItem, ContradictionRecord } from '../../types';
import { dualLayerStore } from '../../lib/cekikj/dualLayerStore';

interface CekikjNewContradictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources?: ResourceItem[];
  onCreated: (newRecord: ContradictionRecord) => void;
  onNotification?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const CekikjNewContradictionModal: React.FC<CekikjNewContradictionModalProps> = ({
  isOpen,
  onClose,
  resources = [],
  onCreated,
  onNotification
}) => {
  const [conceptName, setConceptName] = useState('');
  const [domain, setDomain] = useState('Architettura & Governance');

  // Source A state
  const [sourceATitle, setSourceATitle] = useState('');
  const [sourceAStatement, setSourceAStatement] = useState('');
  const [sourceAOwner, setSourceAOwner] = useState('');
  const [sourceADate, setSourceADate] = useState(new Date().toISOString().split('T')[0]);

  // Source B state
  const [sourceBTitle, setSourceBTitle] = useState('');
  const [sourceBStatement, setSourceBStatement] = useState('');
  const [sourceBOwner, setSourceBOwner] = useState('');
  const [sourceBDate, setSourceBDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleSelectResourceForA = (resId: string) => {
    const res = resources.find(r => r.id === resId);
    if (!res) return;
    setSourceATitle(res.title);
    setSourceAStatement(res.summary || res.title);
    setSourceAOwner((res as any).author || 'Vault Contributor');
  };

  const handleSelectResourceForB = (resId: string) => {
    const res = resources.find(r => r.id === resId);
    if (!res) return;
    setSourceBTitle(res.title);
    setSourceBStatement(res.summary || res.title);
    setSourceBOwner((res as any).author || 'Vault Contributor');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!conceptName.trim()) {
      onNotification?.('error', 'Inserisci il nome del concetto o della policy contesa.');
      return;
    }
    if (!sourceATitle.trim() || !sourceAStatement.trim()) {
      onNotification?.('error', 'Compila titolo e dichiarazione per la Fonte A.');
      return;
    }
    if (!sourceBTitle.trim() || !sourceBStatement.trim()) {
      onNotification?.('error', 'Compila titolo e dichiarazione per la Fonte B.');
      return;
    }

    try {
      const record = dualLayerStore.registerNewContradiction({
        conceptName: conceptName.trim(),
        domain: domain.trim(),
        sourceA: {
          title: sourceATitle.trim(),
          statement: sourceAStatement.trim(),
          owner: sourceAOwner.trim() || 'Vault Architect',
          validFrom: sourceADate
        },
        sourceB: {
          title: sourceBTitle.trim(),
          statement: sourceBStatement.trim(),
          owner: sourceBOwner.trim() || 'Vault Contributor',
          validFrom: sourceBDate
        }
      });

      onNotification?.('success', `Nuova contraddizione registrata nel Gate: "${record.conceptName}"`);
      onCreated(record);
      onClose();
    } catch (err: any) {
      onNotification?.('error', `Errore registrazione: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Registra Nuova Contraddizione Epistemica
              </h3>
              <p className="text-xs text-slate-400">
                Iscrivi formalmente due policy discordanti nel Contradiction Gate di Cekikj
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Concept Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Concetto / Politica Contesa *
              </label>
              <input
                type="text"
                required
                value={conceptName}
                onChange={e => setConceptName(e.target.value)}
                placeholder="es. Politica Retention Token & Sessioni"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Dominio Ontologico
              </label>
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="es. Security, Auth, Cloud Architecture"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Side-by-Side Sources Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Source A */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  FONTE A (Policy Discordante 1)
                </span>
                {resources.length > 0 && (
                  <select
                    onChange={e => handleSelectResourceForA(e.target.value)}
                    defaultValue=""
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 max-w-[140px]"
                  >
                    <option value="" disabled>Scegli dal Vault...</option>
                    {resources.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Titolo Documento / RFC *
                </label>
                <input
                  type="text"
                  required
                  value={sourceATitle}
                  onChange={e => setSourceATitle(e.target.value)}
                  placeholder="es. Specifica Architetturale RFC-008"
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Asserzione / Regola Contrastante *
                </label>
                <textarea
                  required
                  rows={3}
                  value={sourceAStatement}
                  onChange={e => setSourceAStatement(e.target.value)}
                  placeholder="es. Tutte le sessioni devono scadere rigidamente dopo 15 minuti di inattività..."
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Owner / Team</label>
                  <input
                    type="text"
                    value={sourceAOwner}
                    onChange={e => setSourceAOwner(e.target.value)}
                    placeholder="Security Lead"
                    className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Data Validità</label>
                  <input
                    type="date"
                    value={sourceADate}
                    onChange={e => setSourceADate(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Source B */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  FONTE B (Policy Discordante 2)
                </span>
                {resources.length > 0 && (
                  <select
                    onChange={e => handleSelectResourceForB(e.target.value)}
                    defaultValue=""
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 max-w-[140px]"
                  >
                    <option value="" disabled>Scegli dal Vault...</option>
                    {resources.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Titolo Documento / RFC *
                </label>
                <input
                  type="text"
                  required
                  value={sourceBTitle}
                  onChange={e => setSourceBTitle(e.target.value)}
                  placeholder="es. Guida Mobile Experience v2"
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Asserzione / Regola Contrastante *
                </label>
                <textarea
                  required
                  rows={3}
                  value={sourceBStatement}
                  onChange={e => setSourceBStatement(e.target.value)}
                  placeholder="es. Per garantire seamless UX su dispositivi mobili, le sessioni rimangono valide per 30 giorni..."
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Owner / Team</label>
                  <input
                    type="text"
                    value={sourceBOwner}
                    onChange={e => setSourceBOwner(e.target.value)}
                    placeholder="Product Team"
                    className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Data Validità</label>
                  <input
                    type="date"
                    value={sourceBDate}
                    onChange={e => setSourceBDate(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Epistemic note */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Una volta registrata, qualsiasi query degli agenti o del Vault che tocca questo concetto attiverà immediatamente il <strong>Contradiction Gate</strong>, bloccando sintesi forzate fino all'arbitraggio formale dell'Architetto.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-white rounded-lg bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/20 transition-colors flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Iscrivi nel Contradiction Gate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
