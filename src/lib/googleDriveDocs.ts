import { 
  auth, 
  googleProvider, 
  GoogleAuthProvider, 
  signInWithPopup, 
  getGoogleAccessToken, 
  setGoogleAccessToken,
  clearGoogleAccessToken,
  hasValidGoogleToken
} from "./firebase";

export { 
  hasValidGoogleToken,
  clearGoogleAccessToken,
  getGoogleAccessToken
};
import { ResourceItem, ResourceType } from "../types";

export const DEFAULT_KNOWLEDGE_FOLDER_ID = "151nJJammXivExYPlRG6AmrlWuHB104Jy";
export const DEFAULT_KNOWLEDGE_FOLDER_URL = "https://drive.google.com/drive/folders/151nJJammXivExYPlRG6AmrlWuHB104Jy?usp=sharing";
export const DEFAULT_KNOWLEDGE_FOLDER_NAME = "knowledge (Team Shared)";

export interface TargetFolderOption {
  id: string;
  name: string;
  url: string;
  isPersonal?: boolean;
  isDefault?: boolean;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName?: string; emailAddress?: string; photoLink?: string }[];
}

export interface GoogleDocExportResult {
  docId: string;
  docUrl: string;
  title: string;
  folderId: string;
  folderUrl: string;
}

export class GoogleAuthExpiredError extends Error {
  constructor(message = "Sessione Google Workspace scaduta o non autorizzata (401).") {
    super(message);
    this.name = "GoogleAuthExpiredError";
  }
}

/**
 * Storage helpers for user's preferred target folder in Google Drive
 */
const ACTIVE_FOLDER_KEY = "vault_gdrive_active_folder_config";

export function getActiveFolderConfig(): TargetFolderOption {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem(ACTIVE_FOLDER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fallback
    }
  }
  return {
    id: DEFAULT_KNOWLEDGE_FOLDER_ID,
    name: DEFAULT_KNOWLEDGE_FOLDER_NAME,
    url: DEFAULT_KNOWLEDGE_FOLDER_URL,
    isDefault: true
  };
}

export function setActiveFolderConfig(folder: TargetFolderOption): void {
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(ACTIVE_FOLDER_KEY, JSON.stringify(folder));
  }
}

/**
 * Robust wrapper around fetch for Google APIs with 401 expiration detection and descriptive errors
 */
export async function workspaceFetch(
  url: string, 
  options: RequestInit = {}, 
  token: string
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401) {
    clearGoogleAccessToken();
    throw new GoogleAuthExpiredError("Token Google non valido o scaduto. Effettua nuovamente l'autorizzazione.");
  }

  return res;
}

/**
 * Explicit user-triggered Google Sign-In with OAuth scopes.
 * Must be called from a user gesture (button click).
 */
export async function requestGoogleAccess(): Promise<string> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error("Impossibile ottenere il token di accesso Google Workspace.");
    }
    setGoogleAccessToken(token, 3550);
    return token;
  } catch (error: any) {
    if (error.code === "auth/popup-blocked") {
      throw new Error("La finestra popup di Google è stata bloccata dal browser. Abilita i popup per questo sito e riprova.");
    }
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
      throw new Error("Finestra di accesso Google chiusa prima del completamento.");
    }
    console.error("[GoogleWorkspace] Errore autenticazione OAuth:", error);
    throw error;
  }
}

/**
 * Ensures a valid OAuth access token is available. If forcePrompt is false and token is cached, returns it.
 */
export async function ensureGoogleAccessToken(forcePrompt = false): Promise<string> {
  const existingToken = getGoogleAccessToken();
  if (existingToken && !forcePrompt) {
    return existingToken;
  }
  return await requestGoogleAccess();
}

/**
 * Checks if current user already has an active Google OAuth token
 */
export function isGoogleConnected(): boolean {
  return hasValidGoogleToken();
}

/**
 * Parses a Google Drive or Google Docs URL to extract the resource ID and type.
 */
export function parseGoogleResourceUrl(input: string): { id: string; type: 'doc' | 'file' | 'folder' | 'unknown' } | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Match Google Docs URL: docs.google.com/document/d/<ID>/...
  const docMatch = trimmed.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) {
    return { id: docMatch[1], type: 'doc' };
  }

  // Match Google Drive Folder: drive.google.com/drive/folders/<ID>
  const folderMatch = trimmed.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    return { id: folderMatch[1], type: 'folder' };
  }

  // Match Google Drive File: drive.google.com/file/d/<ID>/...
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return { id: fileMatch[1], type: 'file' };
  }

  // Match open?id=<ID>
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) {
    return { id: idParamMatch[1], type: 'file' };
  }

  // Direct alphanumeric ID (at least 20 chars)
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) {
    return { id: trimmed, type: 'unknown' };
  }

  return null;
}

/**
 * Verifies if a folder exists and is accessible.
 */
export async function verifyFolderAccess(
  token: string, 
  folderId: string
): Promise<{ accessible: boolean; folderName?: string; webViewLink?: string; error?: string }> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,webViewLink,capabilities`;
    const res = await workspaceFetch(url, {}, token);
    
    if (!res.ok) {
      if (res.status === 404) {
        return { accessible: false, error: "Cartella non trovata o permessi insufficienti su Google Drive (404)." };
      }
      if (res.status === 403) {
        return { accessible: false, error: "Accesso non autorizzato a questa cartella (403)." };
      }
      return { accessible: false, error: `Errore verifica cartella (${res.status})` };
    }

    const data = await res.json();
    return {
      accessible: true,
      folderName: data.name,
      webViewLink: data.webViewLink
    };
  } catch (err: any) {
    return { accessible: false, error: err.message };
  }
}

/**
 * Searches user's personal Drive for a folder named "Knowledge Vault", or creates one if absent.
 */
export async function findOrCreateUserKnowledgeFolder(
  token: string, 
  folderName = "Knowledge Vault"
): Promise<TargetFolderOption> {
  const safeName = folderName.replace(/'/g, "");
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`;

  const res = await workspaceFetch(searchUrl, {}, token);
  if (res.ok) {
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const folder = data.files[0];
      const opt: TargetFolderOption = {
        id: folder.id,
        name: folder.name,
        url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}?usp=sharing`,
        isPersonal: true
      };
      setActiveFolderConfig(opt);
      return opt;
    }
  }

  // If not found, create it in root Drive
  const createUrl = "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink";
  const createRes = await workspaceFetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      description: "Cartella dedicata per l'archiviazione di risorse, compendi e documenti generati da Knowledge Vault."
    })
  }, token);

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Impossibile creare la cartella "${folderName}" su Google Drive: ${err}`);
  }

  const newFolder = await createRes.json();
  const folderOpt: TargetFolderOption = {
    id: newFolder.id,
    name: newFolder.name,
    url: newFolder.webViewLink || `https://drive.google.com/drive/folders/${newFolder.id}?usp=sharing`,
    isPersonal: true
  };
  setActiveFolderConfig(folderOpt);
  return folderOpt;
}

/**
 * Lists files contained within a specific Google Drive folder.
 */
