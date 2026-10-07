import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Database, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught an unhandled error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReload = () => {
    try {
      localStorage.removeItem("KV_ZEN_MODE");
      // Keep main cached resources if possible, or reload fresh
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-[#E0E0E0] flex items-center justify-center p-6 font-sans">
          <div className="bg-[#111] border border-[#2A2415] rounded-2xl max-w-xl w-full p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center mx-auto text-[#C5A059]">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-white tracking-tight">
                Recupero Interfaccia Knowledge Vault
              </h1>
              <p className="text-sm text-[#888] leading-relaxed">
                Si è verificata un'anomalia temporanea durante il rendering dei componenti dell'interfaccia.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#080808] border border-[#222] rounded-xl p-4 text-left font-mono text-xs text-[#E5C170] overflow-x-auto max-h-40">
                <p className="font-semibold text-red-400 mb-1">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.error.stack && (
                  <pre className="text-[11px] text-[#666] whitespace-pre-wrap">{this.state.error.stack.split("\n").slice(1, 5).join("\n")}</pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 rounded-xl bg-[#C5A059] hover:bg-[#D4AF37] text-black font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#C5A059]/10"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Ricarica Interfaccia</span>
              </button>

              <button
                onClick={this.handleClearAndReload}
                className="px-4 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] text-[#AAA] hover:text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>Riavvia Sessione</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
