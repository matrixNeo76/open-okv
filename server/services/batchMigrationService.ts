/**
 * Batch Vault Migration Engine (Obsidian / Notion / Markdown ZIP Archives)
 * 
 * Unpacks compressed zip vaults, extracts markdown files, resolves [[wikilinks]]
 * into topological OKF v0.2 relations, and constructs structured ResourceItem payloads.
 */

import { inspectAndExtractZipArchive } from "./archiveSecurityService";
import { generateProvenanceRecord } from "./provenanceHelper";

export interface MigratedArchiveItem {
  id: string;
  title: string;
  type: string;
  summary: string;
  tags: string[];
  filePath: string;
  markdownContent: string;
  metadata: {
    okfVersion: "0.2";
    domain: string;
    docType: string;
    markdownContent: string;
    sourceFileName: string;
    sourceFileType: string;
    entities: Array<{ name: string; type: string; description: string }>;
    relations: Array<{ targetTitle: string; relationType: string; weight: number; description: string }>;
  };
}

export interface ArchiveMigrationResult {
  success: boolean;
  totalFilesProcessed: number;
  markdownCount: number;
  wikilinksResolvedCount: number;
  items: MigratedArchiveItem[];
  error?: string;
}

/**
 * Extracts and maps all markdown documents in a ZIP archive with wikilink topology
 */