export async function listDriveFolderFiles(
  token: string, 
  folderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID
): Promise<DriveFileInfo[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=50`;

  const res = await workspaceFetch(url, {}, token);

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404 || res.status === 403) {
      throw new Error(`Cartella Google Drive non accessibile o permessi mancanti (${res.status}). Prova a selezionare la tua cartella personale "Knowledge Vault".`);
    }
    throw new Error(`Errore recupero file da Google Drive (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Searches user files and Google Docs across Drive.
 */
export async function searchDriveDocsAndFiles(
  token: string, 
  searchTerm: string = "",
  filterMime: "all" | "gdoc" | "text" = "all"
): Promise<DriveFileInfo[]> {
  let query = "trashed = false";
  
  if (filterMime === "gdoc") {
    query += " and mimeType = 'application/vnd.google-apps.document'";
  } else if (filterMime === "text") {
    query += " and (mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/json')";
  } else {
    query += " and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/json' or mimeType = 'text/csv' or mimeType = 'text/html')";
  }

  if (searchTerm.trim()) {
    const safeTerm = searchTerm.replace(/'/g, "");
    query += ` and (name contains '${safeTerm}' or fullText contains '${safeTerm}')`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=40`;

  const res = await workspaceFetch(url, {}, token);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Errore ricerca Google Drive (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Retrieves file metadata from Google Drive.
 */
export async function getDriveFileMetadata(token: string, fileId: string): Promise<DriveFileInfo> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners,description`;
  const res = await workspaceFetch(url, {}, token);

  if (!res.ok) {
    throw new Error(`Impossibile leggere i metadati del file Drive (${res.status})`);
  }

  return await res.json();
}

/**
 * Extracts plain text content from a Google Doc or supported file on Google Drive.
 * Protects against binary gibberish and supports text, markdown, csv, json, html, and Google Docs.
 */
export async function readDriveDocContent(
  token: string, 
  fileId: string, 
  mimeType?: string
): Promise<{ text: string; name: string; webViewLink?: string; mimeType: string }> {
  let fileName = "Google Doc";
  let targetMime = mimeType;
  let webViewLink = `https://docs.google.com/document/d/${fileId}/edit`;

  try {
    const meta = await getDriveFileMetadata(token, fileId);
    fileName = meta.name;
    targetMime = meta.mimeType;
    if (meta.webViewLink) webViewLink = meta.webViewLink;
  } catch (err) {
    console.warn("[readDriveDocContent] Impossibile recuperare metadati, fallback su esportazione diretta:", err);
  }

  // 1. Check if binary file that cannot be ingested as text
  if (
    targetMime &&
    (targetMime.startsWith("image/") ||
     targetMime.startsWith("audio/") ||
     targetMime.startsWith("video/") ||
     targetMime.includes("zip") ||
     targetMime.includes("tar") ||
     targetMime.includes("octet-stream"))
  ) {
    throw new Error(`Il file "${fileName}" (${targetMime}) è un formato binario. Seleziona un Google Doc, un file Markdown o un file di testo.`);
  }

  // 2. If it's a Google Doc, export as plain text or use Docs API
  if (targetMime === "application/vnd.google-apps.document" || !targetMime) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    const exportRes = await workspaceFetch(exportUrl, {}, token);

    if (exportRes.ok) {
      const text = await exportRes.text();
      return { text: text.trim(), name: fileName, webViewLink, mimeType: targetMime || "application/vnd.google-apps.document" };
    }
    
    // Fallback: Docs API structural parse
    const docsUrl = `https://docs.googleapis.com/v1/documents/${fileId}`;
    const docsRes = await workspaceFetch(docsUrl, {}, token);

    if (!docsRes.ok) {
      const errText = await docsRes.text();
      throw new Error(`Errore lettura Google Doc (${docsRes.status}): ${errText}`);
    }

    const docData = await docsRes.json();
    let extractedText = "";
    if (docData.body?.content) {
      for (const elem of docData.body.content) {
        if (elem.paragraph?.elements) {
          for (const pElem of elem.paragraph.elements) {
            if (pElem.textRun?.content) {
              extractedText += pElem.textRun.content;
            }
          }
        }
      }
    }

    return { 
      text: extractedText.trim(), 
      name: docData.title || fileName, 
      webViewLink, 
      mimeType: "application/vnd.google-apps.document" 
    };
  }

  // 3. For plain text, markdown, json, csv, html
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const mediaRes = await workspaceFetch(mediaUrl, {}, token);

  if (!mediaRes.ok) {
    throw new Error(`Errore download contenuto file (${mediaRes.status})`);
  }

  const text = await mediaRes.text();
  return { text: text.trim(), name: fileName, webViewLink, mimeType: targetMime };
}

/**
 * Escapes HTML special characters safely
 */
function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Palette mapping for resource types
 */
const TYPE_STYLE_MAP: Record<string, { bg: string; color: string; label: string }> = {
  knowledge: { bg: "#e0e7ff", color: "#3730a3", label: "Knowledge OKF v0.2" },
  github_repo: { bg: "#f1f5f9", color: "#0f172a", label: "GitHub Repository" },
  mcp_server: { bg: "#dcfce7", color: "#166534", label: "MCP Server" },
  ai_skill: { bg: "#f3e8ff", color: "#6b21a8", label: "AI Skill" },
  article: { bg: "#fef3c7", color: "#92400e", label: "Articolo Tecnico" },
  troubleshooting: { bg: "#ffedd5", color: "#c2410c", label: "Troubleshooting / Fix" },
  paper: { bg: "#e0f2fe", color: "#0369a1", label: "Paper Scientifico" },
  rss: { bg: "#fee2e2", color: "#991b1b", label: "Aggiornamento RSS" },
};

/**
 * Palette mapping for resource status
 */
const STATUS_STYLE_MAP: Record<string, { bg: string; color: string; label: string }> = {
  stable: { bg: "#dcfce7", color: "#166534", label: "STABILE • VERIFICATO" },
  verified: { bg: "#dcfce7", color: "#166534", label: "STABILE • VERIFICATO" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "IN REVISIONE" },
  deprecated: { bg: "#fee2e2", color: "#991b1b", label: "DEPRECATO" },
  draft: { bg: "#f1f5f9", color: "#475569", label: "BOZZA" },
};

/**
 * Converts raw markdown into beautifully styled HTML specifically tailored for Google Docs import.
 * Handles headings, tables, code blocks, lists, blockquotes, and inline formatting.
 */
function markdownToGoogleDocHtml(rawMarkdown: string): string {
  if (!rawMarkdown) return "";

  // Strip YAML frontmatter if present (frontmatter is rendered in dedicated structured box)
  let text = rawMarkdown.replace(/^---[\s\S]*?---\n*/, "").trim();
  if (!text) return "";

  // 1. Protect code blocks first
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    const placeholder = `<!--CODE_BLOCK_VAULT_${codeBlocks.length}-->`;
    codeBlocks.push(`
      <table style="width: 100%; border-collapse: collapse; margin: 12pt 0; background-color: #0f172a; border-radius: 4pt; border: 1pt solid #1e293b;">
        <tr>
          <td style="background-color: #1e293b; color: #94a3b8; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; padding: 4pt 10pt; text-transform: uppercase; border-bottom: 1pt solid #334155;">
            ${escapeHtml(lang || "CODE")}
          </td>
        </tr>
        <tr>
          <td style="padding: 10pt 14pt; font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; color: #f8fafc; line-height: 1.5; white-space: pre-wrap; word-break: break-all;">${escapedCode}</td>
        </tr>
      </table>
    `);
    return placeholder;
  });

  // 2. Protect markdown tables
  const tableBlocks: string[] = [];
  text = text.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
    const lines = match.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return match;
    
    // Check if second line is a separator like |---|---|
    if (!/^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1])) {
      return match;
    }
    
    const headers = lines[0].split('|').slice(1, -1).map(h => h.trim());
    const rows = lines.slice(2).map(rowLine => rowLine.split('|').slice(1, -1).map(c => c.trim()));
    
    let tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 12pt 0; border: 1pt solid #cbd5e1;">`;
    tableHtml += `<thead><tr style="background-color: #1e293b; color: #ffffff;">`;
    headers.forEach(h => {
      tableHtml += `<th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b;">${escapeHtml(h)}</th>`;
    });
    tableHtml += `</tr></thead><tbody>`;
    rows.forEach((r, rIdx) => {
      const bg = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
      tableHtml += `<tr style="background-color: ${bg};">`;
      r.forEach(c => {
        tableHtml += `<td style="padding: 7pt 10pt; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #cbd5e1; color: #1e293b;">${escapeHtml(c)}</td>`;
      });
      tableHtml += `</tr>`;
    });
    tableHtml += `</tbody></table>`;
    
    const placeholder = `<!--TABLE_BLOCK_VAULT_${tableBlocks.length}-->`;
    tableBlocks.push(tableHtml);
    return placeholder;
  });

  // 3. Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background-color: #f1f5f9; color: #b91c1c; font-family: \'Courier New\', Courier, monospace; font-size: 9.5pt; padding: 1.5pt 4pt; border-radius: 2pt; border: 1pt solid #e2e8f0;">$1</code>');

  // 4. Headings
  text = text.replace(/^#### (.*$)/gim, '<h4 style="font-size: 11pt; font-weight: bold; color: #334155; margin-top: 14pt; margin-bottom: 4pt; font-family: Arial, sans-serif;">$1</h4>');
  text = text.replace(/^### (.*$)/gim, '<h3 style="font-size: 13pt; font-weight: bold; color: #1e293b; margin-top: 16pt; margin-bottom: 6pt; font-family: Arial, sans-serif;">$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2 style="font-size: 15pt; font-weight: bold; color: #0f172a; margin-top: 20pt; margin-bottom: 8pt; border-bottom: 1.5pt solid #cbd5e1; padding-bottom: 4pt; font-family: Arial, sans-serif;">$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h2 style="font-size: 16pt; font-weight: bold; color: #0f172a; margin-top: 22pt; margin-bottom: 10pt; border-bottom: 2pt solid #2563eb; padding-bottom: 4pt; font-family: Arial, sans-serif;">$1</h2>');

  // 5. Blockquotes (single-cell table for rock-solid Google Docs rendering)
  text = text.replace(/^\> (.*$)/gim, '<table style="width: 100%; border-collapse: collapse; margin: 10pt 0; background-color: #f8fafc; border-left: 4pt solid #3b82f6;"><tr><td style="padding: 8pt 12pt; font-style: italic; color: #334155; font-size: 10.5pt; font-family: Arial, sans-serif; line-height: 1.5;">$1</td></tr></table>');

  // 6. Bold & Italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a;">$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 7. Hyperlinks
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2563eb; text-decoration: underline;">$1</a>');

  // 8. Horizontal rules
  text = text.replace(/^---$/gim, '<hr style="border: none; border-top: 1pt solid #cbd5e1; margin: 16pt 0;" />');

  // 9. Unordered and ordered lists
  text = text.replace(/^[-*] (.*$)/gim, '<li style="margin-bottom: 4pt; line-height: 1.5;">$1</li>');
  text = text.replace(/(<li style="margin-bottom: 4pt; line-height: 1.5;">.*<\/li>\s*)+/g, '<ul style="margin: 6pt 0 10pt 18pt; padding: 0; font-size: 10.5pt; font-family: Arial, sans-serif; color: #1e293b;">$&</ul>');

  text = text.replace(/^\d+\.\s+(.*$)/gim, '<li style="margin-bottom: 4pt; line-height: 1.5;">$1</li>');

  // 10. Paragraphs
  const sections = text.split(/\n\n+/);
  text = sections.map(section => {
    const trimmed = section.trim();
    if (!trimmed) return "";
    if (
      trimmed.startsWith("<!--CODE_BLOCK_VAULT_") || 
      trimmed.startsWith("<!--TABLE_BLOCK_VAULT_") || 
      trimmed.startsWith("<h") || 
      trimmed.startsWith("<table") || 
      trimmed.startsWith("<ul") || 
      trimmed.startsWith("<ol") || 
      trimmed.startsWith("<hr")
    ) {
      return trimmed;
    }
    return `<p style="margin: 0 0 10pt 0; line-height: 1.6; font-size: 11pt; font-family: Arial, sans-serif; color: #1e293b;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }).join("\n");

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    text = text.replace(`<!--CODE_BLOCK_VAULT_${idx}-->`, block);
  });

  // Restore table blocks
  tableBlocks.forEach((tbl, idx) => {
    text = text.replace(`<!--TABLE_BLOCK_VAULT_${idx}-->`, tbl);
  });

  return text;
}

/**
 * Builds valid, beautifully formatted OKF v0.2 YAML frontmatter string
 */
function buildFrontmatterYamlString(resource: ResourceItem, domain: string, score: number | string): string {
  const cleanTags = (resource.tags || []).map(t => `"${t}"`).join(", ");
  const dateIso = resource.createdAt ? new Date(resource.createdAt).toISOString() : new Date().toISOString();
  
  const lines: string[] = [
    `okf_version: "0.2"`,
    `id: "${resource.id || 'vault-item'}"`,
    `title: "${resource.title.replace(/"/g, "'")}"`,
    `type: "${resource.type}"`,
    `domain: "${domain.replace(/"/g, "'")}"`,
    `status: "${resource.metadata?.status || 'stable'}"`,
    `score: ${typeof score === "number" ? score : 90}`,
    `tags: [${cleanTags}]`,
    `created_at: "${dateIso}"`
  ];

  if (resource.metadata?.entities && resource.metadata.entities.length > 0) {
    lines.push(`entities:`);
    resource.metadata.entities.slice(0, 10).forEach((e: any) => {
      const name = typeof e === "string" ? e : e.name;
      const type = typeof e === "string" ? "technology" : (e.type || "concept");
      const desc = typeof e === "string" ? "" : (e.description || "");
      lines.push(`  - name: "${name.replace(/"/g, "'")}"`);
      lines.push(`    type: "${type}"`);
      if (desc) lines.push(`    description: "${desc.replace(/"/g, "'")}"`);
    });
  }

  if (resource.metadata?.relations && resource.metadata.relations.length > 0) {
    lines.push(`relations:`);
    resource.metadata.relations.slice(0, 10).forEach((r: any) => {
      const target = r.targetTitle || r.target || "Entità Vault";
      const relType = r.relationType || "relates_to";
      const weight = r.weight !== undefined ? r.weight : 0.8;
      lines.push(`  - targetTitle: "${target.replace(/"/g, "'")}"`);
      lines.push(`    relationType: "${relType}"`);
      lines.push(`    weight: ${weight}`);
    });
  }

  return lines.join("\n");
}

