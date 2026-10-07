/**
 * UTF-8 Encoding & Mojibake Lint Scanner
 * 
 * Scans source code and documentation for broken characters, corrupted encodings,
 * or mojibake patterns (e.g. Ã, Â, â€, Ă, \uFFFD).
 */

import fs from "fs";
import path from "path";

const DIRECTORIES_TO_SCAN = ["src", "server", "docs"];
const EXTENSIONS_TO_SCAN = [".ts", ".tsx", ".js", ".json", ".md"];

// Mojibake patterns commonly caused by double-encoding Latin-1 / UTF-8
const MOJIBAKE_PATTERNS = [
  /Ã[¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/, // e.g. Ã¨, Ã©, Ã , etc.
  /Â[§°±²³´µ¶·¸¹º»¼½¾¿]/,
  /â€[™œž]/,
  /\uFFFD/, // Unicode replacement character 
  /menĂą/,
  /entitĂ/,
  /leggibilitĂ/,
];

export interface MojibakeFinding {
  file: string;
  line: number;
  snippet: string;
}

export function scanFileForMojibake(filePath: string): MojibakeFinding[] {
  // Ignore self-references in this script and documentation describing the pattern
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const findings: MojibakeFinding[] = [];

  // Exclude files that intentionally document mojibake regexes
  const fileName = path.basename(filePath);
  if (fileName === "lintUtf8Encoding.ts" || fileName.includes("SPEC_RESOURCE_PIPELINES_TAXONOMY")) {
    return [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          file: filePath,
          line: i + 1,
          snippet: line.trim(),
        });
        break;
      }
    }
  }

  return findings;
}

export function scanDirectoryRecursive(dirPath: string): MojibakeFinding[] {
  let allFindings: MojibakeFinding[] = [];
  if (!fs.existsSync(dirPath)) return allFindings;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== ".git") {
        allFindings = allFindings.concat(scanDirectoryRecursive(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS_TO_SCAN.includes(ext)) {
        allFindings = allFindings.concat(scanFileForMojibake(fullPath));
      }
    }
  }

  return allFindings;
}

export function runMojibakeLint(): boolean {
  let totalFindings: MojibakeFinding[] = [];

  for (const dir of DIRECTORIES_TO_SCAN) {
    totalFindings = totalFindings.concat(scanDirectoryRecursive(dir));
  }

  if (totalFindings.length > 0) {
    console.error(`\x1b[31m[MOJIBAKE LINT ERROR] Trovate ${totalFindings.length} anomalie di codifica UTF-8:\x1b[0m`);
    for (const f of totalFindings) {
      console.error(`  - ${f.file}:${f.line} -> "${f.snippet}"`);
    }
    return false;
  }

  console.log("\x1b[32m[MOJIBAKE LINT OK] Nessun carattere corrotto o mojibake rilevato in src/, server/, docs/.\x1b[0m");
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("lintUtf8Encoding.ts")) {
  const success = runMojibakeLint();
  process.exit(success ? 0 : 1);
}
