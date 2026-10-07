// Converte uno schema nel formato di Gemini (@google/genai: type "OBJECT", "STRING", nullable...) in JSON Schema standard.
const TYPES: Record<string, string> = { STRING: "string", NUMBER: "number", INTEGER: "integer", BOOLEAN: "boolean", ARRAY: "array", OBJECT: "object", NULL: "null" };
const COPY = ["description", "enum", "format", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern", "title", "default"];

export function geminiSchemaToJsonSchema(s: any): any {
  if (s === null || typeof s !== "object") return {};
  if (Array.isArray(s)) return s.map(geminiSchemaToJsonSchema);
  const out: any = {};
  let type: string | undefined;
  if (typeof s.type === "string") type = TYPES[s.type.toUpperCase()] ?? s.type.toLowerCase();
  if (type) out.type = s.nullable ? [type, "null"] : type;
  for (const k of COPY) if (s[k] !== undefined) out[k] = s[k];
  if (s.properties && typeof s.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, geminiSchemaToJsonSchema(v)]));
  }
  if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  if (s.items) out.items = geminiSchemaToJsonSchema(s.items);
  if (Array.isArray(s.anyOf)) out.anyOf = s.anyOf.map(geminiSchemaToJsonSchema);
  return out;
}

/** Campi richiesti al primo livello: servono a scartare risposte incomplete. */
export function topLevelRequired(jsonSchema: any): string[] {
  return Array.isArray(jsonSchema?.required) ? jsonSchema.required.filter((x: unknown) => typeof x === "string") : [];
}
