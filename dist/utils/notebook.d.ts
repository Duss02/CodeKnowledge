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
export declare function extractNotebook(rawJson: string): NotebookExtract | null;
//# sourceMappingURL=notebook.d.ts.map