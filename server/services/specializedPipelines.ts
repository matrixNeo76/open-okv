import { Type } from "@google/genai";
import {
  generateWithGeminiFallback,
  generateMultimodalWithGeminiFallback,
  transcribeAudioWithGemini,
} from "../gemini/client";
import { executePreFlightCheck, PreFlightCheckResult } from "./deterministicGates";
import { executeCekikjIngestionGate, CekikjGateResult } from "./cekikjIngestionGate";
import { extractTextFromPdfBuffer } from "./pdfExtractor";
import { ResourceItem } from "../../src/types";

export interface SpecializedIngestionOptions {
  preferredModel?: string;
  existingResources?: ResourceItem[];
  explicitType?: string;
  notes?: string;
  filename?: string;
  url?: string;
}

export interface SpecializedPipelineResult {
  success: boolean;
  pipeline: "academic_paper" | "github_repo" | "mcp_server" | "ai_skill" | "article_web" | "spec_note" | "audio_voice";
  preFlight: PreFlightCheckResult;
  cekikjGate: CekikjGateResult;
  resource: any;
  error?: string;
}

/**
 * 1. Specialized Pipeline: Academic Papers & Research Documents (PDF / ArXiv / DOI)
 * Native multimodal parsing preserving 2-column layout, LaTeX ($$...$$), author metadata, and benchmarks.
 */
