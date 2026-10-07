import React, { useState, useRef, useMemo } from "react";
import {
  Printer,
  X,
  FileText,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ThumbsDown,
  Wrench,
  Sparkles,
  Zap,
  ListChecks,
  ExternalLink,
  Info,
  Download,
  Check,
  Loader2,
  FileDown,
  Copy,
  Search,
  CheckSquare,
  Square,
  BookOpen,
  Layers,
  Award,
  Hash,
  Share2,
  Bookmark
} from "lucide-react";
import Markdown from "react-markdown";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { generateAgenticDossierSynthesis, AgenticDossierData } from "../lib/googleDriveDocs";
import { generateAndDownloadResourcePdf } from "../lib/pdfExport";

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If a single resource is provided, or a list of resources for dossier printing
  resource?: ResourceItem | null;
  resources?: ResourceItem[];
  title?: string;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  resource,
  resources,
  title: customTitle,
}) => {
  // Initial source items
  const baseItems: ResourceItem[] = useMemo(() => {
    if (resource) return [resource];
    if (resources && resources.length > 0) return resources;
    return [];
  }, [resource, resources]);

  const isMultiItem = !resource && baseItems.length > 1;

  // Selected item IDs for multi-resource printing
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(baseItems.map((item, idx) => item.id || `item-${idx}`));
  });
  const [itemSearchQuery, setItemSearchQuery] = useState("");

  // Custom Dossier Title
  const defaultTitle = customTitle || (baseItems.length === 1 ? baseItems[0].title : `Dossier Knowledge Vault (${baseItems.length} schede)`);
  const [dossierTitle, setDossierTitle] = useState(defaultTitle);

  // Active items to print based on selection
  const itemsToPrint = useMemo(() => {
    if (resource) return [resource];
    return baseItems.filter((item, idx) => selectedIds.has(item.id || `item-${idx}`));
  }, [baseItems, resource, selectedIds]);

  // Aggregated Statistics for Dossier Cover
  const stats = useMemo(() => {
    const total = itemsToPrint.length;
    const domains = new Set<string>();
    const tags = new Set<string>();
    let totalScore = 0;
    let scoredCount = 0;
    let totalEntities = 0;
    let totalRelations = 0;

    itemsToPrint.forEach((item) => {
      if (item.metadata?.domain) domains.add(item.metadata.domain);
      (item.tags || []).forEach((t) => tags.add(t));
      if (typeof item.metadata?.score === "number") {
        totalScore += item.metadata.score;
        scoredCount++;
      }
      if (Array.isArray(item.metadata?.entities)) {
        totalEntities += item.metadata.entities.length;
      }
      if (Array.isArray(item.metadata?.relations)) {
        totalRelations += item.metadata.relations.length;
      }
    });

    const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : null;
    return {
      total,
      domainsCount: domains.size,
      tagsCount: tags.size,
      avgScore,
      totalEntities,
      totalRelations,
      domainsList: Array.from(domains),
      tagsList: Array.from(tags).slice(0, 16),
    };
  }, [itemsToPrint]);

  // Filtered items for selector list
  const filteredBaseItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return baseItems;
    const q = itemSearchQuery.toLowerCase();
    return baseItems.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q) ||
        (it.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [baseItems, itemSearchQuery]);

  // Print Configuration Options
  const [layoutPreset, setLayoutPreset] = useState<"complete" | "diagnostic" | "executive" | "markdown">("complete");
  const [colorMode, setColorMode] = useState<"clean_accent" | "high_contrast_bw">("clean_accent");
  const [paperFormat, setPaperFormat] = useState<"a4" | "letter">("a4");
  const [fontSize, setFontSize] = useState<"compact" | "normal" | "spacious">("normal");

  // Multi-Resource Dossier Elements
  const [includeCoverPage, setIncludeCoverPage] = useState(isMultiItem);
  const [includeTableOfContents, setIncludeTableOfContents] = useState(isMultiItem);
  const [includeAgenticSynthesis, setIncludeAgenticSynthesis] = useState(false);
  const [agenticDossier, setAgenticDossier] = useState<AgenticDossierData | null>(null);
  const [isGeneratingSynthesis, setIsGeneratingSynthesis] = useState(false);

  // Section Visibility Toggles
  const [includeHeaderMeta, setIncludeHeaderMeta] = useState(true);
  const [includeOkfSpecs, setIncludeOkfSpecs] = useState(true);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [includeAiInsights, setIncludeAiInsights] = useState(true);
  const [includeUserNotes, setIncludeUserNotes] = useState(true);
  const [includeRelations, setIncludeRelations] = useState(true);
  const [includeMarkdownBody, setIncludeMarkdownBody] = useState(true);
  const [pageBreakBetweenItems, setPageBreakBetweenItems] = useState(true);
  const [includePrintFooter, setIncludePrintFooter] = useState(true);

  // State & Printing Tracking
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  // Synchronize selection and default title whenever the modal opens or baseItems changes
  React.useEffect(() => {
    if (isOpen && baseItems.length > 0) {
      setSelectedIds(new Set(baseItems.map((item, idx) => item.id || `item-${idx}`)));
      const newDefaultTitle = customTitle || (baseItems.length === 1 ? baseItems[0].title : `Dossier Knowledge Vault (${baseItems.length} schede)`);
      setDossierTitle(newDefaultTitle);
    }
  }, [isOpen, baseItems, customTitle]);

  // Close modal on Escape key press
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (baseItems.length === 0) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in font-sans"
        onClick={onClose}
      >
        <div 
          className="bg-[#0E0C09] border border-[#2D2413] w-full max-w-md rounded-2xl p-6 shadow-2xl text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-full bg-amber-950/40 border border-amber-800/40 text-amber-400 mx-auto flex items-center justify-center">
            <Printer className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">Nessuna scheda disponibile per il dossier</h3>
          <p className="text-xs text-[#888] leading-relaxed">
            I filtri attivi non contengono schede o il Vault è vuoto. Rimuovi i filtri di ricerca per visualizzare e stampare il dossier completo.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  // Preset changer handler
  const handlePresetChange = (preset: "complete" | "diagnostic" | "executive" | "markdown") => {
    setLayoutPreset(preset);
    if (preset === "complete") {
      setIncludeHeaderMeta(true);
      setIncludeOkfSpecs(true);
      setIncludeDiagnostics(true);
      setIncludeAiInsights(true);
      setIncludeUserNotes(true);
      setIncludeRelations(true);
      setIncludeMarkdownBody(true);
    } else if (preset === "diagnostic") {
      setIncludeHeaderMeta(true);
      setIncludeOkfSpecs(false);
      setIncludeDiagnostics(true);
      setIncludeAiInsights(false);
      setIncludeUserNotes(true);
      setIncludeRelations(false);
      setIncludeMarkdownBody(false);
    } else if (preset === "executive") {
      setIncludeHeaderMeta(true);
      setIncludeOkfSpecs(false);
      setIncludeDiagnostics(false);
      setIncludeAiInsights(true);
      setIncludeUserNotes(true);
      setIncludeRelations(false);
      setIncludeMarkdownBody(false);
    } else if (preset === "markdown") {
      setIncludeHeaderMeta(true);
      setIncludeOkfSpecs(true);
      setIncludeDiagnostics(false);
      setIncludeAiInsights(false);
      setIncludeUserNotes(false);
      setIncludeRelations(false);
      setIncludeMarkdownBody(true);
    }
  };

  // Selection helpers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(baseItems.map((item, idx) => item.id || `item-${idx}`)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Generate Epistemic Synthesis on-demand
  const handleTriggerSynthesis = async () => {
    if (itemsToPrint.length === 0) return;
    setIsGeneratingSynthesis(true);
    setPrintStatus("Generazione compendio ed insight con Orchestrator Multi-Agente...");

    try {
      const synthesis = await generateAgenticDossierSynthesis(
        itemsToPrint,
        dossierTitle || "Compendio Tecnico Knowledge Vault",
        "google_docs"
      );

      if (synthesis) {
        setAgenticDossier(synthesis);
        setIncludeAgenticSynthesis(true);
        setPrintStatus("Sintesi multi-agente generata e aggiunta al Dossier!");
      } else {
        setPrintStatus("Impossibile completare la sintesi automatica. Verrà visualizzato il sommario standard.");
      }
    } catch (err: any) {
      console.error("Dossier synthesis error:", err);
      setPrintStatus(`Errore sintesi: ${err?.message || "Servizio non disponibile"}`);
    } finally {
      setIsGeneratingSynthesis(false);
    }
  };

  // Generates complete Unified Markdown for export/clipboard
  const generateUnifiedMarkdown = (): string => {
    let md = `# ${dossierTitle}\n\n`;
    md += `> **Knowledge Vault · Compendio Documentale Epistemico**\n`;
    md += `> Standard di Conformità: OKF v0.2 | Schede: ${itemsToPrint.length}\n`;
    md += `> Generato il: ${new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}\n\n`;
    md += `---\n\n`;

    if (agenticDossier && includeAgenticSynthesis) {
      md += `## 🧠 Sintesi Epistemica Multi-Agente (Orchestrator)\n\n`;
      md += `### Compendio Esecutivo\n${agenticDossier.executiveSynthesis}\n\n`;

      if (agenticDossier.crossResourceInsights?.length) {
        md += `### Insight Trasversali Cross-Resource\n`;
        agenticDossier.crossResourceInsights.forEach((ins) => {
          md += `- ${ins}\n`;
        });
        md += `\n`;
      }

      if (agenticDossier.topologicalThemes?.length) {
        md += `### Temi Topologici Rilevati\n`;
        agenticDossier.topologicalThemes.forEach((theme) => {
          md += `- **${theme.theme}**: ${theme.description}\n`;
        });
        md += `\n`;
      }

      if (agenticDossier.openEpistemicQuestions?.length) {
        md += `### Domande Epistemiche & Aree di Approfondimento\n`;
        agenticDossier.openEpistemicQuestions.forEach((q) => {
          md += `- ? ${q}\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    }

    if (includeTableOfContents && itemsToPrint.length > 1) {
      md += `## 📑 Indice delle Schede Incluse\n\n`;
      itemsToPrint.forEach((item, idx) => {
        const domain = (item.metadata as any)?.domain ? `[${(item.metadata as any).domain}] ` : "";
        md += `${idx + 1}. **${item.title}** ${domain}— *${item.type}*\n`;
      });
      md += `\n---\n\n`;
    }

    itemsToPrint.forEach((item, index) => {
      md += `## ${index + 1}. ${item.title}\n\n`;
      md += `- **Tipo**: \`${item.type}\`\n`;
      if (item.metadata?.domain) md += `- **Dominio**: ${item.metadata.domain}\n`;
      if (item.metadata?.docType) md += `- **Formato Doc**: ${item.metadata.docType}\n`;
      if (typeof item.metadata?.score === "number") md += `- **Rating AI**: ${item.metadata.score}/100\n`;
      if (item.url) md += `- **Sorgente**: ${item.url}\n`;
      if (item.tags?.length) md += `- **Tag**: ${item.tags.map((t) => `#${t}`).join(" ")}\n`;
      md += `\n`;

      if (item.summary) {
        md += `### Sintesi\n${item.summary}\n\n`;
      }

      const hasDiagnostics = Boolean(
        item.metadata?.affectedSystem ||
          item.metadata?.rootCause ||
          (item.metadata?.solutionSteps && item.metadata.solutionSteps.length > 0)
      );

      if (includeDiagnostics && hasDiagnostics) {
        md += `### Diagnostica & Risoluzione Verificata\n`;
        if (item.metadata?.affectedSystem) md += `- **Sistema Coinvolto**: ${item.metadata.affectedSystem}\n`;
        if (item.metadata?.rootCause) md += `- **Causa Primaria**: ${item.metadata.rootCause}\n`;
        if (item.metadata?.solutionSteps?.length) {
          md += `- **Passaggi Risolutivi**:\n`;
          item.metadata.solutionSteps.forEach((step, sIdx) => {
            md += `  ${sIdx + 1}. ${step}\n`;
          });
        }
        md += `\n`;
      }

      if (includeAiInsights && item.metadata?.aiKeyTakeaways?.length) {
        md += `### Punti Chiave (Key Takeaways)\n`;
        item.metadata.aiKeyTakeaways.forEach((takeaway, tIdx) => {
          md += `${tIdx + 1}. ${takeaway}\n`;
        });
        md += `\n`;
      }

      if (includeMarkdownBody) {
        const rawMarkdown = item.metadata?.markdownContent || "";
        const cleanBody = rawMarkdown.replace(/^---[\s\S]*?---\n*/, "").trim();
        if (cleanBody) {
          md += `### Contenuto Integrale\n\n${cleanBody}\n\n`;
        }
      }

      md += `---\n\n`;
    });

    return md;
  };

  // Copy Markdown to Clipboard
  const handleCopyMarkdown = async () => {
    try {
      const md = generateUnifiedMarkdown();
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      setPrintStatus("Markdown completo del Dossier copiato negli appunti!");
      setTimeout(() => setCopiedMarkdown(false), 3000);
    } catch (err) {
      console.error("Copy error:", err);
      setPrintStatus("Impossibile copiare il markdown negli appunti.");
    }
  };

  // Download Markdown file (.md)
  const handleDownloadMarkdown = () => {
    try {
      const md = generateUnifiedMarkdown();
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const safeTitle = (dossierTitle || "dossier-knowledge-vault")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 45);

      link.href = url;
      link.download = `${safeTitle}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setPrintStatus("File Markdown (.md) del Dossier scaricato con successo!");
    } catch (err) {
      console.error("Download MD error:", err);
      setPrintStatus("Errore durante il download del file Markdown.");
    }
  };

  // Generates a complete standalone HTML document with all inline styles, typography and print bar
  const generateStandaloneHtml = (): string => {
    const sheetContent = printAreaRef.current ? printAreaRef.current.innerHTML : "";
    const docTitle = dossierTitle || (itemsToPrint.length === 1 ? itemsToPrint[0].title : `Dossier Knowledge Vault (${itemsToPrint.length} schede)`);

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
            serif: ['"Cinzel"', 'serif'],
          }
        }
      }
    }
  </script>
  <style>
    @page {
      margin: 12mm 15mm;
      size: ${paperFormat === "letter" ? "letter" : "A4"};
    }
    body {
      background-color: #f3f4f6;
      color: #111111;
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-wrapper {
      max-width: 900px;
      margin: 0 auto;
    }
    .no-print-bar {
      max-width: 900px;
      margin: 0 auto 20px auto;
      padding: 14px 20px;
      background: #111111;
      border: 1px solid #333333;
      border-radius: 12px;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      font-family: "Plus Jakarta Sans", sans-serif;
    }
    .print-action-btn {
      background: #C5A059;
      color: #000000;
      font-weight: 700;
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-family: "JetBrains Mono", monospace;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .print-action-btn:hover {
      background: #d5b069;
      transform: translateY(-1px);
    }
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .no-print-bar {
        display: none !important;
      }
      .page-break-after {
        page-break-after: always !important;
        break-after: page !important;
      }
      .avoid-break-inside {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div>
      <div style="font-size: 14px; font-weight: 700; color: #C5A059; display: flex; align-items: center; gap: 8px;">
        <span>🏛️</span>
        <span>Knowledge Vault · Documento Pronto per la Stampa</span>
      </div>
      <div style="font-size: 11.5px; color: #aaaaaa; margin-top: 2px;">
        Clicca il pulsante a destra oppure usa la scorciatoia <kbd style="background: #222; padding: 2px 5px; border-radius: 4px; font-family: monospace;">Ctrl+P</kbd> / <kbd style="background: #222; padding: 2px 5px; border-radius: 4px; font-family: monospace;">Cmd+P</kbd> per salvare in PDF o stampare.
      </div>
    </div>
    <button class="print-action-btn" onclick="window.print()">
      🖨️ Stampa / Salva in PDF
    </button>
  </div>

  <div class="print-wrapper">
    ${sheetContent}
  </div>

  <script>
    window.addEventListener('load', function() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('print') === '1') {
        setTimeout(function() {
          window.print();
        }, 500);
      }
    });
  </script>
</body>
</html>`;
  };

  // Method 1: Robust Direct Client-Side PDF Generation with page slicing fix & progress updates
  const handleDirectPdfExport = async () => {
    if (itemsToPrint.length === 0) return;
    setIsPrinting(true);
    setPrintStatus("Inizializzazione rendering PDF in alta definizione...");

    try {
      if (itemsToPrint.length === 1) {
        setPrintStatus("Generazione scheda tecnica PDF ad alta definizione...");
        await generateAndDownloadResourcePdf(itemsToPrint[0], {
          onProgress: (status) => setPrintStatus(status),
        });
        setPrintStatus("PDF generato e scaricato con successo nella cartella Download!");
        return;
      }

      if (!printAreaRef.current) return;
      const container = printAreaRef.current;
      const isLetter = paperFormat === "letter";
      const pdfWidth = isLetter ? 215.9 : 210;
      const pdfHeight = isLetter ? 279.4 : 297;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: isLetter ? "letter" : "a4",
        compress: true,
      });

      const pageElements = container.querySelectorAll<HTMLElement>(".printable-sheet-page, .printable-cover-page");

      if (pageElements && pageElements.length > 0) {
        let isFirstPage = true;

        for (let i = 0; i < pageElements.length; i++) {
          setPrintStatus(`Rendering sezione ${i + 1} di ${pageElements.length}...`);
          const pageEl = pageElements[i];

          try {
            const canvas = await html2canvas(pageEl, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: "#ffffff",
              windowWidth: 1024,
              imageTimeout: 12000,
            });

            const imgData = canvas.toDataURL("image/jpeg", 0.95);
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (!isFirstPage) {
              pdf.addPage();
            }
            isFirstPage = false;

            if (imgHeight <= pdfHeight) {
              pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeight);
            } else {
              // Correct multi-page slicing algorithm
              let position = 0;
              pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
              let heightLeft = imgHeight - pdfHeight;

              while (heightLeft > 0) {
                position -= pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
              }
            }
          } catch (pageErr) {
            console.warn(`Non-fatal warning rendering page ${i + 1}:`, pageErr);
          }
        }
      } else {
        setPrintStatus("Elaborazione documento intero...");
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 1024,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        let position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
        let heightLeft = imgHeight - pdfHeight;

        while (heightLeft > 0) {
          position -= pdfHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      const safeTitle = (dossierTitle || (itemsToPrint.length === 1 ? itemsToPrint[0].title : "dossier-knowledge-vault"))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 45);

      pdf.save(`${safeTitle}.pdf`);
      setPrintStatus("PDF generato e scaricato con successo nella cartella Download!");
    } catch (err) {
      console.error("PDF generation error:", err);
      setPrintStatus("Impossibile generare il PDF direttamente con html2canvas. Usa 'Nuova Scheda' o 'Scarica HTML'.");
    } finally {
      setIsPrinting(false);
    }
  };

  // Method 2: Open in a clean new tab using a Blob URL
  const handleOpenInNewTab = () => {
    if (itemsToPrint.length === 0) {
      setPrintStatus("Seleziona almeno una scheda prima di aprire la nuova scheda.");
      return;
    }
    try {
      const fullHtml = generateStandaloneHtml();
      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);

      const openedWindow = window.open(blobUrl, "_blank");
      if (!openedWindow) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }
      setPrintStatus("Documento aperto in una nuova scheda! Usa Ctrl+P per stampare o salvare in PDF.");
    } catch (err) {
      console.error("Open in new tab error:", err);
      handleDownloadHtml();
    }
  };

  // Method 3: Download standalone HTML report
  const handleDownloadHtml = () => {
    if (itemsToPrint.length === 0) {
      setPrintStatus("Seleziona almeno una scheda prima di scaricare l'HTML.");
      return;
    }
    try {
      const fullHtml = generateStandaloneHtml();
      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const safeTitle = (dossierTitle || "dossier-knowledge-vault")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);

      link.href = url;
      link.download = `stampa-${safeTitle}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setPrintStatus("File HTML stampabile scaricato con successo!");
    } catch (err) {
      console.error("Download HTML error:", err);
    }
  };

  // Method 4: Hidden Iframe Print Attempt
  const handleTriggerPrint = () => {
    if (itemsToPrint.length === 0) {
      setPrintStatus("Seleziona almeno una scheda prima di procedere con la stampa.");
      return;
    }
    setIsPrinting(true);
    setPrintStatus("Avvio finestra di stampa del browser in corso...");

    try {
      const fullHtml = generateStandaloneHtml();

      const oldFrame = document.getElementById("knowledge-vault-print-frame");
      if (oldFrame && oldFrame.parentNode) {
        oldFrame.parentNode.removeChild(oldFrame);
      }

      const printIframe = document.createElement("iframe");
      printIframe.id = "knowledge-vault-print-frame";
      printIframe.setAttribute("style", "position:fixed;top:0;left:0;width:10px;height:10px;opacity:0.01;pointer-events:none;z-index:-999;border:none;");
      document.body.appendChild(printIframe);

      const frameDoc = printIframe.contentWindow?.document || printIframe.contentDocument;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(fullHtml);
        frameDoc.close();

        setTimeout(() => {
          try {
            printIframe.contentWindow?.focus();
            printIframe.contentWindow?.print();
            setPrintStatus("Se la finestra di stampa non appare, clicca su 'Scarica PDF' o 'Nuova Scheda'.");
          } catch (err) {
            console.warn("Direct iframe print blocked by sandbox, attempting native window.print:", err);
            try {
              window.print();
            } catch (wErr) {
              console.warn("window.print failed:", wErr);
            }
          }
          setIsPrinting(false);
        }, 350);
      } else {
        window.print();
        setIsPrinting(false);
      }
    } catch (e) {
      console.warn("Print error:", e);
      try {
        window.print();
      } catch (err2) {
        console.error("Window print error:", err2);
      }
      setIsPrinting(false);
    }
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case "compact":
        return "text-[10px] leading-relaxed";
      case "spacious":
        return "text-[13px] leading-relaxed";
      case "normal":
      default:
        return "text-[11.5px] leading-relaxed";
    }
  };

  const getTypeLabel = (type: ResourceType) => {
    switch (type) {
      case "knowledge":
        return "OKF Knowledge v0.2";
      case "troubleshooting":
        return "Scheda Diagnostica & Soluzione";
      case "paper":
        return "Paper Scientifico (Research)";
      case "rss":
        return "Feed RSS / Aggiornamenti";
      case "note":
        return "Nota & Scratchpad";
      case "github_repo":
        return "Repository GitHub";
      case "mcp_server":
        return "Server MCP";
      case "ai_skill":
        return "AI Prompt & Skill";
      case "article":
        return "Articolo Tecnico";
      default:
        return "Risorsa Web";
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#0D0D0D] border border-[#262626] rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Dialog Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#1E1E1E] bg-[#080808] flex items-center justify-between gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#181818] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-serif text-white font-medium truncate flex items-center gap-2">
                <span>Stampa & Esportazione Dossier Tecnico</span>
                <span className="text-[10px] font-mono bg-[#1C160B] text-[#C5A059] border border-[#C5A059]/30 px-2 py-0.5 rounded">
                  {itemsToPrint.length} {itemsToPrint.length === 1 ? "Scheda" : "Schede"}
                </span>
              </h2>
              <p className="text-[11px] text-[#777] truncate">
                {dossierTitle}
              </p>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1.5 bg-[#141414] hover:bg-[#1E1E1E] text-[#CCC] hover:text-white border border-[#2B2B2B] font-mono text-xs px-2.5 py-2 rounded-lg transition-all active:scale-95 cursor-pointer"
              title="Copia negli appunti l'intero dossier in formato Markdown"
            >
              {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#AAA]" />}
              <span className="hidden md:inline">{copiedMarkdown ? "Copiato" : "Copia .md"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 bg-[#141414] hover:bg-[#1E1E1E] text-[#CCC] hover:text-white border border-[#2B2B2B] font-mono text-xs px-2.5 py-2 rounded-lg transition-all active:scale-95 cursor-pointer"
              title="Scarica file Markdown autonomo del Dossier"
            >
              <Download className="w-3.5 h-3.5 text-[#AAA]" />
              <span className="hidden lg:inline">Scarica .md</span>
            </button>

            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="flex items-center gap-1.5 bg-[#1C160B] hover:bg-[#2A2010] text-[#E5C170] border border-[#C5A059]/40 font-mono text-xs px-2.5 sm:px-3 py-2 rounded-lg transition-all active:scale-95 cursor-pointer"
              title="Apri documento in una nuova scheda a schermo intero (Ctrl+P)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="hidden sm:inline">Nuova Scheda</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="flex items-center gap-1.5 bg-[#141414] hover:bg-[#1E1E1E] text-[#CCC] hover:text-white border border-[#2B2B2B] font-mono text-xs px-2.5 py-2 rounded-lg transition-all active:scale-95 cursor-pointer"
              title="Scarica documento HTML autonomo con impaginazione"
            >
              <FileText className="w-3.5 h-3.5 text-[#AAA]" />
              <span className="hidden xl:inline">HTML</span>
            </button>

            <button
              type="button"
              onClick={handleTriggerPrint}
              disabled={isPrinting}
              className="flex items-center gap-1.5 bg-[#141414] hover:bg-[#1E1E1E] text-[#CCC] hover:text-[#C5A059] border border-[#2B2B2B] font-mono text-xs px-2.5 sm:px-3 py-2 rounded-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Invia al comando di stampa nativo del browser"
            >
              <Printer className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="hidden sm:inline">Stampa</span>
            </button>

            {/* Primary Action: Direct Download PDF to PC */}
            <button
              type="button"
              onClick={handleDirectPdfExport}
              disabled={isPrinting}
              className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs font-mono px-3.5 sm:px-4 py-2 rounded-lg transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              title="Genera e scarica direttamente il file PDF impaginato"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 text-black animate-spin stroke-[2.5]" />
              ) : (
                <FileDown className="w-4 h-4 text-black stroke-[2.5]" />
              )}
              <span>{isPrinting ? "Generazione..." : "Scarica PDF"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-[#777] hover:text-white bg-[#141414] hover:bg-[#202020] border border-[#262626] rounded-lg transition-colors"
              aria-label="Chiudi anteprima"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Status / Info banner if triggered */}
        {printStatus && (
          <div className="bg-[#141108] border-b border-[#C5A059]/30 px-4 py-2 flex items-center justify-between text-xs font-mono text-[#E5C170] shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>{printStatus}</span>
            </div>
            <button
              onClick={() => setPrintStatus(null)}
              className="text-[#888] hover:text-white text-[11px] underline ml-3"
            >
              Nascondi
            </button>
          </div>
        )}

        {/* Main Body: Controls Sidebar + Live Print Sheet Canvas */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-[#0A0A0A]">
          {/* Controls Sidebar */}
          <div className="w-full lg:w-88 bg-[#0E0E0E] border-b lg:border-b-0 lg:border-r border-[#1C1C1C] p-4 sm:p-5 overflow-y-auto space-y-5 shrink-0">
            {/* Dossier Title Customizer */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase text-[#C5A059] font-bold tracking-wider flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-[#C5A059]" />
                <span>Titolo del Dossier</span>
              </label>
              <input
                type="text"
                value={dossierTitle}
                onChange={(e) => setDossierTitle(e.target.value)}
                placeholder="Titolo compendio..."
                className="w-full bg-[#141414] border border-[#2B2B2B] focus:border-[#C5A059] rounded-lg px-3 py-1.5 text-xs text-white outline-none font-sans transition-all"
              />
            </div>

            {/* Multi-Item Selection Box (Only when multiple resources available) */}
            {isMultiItem && (
              <div className="space-y-2 pt-3 border-t border-[#1C1C1C]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase text-[#777] font-semibold tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-[#777]" />
                    <span>Schede Incluse ({itemsToPrint.length}/{baseItems.length})</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[#C5A059] hover:underline"
                    >
                      Tutte
                    </button>
                    <span className="text-[#444]">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-[#888] hover:text-white"
                    >
                      Nessuna
                    </button>
                  </div>
                </div>

                {/* Quick Search */}
                <div className="relative">
                  <Search className="w-3 h-3 text-[#666] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder="Filtra schede per titolo o tag..."
                    className="w-full bg-[#141414] border border-[#262626] rounded-md pl-7 pr-2.5 py-1 text-[11px] text-[#CCC] placeholder-[#555] outline-none font-mono"
                  />
                </div>

                {/* Item Checkbox List */}
                <div className="max-h-40 overflow-y-auto space-y-1 bg-[#090909] border border-[#1A1A1A] rounded-lg p-1.5">
                  {filteredBaseItems.map((it, idx) => {
                    const itemId = it.id || `item-${idx}`;
                    const isChecked = selectedIds.has(itemId);
                    return (
                      <div
                        key={itemId}
                        onClick={() => handleToggleSelect(itemId)}
                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs transition-colors ${
                          isChecked ? "bg-[#1C170A] text-[#E5C170]" : "text-[#777] hover:bg-[#141414] hover:text-[#BBB]"
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-[#555] shrink-0" />
                        )}
                        <span className="truncate flex-1 font-sans">{it.title}</span>
                        <span className="text-[9px] font-mono text-[#666] shrink-0 uppercase">
                          {it.type.slice(0, 4)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Presets */}
            <div className="space-y-2 pt-3 border-t border-[#1C1C1C]">
              <div className="text-[10px] font-mono uppercase text-[#C5A059] font-bold tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-[#C5A059]" />
                <span>Preset di Layout</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePresetChange("complete")}
                  className={`px-2.5 py-2 text-[11px] font-mono rounded-lg border text-left transition-all ${
                    layoutPreset === "complete"
                      ? "bg-[#251D0C] border-[#C5A059] text-[#E5C170] font-medium"
                      : "bg-[#141414] border-[#222] text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  Dossier Completo
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetChange("diagnostic")}
                  className={`px-2.5 py-2 text-[11px] font-mono rounded-lg border text-left transition-all ${
                    layoutPreset === "diagnostic"
                      ? "bg-[#251208] border-[#F97316] text-[#FDBA74] font-medium"
                      : "bg-[#141414] border-[#222] text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  Diagnostica & Fix
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetChange("executive")}
                  className={`px-2.5 py-2 text-[11px] font-mono rounded-lg border text-left transition-all ${
                    layoutPreset === "executive"
                      ? "bg-[#251D0C] border-[#C5A059] text-[#E5C170] font-medium"
                      : "bg-[#141414] border-[#222] text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  Brief Esecutivo
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetChange("markdown")}
                  className={`px-2.5 py-2 text-[11px] font-mono rounded-lg border text-left transition-all ${
                    layoutPreset === "markdown"
                      ? "bg-[#171717] border-[#555] text-white font-medium"
                      : "bg-[#141414] border-[#222] text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  Markdown Puro
                </button>
              </div>
            </div>

            {/* Dossier Structure Toggles (Cover, TOC, AI Synthesis) */}
            {isMultiItem && (
              <div className="space-y-2.5 pt-3 border-t border-[#1C1C1C]">
                <div className="text-[10px] font-mono uppercase text-[#777] font-semibold tracking-wider">
                  Struttura Editoriale Dossier
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeCoverPage}
                      onChange={(e) => setIncludeCoverPage(e.target.checked)}
                      className="accent-[#C5A059] rounded"
                    />
                    <span>Frontespizio / Copertina Istituzionale</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeTableOfContents}
                      onChange={(e) => setIncludeTableOfContents(e.target.checked)}
                      className="accent-[#C5A059] rounded"
                    />
                    <span>Indice / Sommario Esecutivo delle Schede</span>
                  </label>

                  {/* Multi-Agent Synthesis Section */}
                  <div className="pt-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-[#E5C170] hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeAgenticSynthesis}
                          onChange={(e) => setIncludeAgenticSynthesis(e.target.checked)}
                          className="accent-[#C5A059] rounded"
                        />
                        <span>Sintesi Epistemica Multi-Agente</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleTriggerSynthesis}
                        disabled={isGeneratingSynthesis || itemsToPrint.length === 0}
                        className="px-2 py-1 bg-[#1C160B] hover:bg-[#2A2010] text-[#E5C170] border border-[#C5A059]/40 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isGeneratingSynthesis ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[#C5A059]" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-[#C5A059]" />
                        )}
                        <span>{agenticDossier ? "Rigenera" : "Genera AI"}</span>
                      </button>
                    </div>
                    {agenticDossier && (
                      <p className="text-[10px] text-[#888] font-mono mt-1 pl-5">
                        ✓ Compendio generato per {itemsToPrint.length} risorse.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Print Style & Typography */}
            <div className="space-y-3 pt-3 border-t border-[#1C1C1C]">
              <div className="text-[10px] font-mono uppercase text-[#777] font-semibold tracking-wider">
                Stile & Formato Carta
              </div>

              {/* Paper Format */}
              <div>
                <label className="text-[11px] text-[#999] block mb-1.5">Formato Foglio</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaperFormat("a4")}
                    className={`px-2.5 py-1.5 text-[11px] font-mono rounded-lg border text-center transition-all ${
                      paperFormat === "a4"
                        ? "bg-[#1C160B] border-[#C5A059]/60 text-[#E5C170]"
                        : "bg-[#141414] border-[#222] text-[#777] hover:text-[#AAA]"
                    }`}
                  >
                    A4 (210 × 297 mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperFormat("letter")}
                    className={`px-2.5 py-1.5 text-[11px] font-mono rounded-lg border text-center transition-all ${
                      paperFormat === "letter"
                        ? "bg-[#1C160B] border-[#C5A059]/60 text-[#E5C170]"
                        : "bg-[#141414] border-[#222] text-[#777] hover:text-[#AAA]"
                    }`}
                  >
                    US Letter
                  </button>
                </div>
              </div>

              {/* Color Mode */}
              <div>
                <label className="text-[11px] text-[#999] block mb-1.5">Schema Colori Stampa</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setColorMode("clean_accent")}
                    className={`px-2.5 py-1.5 text-[11px] font-mono rounded-lg border text-center transition-all ${
                      colorMode === "clean_accent"
                        ? "bg-[#1C160B] border-[#C5A059]/60 text-[#E5C170]"
                        : "bg-[#141414] border-[#222] text-[#777] hover:text-[#AAA]"
                    }`}
                  >
                    Colori & Accenti
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode("high_contrast_bw")}
                    className={`px-2.5 py-1.5 text-[11px] font-mono rounded-lg border text-center transition-all ${
                      colorMode === "high_contrast_bw"
                        ? "bg-[#1F1F1F] border-[#666] text-white"
                        : "bg-[#141414] border-[#222] text-[#777] hover:text-[#AAA]"
                    }`}
                  >
                    B/N Alto Contrasto
                  </button>
                </div>
              </div>

              {/* Font Size */}
              <div>
                <label className="text-[11px] text-[#999] block mb-1.5">Dimensione Testo</label>
                <div className="grid grid-cols-3 gap-1">
                  {(["compact", "normal", "spacious"] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setFontSize(size)}
                      className={`px-1.5 py-1 text-[10px] font-mono rounded border capitalize transition-all ${
                        fontSize === size
                          ? "bg-[#1F1F1F] border-[#C5A059] text-[#C5A059]"
                          : "bg-[#141414] border-[#222] text-[#777] hover:text-[#BBB]"
                      }`}
                    >
                      {size === "compact" ? "Compatto" : size === "normal" ? "Standard" : "Grande"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom Section Checkboxes */}
            <div className="space-y-2 pt-3 border-t border-[#1C1C1C]">
              <div className="text-[10px] font-mono uppercase text-[#777] font-semibold tracking-wider">
                Dettagli Scheda
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeHeaderMeta}
                    onChange={(e) => setIncludeHeaderMeta(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Intestazione, Badge & URL</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeOkfSpecs}
                    onChange={(e) => setIncludeOkfSpecs(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Specifiche & Metadati OKF v0.2</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Scheda Diagnostica & Soluzione Fix</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeAiInsights}
                    onChange={(e) => setIncludeAiInsights(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Sintesi Esecutiva & Takeaways AI</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeUserNotes}
                    onChange={(e) => setIncludeUserNotes(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Note Personali / Annotazioni</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeRelations}
                    onChange={(e) => setIncludeRelations(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Entità & Relazioni Ontologiche</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeMarkdownBody}
                    onChange={(e) => setIncludeMarkdownBody(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Contenuto Markdown Completo</span>
                </label>

                {itemsToPrint.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-[#E5C170] hover:text-white cursor-pointer select-none pt-1 border-t border-[#1C1C1C]">
                    <input
                      type="checkbox"
                      checked={pageBreakBetweenItems}
                      onChange={(e) => setPageBreakBetweenItems(e.target.checked)}
                      className="accent-[#C5A059] rounded"
                    />
                    <span>Salto Pagina tra le schede</span>
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-[#AAA] hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includePrintFooter}
                    onChange={(e) => setIncludePrintFooter(e.target.checked)}
                    className="accent-[#C5A059] rounded"
                  />
                  <span>Piè di pagina con data & vault ID</span>
                </label>
              </div>
            </div>

            {/* Iframe & Print Tips Callout */}
            <div className="p-3 bg-[#161616] border border-[#2B2B2B] rounded-xl space-y-1.5 text-[11px] text-[#888]">
              <div className="font-semibold text-[#C5A059] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Suggerimento Stampa & PDF</span>
              </div>
              <p className="leading-normal">
                Per salvare il Dossier in formato vettoriale puro con margini di stampa personalizzabili, puoi usare <strong className="text-white">"Nuova Scheda"</strong> e premere <code className="text-[#C5A059] bg-[#000] px-1 py-0.5 rounded">Ctrl+P</code>.
              </p>
            </div>
          </div>

          {/* Live Print Canvas Sheet */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#111111] flex justify-center">
            {/* The printable sheet wrapper with pure white/neutral paper styling */}
            <div
              id="printable-vault-document"
              ref={printAreaRef}
              className={`w-full max-w-[850px] shadow-2xl transition-all ${
                colorMode === "high_contrast_bw" ? "print-theme-bw" : "print-theme-color"
              }`}
            >
              {/* DOSSIER COVER PAGE (When enabled in multi-item mode) */}
              {isMultiItem && includeCoverPage && (
                <div
                  className={`printable-cover-page bg-white text-[#111111] p-10 sm:p-14 rounded-xl mb-8 border border-neutral-300 print:border-none print:shadow-none print:m-0 print:p-12 print:rounded-none page-break-after flex flex-col justify-between`}
                  style={{ minHeight: "1050px" }}
                >
                  {/* Top Branding */}
                  <div>
                    <div className="flex items-center justify-between pb-6 border-b-2 border-neutral-900">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-neutral-900 text-[#C5A059] flex items-center justify-center font-serif font-bold text-base rounded">
                          KV
                        </div>
                        <div>
                          <div className="font-serif font-bold text-sm uppercase tracking-widest text-neutral-900">
                            Knowledge Vault
                          </div>
                          <div className="font-mono text-[9px] text-neutral-500 uppercase tracking-wider">
                            Ontological Knowledge Format · Standard OKF v0.2
                          </div>
                        </div>
                      </div>
                      <div className="font-mono text-[10px] text-neutral-600 bg-neutral-100 border border-neutral-300 px-3 py-1 rounded">
                        CONFIDENZIALE &bull; AD USO INTERNO
                      </div>
                    </div>

                    {/* Dossier Title Box */}
                    <div className="mt-16 space-y-4">
                      <div className="font-mono text-xs uppercase tracking-widest text-neutral-500 font-semibold">
                        Compendio Documentale & Analisi Topologica
                      </div>
                      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-neutral-900 leading-tight">
                        {dossierTitle}
                      </h1>
                      <p className="text-base text-neutral-700 font-serif italic max-w-2xl leading-relaxed">
                        Raccolta strutturata e certificata di {itemsToPrint.length} nodi di conoscenza estratti e validati secondo il protocollo epistemico Zero-Guessing.
                      </p>
                    </div>

                    {/* Aggregate Statistical Metrics */}
                    <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-neutral-50 border border-neutral-300 p-4 rounded-lg">
                        <div className="font-mono text-[10px] uppercase text-neutral-500">Schede Nodi</div>
                        <div className="font-mono text-2xl font-bold text-neutral-900 mt-1">{stats.total}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">Selezionate</div>
                      </div>

                      <div className="bg-neutral-50 border border-neutral-300 p-4 rounded-lg">
                        <div className="font-mono text-[10px] uppercase text-neutral-500">Domini Tecnici</div>
                        <div className="font-mono text-2xl font-bold text-neutral-900 mt-1">{stats.domainsCount}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">Aree coperte</div>
                      </div>

                      <div className="bg-neutral-50 border border-neutral-300 p-4 rounded-lg">
                        <div className="font-mono text-[10px] uppercase text-neutral-500">Entità & Relazioni</div>
                        <div className="font-mono text-2xl font-bold text-neutral-900 mt-1">{stats.totalEntities + stats.totalRelations}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">Nodi & Archi Grafo</div>
                      </div>

                      <div className="bg-neutral-50 border border-neutral-300 p-4 rounded-lg">
                        <div className="font-mono text-[10px] uppercase text-neutral-500">Rating Epistemico</div>
                        <div className="font-mono text-2xl font-bold text-neutral-900 mt-1">
                          {stats.avgScore ? `${stats.avgScore}/100` : "N/D"}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">Qualità media</div>
                      </div>
                    </div>

                    {/* Domains & Tags Preview */}
                    <div className="mt-10 space-y-3">
                      {stats.domainsList.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-mono text-[10px] uppercase text-neutral-500 font-semibold">
                            Domini Coinvolti:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {stats.domainsList.map((d, i) => (
                              <span key={i} className="font-mono text-[10px] bg-neutral-100 border border-neutral-300 text-neutral-800 px-2 py-0.5 rounded">
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {stats.tagsList.length > 0 && (
                        <div className="space-y-1 pt-2">
                          <div className="font-mono text-[10px] uppercase text-neutral-500 font-semibold">
                            Tag & Argomenti Chiave:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {stats.tagsList.map((t, i) => (
                              <span key={i} className="font-mono text-[10px] bg-neutral-50 text-neutral-600 border border-neutral-200 px-1.5 py-0.2 rounded">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cover Footer */}
                  <div className="pt-8 border-t border-neutral-300 flex items-center justify-between text-xs font-mono text-neutral-500">
                    <div>
                      Compilato da: <strong>Knowledge Vault Engine</strong>
                    </div>
                    <div>
                      {formatDate(new Date(), "full")}
                    </div>
                  </div>
                </div>
              )}

              {/* TABLE OF CONTENTS PAGE (When enabled in multi-item mode) */}
              {isMultiItem && includeTableOfContents && itemsToPrint.length > 1 && (
                <div
                  className={`printable-sheet-page bg-white text-[#111111] p-10 sm:p-14 rounded-xl mb-8 border border-neutral-300 print:border-none print:shadow-none print:m-0 print:p-10 print:rounded-none page-break-after ${getFontSizeClass()}`}
                  style={{ minHeight: "1050px" }}
                >
                  <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-neutral-900 text-[#C5A059] flex items-center justify-center font-serif font-bold text-xs rounded">
                        KV
                      </div>
                      <span className="font-serif font-bold text-xs uppercase tracking-widest text-neutral-900">
                        Sommario & Indice Esecutivo delle Risorse
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-500">
                      {itemsToPrint.length} Schede Registrate
                    </span>
                  </div>

                  <h2 className="text-2xl font-serif font-bold text-neutral-900 mb-4">
                    Indice dei Contenuti
                  </h2>
                  <p className="text-neutral-600 mb-6 italic">
                    Elenco ordinato delle schede tecniche incluse nel compendio con riferimento alla tipologia e ambito concettuale.
                  </p>

                  <div className="divide-y divide-neutral-200 border-y border-neutral-300">
                    {itemsToPrint.map((item, idx) => (
                      <div key={item.id || idx} className="py-2.5 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="font-mono font-bold text-xs text-neutral-900 shrink-0 w-6">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-900 truncate">{item.title}</div>
                            {item.summary && (
                              <p className="text-neutral-500 text-[10.5px] truncate max-w-xl">
                                {item.summary}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                          <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.5 rounded text-neutral-700 uppercase">
                            {item.type}
                          </span>
                          {typeof item.metadata?.score === "number" && (
                            <span className="font-bold text-neutral-900">
                              {item.metadata.score}/100
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {includePrintFooter && (
                    <div className="mt-12 pt-3 border-t border-neutral-300 flex items-center justify-between text-[9.5px] font-mono text-neutral-500">
                      <span>Knowledge Vault &bull; Indice Esecutivo</span>
                      <span>Generato il {formatDate(new Date(), "short")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* AI AGENTIC SYNTHESIS COMPENDIUM (When generated) */}
              {agenticDossier && includeAgenticSynthesis && (
                <div
                  className={`printable-sheet-page bg-white text-[#111111] p-10 sm:p-14 rounded-xl mb-8 border border-neutral-300 print:border-none print:shadow-none print:m-0 print:p-10 print:rounded-none page-break-after ${getFontSizeClass()}`}
                  style={{ minHeight: "1050px" }}
                >
                  <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-neutral-900 text-[#C5A059] flex items-center justify-center font-serif font-bold text-xs rounded">
                        AI
                      </div>
                      <span className="font-serif font-bold text-xs uppercase tracking-widest text-neutral-900">
                        Sintesi Epistemica Multi-Agente &bull; Orchestrator
                      </span>
                    </div>
                    <span className="font-mono text-[10px] bg-neutral-100 border border-neutral-300 px-2 py-0.5 rounded text-neutral-700">
                      Certificato Cekikj
                    </span>
                  </div>

                  <h2 className="text-2xl font-serif font-bold text-neutral-900 mb-2">
                    {agenticDossier.dossierTitle}
                  </h2>
                  <p className="font-mono text-[11px] text-neutral-500 uppercase tracking-wide mb-6">
                    Compendio Esecutivo di Ricerca & Sinergie Topologiche
                  </p>

                  {/* Executive Synthesis */}
                  <div className="bg-neutral-50 border border-neutral-300 rounded-lg p-4 mb-6 space-y-2">
                    <div className="font-mono text-xs font-bold uppercase text-neutral-900 flex items-center gap-2 border-b border-neutral-200 pb-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-neutral-900" />
                      <span>Sintesi Esecutiva Unificata</span>
                    </div>
                    <p className="text-neutral-800 leading-relaxed font-sans">
                      {agenticDossier.executiveSynthesis}
                    </p>
                  </div>

                  {/* Cross-Resource Insights */}
                  {agenticDossier.crossResourceInsights && agenticDossier.crossResourceInsights.length > 0 && (
                    <div className="bg-neutral-50 border border-neutral-300 rounded-lg p-4 mb-6 space-y-2">
                      <div className="font-mono text-xs font-bold uppercase text-neutral-900 flex items-center gap-2 border-b border-neutral-200 pb-1.5">
                        <Zap className="w-3.5 h-3.5 text-neutral-900" />
                        <span>Insight Trasversali (Cross-Resource Analysis)</span>
                      </div>
                      <ul className="space-y-1.5 font-sans text-neutral-800 text-xs">
                        {agenticDossier.crossResourceInsights.map((ins, i) => (
                          <li key={i} className="flex items-start gap-2 bg-white p-2 rounded border border-neutral-200">
                            <span className="font-mono font-bold text-neutral-900 text-[10px] shrink-0">0{i + 1}.</span>
                            <span className="leading-relaxed">{ins}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Topological Themes */}
                  {agenticDossier.topologicalThemes && agenticDossier.topologicalThemes.length > 0 && (
                    <div className="bg-neutral-50 border border-neutral-300 rounded-lg p-4 mb-6 space-y-2">
                      <div className="font-mono text-xs font-bold uppercase text-neutral-900 flex items-center gap-2 border-b border-neutral-200 pb-1.5">
                        <Layers className="w-3.5 h-3.5 text-neutral-900" />
                        <span>Temi Topologici & Cluster di Conoscenza</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {agenticDossier.topologicalThemes.map((theme, i) => (
                          <div key={i} className="bg-white p-3 rounded border border-neutral-200 space-y-1">
                            <div className="font-semibold text-neutral-900">{theme.theme}</div>
                            <p className="text-neutral-600 text-[11px] leading-relaxed">{theme.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open Questions */}
                  {agenticDossier.openEpistemicQuestions && agenticDossier.openEpistemicQuestions.length > 0 && (
                    <div className="bg-neutral-50 border border-neutral-300 rounded-lg p-4 space-y-2">
                      <div className="font-mono text-xs font-bold uppercase text-neutral-900 flex items-center gap-2 border-b border-neutral-200 pb-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-neutral-900" />
                        <span>Domande Epistemiche & Prospettive Aperte</span>
                      </div>
                      <ul className="space-y-1 font-sans text-neutral-800 text-xs">
                        {agenticDossier.openEpistemicQuestions.map((q, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="font-mono font-bold text-neutral-700">?</span>
                            <span className="italic">{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {includePrintFooter && (
                    <div className="mt-12 pt-3 border-t border-neutral-300 flex items-center justify-between text-[9.5px] font-mono text-neutral-500">
                      <span>Sintesi Multi-Agente Knowledge Vault</span>
                      <span>Generato il {formatDate(new Date(), "short")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* INDIVIDUAL RESOURCE SHEETS */}
              {itemsToPrint.map((item, index) => {
                const score = typeof item.metadata?.score === "number" ? item.metadata.score : null;
                const formattedDate = formatDate(item.createdAt || item.updatedAt || new Date(), "full");
                const hasDiagnostics = Boolean(
                  item.metadata?.affectedSystem ||
                    item.metadata?.rootCause ||
                    (item.metadata?.solutionSteps && item.metadata.solutionSteps.length > 0) ||
                    (item.metadata?.attemptedFixes && item.metadata.attemptedFixes.length > 0)
                );
                const rawMarkdown = item.metadata?.markdownContent || "";
                const contentBody = rawMarkdown.replace(/^---[\s\S]*?---\n*/, "") || item.summary;

                return (
                  <div
                    key={item.id || index}
                    className={`printable-sheet-page bg-white text-[#111111] p-8 sm:p-10 rounded-xl mb-8 border border-neutral-300 print:border-none print:shadow-none print:m-0 print:p-8 print:rounded-none ${
                      pageBreakBetweenItems && index < itemsToPrint.length - 1 ? "page-break-after" : ""
                    } ${getFontSizeClass()}`}
                    style={{ minHeight: "1050px" }}
                  >
                    {/* Sheet Header Branding */}
                    <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 mb-6">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-neutral-900 text-[#C5A059] flex items-center justify-center font-serif font-bold text-xs rounded">
                          KV
                        </div>
                        <span className="font-serif font-bold text-xs uppercase tracking-widest text-neutral-900">
                          Knowledge Vault &bull; Scheda Tecnica #{index + 1}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-neutral-500 flex items-center gap-2">
                        <span>Doc ID: {item.id ? item.id.slice(0, 12) : `KV-${index + 1}`}</span>
                        <span>&bull;</span>
                        <span>{formattedDate}</span>
                      </div>
                    </div>

                    {/* Header Metadata */}
                    {includeHeaderMeta && (
                      <div className="space-y-2.5 mb-6">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded border border-neutral-800 bg-neutral-900 text-white">
                            {getTypeLabel(item.type)}
                          </span>

                          {item.metadata?.domain && (
                            <span className="font-mono text-[10px] bg-neutral-100 border border-neutral-300 text-neutral-700 px-2 py-0.5 rounded">
                              Dominio: {item.metadata.domain}
                            </span>
                          )}

                          {item.metadata?.docType && (
                            <span className="font-mono text-[10px] bg-neutral-100 border border-neutral-300 text-neutral-700 px-2 py-0.5 rounded uppercase">
                              Tipo: {item.metadata.docType}
                            </span>
                          )}

                          {score !== null && (
                            <span className="font-mono text-[10px] font-bold bg-neutral-100 border border-neutral-400 text-neutral-900 px-2 py-0.5 rounded">
                              Rating AI: {score}/100
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h1 className="text-xl sm:text-2xl font-serif font-bold text-neutral-900 leading-tight">
                          {item.title}
                        </h1>

                        {/* Summary */}
                        {item.summary && (
                          <p className="text-neutral-700 leading-relaxed italic border-l-2 border-neutral-400 pl-3 py-0.5">
                            {item.summary}
                          </p>
                        )}

                        {/* URL Source if present */}
                        {item.url && (
                          <div className="font-mono text-[10.5px] text-neutral-600 truncate flex items-center gap-1.5 pt-1">
                            <span className="font-semibold text-neutral-900">Sorgente:</span>
                            <span className="underline">{item.url}</span>
                          </div>
                        )}

                        {/* Tags */}
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="font-mono text-[10px] text-neutral-500 font-semibold uppercase">Tag:</span>
                            {item.tags.map((t, idx) => (
                              <span key={idx} className="font-mono text-[10px] bg-neutral-100 border border-neutral-300 text-neutral-800 px-1.5 py-0.2 rounded">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* OKF v0.2 Technical Specifications Grid */}
                    {includeOkfSpecs &&
                      (item.metadata?.author ||
                        item.metadata?.version ||
                        item.metadata?.status ||
                        item.metadata?.license ||
                        (item.metadata?.dependencies && item.metadata.dependencies.length > 0)) && (
                        <div className="mb-6 bg-neutral-50 border border-neutral-300 rounded-lg p-3.5 space-y-2.5">
                          <div className="font-mono text-[10.5px] font-bold uppercase text-neutral-900 flex items-center justify-between border-b border-neutral-200 pb-1">
                            <span>Specifiche Standard OKF v0.2</span>
                            <span className="text-neutral-500 font-normal">Ontological Knowledge Format</span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px]">
                            {item.metadata?.author && (
                              <div className="bg-white border border-neutral-200 p-2 rounded">
                                <div className="text-[9.5px] font-mono text-neutral-500 uppercase">Autore / Maintainer</div>
                                <div className="font-semibold text-neutral-900 truncate">{item.metadata.author}</div>
                              </div>
                            )}

                            <div className="bg-white border border-neutral-200 p-2 rounded">
                              <div className="text-[9.5px] font-mono text-neutral-500 uppercase">Versione Specifica</div>
                              <div className="font-semibold text-neutral-900">v{item.metadata?.version || item.metadata?.docVersion || "0.2"}</div>
                            </div>

                            {item.metadata?.status && (
                              <div className="bg-white border border-neutral-200 p-2 rounded">
                                <div className="text-[9.5px] font-mono text-neutral-500 uppercase">Stato Ciclo Vita</div>
                                <div className="font-semibold text-neutral-900 uppercase">{item.metadata.status}</div>
                              </div>
                            )}

                            {item.metadata?.license && (
                              <div className="bg-white border border-neutral-200 p-2 rounded">
                                <div className="text-[9.5px] font-mono text-neutral-500 uppercase">Licenza</div>
                                <div className="font-semibold text-neutral-900 truncate">{item.metadata.license}</div>
                              </div>
                            )}
                          </div>

                          {item.metadata?.dependencies && item.metadata.dependencies.length > 0 && (
                            <div className="text-[10px] font-mono text-neutral-700 pt-1 border-t border-neutral-200">
                              <span className="font-bold text-neutral-900">Dipendenze: </span>
                              {item.metadata.dependencies.join(", ")}
                            </div>
                          )}
                        </div>
                      )}

                    {/* Scheda Diagnostica Problema & Risoluzione (Troubleshooting) */}
                    {includeDiagnostics && hasDiagnostics && (
                      <div className="mb-6 border-2 border-neutral-900 rounded-lg p-4 space-y-3 bg-neutral-50/50 avoid-break-inside">
                        <div className="flex items-center justify-between border-b border-neutral-300 pb-1.5">
                          <div className="font-mono text-xs font-bold uppercase text-neutral-900 flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-neutral-900 stroke-[2.5]" />
                            <span>Scheda Diagnostica Problema & Risoluzione</span>
                          </div>
                          {item.metadata?.affectedSystem && (
                            <span className="font-mono text-[10px] bg-neutral-200 text-neutral-900 font-bold px-2 py-0.5 rounded border border-neutral-300">
                              Sistema: {item.metadata.affectedSystem}
                            </span>
                          )}
                        </div>

                        {/* Root Cause */}
                        {item.metadata?.rootCause && (
                          <div className="bg-white border border-neutral-300 p-3 rounded space-y-1">
                            <div className="font-mono text-[10px] font-bold uppercase text-neutral-900 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-neutral-800" />
                              <span>Causa Scatenante Identificata (Root Cause):</span>
                            </div>
                            <p className="text-neutral-800 leading-relaxed font-sans">
                              {item.metadata.rootCause}
                            </p>
                          </div>
                        )}

                        {/* Attempted Fixes (False Positives) */}
                        {item.metadata?.attemptedFixes && item.metadata.attemptedFixes.length > 0 && (
                          <div className="bg-white border border-neutral-300 p-3 rounded space-y-1.5">
                            <div className="font-mono text-[10px] font-bold uppercase text-neutral-700 flex items-center gap-1">
                              <ThumbsDown className="w-3 h-3 text-neutral-600" />
                              <span>Tentativi Non Risolutivi / Falsi Positivi:</span>
                            </div>
                            <ul className="space-y-1 font-sans text-neutral-700">
                              {item.metadata.attemptedFixes.map((fix, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <span className="font-mono font-bold text-neutral-900">&times;</span>
                                  <span>{fix}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Verified Solution Steps */}
                        {item.metadata?.solutionSteps && item.metadata.solutionSteps.length > 0 && (
                          <div className="bg-white border-2 border-neutral-900 p-3.5 rounded space-y-2">
                            <div className="font-mono text-[10.5px] font-bold uppercase text-neutral-900 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-neutral-900" />
                                <span>Procedura Risolutiva Verificata (Step-by-Step)</span>
                              </div>
                              <span className="font-mono text-[10px] text-neutral-600">
                                {item.metadata.solutionSteps.length} Passaggi
                              </span>
                            </div>
                            <ol className="space-y-1.5 font-sans text-neutral-900">
                              {item.metadata.solutionSteps.map((step, idx) => (
                                <li key={idx} className="flex items-start gap-2 bg-neutral-50 p-2 rounded border border-neutral-200">
                                  <span className="font-mono font-bold text-neutral-900 text-xs shrink-0">{idx + 1}.</span>
                                  <span className="leading-relaxed">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Executive Summary & Key Takeaways */}
                    {includeAiInsights &&
                      (item.metadata?.aiExecutiveSummary ||
                        (item.metadata?.aiKeyTakeaways && item.metadata.aiKeyTakeaways.length > 0) ||
                        item.metadata?.scoreRationale) && (
                        <div className="mb-6 bg-neutral-50 border border-neutral-300 rounded-lg p-4 space-y-3 avoid-break-inside">
                          <div className="font-mono text-xs font-bold uppercase text-neutral-900 flex items-center gap-1.5 border-b border-neutral-200 pb-1">
                            <Zap className="w-3.5 h-3.5 text-neutral-900" />
                            <span>Sintesi Esecutiva & Key Takeaways AI</span>
                          </div>

                          {item.metadata?.aiExecutiveSummary && (
                            <div className="bg-white p-3 rounded border border-neutral-200">
                              <div className="font-mono text-[9.5px] text-neutral-500 uppercase font-semibold mb-1">Executive Briefing:</div>
                              <p className="text-neutral-800 leading-relaxed font-sans">
                                {item.metadata.aiExecutiveSummary}
                              </p>
                            </div>
                          )}

                          {item.metadata?.aiKeyTakeaways && item.metadata.aiKeyTakeaways.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="font-mono text-[10px] text-neutral-700 uppercase font-semibold flex items-center gap-1">
                                <ListChecks className="w-3 h-3 text-neutral-800" />
                                <span>Punti Chiave (Key Takeaways):</span>
                              </div>
                              <ul className="space-y-1 font-sans text-neutral-800">
                                {item.metadata.aiKeyTakeaways.map((takeaway, idx) => (
                                  <li key={idx} className="flex items-start gap-2 bg-white p-1.5 rounded border border-neutral-200">
                                    <span className="font-mono font-bold text-neutral-900 text-[10px] shrink-0">0{idx + 1}.</span>
                                    <span className="leading-relaxed">{takeaway}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {item.metadata?.aiTargetAudience && (
                            <div className="font-mono text-[10px] text-neutral-600 flex items-center gap-1.5 pt-1 border-t border-neutral-200">
                              <span className="font-bold text-neutral-900 uppercase">Target di Riferimento:</span>
                              <span>{item.metadata.aiTargetAudience}</span>
                            </div>
                          )}
                        </div>
                      )}

                    {/* User Personal Notes */}
                    {includeUserNotes && item.metadata?.userNotes && (
                      <div className="mb-6 bg-neutral-100 border-l-4 border-neutral-900 p-3 rounded-r space-y-1 avoid-break-inside">
                        <div className="font-mono text-[10px] uppercase font-bold text-neutral-900 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-neutral-800" />
                          <span>Note Personali & Annotazioni:</span>
                        </div>
                        <p className="text-neutral-800 leading-relaxed font-sans italic">
                          {item.metadata.userNotes}
                        </p>
                      </div>
                    )}

                    {/* Entities & Relations */}
                    {includeRelations &&
                      ((item.metadata?.entities && item.metadata.entities.length > 0) ||
                        (item.metadata?.relations && item.metadata.relations.length > 0)) && (
                        <div className="mb-6 bg-neutral-50 border border-neutral-300 rounded-lg p-3.5 space-y-2.5 avoid-break-inside">
                          <div className="font-mono text-[10.5px] font-bold uppercase text-neutral-900 border-b border-neutral-200 pb-1">
                            Grafo Ontologico: Entità & Relazioni Correlate
                          </div>

                          {item.metadata?.entities && item.metadata.entities.length > 0 && (
                            <div className="space-y-1">
                              <div className="font-mono text-[9.5px] text-neutral-500 uppercase">Entità Dichiarate:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {item.metadata.entities.map((ent, idx) => {
                                  const name = typeof ent === "string" ? ent : ent.name;
                                  const type = typeof ent === "object" ? ent.type : undefined;
                                  return (
                                    <span key={idx} className="font-mono text-[10px] bg-white border border-neutral-300 px-2 py-0.5 rounded text-neutral-800">
                                      {name} {type && <span className="text-neutral-500 font-normal">({type})</span>}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {item.metadata?.relations && item.metadata.relations.length > 0 && (
                            <div className="space-y-1 pt-1.5 border-t border-neutral-200">
                              <div className="font-mono text-[9.5px] text-neutral-500 uppercase">Archi & Relazioni del Grafo:</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px]">
                                {item.metadata.relations.map((rel, idx) => (
                                  <div key={idx} className="bg-white border border-neutral-200 p-1.5 rounded flex items-center justify-between gap-1">
                                    <span className="font-semibold text-neutral-900 truncate">{rel.targetTitle || "Nodo"}</span>
                                    <span className="text-neutral-500 font-normal shrink-0">[{rel.relationType}]</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Full Rendered Markdown Body */}
                    {includeMarkdownBody && contentBody && (
                      <div className="mb-6 space-y-3">
                        <div className="font-mono text-xs font-bold uppercase text-neutral-900 border-b-2 border-neutral-900 pb-1 mb-3">
                          Documentazione & Contenuto Integrale
                        </div>
                        <div className="prose prose-neutral max-w-none print:prose-sm text-neutral-900 leading-relaxed">
                          <Markdown>{contentBody}</Markdown>
                        </div>
                      </div>
                    )}

                    {/* Sheet Footer */}
                    {includePrintFooter && (
                      <div className="mt-8 pt-3 border-t border-neutral-300 flex items-center justify-between text-[9.5px] font-mono text-neutral-500">
                        <span>Generato da Knowledge Vault OKF &bull; {formattedDate}</span>
                        <span>Scheda {index + 1} di {itemsToPrint.length}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
