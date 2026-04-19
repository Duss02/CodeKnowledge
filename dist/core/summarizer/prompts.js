"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
exports.buildBatchPrompt = buildBatchPrompt;
exports.parseFileSummary = parseFileSummary;
exports.parseSymbolSummary = parseSymbolSummary;
exports.parseBatchResponse = parseBatchResponse;
exports.validateExports = validateExports;
exports.mergeExports = mergeExports;
exports.groupForBatching = groupForBatching;
// ──────────── Prompt Templates ────────────
const FILE_PROMPT = `Analyze this source file. Output in this exact format:

SUMMARY: <2-4 sentences: what this file does, its role in the codebase>
EXPORTS: <comma-separated list of public exports>
TAGS: <3-6 lowercase keywords>

For each class, add:
CLASS <ClassName>: <1-2 sentence description>

For each top-level function, add:
FUNC <functionName>: <1 sentence description>`;
const CLASS_PROMPT = `Analyze this class definition. Output in this exact format:

SUMMARY: <2-3 sentences: what this class does, its responsibilities>
EXPORTS: <comma-separated list of public methods>
TAGS: <3-6 lowercase keywords>`;
const FUNCTION_PROMPT = `Analyze this function. Output in this exact format:

SUMMARY: <1-2 sentences: what this function does, its inputs/outputs>
TAGS: <2-4 lowercase keywords>`;
const BATCH_PROMPT = `Analyze these code snippets. For each one, output a summary in this format:

--- FILE: <path> ---
SUMMARY: <1-2 sentences>
EXPORTS: <comma-separated>
TAGS: <keywords>
--- END ---`;
// ──────────── Prompt Builders ────────────
function buildPrompt(code, node, maxLines) {
    const truncated = truncateCode(code, maxLines);
    const lang = node.language === "notebook" ? "python (jupyter notebook)" : node.language;
    let template;
    switch (node.type) {
        case "class":
            template = CLASS_PROMPT;
            break;
        case "function":
            template = FUNCTION_PROMPT;
            break;
        default:
            template = FILE_PROMPT;
    }
    return `${template}

Language: ${lang}
${node.type === "file" ? `File: ${node.path}` : `Symbol: ${node.name} (${node.type})`}
---
${truncated}
---`;
}
function buildBatchPrompt(items, maxLinesPerItem) {
    const parts = items.map(({ node, code }) => {
        const truncated = truncateCode(code, maxLinesPerItem);
        return `--- FILE: ${node.path} ---
Language: ${node.language}
${truncated}
--- END ---`;
    });
    return `${BATCH_PROMPT}

${parts.join("\n\n")}`;
}
// ──────────── Response Parsers ────────────
function parseFileSummary(text) {
    const base = parseSymbolSummary(text);
    const classes = {};
    const classMatches = text.matchAll(/CLASS\s+(\w+):\s*(.+)/gi);
    for (const m of classMatches) {
        classes[m[1]] = { summary: m[2].trim(), exports: [], tags: [] };
    }
    const functions = {};
    const funcMatches = text.matchAll(/FUNC\s+(\w+):\s*(.+)/gi);
    for (const m of funcMatches) {
        functions[m[1]] = m[2].trim();
    }
    return { ...base, classes, functions };
}
function parseSymbolSummary(text) {
    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=EXPORTS:|TAGS:|CLASS |FUNC |$)/i);
    const exportsMatch = text.match(/EXPORTS:\s*([\s\S]*?)(?=TAGS:|CLASS |FUNC |$)/i);
    const tagsMatch = text.match(/TAGS:\s*([\s\S]*?)(?=CLASS |FUNC |$)/i);
    const summary = summaryMatch?.[1]?.trim() ?? text.slice(0, 300).trim();
    const exportsRaw = exportsMatch?.[1]?.trim() ?? "";
    const tagsRaw = tagsMatch?.[1]?.trim() ?? "";
    const exports = exportsRaw
        ? exportsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const tags = tagsRaw
        ? tagsRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [];
    return { summary, exports, tags };
}
function parseBatchResponse(text) {
    const results = new Map();
    const blocks = text.split(/---\s*FILE:\s*/i).filter(Boolean);
    for (const block of blocks) {
        const pathMatch = block.match(/^([^\n]+?)\s*---/);
        if (!pathMatch)
            continue;
        const filePath = pathMatch[1].trim();
        const content = block.slice(pathMatch[0].length);
        results.set(filePath, parseSymbolSummary(content));
    }
    return results;
}
/**
 * Validate LLM-generated exports against AST-extracted exports.
 * Returns the validated/corrected export list.
 */
function validateExports(llmExports, astExports) {
    const astSet = new Set(astExports);
    const llmSet = new Set(llmExports);
    const missing = astExports.filter((e) => !llmSet.has(e));
    const extra = llmExports.filter((e) => !astSet.has(e));
    return {
        valid: missing.length === 0 && extra.length === 0,
        missingExports: missing,
        extraExports: extra,
    };
}
/**
 * Merge LLM exports with AST exports — AST is the source of truth,
 * but LLM may discover re-exported or dynamically generated symbols.
 */
function mergeExports(llmExports, astExports) {
    const merged = new Set([...astExports, ...llmExports]);
    return Array.from(merged).sort();
}
// ──────────── Batching Logic ────────────
/**
 * Group small files into batches for a single LLM call.
 * Large files are returned as individual items.
 */
function groupForBatching(items, maxBatchLines = 200, maxBatchItems = 5) {
    const batches = [];
    const small = [];
    const large = [];
    // Separate small (≤50 lines) from large files
    for (const item of items) {
        if (item.lineCount <= 50) {
            small.push(item);
        }
        else {
            large.push(item);
        }
    }
    // Group small files into batches
    let currentBatch = [];
    let currentLines = 0;
    for (const item of small) {
        if (currentBatch.length >= maxBatchItems ||
            currentLines + item.lineCount > maxBatchLines) {
            if (currentBatch.length > 0)
                batches.push(currentBatch);
            currentBatch = [];
            currentLines = 0;
        }
        currentBatch.push({ node: item.node, code: item.code });
        currentLines += item.lineCount;
    }
    if (currentBatch.length > 0)
        batches.push(currentBatch);
    // Each large file is its own batch
    for (const item of large) {
        batches.push([{ node: item.node, code: item.code }]);
    }
    return batches;
}
// ──────────── Helpers ────────────
function truncateCode(code, maxLines) {
    const lines = code.split("\n");
    if (lines.length <= maxLines)
        return code;
    return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
}
//# sourceMappingURL=prompts.js.map