export async function processAcademicPaperPipeline(
  buffer: Buffer,
  preFlight: PreFlightCheckResult,
  options: SpecializedIngestionOptions
): Promise<SpecializedPipelineResult> {
  const existingResources = options.existingResources || [];
  const base64Data = buffer.toString("base64");

  // Attempt preliminary local text extraction for grounding verification
  let rawExtractedText = "";
  try {
    rawExtractedText = await extractTextFromPdfBuffer(buffer);
  } catch {
    rawExtractedText = preFlight.extractedMetadata.title || "";
  }

  const prompt = `You are a World-Class Principal AI Research Scientist and Ontologist.
You are performing SOTA Multimodal Ingestion of an Academic Scientific Research Paper into the Knowledge Vault conforming to Open Knowledge Format (OKF v0.2).

MANDATORY SOTA RULES FOR ACADEMIC PAPERS:
1. 'title': Exact academic paper title. Do not invent.
2. 'authors': Array of authors or primary research lab/institution.
3. 'venue': Conference or Journal (e.g. "NeurIPS 2025", "ICML", "arXiv preprint", or "[NON SPECIFICATO NEL DOCUMENTO]").
4. 'doi': DOI string (e.g. "10.xxxx/yyyy") or ArXiv ID if present, else null.
5. 'abstract': Accurate, verbatim or high-fidelity executive abstract.
6. 'methodologySummary': Technical description of the mathematical model, neural architecture, algorithm, or theorem.
7. 'benchmarks': List of exact quantitative results, metrics, and comparisons against baselines (e.g. "MMLU: 89.2% (+3.4% over baseline)").
8. 'latexEquations': Extract the top 2-5 central mathematical equations or formulations formatted in strict LaTeX blocks ($$ ... $$).
9. 'tags': 4 to 8 relevant technical tags (e.g. "deep-learning", "transformers", "arxiv", "reasoning", "benchmarks").
10. 'domain': E.g. "Artificial Intelligence & LLMs", "Quantum Computing", "Systems Architecture", "Applied Mathematics".
11. 'docType': "specification"
12. 'entities': 4 to 8 canonical entities { name, type, description } (e.g. Model names, Datasets, Architectures).
13. 'relations': Weighted relations to existing vault items if semantically relevant { targetTitle, relationType, weight, description }.
14. 'markdownContent': An exhaustive OKF v0.2 Markdown document (starting with YAML frontmatter) with sections:
    - Abstract & Motivazione
    - Architettura & Formulazione Matematica (con formule $$ ... $$)
    - Risultati Sperimentali & Benchmark SOTA
    - Conclusioni & Implicazioni per il Vault

Contextual Resources in Vault for topological linking:
${JSON.stringify(existingResources.slice(0, 20).map((r) => ({ id: r.id, title: r.title, domain: r.metadata?.domain })), null, 2)}

Return pure JSON matching the schema strictly.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      authors: { type: Type.ARRAY, items: { type: Type.STRING } },
      venue: { type: Type.STRING },
      doi: { type: Type.STRING },
      abstract: { type: Type.STRING },
      summary: { type: Type.STRING },
      methodologySummary: { type: Type.STRING },
      benchmarks: { type: Type.ARRAY, items: { type: Type.STRING } },
      latexEquations: { type: Type.ARRAY, items: { type: Type.STRING } },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      domain: { type: Type.STRING },
      docType: { type: Type.STRING },
      entities: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            type: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["name", "type"],
        },
      },
      relations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            targetId: { type: Type.STRING },
            targetTitle: { type: Type.STRING },
            relationType: { type: Type.STRING },
            weight: { type: Type.NUMBER },
            description: { type: Type.STRING },
          },
          required: ["targetTitle", "relationType"],
        },
      },
      markdownContent: { type: Type.STRING },
    },
    required: ["title", "abstract", "summary", "tags", "markdownContent", "entities"],
  };

  let parsed: any = null;
  try {
    // Direct Multimodal input with application/pdf
    const multimodalContents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Data,
        },
      },
    ];

    const generated = await generateMultimodalWithGeminiFallback(
      multimodalContents,
      schema,
      45000,
      "/api/specialized-ingest/paper",
      options.preferredModel || "gemini-3.8-flash"
    );

    if (generated?.text) {
      parsed = JSON.parse(generated.text);
    }
  } catch (err: any) {
    console.warn("[AcademicPaperPipeline] Multimodal generation warning:", err?.message);
  }

  // Fallback to text generation if multimodal fails or returns empty
  if (!parsed && rawExtractedText.length > 50) {
    try {
      const generated = await generateWithGeminiFallback(
        `${prompt}\n\nExtracted raw text sample:\n"""\n${rawExtractedText.slice(0, 30000)}\n"""`,
        schema,
        {
          timeoutMs: 30000,
          preferredModel: options.preferredModel,
          thinkingBudget: 1024,
        }
      );
      if (generated?.text) parsed = JSON.parse(generated.text);
    } catch (e: any) {
      console.warn("[AcademicPaperPipeline] Text fallback failed:", e?.message);
    }
  }

  // If still no parsed output, construct minimal zero-guessing draft
  if (!parsed || !parsed.title) {
    const fallbackTitle = preFlight.extractedMetadata.title || options.filename?.replace(/\.[^/.]+$/, "") || "Paper Scientifico";
    parsed = {
      title: fallbackTitle,
      summary: rawExtractedText.slice(0, 300) || "Bozza non elaborata di paper scientifico.",
      tags: ["paper", "academic", "pdf", "okf-v0.2"],
      domain: "Academic Research",
      docType: "specification",
      entities: [{ name: fallbackTitle, type: "concept", description: "Documento accademico" }],
      relations: [],
      markdownContent: `# ${fallbackTitle}\n\n> Documento importato nel Vault in modalità bozza.\n\n${rawExtractedText.slice(0, 2000)}`,
    };
  }

  // Execute Cekikj Epistemic Gate
  const cekikjGate = executeCekikjIngestionGate(
    {
      type: "knowledge",
      title: parsed.title,
      summary: parsed.summary || parsed.abstract,
      tags: parsed.tags || ["paper", "academic"],
      metadata: {
        okfVersion: "0.2",
        domain: parsed.domain || "Academic Research",
        docType: "specification",
        venue: parsed.venue,
        doi: parsed.doi || preFlight.extractedMetadata.doi,
        authors: parsed.authors || (preFlight.extractedMetadata.author ? [preFlight.extractedMetadata.author] : []),
        benchmarks: parsed.benchmarks || [],
        latexEquations: parsed.latexEquations || [],
        entities: parsed.entities || [],
        relations: parsed.relations || [],
        markdownContent: parsed.markdownContent,
        sha256: preFlight.sha256,
        pipeline: "academic_paper",
      },
    },
    rawExtractedText || parsed.markdownContent,
    existingResources,
    { pipelineType: "academic_paper", minGroundingScore: 0.7 }
  );

  return {
    success: true,
    pipeline: "academic_paper",
    preFlight,
    cekikjGate,
    resource: cekikjGate.sanitizedResource,
  };
}
