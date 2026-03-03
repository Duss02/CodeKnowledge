"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeGraph = summarizeGraph;
const promises_1 = __importDefault(require("fs/promises"));
const llm_js_1 = require("./llm.js");
const cache_js_1 = require("./cache.js");
const index_js_1 = require("../config/index.js");
async function summarizeGraph(graph, rootDir, outputDir, config, logger, opts = {}) {
    if (!config.summaries) {
        logger.info("Summaries disabled, skipping LLM calls");
        return;
    }
    if (!(0, index_js_1.hasApiKey)(config)) {
        logger.warn("No API key found — skipping summaries. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable.");
        return;
    }
    const cache = await (0, cache_js_1.loadSummaryCache)(outputDir);
    // Only summarize file-level nodes (classes/functions get their context from the file)
    const filesToSummarize = graph
        .nodes()
        .filter((n) => n.type === "file")
        .filter((n) => opts.force || !(0, cache_js_1.getCached)(cache, n.id, n.hash));
    if (filesToSummarize.length === 0) {
        logger.info("All summaries up-to-date (cache hit)");
        return;
    }
    const batchSize = config.summaryBatchSize ?? 5;
    logger.info(`Generating summaries for ${filesToSummarize.length} files (${batchSize} parallel)...`);
    let completed = 0;
    async function processNode(node) {
        const filePath = `${rootDir}/${node.path}`;
        let code;
        try {
            code = await promises_1.default.readFile(filePath, "utf8");
        }
        catch {
            logger.warn({ path: node.path }, "Could not read file for summarization, skipping");
            completed++;
            return;
        }
        const cached = (0, cache_js_1.getCached)(cache, node.id, node.hash);
        if (cached && !opts.force) {
            graph.updateNode(node.id, {
                summary: cached.summary,
                tags: cached.tags,
                exports: cached.exports.length > 0 ? cached.exports : node.exports,
            });
            completed++;
            opts.onProgress?.(completed, filesToSummarize.length, node.id);
            return;
        }
        const result = await (0, llm_js_1.generateSummary)(code, node.path, node.language ?? "python", config);
        if (result) {
            graph.updateNode(node.id, {
                summary: result.summary,
                tags: result.tags,
                exports: result.exports.length > 0 ? result.exports : node.exports,
                stale: false,
            });
            (0, cache_js_1.setCached)(cache, node.id, node.hash, result);
            logger.debug({ path: node.path }, "Summary generated");
        }
        else {
            logger.warn({ path: node.path }, "LLM returned no result, skipping");
        }
        completed++;
        opts.onProgress?.(completed, filesToSummarize.length, node.id);
        // Save cache incrementally every 20 completions
        if (completed % 20 === 0) {
            await (0, cache_js_1.saveSummaryCache)(cache, outputDir);
        }
    }
    // Process in batches of batchSize (parallel within each batch)
    for (let i = 0; i < filesToSummarize.length; i += batchSize) {
        const batch = filesToSummarize.slice(i, i + batchSize);
        await Promise.all(batch.map(processNode));
        const pct = Math.round((completed / filesToSummarize.length) * 100);
        logger.info(`  [${completed}/${filesToSummarize.length}] ${pct}% complete`);
    }
    await (0, cache_js_1.saveSummaryCache)(cache, outputDir);
    logger.info(`Summaries complete: ${completed}/${filesToSummarize.length} processed`);
}
//# sourceMappingURL=index.js.map