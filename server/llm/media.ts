// Immagini e PDF in ingresso: riconoscimento del formato e stima PRUDENTE dei token, per il controllo della spesa.
// Le stime servono solo a fissare il costo massimo prima della chiamata; il costo vero si legge da usage.cost.
export type MediaKind = "image" | "pdf";
export interface MediaPart {
  kind: MediaKind;
  mimeType: string;
  base64: string;
  filename?: string;
  /** Pagine del PDF, se gia' note (conteggio esatto). Se manca si usa la stima prudente. */
  pages?: number;
}

/** Formati immagine ammessi da OpenRouter (documentazione ufficiale, "Image Inputs"). */
export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const PDF_MIME = "application/pdf";

/** Token massimi stimati per una pagina PDF (testo + immagine della pagina) e per una singola immagine. */
export const PDF_TOKENS_PER_PAGE = 3000;
export const IMAGE_TOKENS_CAP = 20000;

export function normalizeMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  return m === "image/jpg" ? "image/jpeg" : m;
}

/** Larghezza e altezza dai primi byte di PNG, JPEG, GIF e WebP. null se non riconosciuto. */
export function imageDimensions(b: Buffer): { w: number; h: number } | null {
  try {
    if (b.length >= 24 && b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.length >= 10 && b.subarray(0, 3).toString("latin1") === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.length >= 30 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") {
      const t = b.subarray(12, 16).toString("latin1");
      if (t === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (t === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (t === "VP8L") {
        const v = b.readUInt32LE(21);
        return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
      }
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {
    /* file troncato o non valido */
  }
  return null;
}

/** Token stimati per ECCESSO: un token ogni 512 pixel (+100), al massimo IMAGE_TOKENS_CAP; senza dimensioni, un token ogni 2 byte. */
export function estimateImageTokens(b: Buffer): number {
  const d = imageDimensions(b);
  const t = d && d.w > 0 && d.h > 0 ? Math.ceil((d.w * d.h) / 512) + 100 : Math.ceil(b.length / 2) + 100;
  return Math.min(t, IMAGE_TOKENS_CAP);
}

/** Pagine di un PDF: oggetti /Type /Page, oppure il valore piu' alto di /Count; se nulla, una pagina ogni 30 KB. Sempre per eccesso. */
export function countPdfPages(b: Buffer): number {
  const s = b.toString("latin1");
  const objs = (s.match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
  let count = 0;
  for (const m of s.matchAll(/\/Count\s+(\d+)/g)) count = Math.max(count, Number(m[1]));
  return Math.max(objs, count, Math.ceil(b.length / 30000), 1);
}

/** Conteggio ESATTO delle pagine con pdf-parse (gia' usato dall'app). Se il file e' illeggibile o ci mette troppo: stima prudente. */
export async function pdfPageCount(b: Buffer): Promise<number> {
  try {
    const m: any = await import("pdf-parse");
    const parser = new m.PDFParse({ data: b, verbosity: 0 });
    try {
      const info: any = await Promise.race([parser.getInfo(), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 10000))]);
      if (Number.isInteger(info?.total) && info.total > 0) return info.total;
    } finally {
      try {
        await parser.destroy();
      } catch {
        /* gia' chiuso */
      }
    }
  } catch {
    /* PDF cifrato, rovinato o libreria non disponibile */
  }
  return countPdfPages(b);
}

export interface MediaEstimate {
  tokens: number;
  bytes: number;
  images: number;
  pdfPages: number;
}

export function estimateMedia(media: MediaPart[]): MediaEstimate {
  const e: MediaEstimate = { tokens: 0, bytes: 0, images: 0, pdfPages: 0 };
  for (const m of media) {
    const buf = Buffer.from(m.base64, "base64");
    e.bytes += buf.length;
    if (m.kind === "image") {
      e.images++;
      e.tokens += estimateImageTokens(buf);
    } else {
      const pages = m.pages ?? countPdfPages(buf);
      e.pdfPages += pages;
      e.tokens += pages * PDF_TOKENS_PER_PAGE;
    }
  }
  return e;
}
