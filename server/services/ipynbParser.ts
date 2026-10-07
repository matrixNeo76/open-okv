/**
 * Jupyter Notebook (.ipynb) Pre-Parsing and Sanitization Engine
 * 
 * Extracts markdown narrative, formulas, and Python code blocks from JSON nbformat.
 * Strips heavy binary artifacts (base64 plots, huge stdout dumps) to maintain
 * clean, reproducible OKF v0.2 technical guides.
 */

export interface ParsedJupyterNotebook {
  title: string;
  markdownContent: string;
  codeBlocksCount: number;
  markdownCellsCount: number;
  kernelName?: string;
  language?: string;
}

export function parseJupyterNotebookBuffer(buffer: Buffer, fallbackFileName = "notebook.ipynb"): ParsedJupyterNotebook {
  let jsonString = "";
  try {
    jsonString = buffer.toString("utf-8");
  } catch {
    jsonString = "";
  }

  return parseJupyterNotebookString(jsonString, fallbackFileName);
}

export function parseJupyterNotebookString(jsonString: string, fallbackFileName = "notebook.ipynb"): ParsedJupyterNotebook {
  let title = fallbackFileName.replace(/\.ipynb$/i, "").replace(/[-_]+/g, " ");
  // Capitalize title
  title = title.charAt(0).toUpperCase() + title.slice(1);

  if (!jsonString || !jsonString.trim()) {
    return {
      title,
      markdownContent: `# ${title}\n\n> Notebook vuoto o non decodificabile.`,
      codeBlocksCount: 0,
      markdownCellsCount: 0,
    };
  }

  try {
    const nb = JSON.parse(jsonString);
    const cells = Array.isArray(nb.cells) ? nb.cells : [];
    const metadata = nb.metadata || {};
    const kernelName = metadata.kernelspec?.display_name || metadata.kernelspec?.name || "Python 3";
    const language = metadata.language_info?.name || "python";

    let firstHeadingFound = false;
    let codeBlocksCount = 0;
    let markdownCellsCount = 0;

    const sections: string[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellType = cell.cell_type;
      const rawSource = Array.isArray(cell.source) ? cell.source.join("") : (typeof cell.source === "string" ? cell.source : "");
      const cleanSource = rawSource.trim();

      if (!cleanSource) continue;

      if (cellType === "markdown") {
        markdownCellsCount++;
        // Check if there is an H1 heading in the first markdown cell to use as canonical title
        if (!firstHeadingFound) {
          const h1Match = cleanSource.match(/^#\s+(.+)$/m);
          if (h1Match && h1Match[1]) {
            title = h1Match[1].trim();
            firstHeadingFound = true;
          }
        }
        sections.push(cleanSource);
      } else if (cellType === "code") {
        codeBlocksCount++;
        let cellBlock = `\`\`\`${language}\n${cleanSource}\n\`\`\``;

        // Optionally capture short text output or errors, discarding base64 images
        if (Array.isArray(cell.outputs) && cell.outputs.length > 0) {
          const textOutputs: string[] = [];
          for (const out of cell.outputs) {
            if (out.output_type === "stream" && out.text) {
              const text = Array.isArray(out.text) ? out.text.join("") : String(out.text);
              if (text.length < 500) textOutputs.push(text.trim());
            } else if (out.output_type === "execute_result" || out.output_type === "display_data") {
              if (out.data && out.data["text/plain"]) {
                const plainText = Array.isArray(out.data["text/plain"]) ? out.data["text/plain"].join("") : String(out.data["text/plain"]);
                if (plainText.length < 500) textOutputs.push(plainText.trim());
              }
            } else if (out.output_type === "error" && out.ename) {
              textOutputs.push(`[${out.ename}]: ${out.evalue || "Execution Error"}`);
            }
          }

          if (textOutputs.length > 0) {
            cellBlock += `\n\n*Output:* \n\`\`\`text\n${textOutputs.join("\n").slice(0, 800)}\n\`\`\``;
          }
        }

        sections.push(cellBlock);
      } else if (cellType === "raw") {
        sections.push(cleanSource);
      }
    }

    const compiledBody = sections.join("\n\n---\n\n");

    return {
      title,
      markdownContent: compiledBody || `# ${title}\n\n> Nessuna cella rilevante estratta.`,
      codeBlocksCount,
      markdownCellsCount,
      kernelName,
      language,
    };
  } catch (err: any) {
    console.warn("[ipynbParser] JSON parse error:", err?.message);
    return {
      title,
      markdownContent: `# ${title}\n\n> Errore decodifica JSON del notebook: ${err?.message}`,
      codeBlocksCount: 0,
      markdownCellsCount: 0,
    };
  }
}
