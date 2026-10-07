/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Audio Overview & Executive Voice Briefing per le risorse del Knowledge Vault
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  RefreshCw,
  Sparkles,
  X,
  Headphones,
  Radio,
  Download,
  FileText,
  Sliders,
  Check,
} from "lucide-react";
import { ResourceItem } from "../types";

interface AudioOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  selectedResource?: ResourceItem | null;
}

export const AudioOverviewModal: React.FC<AudioOverviewModalProps> = ({
  isOpen,
  onClose,
  resources,
  selectedResource,
}) => {
  const [scriptContent, setScriptContent] = useState<string>("");
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(0);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentencesRef = useRef<string[]>([]);

  // Carica le voci TTS disponibili nel browser
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Priorità a voci italiane e poi inglesi
        const sorted = [...voices].sort((a, b) => {
          const aIt = a.lang.startsWith("it") ? -1 : 1;
          const bIt = b.lang.startsWith("it") ? -1 : 1;
          return aIt - bIt;
        });
        setAvailableVoices(sorted);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Quando si apre il modale, genera automaticamente il testo di briefing
  useEffect(() => {
    if (!isOpen) {
      handleStopAudio();
      return;
    }
    generateBriefingScript();
  }, [isOpen, selectedResource]);

  const generateBriefingScript = async () => {
    setIsGeneratingScript(true);
    handleStopAudio();

    try {
      // Se c'è una risorsa selezionata, crea un briefing specifico; altrimenti panoramica del vault
      const targetItems = selectedResource ? [selectedResource] : resources.slice(0, 8);

      const res = await fetch("/api/vault/audio-overview-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedResource ? "deep_dive" : "vault_digest",
          resourceTitle: selectedResource?.title,
          resources: targetItems.map((r) => ({
            id: r.id,
            title: r.title,
            type: r.type,
            summary: r.summary,
            domain: r.metadata?.domain,
            keyConcepts: r.metadata?.keyConcepts,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const script = data.script || getDefaultFallbackScript(targetItems);
        setScriptContent(script);
        prepareSentences(script);
      } else {
        const fallback = getDefaultFallbackScript(targetItems);
        setScriptContent(fallback);
        prepareSentences(fallback);
      }
    } catch (e) {
      const fallback = getDefaultFallbackScript(selectedResource ? [selectedResource] : resources.slice(0, 8));
      setScriptContent(fallback);
      prepareSentences(fallback);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const getDefaultFallbackScript = (items: ResourceItem[]) => {
    if (items.length === 1) {
      const it = items[0];
      return `Benvenuto nell'audio briefing del Knowledge Vault. Oggi approfondiamo: ${it.title}. ` +
        `Questa risorsa appartiene alla categoria ${it.type} nel dominio ${it.metadata?.domain || "tecnologico"}. ` +
        `Sintesi esecutiva: ${it.summary}. ` +
        `I concetti chiave includono le etichette ${items[0].tags?.join(", ") || "generali"}. ` +
        `La documentazione è pienamente conforme alle specifiche epistemiche del Vault e pronta all'uso nei tuoi progetti.`;
    }

    return `Benvenuto nell'audio digest del Knowledge Vault. Attualmente il corpus ospita un insieme strutturato di ${items.length} risorse di rilievo. ` +
      `Tra i pilastri principali troviamo: ${items.map((i) => i.title).join("; ")}. ` +
      `Ciascuna risorsa è corredata da ontologia formale OKF versione 0.2, con entità tracciate nel grafo e conformità rigorosa ai principi epistemici Zero-Guessing. ` +
      `Puoi esplorare liberamente le correlazioni topologiche e interrogare gli agenti per un'analisi approfondita.`;
  };

  const prepareSentences = (text: string) => {
    // Suddivide in frasi per feedback visivo durante la lettura
    const cleanText = text.replace(/[*_#`]/g, "");
    const parts = cleanText.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
    sentencesRef.current = parts;
    setCurrentSentenceIndex(0);
  };

  const handlePlayAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = scriptContent.replace(/[*_#`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    if (availableVoices.length > 0 && availableVoices[selectedVoiceIndex]) {
      utterance.voice = availableVoices[selectedVoiceIndex];
    }
    utterance.rate = playbackRate;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentSentenceIndex(0);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    // Stima della frase corrente
    utterance.onboundary = (e) => {
      if (e.name === "sentence" || e.name === "word") {
        const charIdx = e.charIndex;
        let cumulative = 0;
        for (let i = 0; i < sentencesRef.current.length; i++) {
          cumulative += sentencesRef.current[i].length + 1;
          if (charIdx < cumulative) {
            setCurrentSentenceIndex(i);
            break;
          }
        }
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePauseAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleStopAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIndex(0);
  };

  const handleRateChange = (newRate: number) => {
    setPlaybackRate(newRate);
    if (isPlaying) {
      handleStopAudio();
      setTimeout(handlePlayAudio, 100);
    }
  };

  const handleDownloadScript = () => {
    const blob = new Blob([scriptContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audio-briefing-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs font-sans animate-in fade-in duration-150">
      <div className="bg-[#120E08] border border-[#3A2D1B] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#221A10] bg-[#16110A]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059]">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#F5EADB]">Audio Overview & Voice Briefing</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#C5A059]/15 text-[#E5C170] border border-[#C5A059]/30 flex items-center gap-1">
                  <Radio className="w-3 h-3 text-[#C5A059] animate-pulse" />
                  Executive Audio
                </span>
              </div>
              <p className="text-xs text-[#888]">
                {selectedResource
                  ? `Sintesi vocale e approfondimento guidato di: "${selectedResource.title}"`
                  : `Executive Digest audio delle risorse principali del Vault`}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleStopAudio();
              onClose();
            }}
            className="p-1.5 rounded-lg text-[#888] hover:text-[#DDD] hover:bg-[#20180F] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Audio Player Controller Bar */}
        <div className="p-4 bg-[#18130B] border-b border-[#251C10] flex flex-wrap items-center justify-between gap-3">
          {/* Play/Pause Controls */}
          <div className="flex items-center gap-2">
            {!isPlaying ? (
              <button
                onClick={handlePlayAudio}
                disabled={isGeneratingScript || !scriptContent}
                className="px-4 py-2 bg-[#C5A059] hover:bg-[#D8B46B] text-black font-semibold text-xs rounded-xl flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>{isPaused ? "Riprendi" : "Ascolta Briefing"}</span>
              </button>
            ) : (
              <button
                onClick={handlePauseAudio}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                <span>Pausa</span>
              </button>
            )}

            <button
              onClick={handleStopAudio}
              disabled={!isPlaying && !isPaused}
              className="p-2 rounded-xl bg-[#221A10] hover:bg-[#2E2316] text-[#AAA] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              title="Ferma riproduzione"
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              onClick={generateBriefingScript}
              disabled={isGeneratingScript}
              className="p-2 rounded-xl bg-[#221A10] hover:bg-[#2E2316] text-[#AAA] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              title="Rigenera copione audio"
            >
              <RefreshCw className={`w-4 h-4 ${isGeneratingScript ? "animate-spin text-[#C5A059]" : ""}`} />
            </button>
          </div>

          {/* Rate and Voice Selection */}
          <div className="flex items-center gap-2 text-xs">
            {/* Speed selection */}
            <div className="flex items-center gap-1 bg-[#120E08] border border-[#2B2012] rounded-lg p-0.5 font-mono">
              {[0.8, 1.0, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`px-2 py-1 rounded text-[10.5px] transition-colors cursor-pointer ${
                    playbackRate === rate
                      ? "bg-[#C5A059] text-black font-bold"
                      : "text-[#888] hover:text-[#DDD]"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Voice dropdown */}
            {availableVoices.length > 0 && (
              <select
                value={selectedVoiceIndex}
                onChange={(e) => {
                  setSelectedVoiceIndex(Number(e.target.value));
                  if (isPlaying) {
                    handleStopAudio();
                    setTimeout(handlePlayAudio, 100);
                  }
                }}
                className="bg-[#120E08] border border-[#2B2012] rounded-lg px-2 py-1 text-xs text-[#DDD] font-mono focus:outline-hidden focus:border-[#C5A059] max-w-[130px] truncate"
              >
                {availableVoices.map((v, i) => (
                  <option key={v.name + i} value={i}>
                    {v.lang.startsWith("it") ? "🇮🇹 " : "🌐 "}
                    {v.name.slice(0, 16)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Dynamic Equalizer Visualizer during playback */}
        {isPlaying && (
          <div className="bg-[#140F09] px-4 py-2 border-b border-[#251C10] flex items-center justify-between text-xs font-mono text-[#C5A059]">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#C5A059]" />
              <span className="text-[11px]">Riproduzione attiva: frase {currentSentenceIndex + 1} di {sentencesRef.current.length}</span>
            </div>
            {/* Equalizer animation bars */}
            <div className="flex items-center gap-1 h-3">
              <span className="w-1 bg-[#C5A059] rounded-full animate-bounce h-2" style={{ animationDelay: "0ms" }} />
              <span className="w-1 bg-[#C5A059] rounded-full animate-bounce h-3" style={{ animationDelay: "150ms" }} />
              <span className="w-1 bg-[#C5A059] rounded-full animate-bounce h-1.5" style={{ animationDelay: "300ms" }} />
              <span className="w-1 bg-[#C5A059] rounded-full animate-bounce h-2.5" style={{ animationDelay: "75ms" }} />
            </div>
          </div>
        )}

        {/* Script Body with Read-Along Highlighting */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-[#DDD] leading-relaxed">
          {isGeneratingScript ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <RefreshCw className="w-6 h-6 text-[#C5A059] animate-spin" />
              <div className="text-sm font-medium text-[#E5C170]">Generazione copione audio con Gemini...</div>
              <div className="text-xs text-[#777]">Sintetizzazione concetti e ottimizzazione per ascolto naturale</div>
            </div>
          ) : (
            <div className="bg-[#0C0A06] border border-[#221A10] rounded-xl p-4 font-serif text-[14.5px] leading-relaxed space-y-2">
              {sentencesRef.current.map((sentence, idx) => {
                const isCurrent = isPlaying && idx === currentSentenceIndex;
                return (
                  <span
                    key={idx}
                    className={`transition-colors duration-200 ${
                      isCurrent
                        ? "bg-[#C5A059]/25 text-[#FFF] font-medium px-1 rounded shadow-xs"
                        : "text-[#CCC]"
                    }`}
                  >
                    {sentence}{" "}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#221A10] bg-[#16110A] flex items-center justify-between text-xs text-[#888]">
          <button
            onClick={handleDownloadScript}
            disabled={!scriptContent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20180F] hover:bg-[#2A2015] text-[#DDD] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Salva Copione (.md)</span>
          </button>

          <button
            onClick={() => {
              handleStopAudio();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-[#20180F] hover:bg-[#2A2015] text-[#DDD] font-medium transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
