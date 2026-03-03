/**
 * Utilities for extracting content from Jupyter notebooks (.ipynb).
 *
 * A notebook is a JSON file with the following structure:
 *   { cells: [ { cell_type: "code"|"markdown", source: string[] }, ... ] }
 *
 * We extract:
 * - Code cells → concatenated Python source (for AST parsing + LLM summary)
 * - Markdown cells → stripped text (for contextual headings in the LLM prompt)
 */

export interface NotebookCell {
  type: "code" | "markdown" | "raw";
  source: string;
}

export interface NotebookExtract {
  /** All code cells concatenated, ready for tree-sitter parsing */
  codeContent: string;
  /** LLM-friendly representation: markdown headings + code blocks */
  llmContent: string;
  /** Total number of cells */
  totalCells: number;
  /** Number of code cells */
  codeCellCount: number;
  /** Detected kernel language (e.g. "python") */
  kernelLanguage: string;
}

function joinSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join("") : source;
}

export function extractNotebook(rawJson: string): NotebookExtract | null {
  let nb: Record<string, unknown>;
  try {
    nb = JSON.parse(rawJson);
  } catch {
    return null;
  }

  const cells = nb.cells as Array<{ cell_type: string; source: string | string[] }> | undefined;
  if (!Array.isArray(cells)) return null;

  const kernelLanguage =
    (nb.metadata as Record<string, unknown> | undefined)?.kernelspec
      ? ((nb.metadata as Record<string, Record<string, unknown>>).kernelspec?.language as string) ?? "python"
      : "python";

  const codeParts: string[] = [];
  const llmParts: string[] = [];
  let codeCellCount = 0;

  for (const cell of cells) {
    const source = joinSource(cell.source ?? "").trim();
    if (!source) continue;

    if (cell.cell_type === "code") {
      // Skip cells that are only magic commands (%, !) or empty
      const codeLines = source
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("%") && !l.trimStart().startsWith("!"))
        .join("\n")
        .trim();

      if (codeLines) {
        codeParts.push(codeLines);
        llmParts.push("```python\n" + codeLines + "\n```");
        codeCellCount++;
      }
    } else if (cell.cell_type === "markdown") {
      // Keep markdown headings and first paragraph as context
      const firstParagraph = source.split("\n\n")[0].slice(0, 300);
      llmParts.push(firstParagraph);
    }
  }

  return {
    codeContent: codeParts.join("\n\n"),
    llmContent: llmParts.join("\n\n"),
    totalCells: cells.length,
    codeCellCount,
    kernelLanguage,
  };
}