export function parseVaultZipArchive(zipBuffer: Buffer, archiveName = "archive.zip"): ArchiveMigrationResult {
  try {
    const inspection = inspectAndExtractZipArchive(zipBuffer, archiveName);
    if (!inspection.valid) {
      return {
        success: false,
        totalFilesProcessed: 0,
        markdownCount: 0,
        wikilinksResolvedCount: 0,
        items: [],
        error: inspection.error || "Archivio ZIP non valido o rifiutato dai controlli di sicurezza.",
      };
    }

    interface TempDoc {
      entryName: string;
      cleanFileName: string;
      rawText: string;
      title: string;
      domain: string;
      docType: string;
      tags: string[];
      wikilinks: string[];
      bodyMarkdown: string;
    }

    const tempDocs: TempDoc[] = [];

    // Pass 1: Parse and clean markdown files from sanitized entries
    for (const entry of inspection.entries) {
      const entryName = entry.sanitizedPath;
      const rawText = entry.content;
      if (!rawText.trim()) continue;

      const fileNameOnly = entryName.split("/").pop() || entryName;
      let inferredTitle = fileNameOnly.replace(/\.(md|markdown)$/i, "").trim();

      // Extract existing frontmatter if present
      let tags: string[] = ["migrated-vault", "markdown"];
      let docType = "guide";
      let domain = "Knowledge Architecture";
      let bodyMarkdown = rawText;

      if (rawText.startsWith("---")) {
        const fmEndIndex = rawText.indexOf("---", 3);
        if (fmEndIndex !== -1) {
          const fmContent = rawText.substring(3, fmEndIndex);
          bodyMarkdown = rawText.substring(fmEndIndex + 3).trim();

          // Parse basic key: value lines
          const lines = fmContent.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("title:")) {
              const val = trimmed.replace(/^title:\s*/, "").replace(/^["']|["']$/g, "").trim();
              if (val) inferredTitle = val;
            } else if (trimmed.startsWith("domain:")) {
              const val = trimmed.replace(/^domain:\s*/, "").replace(/^["']|["']$/g, "").trim();
              if (val) domain = val;
            } else if (trimmed.startsWith("docType:") || trimmed.startsWith("type:")) {
              const val = trimmed.replace(/^(docType|type):\s*/, "").replace(/^["']|["']$/g, "").trim();
              if (["concept", "guide", "specification", "architecture", "tool_description", "prompt_skill"].includes(val)) {
                docType = val;
              }
            } else if (trimmed.startsWith("tags:")) {
              try {
                const tagPart = trimmed.replace(/^tags:\s*/, "").trim();
                if (tagPart.startsWith("[") && tagPart.endsWith("]")) {
                  const parsedTags = JSON.parse(tagPart);
                  if (Array.isArray(parsedTags)) tags = Array.from(new Set([...tags, ...parsedTags]));
                }
              } catch {
                // fall through
              }
            }
          }
        }
      }

      // Check first heading if title is still default
      if (!inferredTitle || inferredTitle === fileNameOnly) {
        const h1Match = bodyMarkdown.match(/^#\s+(.+)$/m);
        if (h1Match && h1Match[1]) {
          inferredTitle = h1Match[1].trim();
        }
      }

      // Extract [[wikilinks]] from Obsidian / Notion
      const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
      const foundWikilinks: string[] = [];
      let match: RegExpExecArray | null;

      while ((match = wikilinkRegex.exec(bodyMarkdown)) !== null) {
        const target = match[1]?.trim();
        if (target && !foundWikilinks.includes(target)) {
          foundWikilinks.push(target);
        }
      }

      tempDocs.push({
        entryName,
        cleanFileName: fileNameOnly,
        rawText,
        title: inferredTitle,
        domain,
        docType,
        tags,
        wikilinks: foundWikilinks,
        bodyMarkdown,
      });
    }

    if (tempDocs.length === 0) {
      return {
        success: false,
        totalFilesProcessed: inspection.entries.length,
        markdownCount: 0,
        wikilinksResolvedCount: 0,
        items: [],
        error: "Nessun file Markdown (.md) valido trovato nell'archivio ZIP.",
      };
    }

    // Map title lookup for resolving wikilinks
    const allTitlesLower = new Map<string, string>();
    for (const doc of tempDocs) {
      allTitlesLower.set(doc.title.toLowerCase(), doc.title);
      allTitlesLower.set(doc.cleanFileName.replace(/\.(md|markdown)$/i, "").toLowerCase(), doc.title);
    }

    let totalWikilinksResolved = 0;
    const finalItems: MigratedArchiveItem[] = [];

    // Pass 2: Build OKF v0.2 artifacts with structured relations
    for (const doc of tempDocs) {
      const relations: Array<{ targetTitle: string; relationType: string; weight: number; description: string }> = [];

      for (const link of doc.wikilinks) {
        const matchedTitle = allTitlesLower.get(link.toLowerCase()) || link;
        relations.push({
          targetTitle: matchedTitle,
          relationType: "references",
          weight: 0.85,
          description: `Collegamento topologico migrato da wikilink [[${link}]]`,
        });
        totalWikilinksResolved++;
      }

      // Generate clean summary
      const plainText = doc.bodyMarkdown
        .replace(/#+\s+/g, "")
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2 || $1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\n+/g, " ")
        .trim();
      const summary = plainText.slice(0, 280) || `Documento migrato da archivio ${archiveName}: ${doc.title}.`;

      // Compose pristine OKF v0.2 frontmatter
      const cleanDocId = `migrated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const entities = [
        {
          name: doc.title,
          type: "concept",
          description: `Entità canonica originata dal file ${doc.cleanFileName}`,
        },
      ];

      const yamlRelations = relations.length > 0
        ? "\nrelations:\n" + relations.map((r) => `  - targetTitle: "${r.targetTitle.replace(/"/g, '\\"')}"\n    relationType: "${r.relationType}"\n    weight: ${r.weight}\n    description: "${r.description.replace(/"/g, '\\"')}"`).join("\n")
        : "";

      const okfFrontmatter = `---
okf_version: "0.2"
id: "${cleanDocId}"
title: "${doc.title.replace(/"/g, '\\"')}"
type: "knowledge"
domain: "${doc.domain.replace(/"/g, '\\"')}"
docType: "${doc.docType}"
tags: ${JSON.stringify(doc.tags)}
entities:
  - name: "${doc.title.replace(/"/g, '\\"')}"
    type: "concept"
    description: "Entità canonica dal vault locale"${yamlRelations}
---

`;

      const completeMarkdown = okfFrontmatter + doc.bodyMarkdown;

      finalItems.push({
        id: cleanDocId,
        title: doc.title,
        type: "knowledge",
        summary,
        tags: doc.tags,
        filePath: doc.entryName,
        markdownContent: completeMarkdown,
        metadata: {
          okfVersion: "0.2",
          domain: doc.domain,
          docType: doc.docType,
          docTypeLocked: true,
          provenance: generateProvenanceRecord({
            modelUsed: "batch-vault-migrator",
            pipelineId: "batch-zip-migration",
            pipelineVersion: "1.2.0",
            promptVersion: "0.2.2",
            tokensIn: 0,
            tokensOut: Math.round(completeMarkdown.length / 4),
            durationMs: 0,
            contentToHash: completeMarkdown,
          }),
          markdownContent: completeMarkdown,
          sourceFileName: doc.cleanFileName,
          sourceFileType: "zip_entry",
          entities,
          relations,
        },
      });
    }

    return {
      success: true,
      totalFilesProcessed: zipEntries.length,
      markdownCount: finalItems.length,
      wikilinksResolvedCount: totalWikilinksResolved,
      items: finalItems,
    };
  } catch (err: any) {
    return {
      success: false,
      totalFilesProcessed: 0,
      markdownCount: 0,
      wikilinksResolvedCount: 0,
      items: [],
      error: `Errore nella decompressione o analisi del file ZIP: ${err?.message || "File corrotto"}`,
    };
  }
}
