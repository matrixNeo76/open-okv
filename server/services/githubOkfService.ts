import { OKFEntity, OKFRelation, ResourceType } from "../../src/types";

export interface GitHubOkfSyncItem {
  filePath: string;
  fileName: string;
  title: string;
  summary: string;
  type: ResourceType;
  tags: string[];
  url: string;
  rawUrl: string;
  docType: string;
  domain: string;
  okfVersion?: string;
  isValidOKF: boolean;
  entitiesCount: number;
  relationsCount: number;
  entities: OKFEntity[];
  relations: OKFRelation[];
  markdownContent: string;
  sizeBytes: number;
  existingMatch?: {
    id: string;
    title: string;
    isIdentical: boolean;
  };
}

export interface GitHubRepoSyncResult {
  success: boolean;
  owner: string;
  repo: string;
  branch: string;
  subpath?: string;
  repoUrl: string;
  totalMarkdownFilesFound: number;
  okfDocumentsFound: number;
  items: GitHubOkfSyncItem[];
  error?: string;
}

/**
 * Normalizes input repository string into { owner, repo }
 */
export function parseGitHubRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = (input || "").trim().replace(/\.git$/i, "");
  if (!trimmed) return null;

  // Pattern: https://github.com/owner/repo or github.com/owner/repo
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Pattern: owner/repo
  const slashParts = trimmed.split("/").map((p) => p.trim()).filter(Boolean);
  if (slashParts.length === 2 && /^[a-zA-Z0-9._-]+$/.test(slashParts[0]) && /^[a-zA-Z0-9._-]+$/.test(slashParts[1])) {
    return { owner: slashParts[0], repo: slashParts[1] };
  }

  return null;
}

/**
 * Parses frontmatter YAML and body from raw markdown
 */
export function parseMarkdownOKF(rawContent: string, fallbackTitle: string): {
  isValidOKF: boolean;
  okfVersion?: string;
  title: string;
  summary: string;
  docType: string;
  domain: string;
  tags: string[];
  entities: OKFEntity[];
  relations: OKFRelation[];
} {
  const text = (rawContent || "").trim();
  const frontmatterMatch = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/);

  if (!frontmatterMatch) {
    // Non ha frontmatter YAML
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const inferredTitle = lines[0]?.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim().slice(0, 100) || fallbackTitle;
    const bodyText = text.slice(0, 500).replace(/#+/g, "").trim();
    const inferredSummary = bodyText.slice(0, 240) + (bodyText.length > 240 ? "..." : "");

    return {
      isValidOKF: false,
      title: inferredTitle,
      summary: inferredSummary || `Documento markdown ${fallbackTitle}`,
      docType: "specification",
      domain: "Software Architecture",
      tags: ["markdown", "github", "imported"],
      entities: [{ name: inferredTitle, type: "concept", description: "Entità principale del documento" }],
      relations: [],
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

    // Parse array items
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
        if (propKey === "relationType" || propKey === "relation_type") currentRelation.relationType = propVal as any;
        if (propKey === "weight") currentRelation.weight = parseFloat(propVal) || 0.8;
        if (propKey === "description") currentRelation.description = propVal;
      }
      continue;
    }
  }

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
      relationType: currentRelation.relationType || "references",
      weight: currentRelation.weight ?? 0.8,
      description: currentRelation.description,
    });
  }

  // Extract clean summary from body Markdown
  const bodyParagraphs = bodyMarkdown.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0 && !p.startsWith("#"));
  const firstPara = bodyParagraphs[0] || "";
  const cleanSummary = firstPara.slice(0, 300) || `Documentazione OKF: ${title}`;

  if (tags.length === 0) {
    tags.push("okf-v0.2", "knowledge", "github");
  }

  return {
    isValidOKF: okfVersion === "0.2" || okfVersion === "0.1" || Boolean(okfVersion),
    okfVersion: okfVersion || (rawYaml.includes("okf") ? "0.2" : undefined),
    title,
    summary: cleanSummary,
    docType,
    domain,
    tags: Array.from(new Set(tags)),
    entities,
    relations,
  };
}

/**
 * Scans a GitHub repository for markdown and OKF files
 */
