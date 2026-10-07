/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Modale per la configurazione e il testing interattivo del Server MCP Nativo del Vault
 */

import React, { useState, useEffect } from "react";
import {
  Server,
  Copy,
  Check,
  Terminal,
  Play,
  ShieldCheck,
  Code,
  Network,
  FileJson,
  X,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
} from "lucide-react";

interface McpConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultResourcesCount: number;
}

export const McpConnectionModal: React.FC<McpConnectionModalProps> = ({
  isOpen,
  onClose,
  vaultResourcesCount,
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Playground interattivo tool call
  const [selectedTool, setSelectedTool] = useState("vault_search");
  const [toolParamsInput, setToolParamsInput] = useState('{\n  "query": "agenti"\n}');
  const [toolExecutionResult, setToolExecutionResult] = useState<string | null>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchStatus();
  }, [isOpen]);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch("/api/mcp");
      if (res.ok) {
        const data = await res.json();
        setMcpStatus(data);
      }
    } catch (e) {
      console.warn("MCP status fetch failed:", e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleCopy = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const executeToolCall = async () => {
    setIsExecutingTool(true);
    setToolExecutionResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolParamsInput);
      } catch (e: any) {
        throw new Error(`JSON parametri non valido: ${e.message}`);
      }

      const rpcPayload = {
        jsonrpc: "2.0",
        id: `test-${Date.now()}`,
        method: "tools/call",
        params: {
          name: selectedTool,
          arguments: parsedArgs,
        },
      };

      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcPayload),
      });

      const data = await res.json();
      setToolExecutionResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setToolExecutionResult(
        JSON.stringify(
          {
            error: err?.message || "Errore esecuzione",
          },
          null,
          2
        )
      );
    } finally {
      setIsExecutingTool(false);
    }
  };

  if (!isOpen) return null;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const mcpEndpoint = `${currentOrigin}/api/mcp`;

  const claudeConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        "knowledge-vault": {
          url: mcpEndpoint,
          type: "http",
        },
      },
    },
    null,
    2
  );

  const cursorConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        "knowledge-vault": {
          url: mcpEndpoint,
          type: "http",
        },
      },
    },
    null,
    2
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs font-sans animate-in fade-in duration-150">
      <div className="bg-[#120E08] border border-[#3A2D1B] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#221A10] bg-[#16110A]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#F5EADB]">Server MCP Nativo</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  JSON-RPC 2.0 Attivo
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Collega Claude Desktop, Cursor o agenti esterni al Knowledge Vault tramite Model Context Protocol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#888] hover:text-[#DDD] hover:bg-[#20180F] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollabile */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm text-[#DDD]">
          {/* Badge indicatori stato */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#18130B] border border-[#2B2012] rounded-xl p-3">
              <div className="text-[10px] font-mono text-[#888] uppercase">Endpoint URL</div>
              <div className="text-xs font-mono text-[#C5A059] truncate mt-1">{mcpEndpoint}</div>
            </div>
            <div className="bg-[#18130B] border border-[#2B2012] rounded-xl p-3">
              <div className="text-[10px] font-mono text-[#888] uppercase">Typed Tools Esposti</div>
              <div className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[#C5A059]" />
                5 Tool Cekikj
              </div>
            </div>
            <div className="bg-[#18130B] border border-[#2B2012] rounded-xl p-3">
              <div className="text-[10px] font-mono text-[#888] uppercase">Documenti Accessibili</div>
              <div className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#C5A059]" />
                {vaultResourcesCount} Risorse
              </div>
            </div>
          </div>

          {/* Configurazione rapida per IDE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A89874] flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-[#C5A059]" />
                Configurazione Claude Desktop & Cursor
              </h3>
              <button
                onClick={() => handleCopy(claudeConfigSnippet, "claude")}
                className="text-[11px] font-mono text-[#C5A059] hover:text-[#E5C170] flex items-center gap-1 cursor-pointer"
              >
                {copiedSection === "claude" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSection === "claude" ? "Copiato!" : "Copia JSON"}</span>
              </button>
            </div>
            <div className="bg-[#0D0A06] border border-[#221A10] rounded-xl p-3 font-mono text-xs text-[#BBB] overflow-x-auto">
              <pre>{claudeConfigSnippet}</pre>
            </div>
            <div className="text-[11px] text-[#777]">
              Incolla questo blocco nel file <span className="text-[#C5A059] font-mono">claude_desktop_config.json</span> o nelle impostazioni MCP di Cursor/Windsurf.
            </div>
          </div>

          {/* I 5 Tool Tipizzati */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A89874] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
              Tool Tipizzati Disponibili
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[#161109] border border-[#261C10] space-y-1">
                <div className="font-mono font-semibold text-[#C5A059]">vault_search</div>
                <div className="text-[11px] text-[#888]">Ricerca semantica ibrida e per filtri tipologia/tag.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#161109] border border-[#261C10] space-y-1">
                <div className="font-mono font-semibold text-[#C5A059]">vault_get_resource</div>
                <div className="text-[11px] text-[#888]">Recupero atomico con metadati completi OKF v0.2.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#161109] border border-[#261C10] space-y-1">
                <div className="font-mono font-semibold text-[#C5A059]">vault_traverse_graph</div>
                <div className="text-[11px] text-[#888]">Esplorazione topologica ad N-hop tra nodi e archi.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#161109] border border-[#261C10] space-y-1">
                <div className="font-mono font-semibold text-[#C5A059]">vault_ingest_document</div>
                <div className="text-[11px] text-[#888]">Inserimento programmatico conforme a OKF v0.2.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#161109] border border-[#261C10] space-y-1 sm:col-span-2">
                <div className="font-mono font-semibold text-[#C5A059]">vault_check_contradictions</div>
                <div className="text-[11px] text-[#888]">Audit epistemico Cekikj per rilevamento contraddizioni e Zero-Guessing.</div>
              </div>
            </div>
          </div>

          {/* Playground Interattivo Tool Call */}
          <div className="space-y-3 pt-2 border-t border-[#221A10]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A89874] flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-[#C5A059]" />
                Console di Test Interattiva
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTool}
                  onChange={(e) => {
                    setSelectedTool(e.target.value);
                    if (e.target.value === "vault_search") {
                      setToolParamsInput('{\n  "query": "agenti",\n  "limit": 5\n}');
                    } else if (e.target.value === "vault_traverse_graph") {
                      setToolParamsInput('{\n  "rootId": "sample-1",\n  "maxHops": 2\n}');
                    } else if (e.target.value === "vault_get_resource") {
                      setToolParamsInput('{\n  "title": "Model Context Protocol (MCP) Specification"\n}');
                    } else if (e.target.value === "vault_check_contradictions") {
                      setToolParamsInput('{\n  "topic": "Orchestrazione Agenti"\n}');
                    } else if (e.target.value === "vault_ingest_document") {
                      setToolParamsInput('{\n  "title": "Documento Test MCP",\n  "type": "guide",\n  "summary": "Guida generata via MCP",\n  "markdownContent": "# Test MCP\\n\\nContenuto",\n  "tags": ["test", "mcp"]\n}');
                    }
                  }}
                  className="bg-[#19130B] border border-[#302315] rounded-lg px-2.5 py-1 text-xs text-[#E0D5C0] font-mono focus:outline-hidden focus:border-[#C5A059]"
                >
                  <option value="vault_search">vault_search</option>
                  <option value="vault_get_resource">vault_get_resource</option>
                  <option value="vault_traverse_graph">vault_traverse_graph</option>
                  <option value="vault_check_contradictions">vault_check_contradictions</option>
                  <option value="vault_ingest_document">vault_ingest_document</option>
                </select>

                <button
                  onClick={executeToolCall}
                  disabled={isExecutingTool}
                  className="px-3 py-1 bg-[#C5A059] hover:bg-[#D8B46B] text-black font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isExecutingTool ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 fill-black" />
                  )}
                  <span>Esegui</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-[#777] mb-1">Parametri Tool (JSON):</label>
                <textarea
                  rows={6}
                  value={toolParamsInput}
                  onChange={(e) => setToolParamsInput(e.target.value)}
                  className="w-full bg-[#0E0B07] border border-[#221A10] rounded-xl p-2.5 font-mono text-xs text-[#DDD] focus:outline-hidden focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#777] mb-1">Risposta Server MCP (JSON-RPC):</label>
                <div className="h-[128px] overflow-y-auto bg-[#0E0B07] border border-[#221A10] rounded-xl p-2.5 font-mono text-xs text-[#AAA] whitespace-pre-wrap">
                  {toolExecutionResult || "// Clicca su 'Esegui' per testare la risposta JSON-RPC del tool selezionato."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#221A10] bg-[#16110A] flex items-center justify-between text-xs text-[#888]">
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero-Guessing Epistemic Compliance</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#20180F] hover:bg-[#2A2015] text-[#DDD] font-medium transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
