import type { GraphNode } from "../graph/index.js";
export interface SymbolSummary {
    /** 1-3 sentence description */
    summary: string;
    /** Exported symbols or method names */
    exports: string[];
    /** Classification tags */
    tags: string[];
}
export interface FileSummary extends SymbolSummary {
    /** Per-class summaries within this file */
    classes: Record<string, SymbolSummary>;
    /** Per-function summaries within this file */
    functions: Record<string, string>;
}
export declare function buildPrompt(code: string, node: GraphNode, maxLines: number): string;
export declare function buildBatchPrompt(items: Array<{
    node: GraphNode;
    code: string;
}>, maxLinesPerItem: number): string;
export declare function parseFileSummary(text: string): FileSummary;
export declare function parseSymbolSummary(text: string): SymbolSummary;
export declare function parseBatchResponse(text: string): Map<string, SymbolSummary>;
export interface ValidationResult {
    valid: boolean;
    missingExports: string[];
    extraExports: string[];
}
/**
 * Validate LLM-generated exports against AST-extracted exports.
 * Returns the validated/corrected export list.
 */
export declare function validateExports(llmExports: string[], astExports: string[]): ValidationResult;
/**
 * Merge LLM exports with AST exports — AST is the source of truth,
 * but LLM may discover re-exported or dynamically generated symbols.
 */
export declare function mergeExports(llmExports: string[], astExports: string[]): string[];
/**
 * Group small files into batches for a single LLM call.
 * Large files are returned as individual items.
 */
export declare function groupForBatching(items: Array<{
    node: GraphNode;
    code: string;
    lineCount: number;
}>, maxBatchLines?: number, maxBatchItems?: number): Array<Array<{
    node: GraphNode;
    code: string;
}>>;
//# sourceMappingURL=prompts.d.ts.map