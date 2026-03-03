"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNotebook = extractNotebook;
function joinSource(source) {
    return Array.isArray(source) ? source.join("") : source;
}
function extractNotebook(rawJson) {
    let nb;
    try {
        nb = JSON.parse(rawJson);
    }
    catch {
        return null;
    }
    const cells = nb.cells;
    if (!Array.isArray(cells))
        return null;
    const kernelLanguage = nb.metadata?.kernelspec
        ? nb.metadata.kernelspec?.language ?? "python"
        : "python";
    const codeParts = [];
    const llmParts = [];
    let codeCellCount = 0;
    for (const cell of cells) {
        const source = joinSource(cell.source ?? "").trim();
        if (!source)
            continue;
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
        }
        else if (cell.cell_type === "markdown") {
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
//# sourceMappingURL=notebook.js.map