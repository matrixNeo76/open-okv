// Helper to safely parse PDF buffer without crashing or emitting false errors
export async function extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  try {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 10) return "";
    
    // Validate standard %PDF- magic signature (0x25, 0x50, 0x44, 0x46)
    const magic = pdfBuffer.subarray(0, 5).toString("latin1");
    if (!magic.startsWith("%PDF")) {
      return "";
    }

    const pdfModule = await import("pdf-parse");
    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: pdfBuffer, verbosity: 0 });
      const res = await parser.getText();
      try { await parser.destroy(); } catch {}
      if (typeof res === "string") return res;
      if (res && typeof (res as any).text === "string") return (res as any).text;
      return "";
    } else if (typeof (pdfModule as any).default === "function") {
      const parsed = await (pdfModule as any).default(pdfBuffer);
      return parsed?.text || "";
    }
  } catch {
    // Non-fatal: if PDF binary is encrypted or non-standard, fallback to Gemini inline multimodal or raw text
  }
  return "";
}
