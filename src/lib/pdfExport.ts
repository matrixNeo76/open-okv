import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "./dateUtils";

export interface PdfExportOptions {
  filename?: string;
  onProgress?: (stage: string) => void;
}

/**
 * Generates a clean, slugified filename for the exported PDF
 */
export function getResourcePdfFilename(resource: ResourceItem): string {
  const safeTitle = (resource.title || "documento-knowledge-vault")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45);

  const dateStr = new Date().toISOString().slice(0, 10);
  return `${safeTitle || "okf-doc"}-offline-${dateStr}.pdf`;
}

/**
 * Simple, safe markdown to HTML parser tailored for offline printable documents
 */
function markdownToPrintHtml(rawMarkdown: string): string {
  if (!rawMarkdown) return "";

  // Strip YAML frontmatter if present (we render frontmatter in a dedicated styled metadata box)
  let text = rawMarkdown.replace(/^---[\s\S]*?---\n*/, "");

  // Protect code blocks first
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`
      <div style="margin: 14px 0; background: #161616; border: 1px solid #333333; border-radius: 6px; overflow: hidden; page-break-inside: avoid;">
        <div style="background: #222222; padding: 4px 10px; font-family: monospace; font-size: 9px; color: #C5A059; text-transform: uppercase; border-bottom: 1px solid #333333;">
          ${lang || "CODE"}
        </div>
        <pre style="margin: 0; padding: 12px; font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 10px; color: #EDEDED; overflow-x: auto; line-height: 1.5; white-space: pre-wrap; word-break: break-all;"><code>${escapedCode}</code></pre>
      </div>
    `);
    return placeholder;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="font-family: monospace; font-size: 10px; background: #f0f0f0; color: #9a2020; padding: 1.5px 4px; border-radius: 3px; border: 1px solid #e0e0e0;">$1</code>');

  // Headers
  text = text.replace(/^#### (.*$)/gim, '<h4 style="font-size: 12px; font-weight: 700; color: #222222; margin: 14px 0 6px 0; font-family: sans-serif;">$1</h4>');
  text = text.replace(/^### (.*$)/gim, '<h3 style="font-size: 14px; font-weight: 700; color: #1a1a1a; margin: 18px 0 8px 0; border-bottom: 1px solid #eaeaea; padding-bottom: 4px; font-family: sans-serif;">$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2 style="font-size: 16px; font-weight: 700; color: #111111; margin: 22px 0 10px 0; border-bottom: 1.5px solid #C5A059; padding-bottom: 5px; font-family: sans-serif;">$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1 style="font-size: 19px; font-weight: 700; color: #111111; margin: 26px 0 12px 0; font-family: sans-serif;">$1</h1>');

  // Blockquotes
  text = text.replace(/^\> (.*$)/gim, '<blockquote style="margin: 12px 0; padding: 8px 14px; border-left: 3px solid #C5A059; background: #fbf9f5; color: #444444; font-style: italic; font-size: 11px; page-break-inside: avoid;">$1</blockquote>');

  // Bold & Italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #111111;">$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Horizontal rules
  text = text.replace(/^---$/gim, '<hr style="border: none; border-top: 1px solid #dddddd; margin: 18px 0;" />');

  // Unordered lists
  text = text.replace(/^[-*] (.*$)/gim, '<li style="margin-bottom: 4px; line-height: 1.5;">$1</li>');
  text = text.replace(/(<li.*<\/li>\s*)+/g, '<ul style="margin: 8px 0 12px 18px; padding: 0; font-size: 11px; color: #333333;">$&</ul>');

  // Paragraphs
  const lines = text.split(/\n\n+/);
  text = lines.map(line => {
    line = line.trim();
    if (!line) return "";
    if (line.startsWith("__CODE_BLOCK_") || line.startsWith("<h") || line.startsWith("<ul") || line.startsWith("<blockquote") || line.startsWith("<hr")) {
      return line;
    }
    return `<p style="margin: 8px 0; line-height: 1.6; font-size: 11px; color: #333333;">${line.replace(/\n/g, '<br/>')}</p>`;
  }).join("\n");

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    text = text.replace(`__CODE_BLOCK_${idx}__`, block);
  });

  return text;
}