export async function scanGitHubRepositoryOKF(options: {
  repoInput: string;
  branch?: string;
  subpath?: string;
  maxFiles?: number;
  existingResources?: Array<{ id: string; title: string; url?: string; markdownContent?: string }>;
}): Promise<GitHubRepoSyncResult> {
  const parsedRepo = parseGitHubRepoInput(options.repoInput);
  if (!parsedRepo) {
    return {
      success: false,
      owner: "",
      repo: "",
      branch: "",
      repoUrl: options.repoInput,
      totalMarkdownFilesFound: 0,
      okfDocumentsFound: 0,
      items: [],
      error: "Identificatore repository GitHub non valido. Usa 'owner/repo' o l'URL completo.",
    };
  }

  const { owner, repo } = parsedRepo;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const maxFiles = options.maxFiles || 35;
  const headers: Record<string, string> = {
    "User-Agent": "KnowledgeVault-OKF-Sync/1.0",
    Accept: "application/vnd.github.v3+json",
  };

  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  // 1. Resolve default branch if not specified
  let branch = (options.branch || "").trim();
  if (!branch) {
    try {
      const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (repoInfoRes.ok) {
        const repoData: any = await repoInfoRes.json();
        branch = repoData.default_branch || "main";
      } else {
        branch = "main";
      }
    } catch {
      branch = "main";
    }
  }

  // 2. Fetch Git Tree recursively
  let treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  let treeRes = await fetch(treeUrl, { headers });

  // Fallback to "master" if "main" returns 404
  if (treeRes.status === 404 && branch === "main") {
    branch = "master";
    treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    treeRes = await fetch(treeUrl, { headers });
  }

  if (!treeRes.ok) {
    const errStatus = treeRes.status;
    let errMsg = `Impossibile interrogare l'albero del repository (HTTP ${errStatus})`;
    if (errStatus === 404) errMsg = `Repository ${owner}/${repo} o branch '${branch}' non trovato o privato.`;
    if (errStatus === 403) errMsg = `Limite di richieste API di GitHub raggiunto. Riprova più tardi o specifica un token.`;
    return {
      success: false,
      owner,
      repo,
      branch,
      repoUrl,
      totalMarkdownFilesFound: 0,
      okfDocumentsFound: 0,
      items: [],
      error: errMsg,
    };
  }

  const treeData: any = await treeRes.json();
  const treeList: Array<{ path: string; type: string; size?: number; url: string }> = treeData.tree || [];

  const subpathClean = (options.subpath || "").trim().replace(/^\/+|\/+$/g, "");

  // Filter for markdown files
  const mdFiles = treeList.filter((item) => {
    if (item.type !== "blob") return false;
    const lower = item.path.toLowerCase();
    const isMd = lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
    if (!isMd) return false;
    if (subpathClean) {
      return item.path.startsWith(subpathClean + "/") || item.path === subpathClean;
    }
    return true;
  });

  const totalMarkdownFilesFound = mdFiles.length;
  const targetFiles = mdFiles.slice(0, maxFiles);

  // 3. Fetch each markdown file via raw URL in controlled concurrency
  const items: GitHubOkfSyncItem[] = [];
  let okfCount = 0;

  // Run in chunks of 5 parallel requests
  const CHUNK_SIZE = 5;
  for (let i = 0; i < targetFiles.length; i += CHUNK_SIZE) {
    const chunk = targetFiles.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (file) => {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
        const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;
        const fileName = file.path.split("/").pop() || file.path;
        const baseFallbackTitle = fileName.replace(/\.(md|mdx|markdown)$/i, "");

        try {
          const rawRes = await fetch(rawUrl, {
            headers: { "User-Agent": "KnowledgeVault-OKF-Sync/1.0" },
          });

          if (!rawRes.ok) return null;
          const text = await rawRes.text();

          const parsed = parseMarkdownOKF(text, baseFallbackTitle);
          if (parsed.isValidOKF) {
            okfCount++;
          }

          // Check for existing match in Vault
          let existingMatch: GitHubOkfSyncItem["existingMatch"];
          if (options.existingResources && options.existingResources.length > 0) {
            const matched = options.existingResources.find(
              (r) =>
                r.title.trim().toLowerCase() === parsed.title.trim().toLowerCase() ||
                (r.url && (r.url === githubUrl || r.url === rawUrl))
            );
            if (matched) {
              const currentContent = matched.markdownContent || "";
              const isIdentical = currentContent.trim() === text.trim();
              existingMatch = {
                id: matched.id,
                title: matched.title,
                isIdentical,
              };
            }
          }

          const syncItem: GitHubOkfSyncItem = {
            filePath: file.path,
            fileName,
            title: parsed.title,
            summary: parsed.summary,
            type: "knowledge",
            tags: parsed.tags,
            url: githubUrl,
            rawUrl,
            docType: parsed.docType,
            domain: parsed.domain,
            okfVersion: parsed.okfVersion,
            isValidOKF: parsed.isValidOKF,
            entitiesCount: parsed.entities.length,
            relationsCount: parsed.relations.length,
            entities: parsed.entities,
            relations: parsed.relations,
            markdownContent: text,
            sizeBytes: Buffer.byteLength(text, "utf-8"),
            existingMatch,
          };

          return syncItem;
        } catch (fetchErr) {
          console.warn(`Failed to fetch ${file.path}:`, fetchErr);
          return null;
        }
      })
    );

    for (const res of chunkResults) {
      if (res) items.push(res);
    }
  }

  // Sort items: valid OKF docs first, then by title
  items.sort((a, b) => {
    if (a.isValidOKF && !b.isValidOKF) return -1;
    if (!a.isValidOKF && b.isValidOKF) return 1;
    return a.title.localeCompare(b.title);
  });

  return {
    success: true,
    owner,
    repo,
    branch,
    subpath: subpathClean || undefined,
    repoUrl,
    totalMarkdownFilesFound,
    okfDocumentsFound: okfCount,
    items,
  };
}
