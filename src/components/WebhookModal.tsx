import React, { useState, useEffect } from "react";
import { X, Key, Copy, Check, RefreshCw, Send, Globe, Bookmark, Terminal, ShieldCheck, ExternalLink } from "lucide-react";

interface WebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WebhookConfigResponse {
  enabled: boolean;
  secretToken: string;
  createdAt: string;
  lastUsedAt?: string;
  totalCaptures: number;
  endpointUrl: string;
  sampleCurl: string;
  bookmarkletCode: string;
}

export const WebhookModal: React.FC<WebhookModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<WebhookConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [testUrl, setTestUrl] = useState("https://github.com/anthropics/anthropic-cookbook");
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/webhook/config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.warn("Error fetching webhook config:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm("Sei sicuro di voler rigenerare il token? Le estensioni o script con il token precedente smetteranno di funzionare.")) return;
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/webhook/regenerate-token", { method: "POST" });
      if (res.ok) {
        await fetchConfig();
      }
    } catch (e) {
      console.warn("Regenerate token error:", e);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleTestCapture = async () => {
    if (!config?.secretToken || !testUrl) return;
    setTestStatus("Invio in corso...");
    try {
      const res = await fetch("/api/webhook/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.secretToken}`,
        },
        body: JSON.stringify({
          url: testUrl,
          source: "modal_test",
          tags: ["webhook", "test"],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestStatus(`Successo! Salvato: "${data.resource?.title || "Risorsa"}"`);
        await fetchConfig();
      } else {
        setTestStatus(`Errore: ${data.error || "Fallito"}`);
      }
    } catch (err: any) {
      setTestStatus(`Errore di rete: ${err?.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div 
        className="bg-[#0C0C0C] border border-[#262626] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#222] bg-[#101010]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059]">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-serif font-medium text-white leading-tight">
                Inbound Webhook & Remote Capture API
              </h2>
              <p className="text-xs text-[#888] font-mono">
                Cattura remota da estensioni browser, script CI/CD e bookmarklet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#666] hover:text-white rounded-lg hover:bg-[#1E1E1E] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar text-xs">
          {/* Secret Token Section */}
          <div className="bg-[#121212] border border-[#222] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#E5C170] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
                Il tuo Webhook Secret Token
              </span>
              <button
                onClick={handleRegenerateToken}
                disabled={isRegenerating}
                className="text-[11px] font-mono text-[#777] hover:text-[#C5A059] flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                Rigenera
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                readOnly
                value={config?.secretToken || "Caricamento..."}
                className="bg-[#080808] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs font-mono text-[#DDD] w-full select-all focus:outline-none"
              />
              <button
                onClick={() => {
                  if (config?.secretToken) {
                    navigator.clipboard.writeText(config.secretToken);
                    setCopiedToken(true);
                    setTimeout(() => setCopiedToken(false), 2000);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-white font-mono flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#C5A059]" />}
                {copiedToken ? "Copiato" : "Copia"}
              </button>
            </div>
            
            <div className="flex items-center justify-between text-[10.5px] font-mono text-[#666] pt-1">
              <span>Totale catture via Webhook: <strong className="text-[#C5A059]">{config?.totalCaptures || 0}</strong></span>
              {config?.lastUsedAt && (
                <span>Ultimo utilizzo: {new Date(config.lastUsedAt).toLocaleDateString("it-IT")}</span>
              )}
            </div>
          </div>

          {/* 1-Click Browser Bookmarklet */}
          <div className="bg-[#121212] border border-[#222] rounded-xl p-4 space-y-2.5">
            <span className="text-xs font-mono font-semibold text-purple-300 flex items-center gap-1.5">
              <Bookmark className="w-4 h-4 text-purple-400" />
              Bookmarklet Browser (1-Click Save)
            </span>
            <p className="text-[#888] leading-relaxed">
              Trascina o copia questo link nella barra dei preferiti del tuo browser. Cliccandolo su qualsiasi pagina web, la invierà all'istante nel Knowledge Vault!
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  if (config?.bookmarkletCode) {
                    navigator.clipboard.writeText(config.bookmarkletCode);
                    setCopiedBookmarklet(true);
                    setTimeout(() => setCopiedBookmarklet(false), 2000);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-[#1E1428] hover:bg-[#2A1D38] border border-purple-900/50 text-purple-200 font-mono flex items-center gap-2 transition-colors cursor-pointer"
              >
                {copiedBookmarklet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
                {copiedBookmarklet ? "Codice Bookmarklet Copiato!" : "Copia Codice Bookmarklet"}
              </button>
            </div>
          </div>

          {/* cURL & CI/CD Command */}
          <div className="bg-[#121212] border border-[#222] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#AAA] flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-[#C5A059]" />
                Integrazione cURL / GitHub Actions / Script
              </span>
              <button
                onClick={() => {
                  if (config?.sampleCurl) {
                    navigator.clipboard.writeText(config.sampleCurl);
                    setCopiedCurl(true);
                    setTimeout(() => setCopiedCurl(false), 2000);
                  }
                }}
                className="text-[11px] font-mono text-[#C5A059] hover:underline flex items-center gap-1"
              >
                {copiedCurl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedCurl ? "Copiato" : "Copia cURL"}
              </button>
            </div>

            <pre className="bg-[#080808] border border-[#222] rounded-lg p-3 text-[11px] font-mono text-[#C8C8C8] overflow-x-auto whitespace-pre-wrap">
              {config?.sampleCurl || "Caricamento snippet..."}
            </pre>
          </div>

          {/* Live Test */}
          <div className="bg-[#121212] border border-[#222] rounded-xl p-4 space-y-3">
            <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              Collaudo Rapido Inbound Webhook
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://..."
                className="bg-[#080808] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs font-mono text-[#DDD] w-full focus:outline-none"
              />
              <button
                onClick={handleTestCapture}
                className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D4AF37] text-black font-semibold font-mono shrink-0 transition-colors cursor-pointer"
              >
                Invia Test
              </button>
            </div>
            {testStatus && (
              <div className={`p-2 rounded font-mono text-[11px] ${testStatus.startsWith("Successo") ? "text-emerald-400 bg-emerald-950/30 border border-emerald-800/40" : "text-amber-400 bg-amber-950/30 border border-amber-800/40"}`}>
                {testStatus}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