/**
 * Builds a comprehensive, high-aesthetic HTML template for the resource
 */
function buildPrintableResourceHtml(resource: ResourceItem): string {
  const score = typeof resource.metadata?.score === "number" ? resource.metadata.score : null;
  const createdDate = formatDate(resource.createdAt || resource.updatedAt || new Date(), "full");
  const markdownBody = markdownToPrintHtml(resource.metadata?.markdownContent || resource.summary || "");

  const typeLabelMap: Record<ResourceType, { label: string; bg: string; color: string }> = {
    knowledge: { label: "OKF Knowledge v0.2", bg: "#1A150A", color: "#C5A059" },
    procedure: { label: "Procedura / SOP Playbook", bg: "#09171C", color: "#22D3EE" },
    troubleshooting: { label: "Problemi & Fix (Troubleshooting)", bg: "#1C120C", color: "#F97316" },
    paper: { label: "Paper Scientifico (Research)", bg: "#12132A", color: "#818CF8" },
    rss: { label: "Feed RSS / Aggiornamenti", bg: "#1F150B", color: "#FB923C" },
    note: { label: "Nota & Scratchpad", bg: "#1C1A0E", color: "#FBBF24" },
    github_repo: { label: "GitHub Repository", bg: "#18121E", color: "#C084FC" },
    mcp_server: { label: "Model Context Protocol Server", bg: "#0F1820", color: "#38BDF8" },
    ai_skill: { label: "AI Prompt & Skill", bg: "#0D1812", color: "#34D399" },
    article: { label: "Articolo Tecnico", bg: "#18140B", color: "#F59E0B" },
    link: { label: "Risorsa Web", bg: "#0E181C", color: "#06B6D4" },
    document_refactor: { label: "Documento Rielaborato (OKF v0.2)", bg: "#13112c", color: "#a5b4fc" },
  };

  const currentType = typeLabelMap[resource.type] || { label: "Documento Vault", bg: "#1A150A", color: "#C5A059" };

  // Entities HTML
  const entities = Array.isArray(resource.metadata?.entities) ? resource.metadata.entities : [];
  const entitiesHtml = entities.length > 0 ? `
    <div style="margin: 16px 0; background: #fafafa; border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; color: #888888; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
        <span>Entità Ontologiche Canoniche (${entities.length})</span>
        <span style="color: #C5A059;">Grafo OKF</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${entities.map((ent: any) => {
          const name = typeof ent === "string" ? ent : ent.name;
          const type = typeof ent === "object" && ent.type ? ` (${ent.type})` : "";
          return `<span style="font-family: monospace; font-size: 9.5px; background: #ffffff; border: 1px solid #d5d5d5; color: #222222; padding: 3px 8px; border-radius: 4px;">• <strong>${name}</strong>${type}</span>`;
        }).join("")}
      </div>
    </div>
  ` : "";

  // Relations HTML
  const relations = Array.isArray(resource.metadata?.relations) ? resource.metadata.relations : [];
  const relationsHtml = relations.length > 0 ? `
    <div style="margin: 16px 0; background: #fafafa; border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; color: #888888; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
        <span>Relazioni Semantiche nel Grafo (${relations.length})</span>
        <span style="color: #C5A059;">Connessioni Vault</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${relations.map((rel: any) => `
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; background: #ffffff; border: 1px solid #e8e8e8; padding: 5px 8px; border-radius: 4px;">
            <div>
              <span style="font-family: monospace; color: #C5A059; font-weight: 600; text-transform: uppercase; margin-right: 6px;">[${rel.relationType || "collegato_a"}]</span>
              <span style="font-weight: 600; color: #111111;">${rel.targetTitle || "Nodo correlato"}</span>
            </div>
            ${rel.description ? `<span style="color: #666666; font-style: italic; font-size: 9.5px; margin-left: 8px;">${rel.description}</span>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  // Key Takeaways HTML
  const takeaways = Array.isArray(resource.metadata?.aiKeyTakeaways) ? resource.metadata.aiKeyTakeaways : [];
  const takeawaysHtml = takeaways.length > 0 ? `
    <div style="margin: 16px 0; background: #FFFDF8; border: 1px solid #E5C170; border-radius: 8px; padding: 14px; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 10.5px; font-weight: 700; color: #947125; text-transform: uppercase; margin-bottom: 8px;">
        ★ Punti Chiave Estratti (Key Takeaways)
      </div>
      <ul style="margin: 0; padding-left: 18px; font-size: 11px; color: #2A2416; line-height: 1.6;">
        ${takeaways.map((t: string) => `<li style="margin-bottom: 4px;">${t}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  // Executive Summary HTML
  const execSummary = resource.metadata?.aiExecutiveSummary;
  const execSummaryHtml = execSummary ? `
    <div style="margin: 16px 0; background: #F8F9FA; border-left: 3.5px solid #111111; padding: 12px 14px; border-radius: 0 6px 6px 0; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; color: #555555; text-transform: uppercase; margin-bottom: 4px;">
        Sintesi Esecutiva AI
      </div>
      <p style="margin: 0; font-size: 11.5px; color: #222222; line-height: 1.6; font-style: italic;">
        "${execSummary}"
      </p>
    </div>
  ` : "";

  // Troubleshooting section
  const hasTroubleshooting = Boolean(
    resource.metadata?.affectedSystem ||
    resource.metadata?.rootCause ||
    (resource.metadata?.solutionSteps && resource.metadata.solutionSteps.length > 0)
  );

  const troubleshootingHtml = hasTroubleshooting ? `
    <div style="margin: 20px 0; background: #FFF9F5; border: 1.5px solid #FDBA74; border-radius: 8px; padding: 14px; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #C2410C; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #FED7AA; padding-bottom: 4px;">
        🔧 Diagnostica & Procedura di Risoluzione (Troubleshooting)
      </div>
      ${resource.metadata?.affectedSystem ? `
        <div style="margin-bottom: 8px; font-size: 10.5px;">
          <strong style="color: #9A3412;">Sistema o Componente Interessato:</strong> <span style="color: #333333;">${resource.metadata.affectedSystem}</span>
        </div>
      ` : ""}
      ${resource.metadata?.rootCause ? `
        <div style="margin-bottom: 10px; font-size: 10.5px; background: #FFFFFF; border: 1px solid #FFEDD5; padding: 8px; border-radius: 4px;">
          <strong style="color: #9A3412;">Causa Radice (Root Cause):</strong> <span style="color: #333333;">${resource.metadata.rootCause}</span>
        </div>
      ` : ""}
      ${resource.metadata?.solutionSteps && resource.metadata.solutionSteps.length > 0 ? `
        <div style="font-size: 10.5px; margin-top: 8px;">
          <strong style="color: #9A3412; display: block; margin-bottom: 6px;">Passi Verificati per il Fix:</strong>
          <ol style="margin: 0; padding-left: 20px; color: #333333; line-height: 1.6;">
            ${resource.metadata.solutionSteps.map((step: string) => `<li style="margin-bottom: 4px;">${step}</li>`).join("")}
          </ol>
        </div>
      ` : ""}
    </div>
  ` : "";

  // Procedure / SOP section
  const isProcedureDoc = (resource.type as string) === "procedure";
  const hasProcedure = isProcedureDoc || Boolean(
    resource.metadata?.procedureType ||
    resource.metadata?.targetSystem
  );

  const procedureHtml = hasProcedure ? `
    <div style="margin: 20px 0; background: #F0FDF4; border: 1.5px solid #22D3EE; border-radius: 8px; padding: 14px; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #0891B2; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #CFFAFE; padding-bottom: 4px; display: flex; justify-content: space-between;">
        <span>📋 Playbook Operativo Standard (SOP)</span>
        ${resource.metadata?.riskLevel ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 3px; background: #0891B2; color: #fff;">Rischio: ${resource.metadata.riskLevel.toUpperCase()}</span>` : ""}
      </div>
      <div style="display: flex; gap: 15px; margin-bottom: 8px; font-size: 10.5px; flex-wrap: wrap;">
        ${resource.metadata?.targetSystem ? `<div><strong style="color: #0E7490;">Sistema Target:</strong> <span style="color: #333;">${resource.metadata.targetSystem}</span></div>` : ""}
        ${resource.metadata?.procedureType ? `<div><strong style="color: #0E7490;">Tipologia:</strong> <span style="color: #333;">${resource.metadata.procedureType}</span></div>` : ""}
        ${resource.metadata?.estimatedDuration ? `<div><strong style="color: #0E7490;">Durata Stimata:</strong> <span style="color: #333;">${resource.metadata.estimatedDuration}</span></div>` : ""}
      </div>
      ${resource.metadata?.safetyWarnings && resource.metadata.safetyWarnings.length > 0 ? `
        <div style="margin-bottom: 8px; font-size: 10px; background: #FEF2F2; border: 1px solid #FECACA; padding: 6px 10px; border-radius: 4px; color: #991B1B;">
          <strong>⚠️ Avvertenze di Sicurezza:</strong> ${resource.metadata.safetyWarnings.join(" • ")}
        </div>
      ` : ""}
      ${resource.metadata?.prerequisites && resource.metadata.prerequisites.length > 0 ? `
        <div style="margin-bottom: 8px; font-size: 10px; background: #FFFFFF; border: 1px solid #E0F2FE; padding: 6px 10px; border-radius: 4px; color: #0369A1;">
          <strong>Prerequisiti:</strong> ${resource.metadata.prerequisites.join(" • ")}
        </div>
      ` : ""}
      ${resource.metadata?.solutionSteps && resource.metadata.solutionSteps.length > 0 ? `
        <div style="font-size: 10.5px; margin-top: 8px;">
          <strong style="color: #0E7490; display: block; margin-bottom: 6px;">Checklist Esecutiva delle Fasi:</strong>
          <ol style="margin: 0; padding-left: 20px; color: #333333; line-height: 1.6;">
            ${resource.metadata.solutionSteps.map((step: string) => `<li style="margin-bottom: 4px;">${step}</li>`).join("")}
          </ol>
        </div>
      ` : ""}
      ${resource.metadata?.rollbackPlan ? `
        <div style="margin-top: 10px; font-size: 10px; background: #FFFBEB; border: 1px solid #FDE68A; padding: 6px 10px; border-radius: 4px; color: #92400E;">
          <strong>Piano di Rollback:</strong> ${resource.metadata.rollbackPlan}
        </div>
      ` : ""}
    </div>
  ` : "";

  // User Notes
  const userNotes = resource.metadata?.userNotes;
  const userNotesHtml = userNotes ? `
    <div style="margin: 16px 0; background: #FAFDF8; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px; page-break-inside: avoid;">
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 6px;">
        📝 Note Personali & Annotazioni Vault
      </div>
      <p style="margin: 0; font-size: 11px; color: #14532D; line-height: 1.5; white-space: pre-wrap;">${userNotes}</p>
    </div>
  ` : "";

  // Tags list
  const tagsHtml = resource.tags && resource.tags.length > 0 ? `
    <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
      ${resource.tags.map((t: string) => `<span style="font-family: monospace; font-size: 9.5px; background: #f0f0f0; border: 1px solid #dcdcdc; color: #555555; padding: 2px 6px; border-radius: 3px;">#${t}</span>`).join("")}
    </div>
  ` : "";

  return `
    <div class="printable-pdf-document" style="width: 760px; min-height: 1060px; background: #ffffff; color: #111111; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 45px; box-sizing: border-box; line-height: 1.5;">
      <!-- TOP MASTHEAD -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #111111; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 28px; height: 28px; background: #111111; color: #C5A059; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; font-family: serif; border-radius: 5px;">
            KV
          </div>
          <div>
            <div style="font-family: serif; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color: #111111;">
              Knowledge Vault
            </div>
            <div style="font-family: monospace; font-size: 9px; color: #777777; letter-spacing: 0.5px;">
              DOCUMENTAZIONE TECNICA OFFLINE · STANDARD OKF v0.2
            </div>
          </div>
        </div>

        <div style="text-align: right; font-family: monospace; font-size: 9.5px; color: #666666;">
          <div>DOC-ID: <span style="font-weight: 700; color: #111111;">${resource.id ? resource.id.slice(0, 16) : "DOC-LOCAL"}</span></div>
          <div>GENERATO: ${createdDate}</div>
        </div>
      </div>

      <!-- BADGES AND METADATA BAR -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-family: monospace; font-size: 9.5px; font-weight: 700; background: ${currentType.bg}; color: ${currentType.color}; border: 1px solid #333333; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
            ${currentType.label}
          </span>
          ${resource.metadata?.domain ? `
            <span style="font-family: monospace; font-size: 9.5px; background: #F3F4F6; border: 1px solid #E5E7EB; color: #374151; padding: 3px 8px; border-radius: 4px;">
              Dominio: <strong>${resource.metadata.domain}</strong>
            </span>
          ` : ""}
          ${resource.metadata?.docType ? `
            <span style="font-family: monospace; font-size: 9.5px; background: #F3F4F6; border: 1px solid #E5E7EB; color: #374151; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
              Tipo: <strong>${resource.metadata.docType}</strong>
            </span>
          ` : ""}
        </div>

        ${score !== null ? `
          <span style="font-family: monospace; font-size: 10px; font-weight: 700; background: #161208; border: 1px solid #C5A059; color: #E5C170; padding: 3px 10px; border-radius: 4px;">
            ★ Rating Utilità AI: ${score}/100
          </span>
        ` : ""}
      </div>

      <!-- DOCUMENT TITLE -->
      <h1 style="font-family: serif; font-size: 24px; font-weight: 700; color: #111111; line-height: 1.25; margin: 0 0 10px 0;">
        ${resource.title}
      </h1>

      <!-- ABSTRACT / SUMMARY -->
      ${resource.summary ? `
        <div style="font-size: 12px; color: #444444; line-height: 1.6; font-style: italic; border-left: 3px solid #C5A059; padding-left: 12px; margin-bottom: 14px;">
          ${resource.summary}
        </div>
      ` : ""}

      <!-- SOURCE URL IF PRESENT -->
      ${resource.url ? `
        <div style="font-family: monospace; font-size: 10px; color: #666666; margin-bottom: 12px; background: #fafafa; padding: 6px 10px; border-radius: 4px; border: 1px solid #eee; word-break: break-all;">
          <strong style="color: #111111;">Sorgente Ufficiale:</strong> ${resource.url}
        </div>
      ` : ""}

      ${tagsHtml}

      <!-- SPECIFICATIONS TABLE (OKF METADATA) -->
      ${(resource.metadata?.author || resource.metadata?.version || resource.metadata?.license || resource.metadata?.status) ? `
        <div style="margin: 18px 0; background: #fbfbfb; border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px; page-break-inside: avoid;">
          <div style="font-family: monospace; font-size: 9.5px; font-weight: 700; color: #888888; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #eaeaea; padding-bottom: 4px;">
            Specifiche Tecniche Standard OKF v0.2
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 10.5px;">
            ${resource.metadata?.author ? `
              <div>
                <span style="display: block; font-family: monospace; font-size: 8.5px; color: #888888; text-transform: uppercase;">Autore</span>
                <strong style="color: #222222;">${resource.metadata.author}</strong>
              </div>
            ` : ""}
            <div>
              <span style="display: block; font-family: monospace; font-size: 8.5px; color: #888888; text-transform: uppercase;">Versione OKF</span>
              <strong style="color: #222222;">v${resource.metadata?.okfVersion || "0.2"}</strong>
            </div>
            ${resource.metadata?.license ? `
              <div>
                <span style="display: block; font-family: monospace; font-size: 8.5px; color: #888888; text-transform: uppercase;">Licenza</span>
                <strong style="color: #222222;">${resource.metadata.license}</strong>
              </div>
            ` : ""}
            ${resource.metadata?.status ? `
              <div>
                <span style="display: block; font-family: monospace; font-size: 8.5px; color: #888888; text-transform: uppercase;">Stato Ciclo Vita</span>
                <strong style="color: #222222; text-transform: uppercase;">${resource.metadata.status}</strong>
              </div>
            ` : ""}
          </div>
        </div>
      ` : ""}

      ${execSummaryHtml}
      ${takeawaysHtml}
      ${troubleshootingHtml}
      ${procedureHtml}
      ${entitiesHtml}
      ${relationsHtml}

      <!-- MAIN MARKDOWN DOCUMENT CONTENT -->
      <div style="margin-top: 24px; border-top: 1.5px solid #111111; padding-top: 16px;">
        <div style="font-family: monospace; font-size: 10px; font-weight: 700; color: #888888; text-transform: uppercase; margin-bottom: 14px; letter-spacing: 0.5px;">
          Contenuto Tecnico & Documentazione Completa
        </div>
        <div class="markdown-rendered-body" style="font-size: 11px; color: #222222;">
          ${markdownBody}
        </div>
      </div>

      ${userNotesHtml}

      <!-- ARCHIVAL FOOTER -->
      <div style="margin-top: 36px; padding-top: 14px; border-top: 1px solid #e0e0e0; display: flex; align-items: center; justify-content: space-between; font-family: monospace; font-size: 9px; color: #888888; page-break-inside: avoid;">
        <div>
          <span>Knowledge Vault Engine · Documento salvato per consultazione offline</span>
        </div>
        <div>
          <span>Certificato Ontologico OKF v0.2 · Pagina Archiviata</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Direct Client-Side PDF Generation for a Single Knowledge Document.
 * Completely immune to popup blockers and works seamlessly inside iframes.
 */
export async function generateAndDownloadResourcePdf(
  resource: ResourceItem,
  options: PdfExportOptions = {}
): Promise<void> {
  const filename = options.filename || getResourcePdfFilename(resource);
  options.onProgress?.("Preparazione del foglio tecnico...");

  // Create an off-screen container mounted in document.body
  const tempContainer = document.createElement("div");
  tempContainer.setAttribute("id", "kv-pdf-temp-render-root");
  tempContainer.style.position = "fixed";
  tempContainer.style.top = "0";
  tempContainer.style.left = "-9999px";
  tempContainer.style.width = "760px";
  tempContainer.style.backgroundColor = "#ffffff";
  tempContainer.style.zIndex = "-9999";
  tempContainer.style.boxSizing = "border-box";
  tempContainer.style.overflow = "visible";

  tempContainer.innerHTML = buildPrintableResourceHtml(resource);
  document.body.appendChild(tempContainer);

  try {
    options.onProgress?.("Caricamento stili e rendering grafico...");

    // Wait for fonts or layout to settle
    if ((document as any).fonts && (document as any).fonts.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 80));

    options.onProgress?.("Cattura ad alta risoluzione in corso...");

    const targetEl = tempContainer.firstElementChild as HTMLElement || tempContainer;

    const canvas = await html2canvas(targetEl, {
      scale: 2, // Crisp 300dpi-equivalent resolution
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 1024,
    });

    options.onProgress?.("Compilazione del file PDF...");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pdfWidth = 210; // A4 standard width in mm
    const pdfHeight = 297; // A4 standard height in mm

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    if (imgHeight <= pdfHeight) {
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
    }

    options.onProgress?.("Salvataggio su disco...");
    pdf.save(filename);
  } catch (error) {
    console.warn("Direct html2canvas PDF generation failed, attempting programmatic jsPDF vector fallback:", error);
    options.onProgress?.("Generazione alternativa in formato vettoriale...");

    // Reliable fallback using native jsPDF vector text rendering
    try {
      const fallbackPdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const margin = 15;
      const pageWidth = 210;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      // Header
      fallbackPdf.setFont("helvetica", "bold");
      fallbackPdf.setFontSize(16);
      fallbackPdf.text("KNOWLEDGE VAULT · DOCUMENTO OFFLINE", margin, y);
      y += 6;

      fallbackPdf.setFont("helvetica", "normal");
      fallbackPdf.setFontSize(9);
      fallbackPdf.setTextColor(120, 120, 120);
      fallbackPdf.text(`Standard OKF v0.2 | Data: ${formatDate(new Date(), "full")}`, margin, y);
      y += 8;

      fallbackPdf.setDrawColor(197, 160, 89);
      fallbackPdf.setLineWidth(0.8);
      fallbackPdf.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Title
      fallbackPdf.setFont("helvetica", "bold");
      fallbackPdf.setFontSize(14);
      fallbackPdf.setTextColor(20, 20, 20);
      const titleLines = fallbackPdf.splitTextToSize(resource.title || "Documento Senza Titolo", contentWidth);
      fallbackPdf.text(titleLines, margin, y);
      y += titleLines.length * 7 + 3;

      // Summary
      if (resource.summary) {
        fallbackPdf.setFont("helvetica", "italic");
        fallbackPdf.setFontSize(10);
        fallbackPdf.setTextColor(60, 60, 60);
        const summaryLines = fallbackPdf.splitTextToSize(resource.summary, contentWidth);
        fallbackPdf.text(summaryLines, margin, y);
        y += summaryLines.length * 5 + 6;
      }

      // Metadata block
      fallbackPdf.setFont("helvetica", "normal");
      fallbackPdf.setFontSize(9);
      fallbackPdf.setTextColor(80, 80, 80);
      fallbackPdf.text(`Tipo: ${resource.type} | Dominio: ${resource.metadata?.domain || "N/A"} | DocType: ${resource.metadata?.docType || "N/A"}`, margin, y);
      y += 6;
      if (resource.url) {
        fallbackPdf.text(`Sorgente: ${resource.url}`, margin, y);
        y += 6;
      }
      if (resource.tags && resource.tags.length > 0) {
        fallbackPdf.text(`Tag: ${resource.tags.map(t => `#${t}`).join(" ")}`, margin, y);
        y += 8;
      }

      // Markdown Content
      const rawText = (resource.metadata?.markdownContent || resource.summary || "")
        .replace(/^---[\s\S]*?---\n*/, "")
        .replace(/```[\s\S]*?```/g, "[Snippet di codice]");

      fallbackPdf.setFont("helvetica", "normal");
      fallbackPdf.setFontSize(10);
      fallbackPdf.setTextColor(30, 30, 30);
      const bodyLines = fallbackPdf.splitTextToSize(rawText, contentWidth);

      for (let i = 0; i < bodyLines.length; i++) {
        if (y > 280) {
          fallbackPdf.addPage();
          y = 20;
        }
        fallbackPdf.text(bodyLines[i], margin, y);
        y += 5;
      }

      fallbackPdf.save(filename);
    } catch (fallbackError) {
      console.error("Critical error in PDF fallback generation:", fallbackError);
      throw fallbackError;
    }
  } finally {
    // Clean up temporary DOM container
    if (document.body.contains(tempContainer)) {
      document.body.removeChild(tempContainer);
    }
  }
}
