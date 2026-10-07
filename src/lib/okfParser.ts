import { OKFEntity, OKFRelation, ResourceType } from "../types";

export const CANONICAL_OKF_TYPES = [
  "concept",
  "architecture",
  "guide",
  "specification",
  "tool_description",
  "prompt_skill",
] as const;

export type CanonicalOKFType = (typeof CANONICAL_OKF_TYPES)[number];

/**
 * Normalizza e auto-sanifica un docType non canonico riportandolo deterministicamente
 * a uno dei 6 tipi ufficiali OKF v0.2, prevenendo corruzioni ontologiche da parte di LLM esterni.
 */
export function sanitizeDocType(rawType: string): {
  sanitized: CanonicalOKFType;
  wasRepaired: boolean;
  originalType: string;
  repairReason?: string;
} {
  const original = (rawType || "").trim();
  const normalized = original.toLowerCase().replace(/[\s-]+/g, "_");

  if (CANONICAL_OKF_TYPES.includes(normalized as CanonicalOKFType)) {
    return { sanitized: normalized as CanonicalOKFType, wasRepaired: false, originalType: original };
  }

  // Mappatura euristica verso i 6 tipi canonici
  if (normalized.includes("arch") || normalized.includes("infra") || normalized.includes("system") || normalized.includes("topology")) {
    return {
      sanitized: "architecture",
      wasRepaired: true,
      originalType: original,
      repairReason: `Re-indirizzato tipo non-standard '${original}' verso 'architecture'`,
    };
  }
  if (
    normalized.includes("guide") ||
    normalized.includes("tuto") ||
    normalized.includes("how") ||
    normalized.includes("walkthrough") ||
    normalized.includes("manual") ||
    normalized.includes("runbook")
  ) {
    return {
      sanitized: "guide",
      wasRepaired: true,
      originalType: original,
      repairReason: `Re-indirizzato tipo non-standard '${original}' verso 'guide'`,
    };
  }
  if (
    normalized.includes("spec") ||
    normalized.includes("rfc") ||
    normalized.includes("standard") ||
    normalized.includes("protocol") ||
    normalized.includes("contract")
  ) {
    return {
      sanitized: "specification",
      wasRepaired: true,
      originalType: original,
      repairReason: `Re-indirizzato tipo non-standard '${original}' verso 'specification'`,
    };
  }
  if (
    normalized.includes("tool") ||
    normalized.includes("mcp") ||
    normalized.includes("cli") ||
    normalized.includes("util") ||
    normalized.includes("script") ||
    normalized.includes("extension")
  ) {
    return {
      sanitized: "tool_description",
      wasRepaired: true,
      originalType: original,
      repairReason: `Re-indirizzato tipo non-standard '${original}' verso 'tool_description'`,
    };
  }
  if (
    normalized.includes("prompt") ||
    normalized.includes("skill") ||
    normalized.includes("agent") ||
    normalized.includes("instruction") ||
    normalized.includes("persona")
  ) {
    return {
      sanitized: "prompt_skill",
      wasRepaired: true,
      originalType: original,
      repairReason: `Re-indirizzato tipo non-standard '${original}' verso 'prompt_skill'`,
    };
  }

  // Default di sicurezza
  return {
    sanitized: "concept",
    wasRepaired: true,
    originalType: original,
    repairReason: `Re-indirizzato tipo sconosciuto '${original}' verso 'concept'`,
  };
}

export interface ParsedOKFDocument {
  isValidOKF: boolean;
  okfVersion?: string;
  title: string;
  docType: string;
  domain: string;
  tags: string[];
  entities: OKFEntity[];
  relations: OKFRelation[];
  bodyMarkdown: string;
  rawFrontmatter?: string;
  hasFrontmatter: boolean;
  wasAutoRepaired?: boolean;
  originalDocType?: string;
  autoRepairReason?: string;
}

/**
 * Parsing euristico e robusto del frontmatter YAML conforme allo standard OKF v0.2
 */