/**
 * Builds rich, publication-grade HTML content for a single Vault resource.
 * When imported into Google Docs via Google Drive multipart upload, this produces a pristine,
 * visually clear document with headers, styled tables, badges, callout cards, and code blocks.
 */
export function buildResourceDocumentHtml(resource: ResourceItem, targetFolderName: string): string {
  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
  const typeStyle = TYPE_STYLE_MAP[resource.type] || { bg: "#e0e7ff", color: "#3730a3", label: resource.type.toUpperCase() };
  const statusKey = resource.metadata?.status || "stable";
  const statusStyle = STATUS_STYLE_MAP[statusKey] || { bg: "#dcfce7", color: "#166534", label: statusKey.toUpperCase() };
  const domain = resource.metadata?.domain || "Informatica & AI Architecture";
  const scoreVal = typeof resource.metadata?.score === "number" ? resource.metadata.score : (resource.metadata?.score ? Number(resource.metadata.score) : 90);
  
  let scoreBadgeColor = "#166534";
  let scoreBadgeBg = "#dcfce7";
  if (scoreVal < 60) {
    scoreBadgeColor = "#92400e";
    scoreBadgeBg = "#fef3c7";
  } else if (scoreVal < 80) {
    scoreBadgeColor = "#1e40af";
    scoreBadgeBg = "#dbeafe";
  }

  const yamlFrontmatter = buildFrontmatterYamlString(resource, domain, scoreVal);
  const markdownBodyHtml = markdownToGoogleDocHtml(resource.metadata?.markdownContent || resource.rawInput || resource.summary || "");

  // Key Takeaways section
  let takeawaysHtml = "";
  const takeaways = resource.metadata?.aiKeyTakeaways || resource.metadata?.keyTakeaways || [];
  if (takeaways.length > 0) {
    takeawaysHtml = `
      <h2 style="font-size: 14pt; color: #0f172a; font-weight: bold; margin-top: 22pt; margin-bottom: 8pt; border-bottom: 2pt solid #10b981; padding-bottom: 4pt; font-family: Arial, sans-serif;">
        💡 Executive Takeaways &amp; Punti Chiave
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10pt 0 16pt 0; background-color: #f0fdf4; border-left: 5pt solid #10b981; border-top: 1pt solid #dcfce7; border-right: 1pt solid #dcfce7; border-bottom: 1pt solid #dcfce7;">
        <tr>
          <td style="padding: 12pt 16pt; font-size: 10.5pt; color: #064e3b; font-family: Arial, sans-serif; line-height: 1.6;">
            <ul style="margin: 0; padding-left: 18pt;">
              ${takeaways.map((t: string) => `<li style="margin-bottom: 6pt;"><strong>✓ ${escapeHtml(t)}</strong></li>`).join("")}
            </ul>
          </td>
        </tr>
      </table>
    `;
  }

  // Entities section
  let entitiesHtml = "";
  if (resource.metadata?.entities && resource.metadata.entities.length > 0) {
    const entityRows = resource.metadata.entities.map((e: any, idx: number) => {
      const name = typeof e === "string" ? e : e.name;
      const type = typeof e === "string" ? "technology" : (e.type || "concept");
      const desc = typeof e === "string" ? "" : (e.description || "N/D");
      const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      return `
        <tr style="background-color: ${bg};">
          <td style="padding: 7pt 10pt; font-weight: bold; color: #0f172a; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${escapeHtml(name)}</td>
          <td style="padding: 7pt 10pt; border: 1pt solid #cbd5e1; font-size: 9pt; font-family: Arial, sans-serif;">
            <span style="background-color: #f1f5f9; color: #334155; padding: 2pt 6pt; border-radius: 3pt; font-weight: bold; text-transform: uppercase;">${escapeHtml(type)}</span>
          </td>
          <td style="padding: 7pt 10pt; color: #334155; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${escapeHtml(desc)}</td>
        </tr>
      `;
    }).join("");

    entitiesHtml = `
      <h2 style="font-size: 14pt; color: #0f172a; font-weight: bold; margin-top: 22pt; margin-bottom: 8pt; border-bottom: 2pt solid #8b5cf6; padding-bottom: 4pt; font-family: Arial, sans-serif;">
        🧩 Entità Chiave &amp; Tecnologie Rilevate
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10pt 0 16pt 0; border: 1pt solid #cbd5e1;">
        <thead>
          <tr style="background-color: #1e293b; color: #ffffff;">
            <th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b; width: 28%;">Entità</th>
            <th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b; width: 18%;">Classificazione</th>
            <th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b;">Descrizione Funzionale</th>
          </tr>
        </thead>
        <tbody>
          ${entityRows}
        </tbody>
      </table>
    `;
  }

  // Relations section
  let relationsHtml = "";
  if (resource.metadata?.relations && resource.metadata.relations.length > 0) {
    const relationRows = resource.metadata.relations.map((r: any, idx: number) => {
      const relType = r.relationType || "relates_to";
      const target = r.targetTitle || r.target || "Entità Connessa";
      const weight = r.weight !== undefined ? r.weight : 0.8;
      const desc = r.description || "Relazione topologica";
      const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      return `
        <tr style="background-color: ${bg};">
          <td style="padding: 7pt 10pt; border: 1pt solid #cbd5e1; font-size: 9pt; font-family: Arial, sans-serif;">
            <span style="background-color: #fef3c7; color: #92400e; padding: 2pt 6pt; border-radius: 3pt; font-weight: bold; text-transform: uppercase;">${escapeHtml(relType)}</span>
          </td>
          <td style="padding: 7pt 10pt; font-weight: bold; color: #0f172a; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${escapeHtml(target)}</td>
          <td style="padding: 7pt 10pt; text-align: center; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif; font-weight: bold; color: #475569;">${weight}</td>
          <td style="padding: 7pt 10pt; color: #334155; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${escapeHtml(desc)}</td>
        </tr>
      `;
    }).join("");

    relationsHtml = `
      <h2 style="font-size: 14pt; color: #0f172a; font-weight: bold; margin-top: 22pt; margin-bottom: 8pt; border-bottom: 2pt solid #f59e0b; padding-bottom: 4pt; font-family: Arial, sans-serif;">
        🔗 Relazioni Topologiche nel Grafo di Conoscenza
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10pt 0 16pt 0; border: 1pt solid #cbd5e1;">
        <thead>
          <tr style="background-color: #1e293b; color: #ffffff;">
            <th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b; width: 18%;">Tipo Relazione</th>
            <th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b; width: 28%;">Nodo Target</th>
            <th style="padding: 8pt 10pt; text-align: center; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b; width: 12%;">Peso</th>
            <th style="padding: 8pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif; border: 1pt solid #1e293b;">Descrizione Architetturale</th>
          </tr>
        </thead>
        <tbody>
          ${relationRows}
        </tbody>
      </table>
    `;
  }

  // Tags pill formatting
  const tagsHtml = (resource.tags && resource.tags.length > 0)
    ? resource.tags.map(t => `<span style="display: inline-block; background-color: #f1f5f9; color: #334155; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; padding: 2pt 6pt; border-radius: 3pt; margin-right: 4pt; margin-bottom: 4pt; border: 1pt solid #e2e8f0;">#${escapeHtml(t)}</span>`).join(" ")
    : '<span style="color: #94a3b8; font-style: italic;">Nessun tag assegnato</span>';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(resource.title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.6; margin: 0; padding: 0; }
    h1 { font-family: Arial, sans-serif; font-size: 22pt; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 6pt; line-height: 1.25; }
    h2 { font-family: Arial, sans-serif; font-size: 14pt; font-weight: 700; color: #0f172a; margin-top: 20pt; margin-bottom: 8pt; border-bottom: 1.5pt solid #cbd5e1; padding-bottom: 4pt; }
    p { margin: 0 0 10pt 0; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; }
    td, th { vertical-align: top; }
  </style>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; line-height: 1.6; padding: 12pt;">

  <!-- Accent Header Bar -->
  <div style="margin-bottom: 14pt;">
    <span style="display: inline-block; background-color: #f1f5f9; color: #475569; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; padding: 3pt 8pt; border-radius: 10pt; border: 1pt solid #cbd5e1; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 6pt;">
      KNOWLEDGE VAULT • SPECIFICA TECNICA OKF v0.2
    </span>
    <h1 style="font-family: Arial, sans-serif; font-size: 22pt; font-weight: 700; color: #0f172a; margin-top: 4pt; margin-bottom: 4pt; line-height: 1.25;">
      ${escapeHtml(resource.title)}
    </h1>
    <p style="font-family: Arial, sans-serif; font-size: 9.5pt; color: #64748b; margin-top: 0; margin-bottom: 14pt;">
      Data di generazione: <strong>${dateStr}</strong> &nbsp;•&nbsp; Cartella Google Drive: <strong>${escapeHtml(targetFolderName)}</strong>
    </p>
  </div>

  <!-- Metadata Overview Card Table -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 16pt; background-color: #f8fafc; border: 1pt solid #cbd5e1;">
    <tr>
      <td style="width: 50%; padding: 10pt 14pt; border-right: 1pt solid #e2e8f0; font-family: Arial, sans-serif; font-size: 9.5pt; vertical-align: top;">
        <p style="margin: 0 0 6pt 0;">
          <strong style="color: #475569;">TIPO RISORSA:</strong><br>
          <span style="display: inline-block; margin-top: 2pt; background-color: ${typeStyle.bg}; color: ${typeStyle.color}; font-weight: bold; font-size: 9pt; padding: 2.5pt 8pt; border-radius: 3pt; text-transform: uppercase;">
            ${escapeHtml(typeStyle.label)}
          </span>
        </p>
        <p style="margin: 8pt 0 6pt 0;">
          <strong style="color: #475569;">DOMINIO ARCHITETTURALE:</strong><br>
          <span style="color: #0f172a; font-weight: bold;">${escapeHtml(domain)}</span>
        </p>
        <p style="margin: 8pt 0 0 0;">
          <strong style="color: #475569;">STATO CONFORMITÀ:</strong><br>
          <span style="display: inline-block; margin-top: 2pt; background-color: ${statusStyle.bg}; color: ${statusStyle.color}; font-weight: bold; font-size: 8.5pt; padding: 2pt 6pt; border-radius: 3pt;">
            ${escapeHtml(statusStyle.label)}
          </span>
        </p>
      </td>
      <td style="width: 50%; padding: 10pt 14pt; font-family: Arial, sans-serif; font-size: 9.5pt; vertical-align: top;">
        <p style="margin: 0 0 6pt 0;">
          <strong style="color: #475569;">INDICE DI QUALITÀ / SCORE:</strong><br>
          <span style="display: inline-block; margin-top: 2pt; background-color: ${scoreBadgeBg}; color: ${scoreBadgeColor}; font-weight: bold; font-size: 10pt; padding: 2.5pt 8pt; border-radius: 3pt;">
            ${scoreVal}/100
          </span>
        </p>
        <p style="margin: 8pt 0 6pt 0;">
          <strong style="color: #475569;">TAG TEMATICI:</strong><br>
          <div style="margin-top: 3pt;">${tagsHtml}</div>
        </p>
        <p style="margin: 8pt 0 0 0;">
          <strong style="color: #475569;">RIFERIMENTO ORIGINE:</strong><br>
          ${resource.url ? `<a href="${escapeHtml(resource.url)}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(resource.url)}</a>` : '<span style="color: #94a3b8; font-style: italic;">Archiviata direttamente nel Vault</span>'}
        </p>
      </td>
    </tr>
  </table>

  <!-- Structured Frontmatter OKF v0.2 Card -->
  <table style="width: 100%; border-collapse: collapse; margin: 16pt 0 20pt 0; border: 1pt solid #cbd5e1;">
    <tr>
      <td style="background-color: #0f172a; color: #f8fafc; font-family: Arial, sans-serif; font-size: 10pt; font-weight: bold; padding: 8pt 12pt; letter-spacing: 0.3pt;">
        📋 SPECIFICA FORMALE FRONTMATTER OKF v0.2 (YAML METADATA)
      </td>
    </tr>
    <tr>
      <td style="background-color: #f8fafc; padding: 10pt 14pt; font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; color: #0f172a; line-height: 1.5; white-space: pre-wrap; word-break: break-all;">${escapeHtml(yamlFrontmatter)}</td>
    </tr>
  </table>

  <!-- Executive Summary Callout Box -->
  <h2 style="font-size: 14pt; color: #0f172a; font-weight: bold; margin-top: 20pt; margin-bottom: 8pt; border-bottom: 2pt solid #2563eb; padding-bottom: 4pt; font-family: Arial, sans-serif;">
    📌 Sommario Esecutivo
  </h2>
  <table style="width: 100%; border-collapse: collapse; margin: 8pt 0 16pt 0; background-color: #eff6ff; border-left: 5pt solid #2563eb; border-top: 1pt solid #dbeafe; border-right: 1pt solid #dbeafe; border-bottom: 1pt solid #dbeafe;">
    <tr>
      <td style="padding: 12pt 16pt; font-size: 11pt; color: #1e293b; font-family: Arial, sans-serif; line-height: 1.65;">
        ${escapeHtml(resource.summary || "Nessun sommario esecutivo disponibile per questa risorsa.")}
      </td>
    </tr>
  </table>

  <!-- Takeaways -->
  ${takeawaysHtml}

  <!-- Entities -->
  ${entitiesHtml}

  <!-- Graph Relations -->
  ${relationsHtml}

  <!-- Full Technical Documentation -->
  <h2 style="font-size: 14pt; color: #0f172a; font-weight: bold; margin-top: 24pt; margin-bottom: 8pt; border-bottom: 2pt solid #64748b; padding-bottom: 4pt; font-family: Arial, sans-serif;">
    📖 Documentazione Tecnica &amp; Note Operative
  </h2>
  <div style="margin-top: 10pt; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b;">
    ${markdownBodyHtml}
  </div>

  <!-- Footer Certification -->
  <hr style="border: none; border-top: 1pt solid #cbd5e1; margin: 30pt 0 12pt 0;">
  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="font-family: Arial, sans-serif; font-size: 9pt; color: #64748b; line-height: 1.5; text-align: center; padding: 6pt;">
        🛡️ <strong>Knowledge Vault</strong> • Certificato secondo lo Standard Tecnico <strong>OKF v0.2</strong> (Open Knowledge Format)<br>
        Documento generato e sincronizzato automaticamente con <strong>Google Drive</strong> • Cartella: <em>${escapeHtml(targetFolderName)}</em>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/**
 * Builds beautifully formatted structured Google Docs content according to OKF v0.2 (plain text fallback)
 */
function buildResourceDocumentText(resource: ResourceItem, targetFolderName: string): string {
  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
  const typeLabel = resource.type.toUpperCase().replace("_", " ");
  const domain = resource.metadata?.domain || "Informatica & AI Architecture";
  const tagsStr = (resource.tags || []).map(t => `#${t}`).join(" ");
  const status = resource.metadata?.status || "stable";
  const score = resource.metadata?.score !== undefined ? `${resource.metadata.score}/100` : "N/D";
  
  let takeawaysSection = "";
  if (resource.metadata?.aiKeyTakeaways && resource.metadata.aiKeyTakeaways.length > 0) {
    takeawaysSection = "\n\nEXECUTIVE TAKEAWAYS & PUNTI CHIAVE:\n" + resource.metadata.aiKeyTakeaways.map(k => `✓  ${k}`).join("\n");
  } else if (resource.metadata?.keyTakeaways && resource.metadata.keyTakeaways.length > 0) {
    takeawaysSection = "\n\nEXECUTIVE TAKEAWAYS & PUNTI CHIAVE:\n" + resource.metadata.keyTakeaways.map(k => `✓  ${k}`).join("\n");
  }

  let entitiesSection = "";
  if (resource.metadata?.entities && resource.metadata.entities.length > 0) {
    entitiesSection = "\n\nENTITÀ CHIAVE & TECNOLOGIE RILEVATE:\n" + resource.metadata.entities.map(e => {
      if (typeof e === "string") return `•  ${e}`;
      return `•  ${e.name} [${e.type}]${e.description ? ` — ${e.description}` : ""}`;
    }).join("\n");
  }

  let relationsSection = "";
  if (resource.metadata?.relations && resource.metadata.relations.length > 0) {
    relationsSection = "\n\nRELAZIONI TOPOLOGICHE NEL GRAFO:\n" + resource.metadata.relations.map(r => {
      return `➜  [${(r.relationType || "relates_to").toUpperCase()}] ➔ ${r.targetTitle || r.target || "Entità"}${r.description ? ` (${r.description})` : ""}`;
    }).join("\n");
  }

  return `${resource.title}

======================================================================
KNOWLEDGE VAULT • TECHNICAL SPECIFICATION (OKF v0.2)
======================================================================
Tipo: ${typeLabel}   |   Dominio: ${domain}   |   Qualità/Score: ${score}
Stato: ${status.toUpperCase()}   |   Generato: ${dateStr}
Tag: ${tagsStr || "Nessun tag"}
URL Risorsa: ${resource.url || "Nessun URL esterno (Archiviata nel Vault)"}
Cartella Drive: ${targetFolderName}
======================================================================

--- FRONTMATTER OKF v0.2 ---
okf_version: "0.2"
title: "${resource.title.replace(/"/g, "'")}"
type: ${resource.type}
domain: "${domain.replace(/"/g, "'")}"
score: ${resource.metadata?.score || 90}
tags: [${(resource.tags || []).map(t => `"${t}"`).join(", ")}]
----------------------------

SOMMARIO ESECUTIVO:
${resource.summary || "Nessun sommario disponibile."}
${takeawaysSection}${entitiesSection}${relationsSection}

DOCUMENTAZIONE COMPLETA & NOTE TECNICHE:
${resource.metadata?.markdownContent || resource.rawInput || "Nessun contenuto markdown aggiuntivo archiviato."}

======================================================================
Certificato da Knowledge Vault • Protocollo OKF v0.2
Cartella Google Drive: ${targetFolderName}
`;
}

/**
 * Uploads an HTML document to Google Drive with automatic conversion to native Google Doc.
 * Preserves full typography, headings, tables, callout cards, badges, and code blocks.
 */
export async function uploadHtmlAsGoogleDoc(
  token: string,
  title: string,
  htmlContent: string,
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const boundary = "===============VaultDocBoundary" + Math.random().toString(36).substring(2) + "==";
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata: Record<string, any> = {
    name: title,
    mimeType: "application/vnd.google-apps.document"
  };

  if (targetFolderId && targetFolderId !== "root") {
    metadata.parents = [targetFolderId];
  }

  const multipartBody = 
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    "\r\n" +
    delimiter +
    "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
    htmlContent +
    closeDelimiter;

  let res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Accept": "application/json"
      },
      body: multipartBody
    }
  );

  if (res.status === 401) {
    clearGoogleAccessToken();
    throw new GoogleAuthExpiredError("Token Google Workspace scaduto o non valido. Effettua nuovamente l'autorizzazione.");
  }

  // If upload failed and targetFolderId was set (e.g. permission restriction on shared folder), try root and patch move
  if (!res.ok && targetFolderId && targetFolderId !== "root") {
    console.warn(`[uploadHtmlAsGoogleDoc] Upload con cartella genitore fallito (${res.status}), riprovo salvataggio in root Drive e spostamento...`);
    const rootMetadata = {
      name: title,
      mimeType: "application/vnd.google-apps.document"
    };

    const rootBody = 
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(rootMetadata) +
      "\r\n" +
      delimiter +
      "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
      htmlContent +
      closeDelimiter;

    res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Accept": "application/json"
        },
        body: rootBody
      }
    );

    if (res.ok) {
      const data = await res.json();
      try {
        await workspaceFetch(
          `https://www.googleapis.com/drive/v3/files/${data.id}?addParents=${targetFolderId}&fields=id,parents`,
          { method: "PATCH" },
          token
        );
      } catch (moveErr) {
        console.warn("[uploadHtmlAsGoogleDoc] Spostamento in cartella destinazione:", moveErr);
      }
      return data;
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Errore creazione Google Doc (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Creates a richly formatted Google Doc in Google Drive for a single Vault resource.
 * Uses native HTML conversion with headers, cards, tables, badges, and clean typography.
 */
export async function exportResourceToGoogleDoc(
  token: string, 
  resource: ResourceItem, 
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  targetFolderName: string = "Knowledge Vault"
): Promise<GoogleDocExportResult> {
  const docTitle = `[Knowledge Vault] ${resource.title}`;

  // PRIMARY PATH: High-definition HTML upload directly converted to native Google Doc
  try {
    const htmlContent = buildResourceDocumentHtml(resource, targetFolderName);
    const uploadRes = await uploadHtmlAsGoogleDoc(token, docTitle, htmlContent, targetFolderId);
    const docId = uploadRes.id;
    const docUrl = uploadRes.webViewLink || `https://docs.google.com/document/d/${docId}/edit`;

    return {
      docId,
      docUrl,
      title: docTitle,
      folderId: targetFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`
    };
  } catch (htmlUploadErr: any) {
    console.warn("[exportResourceToGoogleDoc] Upload HTML fallito, fallback a Docs API standard:", htmlUploadErr);
  }

  // FALLBACK PATH: Standard Docs API create + batchUpdate
  const createRes = await workspaceFetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: docTitle })
  }, token);

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Errore creazione Google Doc (${createRes.status}): ${errText}`);
  }

  const doc = await createRes.json();
  const docId = doc.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  // Insert cleaned structured text
  const bodyText = buildResourceDocumentText(resource, targetFolderName);
  const updateRes = await workspaceFetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: bodyText
          }
        }
      ]
    })
  }, token);

  if (!updateRes.ok) {
    console.warn("[exportResourceToGoogleDoc] BatchUpdate parziale:", await updateRes.text());
  }

  // Move document into knowledge folder
  try {
    const moveRes = await workspaceFetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, 
      { method: "PATCH" }, 
      token
    );

    if (!moveRes.ok) {
      console.warn("[exportResourceToGoogleDoc] Spostamento cartella target fallito, file salvato in root Drive:", await moveRes.text());
    }
  } catch (moveErr) {
    console.warn("[exportResourceToGoogleDoc] Avviso spostamento:", moveErr);
  }

  return {
    docId,
    docUrl,
    title: docTitle,
    folderId: targetFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`
  };
}

/**
 * Batch exports multiple resources as separate Google Docs with progress feedback.
 */
export async function batchExportResourcesToGoogleDocs(
  token: string,
  resources: ResourceItem[],
  targetFolderId: string,
  targetFolderName: string,
  onProgress?: (current: number, total: number, lastResult?: GoogleDocExportResult) => void
): Promise<GoogleDocExportResult[]> {
  const results: GoogleDocExportResult[] = [];

  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    try {
      const res = await exportResourceToGoogleDoc(token, r, targetFolderId, targetFolderName);
      results.push(res);
      if (onProgress) {
        onProgress(i + 1, resources.length, res);
      }
      // Brief pause to respect Google Docs rate limits
      if (i < resources.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    } catch (err: any) {
      console.error(`[batchExport] Errore export risorsa "${r.title}":`, err);
    }
  }

  return results;
}

export interface AgenticDossierData {
  dossierTitle: string;
  executiveSynthesis: string;
  crossResourceInsights: string[];
  topologicalThemes: Array<{ theme: string; description: string; relatedResources?: string[] }>;
  notebookLMRecommendations?: {
    recommendedAudioFocus?: string;
    suggestedPrompts?: string[];
  };
  openEpistemicQuestions?: string[];
}

/**
 * Invokes the Multi-Agent Synthesis Orchestrator to generate an epistemic dossier across resources.
 */
export async function generateAgenticDossierSynthesis(
  resources: ResourceItem[],
  topic?: string,
  targetPlatform: "google_docs" | "notebooklm" = "google_docs"
): Promise<AgenticDossierData | null> {
  try {
    const res = await fetch("/api/vault/agentic-dossier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resources, topic, targetPlatform }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.data : null;
  } catch (err) {
    console.warn("[generateAgenticDossierSynthesis] Errore sintesi:", err);
    return null;
  }
}

/**
 * Builds HTML for a consolidated multi-resource compendium digest
 */
export function buildCompendiumDocumentHtml(
  resources: ResourceItem[],
  compendiumTitle: string,
  targetFolderName: string,
  agenticDossier?: AgenticDossierData | null
): string {
  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
  const fullTitle = `[Compendio Vault] ${compendiumTitle}`;

  // Multi-Agent Synthesis Section
  let agenticHtml = "";
  if (agenticDossier) {
    const insightsList = agenticDossier.crossResourceInsights.map(ins => `<li style="margin-bottom: 6pt;"><strong>• ${escapeHtml(ins)}</strong></li>`).join("");
    const themesRows = agenticDossier.topologicalThemes.map((t, idx) => {
      const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      return `
        <tr style="background-color: ${bg};">
          <td style="padding: 7pt 10pt; font-weight: bold; color: #0f172a; border: 1pt solid #cbd5e1; font-size: 9.5pt; width: 30%; font-family: Arial, sans-serif;">${escapeHtml(t.theme)}</td>
          <td style="padding: 7pt 10pt; color: #334155; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${escapeHtml(t.description)}</td>
        </tr>
      `;
    }).join("");

    const questionsList = (agenticDossier.openEpistemicQuestions || []).map(q => `<li style="margin-bottom: 5pt; font-style: italic;">? ${escapeHtml(q)}</li>`).join("");

    agenticHtml = `
      <div style="margin: 20pt 0 24pt 0;">
        <h2 style="font-size: 15pt; color: #0f172a; font-weight: bold; border-bottom: 2pt solid #2563eb; padding-bottom: 4pt; font-family: Arial, sans-serif;">
          🧠 Sintesi Esecutiva Multi-Agente (Cekikj Synthesis Orchestrator)
        </h2>
        <p style="font-size: 10pt; color: #64748b; margin-bottom: 10pt;">Dossier: <strong>${escapeHtml(agenticDossier.dossierTitle)}</strong></p>

        <!-- Synthesis Box -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 14pt; background-color: #eff6ff; border-left: 5pt solid #2563eb; border-top: 1pt solid #dbeafe; border-right: 1pt solid #dbeafe; border-bottom: 1pt solid #dbeafe;">
          <tr>
            <td style="padding: 12pt 16pt; font-size: 11pt; color: #1e293b; font-family: Arial, sans-serif; line-height: 1.6;">
              <strong style="color: #1e40af; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.5pt; display: block; margin-bottom: 6pt;">SINTESI ANALITICA CROSS-RISORSA</strong>
              ${escapeHtml(agenticDossier.executiveSynthesis)}
            </td>
          </tr>
        </table>

        <!-- Insights -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 14pt; background-color: #f0fdf4; border-left: 5pt solid #10b981; border-top: 1pt solid #dcfce7; border-right: 1pt solid #dcfce7; border-bottom: 1pt solid #dcfce7;">
          <tr>
            <td style="padding: 12pt 16pt; font-size: 10.5pt; color: #064e3b; font-family: Arial, sans-serif; line-height: 1.6;">
              <strong style="color: #166534; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.5pt; display: block; margin-bottom: 6pt;">SINERGIE &amp; INSIGHT STRUTTURALI</strong>
              <ul style="margin: 0; padding-left: 18pt;">${insightsList}</ul>
            </td>
          </tr>
        </table>

        <!-- Themes Table -->
        <h3 style="font-size: 12pt; color: #0f172a; font-weight: bold; margin-top: 16pt; margin-bottom: 6pt; font-family: Arial, sans-serif;">Temi Topologici &amp; Convergenze</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 14pt; border: 1pt solid #cbd5e1;">
          <thead>
            <tr style="background-color: #1e293b; color: #ffffff;">
              <th style="padding: 7pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif;">Tema Architetturale</th>
              <th style="padding: 7pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif;">Descrizione &amp; Implicazioni</th>
            </tr>
          </thead>
          <tbody>${themesRows}</tbody>
        </table>

        ${questionsList ? `
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 14pt; background-color: #fffbeb; border-left: 5pt solid #f59e0b; border-top: 1pt solid #fef3c7; border-right: 1pt solid #fef3c7; border-bottom: 1pt solid #fef3c7;">
            <tr>
              <td style="padding: 10pt 14pt; font-size: 10pt; color: #92400e; font-family: Arial, sans-serif; line-height: 1.5;">
                <strong style="text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.5pt; display: block; margin-bottom: 4pt;">QUESTIONI EPISTEMICHE APERTE</strong>
                <ul style="margin: 0; padding-left: 16pt;">${questionsList}</ul>
              </td>
            </tr>
          </table>
        ` : ''}
      </div>
    `;
  }

  // Table of Contents (Indice Analitico)
  const tocRows = resources.map((r, idx) => {
    const num = idx + 1;
    const typeStyle = TYPE_STYLE_MAP[r.type] || { bg: "#e0e7ff", color: "#3730a3", label: r.type.toUpperCase() };
    const scoreVal = typeof r.metadata?.score === "number" ? `${r.metadata.score}/100` : "N/D";
    const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
    return `
      <tr style="background-color: ${bg};">
        <td style="padding: 7pt 10pt; text-align: center; font-weight: bold; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${num}</td>
        <td style="padding: 7pt 10pt; border: 1pt solid #cbd5e1; font-size: 8.5pt; font-family: Arial, sans-serif;">
          <span style="background-color: ${typeStyle.bg}; color: ${typeStyle.color}; padding: 2pt 6pt; border-radius: 3pt; font-weight: bold; text-transform: uppercase;">${escapeHtml(typeStyle.label)}</span>
        </td>
        <td style="padding: 7pt 10pt; font-weight: bold; color: #0f172a; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${escapeHtml(r.title)}</td>
        <td style="padding: 7pt 10pt; color: #475569; border: 1pt solid #cbd5e1; font-size: 9pt; font-family: Arial, sans-serif;">${escapeHtml(r.metadata?.domain || "Informatica")}</td>
        <td style="padding: 7pt 10pt; text-align: center; font-weight: bold; color: #166534; border: 1pt solid #cbd5e1; font-size: 9.5pt; font-family: Arial, sans-serif;">${scoreVal}</td>
      </tr>
    `;
  }).join("");

  // Resource Detail Sections
  const detailSections = resources.map((r, idx) => {
    const num = idx + 1;
    const typeStyle = TYPE_STYLE_MAP[r.type] || { bg: "#e0e7ff", color: "#3730a3", label: r.type.toUpperCase() };
    const bodyHtml = markdownToGoogleDocHtml(r.metadata?.markdownContent || r.summary || "");
    const takeaways = r.metadata?.aiKeyTakeaways || r.metadata?.keyTakeaways || [];

    return `
      <div style="margin-top: 30pt; page-break-before: always;">
        <hr style="border: none; border-top: 2pt solid #2563eb; margin-bottom: 16pt;">
        <div style="margin-bottom: 12pt;">
          <span style="background-color: #2563eb; color: #ffffff; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; padding: 2pt 8pt; border-radius: 3pt; text-transform: uppercase;">
            SEZIONE ${num}
          </span>
          <span style="background-color: ${typeStyle.bg}; color: ${typeStyle.color}; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; padding: 2pt 8pt; border-radius: 3pt; text-transform: uppercase; margin-left: 6pt;">
            ${escapeHtml(typeStyle.label)}
          </span>
          <h2 style="font-size: 16pt; color: #0f172a; font-weight: bold; margin-top: 8pt; margin-bottom: 4pt; border: none; font-family: Arial, sans-serif;">
            ${num}. ${escapeHtml(r.title)}
          </h2>
          <p style="font-size: 9pt; color: #64748b; margin: 0;">
            Dominio: <strong>${escapeHtml(r.metadata?.domain || "Informatica")}</strong> &nbsp;|&nbsp; 
            Qualità: <strong>${r.metadata?.score || 90}/100</strong>
            ${r.url ? ` &nbsp;|&nbsp; URL: <a href="${escapeHtml(r.url)}" style="color: #2563eb;">${escapeHtml(r.url)}</a>` : ''}
          </p>
        </div>

        <!-- Summary -->
        <table style="width: 100%; border-collapse: collapse; margin: 10pt 0 14pt 0; background-color: #eff6ff; border-left: 4pt solid #2563eb;">
          <tr>
            <td style="padding: 10pt 14pt; font-size: 10.5pt; color: #1e293b; font-family: Arial, sans-serif; line-height: 1.6;">
              <strong style="color: #1e40af; font-size: 8.5pt; text-transform: uppercase; display: block; margin-bottom: 4pt;">SOMMARIO ESECUTIVO</strong>
              ${escapeHtml(r.summary || "Nessun sommario disponibile.")}
            </td>
          </tr>
        </table>

        ${takeaways.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; margin: 10pt 0 14pt 0; background-color: #f0fdf4; border-left: 4pt solid #10b981;">
            <tr>
              <td style="padding: 10pt 14pt; font-size: 10pt; color: #064e3b; font-family: Arial, sans-serif; line-height: 1.5;">
                <strong style="color: #166534; font-size: 8.5pt; text-transform: uppercase; display: block; margin-bottom: 4pt;">PUNTI CHIAVE &amp; TAKEAWAYS</strong>
                <ul style="margin: 0; padding-left: 16pt;">
                  ${takeaways.map((t: string) => `<li style="margin-bottom: 4pt;">✓ ${escapeHtml(t)}</li>`).join("")}
                </ul>
              </td>
            </tr>
          </table>
        ` : ''}

        <div style="font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.6; color: #1e293b; margin-top: 10pt;">
          ${bodyHtml}
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(fullTitle)}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; line-height: 1.6; padding: 12pt;">

  <!-- Cover Header -->
  <div style="margin-bottom: 18pt; border-bottom: 2pt solid #0f172a; padding-bottom: 14pt;">
    <span style="display: inline-block; background-color: #0f172a; color: #f8fafc; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: bold; padding: 3pt 8pt; border-radius: 3pt; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 6pt;">
      KNOWLEDGE VAULT COMPENDIUM DIGEST • PROTOCOLLO OKF v0.2
    </span>
    <h1 style="font-family: Arial, sans-serif; font-size: 22pt; font-weight: 700; color: #0f172a; margin-top: 6pt; margin-bottom: 4pt;">
      ${escapeHtml(compendiumTitle)}
    </h1>
    <p style="font-family: Arial, sans-serif; font-size: 9.5pt; color: #64748b; margin: 0;">
      Data di compilazione: <strong>${dateStr}</strong> &nbsp;•&nbsp; 
      Totale schede consolidate: <strong>${resources.length}</strong> &nbsp;•&nbsp; 
      Cartella Drive: <strong>${escapeHtml(targetFolderName)}</strong>
    </p>
  </div>

  ${agenticHtml}

  <!-- Indice Analitico -->
  <h2 style="font-size: 14pt; color: #0f172a; font-weight: bold; margin-top: 20pt; margin-bottom: 8pt; border-bottom: 1.5pt solid #cbd5e1; padding-bottom: 4pt; font-family: Arial, sans-serif;">
    📑 Indice Analitico delle Risorse
  </h2>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20pt; border: 1pt solid #cbd5e1;">
    <thead>
      <tr style="background-color: #1e293b; color: #ffffff;">
        <th style="padding: 7pt 10pt; text-align: center; font-size: 9pt; font-family: Arial, sans-serif; width: 6%;">#</th>
        <th style="padding: 7pt 10pt; text-align: left; font-size: 9pt; font-family: Arial, sans-serif; width: 16%;">Tipo</th>
        <th style="padding: 7pt 10pt; text-align: left; font-size: 9.5pt; font-family: Arial, sans-serif;">Titolo Risorsa</th>
        <th style="padding: 7pt 10pt; text-align: left; font-size: 9pt; font-family: Arial, sans-serif; width: 22%;">Dominio</th>
        <th style="padding: 7pt 10pt; text-align: center; font-size: 9pt; font-family: Arial, sans-serif; width: 10%;">Score</th>
      </tr>
    </thead>
    <tbody>
      ${tocRows}
    </tbody>
  </table>

  <!-- Sections -->
  ${detailSections}

  <!-- Footer -->
  <hr style="border: none; border-top: 1pt solid #cbd5e1; margin: 30pt 0 12pt 0;">
  <p style="font-family: Arial, sans-serif; font-size: 9pt; color: #64748b; text-align: center;">
    🛡️ Knowledge Vault Compendium • Generato con Google Docs API &amp; Drive Multipart Integration • OKF v0.2
  </p>

</body>
</html>`;
}

/**
 * Exports multiple filtered resources into a single consolidated Google Doc (Compendium Digest).
 */
export async function exportCompendiumToGoogleDoc(
  token: string, 
  resources: ResourceItem[], 
  compendiumTitle: string = "Compendio Tecnico Knowledge Vault",
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  targetFolderName: string = "Knowledge Vault",
  agenticDossier?: AgenticDossierData | null
): Promise<GoogleDocExportResult> {
  const fullTitle = `[Compendio Vault] ${compendiumTitle} (${resources.length} Risorse)`;

  // PRIMARY PATH: High-definition HTML upload
  try {
    const htmlContent = buildCompendiumDocumentHtml(resources, compendiumTitle, targetFolderName, agenticDossier);
    const uploadRes = await uploadHtmlAsGoogleDoc(token, fullTitle, htmlContent, targetFolderId);
    const docId = uploadRes.id;
    const docUrl = uploadRes.webViewLink || `https://docs.google.com/document/d/${docId}/edit`;

    return {
      docId,
      docUrl,
      title: fullTitle,
      folderId: targetFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`
    };
  } catch (htmlUploadErr) {
    console.warn("[exportCompendiumToGoogleDoc] Upload HTML fallito, fallback a Docs API standard:", htmlUploadErr);
  }

  // FALLBACK PATH: Standard Docs API
  const createRes = await workspaceFetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: fullTitle })
  }, token);

  if (!createRes.ok) {
    throw new Error(`Errore creazione Compendio (${createRes.status}): ${await createRes.text()}`);
  }

  const doc = await createRes.json();
  const docId = doc.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });

  let agenticSection = "";
  if (agenticDossier) {
    agenticSection = `
=== SINTESI ESECUTIVA MULTI-AGENTE (CEKIKJ SYNTHESIS ORCHESTRATOR) ===
Titolo Dossier: ${agenticDossier.dossierTitle}

SINTESI ANALITICA CROSS-RISORSA:
${agenticDossier.executiveSynthesis}

SINERGIE & INSIGHT STRUTTURALI:
${agenticDossier.crossResourceInsights.map(ins => `• ${ins}`).join("\n")}

TEMI TOPOLOGICI & ARCHI NEL GRAFO:
${agenticDossier.topologicalThemes.map(t => `► ${t.theme}: ${t.description}`).join("\n")}

QUESTIONI EPISTEMICHE APERTE:
${(agenticDossier.openEpistemicQuestions || []).map(q => `? ${q}`).join("\n")}
======================================================================
\n\n`;
  }

  let toc = "INDICE ANALITICO DELLE RISORSE:\n";
  let contentSections = "";

  resources.forEach((r, idx) => {
    const num = idx + 1;
    toc += `${num}. [${r.type.toUpperCase()}] ${r.title} (Score: ${r.metadata?.score || "N/D"})\n`;

    contentSections += `\n\n======================================================================\n`;
    contentSections += `SEZIONE ${num}: ${r.title.toUpperCase()}\n`;
    contentSections += `Tipo: ${r.type}   |   Dominio: ${r.metadata?.domain || "Informatica"}   |   URL: ${r.url || "N/D"}\n`;
    contentSections += `Tag: ${(r.tags || []).map(t => `#${t}`).join(" ") || "Nessun tag"}\n`;
    contentSections += `----------------------------------------------------------------------\n\n`;
    contentSections += `SOMMARIO ESECUTIVO:\n${r.summary || "Nessun sommario disponibile."}\n\n`;
    
    if (r.metadata?.aiKeyTakeaways && r.metadata.aiKeyTakeaways.length > 0) {
      contentSections += `PUNTI CHIAVE:\n${r.metadata.aiKeyTakeaways.map(k => `✓  ${k}`).join("\n")}\n\n`;
    }

    if (r.metadata?.markdownContent) {
      contentSections += `SPECIFICHE TECNICHE & DOCUMENTAZIONE:\n${r.metadata.markdownContent}\n`;
    }
  });

  const fullText = `${fullTitle}

KNOWLEDGE VAULT COMPENDIUM DIGEST
======================================================================
Data di compilazione: ${dateStr}
Totale Schede Archiviate: ${resources.length}
Standard: OKF v0.2 (Open Knowledge Format)
Cartella Google Drive di Destinazione: ${targetFolderName}
======================================================================
${agenticSection}
${toc}
${contentSections}

======================================================================
Fine del compendio • Knowledge Vault
`;

  await workspaceFetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: fullText } }]
    })
  }, token);

  try {
    await workspaceFetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, 
      { method: "PATCH" }, 
      token
    );
  } catch (e) {
    console.warn("[exportCompendiumToGoogleDoc] Spostamento cartella:", e);
  }

  return {
    docId,
    docUrl,
    title: fullTitle,
    folderId: targetFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`
  };
}

/**
 * Searches for documents likely exported from or related to NotebookLM.
 */
export async function searchNotebookLMDocs(token: string): Promise<DriveFileInfo[]> {
  const keywords = [
    "Briefing Doc",
    "Study Guide",
    "Guida allo studio",
    "FAQ",
    "Panoramica audio",
    "Audio Overview",
    "NotebookLM",
    "Appunti di studio",
    "Dossier"
  ];
  
  const clauses = keywords.map(kw => `name contains '${kw.replace(/'/g, "")}'`).join(" or ");
  const query = `trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain') and (${clauses})`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=25`;

  try {
    const res = await workspaceFetch(url, {}, token);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn("[searchNotebookLMDocs] Query error:", err);
    return [];
  }
}

/**
 * Builds clean HTML optimized as a knowledge source for NotebookLM (Gemini)
 */
export function buildNotebookLMSourceDocHtml(
  resources: ResourceItem[],
  fullTitle: string,
  targetFolderName: string,
  agenticDossier?: AgenticDossierData | null
): string {
  const dateStr = new Date().toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  let agenticHtml = "";
  if (agenticDossier) {
    const insightsList = agenticDossier.crossResourceInsights.map(ins => `<li style="margin-bottom: 5pt;"><strong>• ${escapeHtml(ins)}</strong></li>`).join("");
    const promptsList = (agenticDossier.notebookLMRecommendations?.suggestedPrompts || [])
      .map(p => `<li style="margin-bottom: 4pt;">- "${escapeHtml(p)}"</li>`).join("");

    agenticHtml = `
      <div style="background-color: #eff6ff; border-left: 5pt solid #2563eb; padding: 12pt 16pt; margin: 16pt 0;">
        <h3 style="font-size: 12pt; color: #1e40af; margin-top: 0; margin-bottom: 6pt; font-family: Arial, sans-serif;">
          🧠 SINTESI ESECUTIVA MULTI-AGENTE (CEKIKJ SYNTHESIS ORCHESTRATOR)
        </h3>
        <p style="font-size: 10.5pt; line-height: 1.6; color: #1e293b; margin-bottom: 8pt;">
          ${escapeHtml(agenticDossier.executiveSynthesis)}
        </p>
        <p style="font-size: 9.5pt; font-weight: bold; color: #1e40af; margin-bottom: 4pt; text-transform: uppercase;">
          INSIGHT CROSS-RISORSA &amp; RELAZIONI TOPOLOGICHE:
        </p>
        <ul style="margin: 0; padding-left: 18pt; font-size: 10pt; color: #1e293b;">${insightsList}</ul>

        ${agenticDossier.notebookLMRecommendations?.recommendedAudioFocus ? `
          <div style="margin-top: 10pt; padding-top: 8pt; border-top: 1pt solid #bfdbfe;">
            <p style="font-size: 9.5pt; font-weight: bold; color: #1e40af; margin-bottom: 3pt;">
              GUIDA AUDIO OVERVIEW NOTEBOOKLM:
            </p>
            <p style="font-size: 10pt; color: #1e293b; margin-bottom: 6pt;">
              Focus consigliato: <em>${escapeHtml(agenticDossier.notebookLMRecommendations.recommendedAudioFocus)}</em>
            </p>
            ${promptsList ? `
              <p style="font-size: 9pt; font-weight: bold; color: #1e40af; margin-bottom: 2pt;">Domande suggerite per l'indagine:</p>
              <ul style="margin: 0; padding-left: 18pt; font-size: 9.5pt; color: #1e293b;">${promptsList}</ul>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  const resourceSections = resources.map((r, idx) => {
    const num = idx + 1;
    const bodyHtml = markdownToGoogleDocHtml(r.metadata?.markdownContent || r.summary || "");
    const takeaways = r.metadata?.aiKeyTakeaways || r.metadata?.keyTakeaways || [];

    return `
      <div style="margin-top: 24pt;">
        <h2 style="font-size: 15pt; color: #0f172a; font-weight: bold; border-bottom: 1.5pt solid #cbd5e1; padding-bottom: 4pt; font-family: Arial, sans-serif;">
          [${num}] ${escapeHtml(r.title)}
        </h2>
        <ul style="font-size: 9.5pt; color: #475569; margin: 4pt 0 10pt 16pt;">
          <li><strong>Tipo:</strong> ${escapeHtml(r.type)}</li>
          <li><strong>Dominio:</strong> ${escapeHtml(r.metadata?.domain || "Informatica / AI")}</li>
          ${r.url ? `<li><strong>Riferimento URL:</strong> <a href="${escapeHtml(r.url)}" style="color: #2563eb;">${escapeHtml(r.url)}</a></li>` : ''}
          ${r.tags && r.tags.length > 0 ? `<li><strong>Tag Chiave:</strong> ${r.tags.map(t => `#${escapeHtml(t)}`).join(", ")}</li>` : ''}
        </ul>

        <h3 style="font-size: 12pt; color: #1e293b; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt; font-family: Arial, sans-serif;">Sintesi Esecutiva</h3>
        <p style="font-size: 10.5pt; line-height: 1.6; color: #1e293b; margin-bottom: 10pt;">
          ${escapeHtml(r.summary || "Nessuna sintesi disponibile.")}
        </p>

        ${takeaways.length > 0 ? `
          <h3 style="font-size: 12pt; color: #166534; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt; font-family: Arial, sans-serif;">Takeaways &amp; Punti Salienti</h3>
          <ul style="font-size: 10pt; color: #064e3b; margin: 4pt 0 10pt 16pt;">
            ${takeaways.map((k: string) => `<li style="margin-bottom: 3pt;">✓ ${escapeHtml(k)}</li>`).join("")}
          </ul>
        ` : ''}

        <div style="font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.6; color: #1e293b;">
          ${bodyHtml}
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(fullTitle)}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; line-height: 1.6; padding: 12pt;">

  <h1 style="font-family: Arial, sans-serif; font-size: 20pt; font-weight: bold; color: #0f172a; margin-top: 0; margin-bottom: 6pt;">
    ${escapeHtml(fullTitle)}
  </h1>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 14pt; background-color: #f8fafc; border-left: 4pt solid #64748b;">
    <tr>
      <td style="padding: 10pt 14pt; font-size: 9.5pt; color: #334155; font-family: Arial, sans-serif;">
        <strong>NOTA PER NOTEBOOKLM / GEMINI:</strong><br>
        Questo documento costituisce una fonte di conoscenza strutturata esportata dal Knowledge Vault.<br>
        Formato: <strong>Open Knowledge Format (OKF v0.2)</strong> &nbsp;|&nbsp; 
        Data di compilazione: <strong>${dateStr}</strong> &nbsp;|&nbsp; 
        Totale Risorse: <strong>${resources.length}</strong> &nbsp;|&nbsp; 
        Cartella Drive: <strong>${escapeHtml(targetFolderName)}</strong>
      </td>
    </tr>
  </table>

  ${agenticHtml}

  <hr style="border: none; border-top: 1pt solid #cbd5e1; margin: 16pt 0;">

  ${resourceSections}

</body>
</html>`;
}

/**
 * Exports resources into a high-density, structured Google Doc in the knowledge folder
 * optimized as a clean knowledge source for NotebookLM (Gemini).
 */
export async function exportNotebookLMSourceDoc(
  token: string,
  resources: ResourceItem[],
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  customTitle?: string,
  targetFolderName: string = "Knowledge Vault",
  agenticDossier?: AgenticDossierData | null
): Promise<GoogleDocExportResult & { notebookLMUrl: string }> {
  const dateStr = new Date().toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const fullTitle = customTitle?.trim() 
    ? customTitle.trim() 
    : `NotebookLM Source - Knowledge Vault Dossier (${resources.length} schede) - ${dateStr}`;

  // PRIMARY PATH: High-definition HTML upload
  try {
    const htmlContent = buildNotebookLMSourceDocHtml(resources, fullTitle, targetFolderName, agenticDossier);
    const uploadRes = await uploadHtmlAsGoogleDoc(token, fullTitle, htmlContent, targetFolderId);
    const docId = uploadRes.id;
    const docUrl = uploadRes.webViewLink || `https://docs.google.com/document/d/${docId}/edit`;

    return {
      docId,
      docUrl,
      title: fullTitle,
      folderId: targetFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`,
      notebookLMUrl: "https://notebooklm.google.com"
    };
  } catch (htmlUploadErr) {
    console.warn("[exportNotebookLMSourceDoc] Upload HTML fallito, fallback a Docs API standard:", htmlUploadErr);
  }

  // FALLBACK PATH: Standard Docs API
  const createRes = await workspaceFetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: fullTitle })
  }, token);

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Impossibile creare Google Doc per NotebookLM: ${err}`);
  }

  const createData = await createRes.json();
  const docId = createData.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  let bodyText = `# ${fullTitle}\n\n`;
  bodyText += `> NOTA PER NOTEBOOKLM / GEMINI:\n`;
  bodyText += `> Questo documento costituisce una fonte di conoscenza strutturata esportata dal Knowledge Vault.\n`;
  bodyText += `> Formato: Open Knowledge Format (OKF v0.2).\n`;
  bodyText += `> Data di compilazione: ${dateStr} | Totale Risorse: ${resources.length}\n`;
  bodyText += `> Cartella Drive: ${targetFolderName}\n\n`;

  if (agenticDossier) {
    bodyText += `> 🧠 SINTESI ESECUTIVA MULTI-AGENTE (CEKIKJ SYNTHESIS ORCHESTRATOR):\n`;
    bodyText += `> ${agenticDossier.executiveSynthesis.replace(/\n/g, "\n> ")}\n>\n`;
    bodyText += `> INSIGHT CROSS-RISORSA & RELAZIONI TOPOLOGICHE:\n`;
    agenticDossier.crossResourceInsights.forEach(ins => {
      bodyText += `> • ${ins}\n`;
    });
    bodyText += `>\n`;
    if (agenticDossier.notebookLMRecommendations?.recommendedAudioFocus) {
      bodyText += `> GUIDA AUDIO OVERVIEW NOTEBOOKLM:\n`;
      bodyText += `> Focus consigliato: ${agenticDossier.notebookLMRecommendations.recommendedAudioFocus}\n`;
      if (agenticDossier.notebookLMRecommendations.suggestedPrompts?.length) {
        bodyText += `> Domande suggerite per l'indagine NotebookLM:\n`;
        agenticDossier.notebookLMRecommendations.suggestedPrompts.forEach(p => {
          bodyText += `> - "${p}"\n`;
        });
      }
      bodyText += `>\n`;
    }
  }

  bodyText += `---\n\n`;

  resources.forEach((r, idx) => {
    bodyText += `## [${idx + 1}] ${r.title}\n`;
    bodyText += `- **Tipo:** ${r.type}\n`;
    bodyText += `- **Dominio:** ${r.metadata?.domain || "Informatica / AI"}\n`;
    if (r.url) bodyText += `- **Riferimento URL:** ${r.url}\n`;
    if (r.tags && r.tags.length > 0) bodyText += `- **Tag Chiave:** ${r.tags.map(t => `#${t}`).join(", ")}\n`;
    bodyText += `\n### Sintesi Esecutiva\n${r.summary || "Nessuna sintesi disponibile."}\n\n`;

    if (r.metadata?.aiKeyTakeaways && r.metadata.aiKeyTakeaways.length > 0) {
      bodyText += `### Takeaways & Punti Salienti\n`;
      r.metadata.aiKeyTakeaways.forEach(k => {
        bodyText += `- ${k}\n`;
      });
      bodyText += `\n`;
    }

    if (r.metadata?.markdownContent) {
      bodyText += `### Approfondimento Tecnico & Documentazione\n${r.metadata.markdownContent}\n\n`;
    }

    if (r.metadata?.entities && r.metadata.entities.length > 0) {
      bodyText += `### Entità e Concetti Chiave\n`;
      r.metadata.entities.forEach((ent: any) => {
        bodyText += `- **${ent.name}** (${ent.type}): ${ent.description || ""}\n`;
      });
      bodyText += `\n`;
    }

    bodyText += `---\n\n`;
  });

  await workspaceFetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: bodyText } }]
    })
  }, token);

  try {
    await workspaceFetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, 
      { method: "PATCH" }, 
      token
    );
  } catch (e) {
    console.warn("[exportNotebookLMSourceDoc] Spostamento cartella:", e);
  }

  return {
    docId,
    docUrl,
    title: fullTitle,
    folderId: targetFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`,
    notebookLMUrl: "https://notebooklm.google.com"
  };
}
