import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Check
} from "lucide-react";

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  sourceFileName?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  sourceFileName,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [downloaded, setDownloaded] = useState(false);

  // Reset zoom & rotation whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setDownloaded(false);
    }
  }, [isOpen]);

  // Keyboard navigation: Esc to close, +/- to zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setScale((prev) => Math.min(prev + 0.25, 4));
      } else if (e.key === "-") {
        e.preventDefault();
        setScale((prev) => Math.max(prev - 0.25, 0.5));
      } else if (e.key === "0") {
        e.preventDefault();
        setScale(1);
        setRotation(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  const handleDownload = () => {
    const filename = sourceFileName || `${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-source.png`;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  if (!isOpen || !imageUrl) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-[#0A0A0A]/90 border-b border-[#222] shrink-0 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-4">
          <div className="p-1.5 rounded-lg bg-[#141208] border border-[#C5A059]/40 text-[#C5A059] shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white truncate" title={title}>
              {title}
            </h3>
            {sourceFileName && (
              <span className="text-[11px] font-mono text-[#888] truncate block">
                {sourceFileName}
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-mono text-[#AAA] bg-[#141414] border border-[#262626] px-2 py-1 rounded hidden sm:inline-block">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#262626] text-[#AAA] hover:text-white transition-colors cursor-pointer"
            title="Ingrandisci (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#262626] text-[#AAA] hover:text-white transition-colors cursor-pointer"
            title="Riduci (-)"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#262626] text-[#AAA] hover:text-white transition-colors cursor-pointer"
            title="Ruota 90°"
            aria-label="Ruota immagine"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#262626] text-[#AAA] hover:text-white transition-colors cursor-pointer text-xs font-mono hidden sm:flex items-center gap-1"
            title="Reimposta scala (0)"
            aria-label="Reset zoom"
          >
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className={`p-2 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono ${
              downloaded
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
                : "bg-[#141414] hover:bg-[#202020] border-[#262626] text-[#C5A059] hover:text-[#E5C170]"
            }`}
            title="Scarica immagine sorgente originale"
            aria-label="Scarica immagine"
          >
            {downloaded ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
            <span className="hidden md:inline">{downloaded ? "Scaricato!" : "Scarica"}</span>
          </button>

          <div className="h-5 w-px bg-[#262626] mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#1A1A1A] hover:bg-rose-950/50 border border-[#333] hover:border-rose-900/50 text-[#AAA] hover:text-rose-400 transition-colors cursor-pointer"
            title="Chiudi visualizzatore (Esc)"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image Viewport Canvas */}
      <div 
        className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-8 cursor-grab active:cursor-grabbing"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div 
          className="relative transition-transform duration-150 ease-out origin-center max-w-full max-h-full flex items-center justify-center"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageUrl}
            alt={title}
            className="max-w-[90vw] max-h-[82vh] object-contain rounded-lg shadow-2xl border border-[#222]"
            draggable={false}
          />
        </div>
      </div>

      {/* Bottom Context Bar */}
      <div 
        className="px-4 py-2 bg-[#0A0A0A]/90 border-t border-[#1C1C1C] flex items-center justify-between text-[11px] font-mono text-[#777] shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span>🔍 Scorciatoie: [+] Ingrandisci • [-] Riduci • [0] Reset • [Esc] Chiudi</span>
        <span className="text-[#C5A059]">Asset visivo analizzato con Vision Mandate OKF v0.2</span>
      </div>
    </div>,
    document.body
  );
};
