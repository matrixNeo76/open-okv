/**
 * Modular MCP & Environment Secret Scrubber
 * 
 * Protects against accidental leakage of sensitive credentials, API keys,
 * and environment secrets in MCP configurations and capture payloads.
 * 
 * Three lines of defense:
 * 1. Key-based scrubbing (matches sensitive variable names)
 * 2. Entropy-based scrubbing (Shannon entropy > 4.5 AND length >= 24)
 * 3. Allowlist of safe, known configuration values
 */

export const SENSITIVE_KEY_REGEX = /(secret|token|key|pass|credential|auth|bearer|private|cert|jwt|signature|webhook)/i;

export const SAFE_VALUES_ALLOWLIST = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "development",
  "production",
  "test",
  "staging",
  "true",
  "false",
  "null",
  "undefined",
  "0",
  "1",
  "utf-8",
  "utf8",
  "http",
  "https",
  "none",
  "info",
  "warn",
  "error",
  "debug",
]);

export const REDACTED_PLACEHOLDER = "[REDACTED_SECRET]";

/**
 * Calculates the Shannon Entropy of a string in bits per character.
 * High entropy (> 4.5) on strings >= 24 chars usually indicates cryptographically
 * random tokens, private keys, or hashes.
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const frequencies: Record<string, number> = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  const length = str.length;
  let entropy = 0;

  for (const char in frequencies) {
    const p = frequencies[char] / length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Checks whether a given key and value should be redacted.
 */
export function shouldRedactValue(key: string, value: string): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  const trimmedValue = value.trim();
  const lowerValue = trimmedValue.toLowerCase();

  // If in safe allowlist, never redact
  if (SAFE_VALUES_ALLOWLIST.has(lowerValue)) {
    return false;
  }

  // 1. Key-based check
  if (SENSITIVE_KEY_REGEX.test(key)) {
    return true;
  }

  // Common sensitive value prefixes (e.g. sk-..., ghp_..., gho_..., Bearer ..., eyJ...)
  if (/^(sk-[a-zA-Z0-9_-]{10,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{20,}|Bearer\s+[^\s]{10,})/i.test(trimmedValue)) {
    return true;
  }

  // 2. Entropy-based check with dual condition: entropy > 4.5 AND length >= 24
  if (trimmedValue.length >= 24) {
    const entropy = calculateShannonEntropy(trimmedValue);
    if (entropy > 4.5) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively scrubs objects, arrays, and environment dictionaries,
 * replacing sensitive secrets with REDACTED_PLACEHOLDER.
 */
export function scrubMcpConfig<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // If standalone string looks like a secret bearer/key
    if (shouldRedactValue("env", data)) {
      return REDACTED_PLACEHOLDER as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => scrubMcpConfig(item)) as unknown as T;
  }

  if (typeof data === "object") {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      if (typeof val === "string") {
        if (shouldRedactValue(key, val)) {
          cleaned[key] = REDACTED_PLACEHOLDER;
        } else {
          cleaned[key] = val;
        }
      } else if (typeof val === "object" && val !== null) {
        cleaned[key] = scrubMcpConfig(val);
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned as T;
  }

  return data;
}