export function parseOKFDocument(rawText: string, fallbackTitle: string = "Documento Tecnico"): ParsedOKFDocument {
  const text = (rawText || "").trim();
  const frontmatterMatch = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/);

  if (!frontmatterMatch) {
    // Non ha frontmatter YAML esplicito: analizziamo il markdown grezzo
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const inferredTitle = lines[0]?.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim().slice(0, 100) || fallbackTitle;

    return {
      isValidOKF: false,
      title: inferredTitle,
      docType: "concept",
      domain: "Knowledge Architecture",
      tags: ["knowledge", "okf-v0.2"],
      entities: [{ name: inferredTitle, type: "concept", description: "Entità cardine del documento" }],
      relations: [],
      bodyMarkdown: text,
      hasFrontmatter: false,
    };
  }

  const rawYaml = frontmatterMatch[1];
  const bodyMarkdown = frontmatterMatch[2].trim();

  let okfVersion: string | undefined;
  let title = fallbackTitle;
  let docType = "concept";
  let domain = "Knowledge Architecture";
  const tags: string[] = [];
  const entities: OKFEntity[] = [];
  const relations: OKFRelation[] = [];

  const yamlLines = rawYaml.split("\n");
  let currentSection: "none" | "tags" | "entities" | "relations" = "none";
  let currentEntity: Partial<OKFEntity> | null = null;
  let currentRelation: Partial<OKFRelation> | null = null;

  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Detect section headers
    if (trimmed.startsWith("tags:")) {
      currentSection = "tags";
      const inlineTags = trimmed.replace(/^tags:\s*/, "");
      if (inlineTags.startsWith("[") && inlineTags.endsWith("]")) {
        try {
          const parsed = JSON.parse(inlineTags.replace(/'/g, '"'));
          if (Array.isArray(parsed)) {
            parsed.forEach((t) => tags.push(String(t).trim().toLowerCase()));
          }
        } catch {
          // Fallback comma split
          inlineTags.slice(1, -1).split(",").forEach((t) => {
            const clean = t.replace(/["']/g, "").trim();
            if (clean) tags.push(clean.toLowerCase());
          });
        }
      }
      continue;
    }

    if (trimmed.startsWith("entities:")) {
      currentSection = "entities";
      continue;
    }

    if (trimmed.startsWith("relations:")) {
      currentSection = "relations";
      continue;
    }

    // Top-level scalar keys
    if (!line.startsWith(" ") && !line.startsWith("\t") && trimmed.includes(":")) {
      currentSection = "none";
      const [rawKey, ...valParts] = trimmed.split(":");
      const key = rawKey.trim();
      const val = valParts.join(":").trim().replace(/^["']|["']$/g, "");

      if (key === "okf_version" || key === "okfVersion") {
        okfVersion = val;
      } else if (key === "title") {
        title = val || title;
      } else if (key === "type" || key === "docType") {
        docType = val || docType;
      } else if (key === "domain") {
        domain = val || domain;
      }
      continue;
    }

    // Parsing array items inside sections
    if (currentSection === "tags" && trimmed.startsWith("-")) {
      const tagVal = trimmed.replace(/^-\s*/, "").replace(/^["']|["']$/g, "").trim();
      if (tagVal) tags.push(tagVal.toLowerCase());
      continue;
    }

    if (currentSection === "entities") {
      if (trimmed.startsWith("-")) {
        if (currentEntity && currentEntity.name) {
          entities.push({
            name: currentEntity.name,
            type: currentEntity.type || "concept",
            description: currentEntity.description,
          });
        }
        currentEntity = {};
        const inlineKeyVal = trimmed.replace(/^-\s*/, "");
        if (inlineKeyVal.includes(":")) {
          const [k, ...v] = inlineKeyVal.split(":");
          const propKey = k.trim();
          const propVal = v.join(":").trim().replace(/^["']|["']$/g, "");
          if (propKey === "name") currentEntity.name = propVal;
          if (propKey === "type") currentEntity.type = propVal;
          if (propKey === "description") currentEntity.description = propVal;
        }
      } else if (currentEntity && trimmed.includes(":")) {
        const [k, ...v] = trimmed.split(":");
        const propKey = k.trim();
        const propVal = v.join(":").trim().replace(/^["']|["']$/g, "");
        if (propKey === "name") currentEntity.name = propVal;
        if (propKey === "type") currentEntity.type = propVal;
        if (propKey === "description") currentEntity.description = propVal;
      }
      continue;
    }

    if (currentSection === "relations") {
      if (trimmed.startsWith("-")) {
        if (currentRelation && (currentRelation.targetTitle || currentRelation.target)) {
          relations.push({
            targetTitle: currentRelation.targetTitle || currentRelation.target || "Resource",
            targetId: currentRelation.targetId,
            relationType: currentRelation.relationType || "references",
            weight: currentRelation.weight ?? 0.8,
            description: currentRelation.description,
          });
        }
        currentRelation = {};
        const inlineKeyVal = trimmed.replace(/^-\s*/, "");
        if (inlineKeyVal.includes(":")) {
          const [k, ...v] = inlineKeyVal.split(":");
          const propKey = k.trim();
          const propVal = v.join(":").trim().replace(/^["']|["']$/g, "");
          if (propKey === "targetTitle" || propKey === "target_title" || propKey === "target") currentRelation.targetTitle = propVal;
          if (propKey === "relationType" || propKey === "relation_type") currentRelation.relationType = propVal as any;
          if (propKey === "weight") currentRelation.weight = parseFloat(propVal) || 0.8;
          if (propKey === "description") currentRelation.description = propVal;
        }
      } else if (currentRelation && trimmed.includes(":")) {
        const [k, ...v] = trimmed.split(":");
        const propKey = k.trim();
        const propVal = v.join(":").trim().replace(/^["']|["']$/g, "");
        if (propKey === "targetTitle" || propKey === "target_title" || propKey === "target") currentRelation.targetTitle = propVal;
        if (propKey === "targetId" || propKey === "target_id") currentRelation.targetId = propVal;
        if (propKey === "relationType" || propKey === "relation_type") currentRelation.relationType = propVal as any;
        if (propKey === "weight") currentRelation.weight = parseFloat(propVal) || 0.8;
        if (propKey === "description") currentRelation.description = propVal;
      }
      continue;
    }
  }

  // Push lingering entity / relation
  if (currentEntity && currentEntity.name) {
    entities.push({
      name: currentEntity.name,
      type: currentEntity.type || "concept",
      description: currentEntity.description,
    });
  }
  if (currentRelation && (currentRelation.targetTitle || currentRelation.target)) {
    relations.push({
      targetTitle: currentRelation.targetTitle || currentRelation.target || "Resource",
      targetId: currentRelation.targetId,
      relationType: currentRelation.relationType || "references",
      weight: currentRelation.weight ?? 0.8,
      description: currentRelation.description,
    });
  }

  // Auto-sanitizzazione tipologica per conformità rigorosa OKF v0.2
  const { sanitized: finalDocType, wasRepaired: wasAutoRepaired, originalType: originalDocType, repairReason: autoRepairReason } = sanitizeDocType(docType);

  const isValidOKF = Boolean(
    okfVersion &&
    okfVersion.includes("0.2") &&
    title &&
    CANONICAL_OKF_TYPES.includes(finalDocType)
  );

  return {
    isValidOKF,
    okfVersion: okfVersion || "0.2",
    title,
    docType: finalDocType,
    domain,
    tags: tags.length > 0 ? Array.from(new Set(tags)) : ["knowledge", "okf-v0.2"],
    entities,
    relations,
    bodyMarkdown,
    rawFrontmatter: rawYaml,
    hasFrontmatter: true,
    wasAutoRepaired,
    originalDocType: wasAutoRepaired ? originalDocType : undefined,
    autoRepairReason,
  };
}

/**
 * Boilerplate templates predefiniti per authoring immediato in OKF v0.2
 */
export const OKF_TEMPLATES = {
  architecture: `---
okf_version: "0.2"
title: "Architettura e Topologia del Sistema"
type: "architecture"
domain: "Cloud & Distributed Systems"
tags: ["architettura", "okf-v0.2", "infrastruttura"]
entities:
  - name: "API Gateway"
    type: "component"
    description: "Punto di ingresso unificato con reverse proxy nginx"
  - name: "Cloud Firestore"
    type: "database"
    description: "Database NoSQL persistente con indici topologici"
relations:
  - targetTitle: "Knowledge Vault"
    relationType: "integrates"
    weight: 0.9
---

# Architettura e Topologia del Sistema

> **Specifica architetturale conforme allo standard OKF v0.2**

---

## 1. Panoramica del Sistema
Descrizione dettagliata dell'architettura, obiettivi di throughput, isolamento dei servizi e pattern di progettazione adottati.

---

## 2. Componenti Core e Flusso Dati
- **Frontend SPA**: React 19 + Tailwind CSS + D3 Force Graph.
- **Backend Service**: Express su porta 3000 con routing protetto verso Gemini 3.7 Flash.
- **Data Layer**: Persistenza multi-layer con fallback locale in caso di quota.
`,

  specification: `---
okf_version: "0.2"
title: "Specifica Tecnica di Funzionalità"
type: "specification"
domain: "Developer Tooling"
tags: ["specifica", "api", "okf-v0.2"]
entities:
  - name: "Contradiction Gate"
    type: "concept"
    description: "Gate out-of-loop che arresta la sintesi in presenza di conflitti"
relations:
  - targetTitle: "Knowledge Vault"
    relationType: "references"
    weight: 0.85
---

# Specifica Tecnica di Funzionalità

> **Definizione dei requisiti e contratti di interfaccia**

---

## 1. Obiettivi e Scope
Definizione dei requisiti funzionali e non funzionali, vincoli di compatibilità retroattiva e metriche di successo.

---

## 2. Contratti di Interfaccia & Endpoint
\`\`\`typescript
interface RequestPayload {
  mode: "hybrid" | "deterministic";
  timeoutMs: number;
}
\`\`\`
`,

  prompt_skill: `---
okf_version: "0.2"
title: "AI Skill: Principal Ontologist Agent"
type: "prompt_skill"
domain: "AI Systems & Inference"
tags: ["prompt-engineering", "ai-skill", "ontologia"]
entities:
  - name: "Gemini 3.7 Flash"
    type: "model"
    description: "Modello primario a basso costo e latenza ridotta"
relations:
  - targetTitle: "Knowledge Vault"
    relationType: "extends"
    weight: 0.95
---

# AI Skill: Principal Ontologist Agent

> **Protocollo operativo per agenti autonomi nel Vault**

---

## 1. Ruolo e Identità
Sei un Senior Ontologist e Principal Architect responsabile dell'ingestione e categorizzazione dei documenti.

---

## 2. Regole di Ingaggio (Hard Bounds)
- Non inventare relazioni se non esplicitate nel testo.
- Rifiutare sintesi arbitrarie quando i dati sono insufficienti (\`insufficient: true\`).
`,

  guide: `---
okf_version: "0.2"
title: "Guida Operativa e Runbook di Deployment"
type: "guide"
domain: "DevOps & SRE"
tags: ["runbook", "deploy", "okf-v0.2"]
entities:
  - name: "Google Cloud Run"
    type: "platform"
    description: "Ambiente di container serverless con scaling a zero"
relations:
  - targetTitle: "Knowledge Vault"
    relationType: "governs"
    weight: 0.8
---

# Guida Operativa e Runbook di Deployment

> **Procedure standard di deployment e monitoraggio**

---

## 1. Prerequisiti
- Node.js 22 LTS installato nel container.
- Chiave API Gemini configurata nell'ambiente.

---

## 2. Procedura di Rilascio
1. Eseguire la compilazione dei bundle: \`npm run build\`.
2. Verificare l'assenza di warning nel linter: \`npm run lint\`.
3. Avviare il servizio Node in produzione.
`,
};

export const VALID_OKF_DOC_TYPES = [
  "concept",
  "architecture",
  "guide",
  "specification",
  "tool_description",
  "prompt_skill",
] as const;

export type ValidOKFDocType = typeof VALID_OKF_DOC_TYPES[number];

export interface OKFValidationResult {
  isValidOKF: boolean;
  failureReasons: string[];
  primaryFailureReason?: string;
  isWebLink: boolean;
  parsedDocument?: ParsedOKFDocument;
}

/**
 * Validazione rigorosa per la conformità allo standard OKF v0.2.
 * Rileva specificamente se l'input è un link web o un payload non conforme.
 */
export function validateOKFDocumentSchema(
  rawInput: string,
  metadata?: Record<string, any>,
  resourceType?: string
): OKFValidationResult {
  const trimmed = (rawInput || "").trim();
  const reasons: string[] = [];

  // 1. Web Link Detection Guard
  const isUrlPattern = /^https?:\/\/[^\s]+$/i.test(trimmed) ||
    (!trimmed.includes("\n") && (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("www.")));
  const isWebLink = isUrlPattern || resourceType === "link" || (!trimmed.includes("\n") && trimmed.includes("github.com/"));

  if (isWebLink) {
    reasons.push(`L'input è un collegamento web (${trimmed.slice(0, 50)}...). I link web non possono essere etichettati come documenti tecnici OKF v0.2.`);
    return {
      isValidOKF: false,
      failureReasons: reasons,
      primaryFailureReason: reasons[0],
      isWebLink: true,
    };
  }

  // 2. Check for frontmatter and parse
  const parsed = parseOKFDocument(trimmed);
  const effectiveMeta: Record<string, any> = { ...(parsed || {}), ...(metadata || {}) };

  if (!parsed.hasFrontmatter && !metadata?.markdownContent?.startsWith("---")) {
    reasons.push("Blocco YAML frontmatter delimitato da '---' assente all'inizio del documento.");
  }

  const okfVersion = effectiveMeta.okfVersion || effectiveMeta.okf_version || parsed.okfVersion;
  if (!okfVersion || !String(okfVersion).includes("0.2")) {
    reasons.push(`Versione OKF non conforme o assente (richiesto okf_version: "0.2", rilevato: "${okfVersion || 'nessuno'}").`);
  }

  const title = effectiveMeta.title || parsed.title;
  if (!title || title === "Documento Tecnico" || title.trim().length === 0) {
    reasons.push("Titolo del documento OKF mancante o non valido.");
  }

  const docType = effectiveMeta.docType || effectiveMeta.type || parsed.docType;
  if (!docType || !VALID_OKF_DOC_TYPES.includes(docType as any)) {
    reasons.push(`docType "${docType || 'indefinito'}" non consentito nello standard OKF v0.2 (tipi consentiti: ${VALID_OKF_DOC_TYPES.join(", ")}).`);
  }

  const domain = effectiveMeta.domain || parsed.domain;
  if (!domain || domain.trim().length === 0) {
    reasons.push("Dominio semantico non specificato nel documento OKF.");
  }

  const entities = effectiveMeta.entities || parsed.entities;
  if (!Array.isArray(entities) || entities.length === 0) {
    reasons.push("Entità del grafo ontologico assenti o non strutturate nello schema OKF.");
  }

  const relations = effectiveMeta.relations || parsed.relations;
  if (!Array.isArray(relations)) {
    reasons.push("Relazioni ontologiche non definite o non strutturate in formato array.");
  }

  const bodyContent = parsed.bodyMarkdown || effectiveMeta.markdownContent || "";
  if (bodyContent.trim().length < 40) {
    reasons.push("Corpo del documento markdown vuoto o insufficiente (< 40 caratteri).");
  }

  const isValidOKF = reasons.length === 0;

  return {
    isValidOKF,
    failureReasons: reasons,
    primaryFailureReason: reasons[0],
    isWebLink: false,
    parsedDocument: parsed,
  };
}

