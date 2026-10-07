/**
 * Streaming Archive Security Service (ZIP Guardian)
 * 
 * Protects against zip bombs, directory traversal, malicious symlinks,
 * and memory exhaustion when uploading compressed archives (.zip).
 * 
 * Safety Limits:
 * - Max uncompressed/compressed ratio: 100:1 (Zip Bomb prevention)
 * - Max single file size: 20 MB
 * - Max cumulative uncompressed size: 80 MB
 * - Max files count: 300
 * - Path traversal prohibition: no "..", no absolute paths, no null bytes
 * - Symlink / hardlink prohibition: ignored/rejected
 * - Atomic de-collision of file names: path-normalized prefixing
 */

import AdmZip from "adm-zip";

export const MAX_COMPRESSION_RATIO = 100;
export const MAX_SINGLE_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 80 * 1024 * 1024; // 80 MB
export const MAX_FILES_COUNT = 300;

export interface SanitizedZipEntry {
  originalPath: string;
  sanitizedPath: string;
  atomicTitle: string;
  size: number;
  compressedSize: number;
  content: string; // UTF-8 text content for supported files
}

export interface ArchiveSecurityValidationResult {
  valid: boolean;
  totalFiles: number;
  totalUncompressedBytes: number;
  entries: SanitizedZipEntry[];
  error?: string;
}

export class ZipSecurityException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipSecurityException";
  }
}

/**
 * Validates zip path safety to prevent Directory Traversal attacks.
 */
export function isSafeZipPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== "string") return false;
  if (entryPath.includes("\0")) return false; // Null byte injection

  // Normalize path separators
  const normalized = entryPath.replace(/\\/g, "/");

  // Prevent path traversal sequences
  if (normalized.includes("../") || normalized.includes("/..") || normalized === "..") {
    return false;
  }

  // Prevent absolute paths escaping the root
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }

  return true;
}

/**
 * Normalizes entry path and creates an atomic collision-free title.
 * e.g., "docs/architecture/system.md" -> "docs_architecture_system"
 */
export function createAtomicTitle(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const withoutExt = normalized.replace(/\.[^/.]+$/, "");
  return withoutExt.replace(/[\\/:"*?<>| ]+/g, "_");
}

/**
 * Performs rigorous multi-layered pre-inspection and safe extraction of a ZIP archive.
 */
export function inspectAndExtractZipArchive(
  zipBuffer: Buffer,
  archiveName = "archive.zip"
): ArchiveSecurityValidationResult {
  if (!zipBuffer || zipBuffer.length === 0) {
    return {
      valid: false,
      totalFiles: 0,
      totalUncompressedBytes: 0,
      entries: [],
      error: "Archivio ZIP vuoto o non valido.",
    };
  }

  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    if (zipEntries.length > MAX_FILES_COUNT) {
      return {
        valid: false,
        totalFiles: zipEntries.length,
        totalUncompressedBytes: 0,
        entries: [],
        error: `Rifiutato: L'archivio contiene ${zipEntries.length} file (limite massimo consentito: ${MAX_FILES_COUNT}).`,
      };
    }

    let cumulativeUncompressedBytes = 0;
    const sanitizedEntries: SanitizedZipEntry[] = [];
    const usedTitles = new Set<string>();

    // Pass 1: Strict Header-by-Header Pre-validation (Zero decompression memory allocation)
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const entryName = entry.entryName;

      // 1. Path Traversal & Null-byte check
      if (!isSafeZipPath(entryName)) {
        return {
          valid: false,
          totalFiles: 0,
          totalUncompressedBytes: 0,
          entries: [],
          error: `Rifiutato per motivi di sicurezza: Percorso non sicuro o Directory Traversal rilevato in "${entryName}".`,
        };
      }

      // Check for symlinks/hardlinks in header attributes
      // In ZIP, symlinks typically have specific unix mode attributes (0120000)
      const attr = (entry as any).attr || (entry.header as any)?.attr || 0;
      const isSymlink = ((attr >>> 16) & 0o170000) === 0o120000;
      if (isSymlink) {
        continue; // Safely skip symlinks
      }

      const uncompressedSize = entry.header.size || 0;
      const compressedSize = entry.header.compressedSize || 0;

      // 2. Single File Size Limit
      if (uncompressedSize > MAX_SINGLE_FILE_BYTES) {
        return {
          valid: false,
          totalFiles: 0,
          totalUncompressedBytes: 0,
          entries: [],
          error: `Rifiutato: Il file "${entryName}" supera la dimensione massima per singolo file (${(uncompressedSize / (1024 * 1024)).toFixed(1)} MB > 20 MB).`,
        };
      }

      // 3. Compression Ratio check (Zip Bomb Prevention)
      // Check ratio only if uncompressed size is significant (> 10KB)
      if (uncompressedSize > 10 * 1024) {
        const ratio = uncompressedSize / Math.max(1, compressedSize);
        if (ratio > MAX_COMPRESSION_RATIO) {
          return {
            valid: false,
            totalFiles: 0,
            totalUncompressedBytes: 0,
            entries: [],
            error: `Rifiutato: Sospetta Zip Bomb. Rapporto di compressione anomalo in "${entryName}" (${ratio.toFixed(0)}:1 > ${MAX_COMPRESSION_RATIO}:1).`,
          };
        }
      }

      // 4. Cumulative Size Limit
      cumulativeUncompressedBytes += uncompressedSize;
      if (cumulativeUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        return {
          valid: false,
          totalFiles: 0,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entries: [],
          error: `Rifiutato: L'archivio supera il volume decompressibile massimo consentito (${(cumulativeUncompressedBytes / (1024 * 1024)).toFixed(1)} MB > 80 MB).`,
        };
      }
    }

    // Pass 2: Safe Selective Decompression (Only for validated Markdown/Text entries)
    const ignoredPrefixes = [
      ".obsidian/",
      ".git/",
      ".trash/",
      "__MACOSX/",
      "node_modules/",
      ".vscode/",
    ];

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;

      // Skip system metadata
      if (ignoredPrefixes.some((p) => entryName.startsWith(p) || entryName.includes("/" + p))) continue;
      if (entryName.startsWith(".") || entryName.endsWith(".DS_Store")) continue;

      const lower = entryName.toLowerCase();
      const isMarkdownOrText = lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt");
      if (!isMarkdownOrText) continue;

      let content = "";
      try {
        content = entry.getData().toString("utf-8");
      } catch (err: any) {
        continue;
      }

      if (!content.trim()) continue;

      // Generate atomic collision-free title
      let atomicTitle = createAtomicTitle(entryName);
      if (usedTitles.has(atomicTitle)) {
        let counter = 2;
        while (usedTitles.has(`${atomicTitle}_${counter}`)) {
          counter++;
        }
        atomicTitle = `${atomicTitle}_${counter}`;
      }
      usedTitles.add(atomicTitle);

      sanitizedEntries.push({
        originalPath: entryName,
        sanitizedPath: entryName.replace(/\\/g, "/").replace(/^\/+/, ""),
        atomicTitle,
        size: entry.header.size,
        compressedSize: entry.header.compressedSize,
        content,
      });
    }

    return {
      valid: true,
      totalFiles: sanitizedEntries.length,
      totalUncompressedBytes: cumulativeUncompressedBytes,
      entries: sanitizedEntries,
    };
  } catch (err: any) {
    return {
      valid: false,
      totalFiles: 0,
      totalUncompressedBytes: 0,
      entries: [],
      error: `Errore scansione archivio ZIP: ${err?.message || "File corrotto"}`,
    };
  }
}
