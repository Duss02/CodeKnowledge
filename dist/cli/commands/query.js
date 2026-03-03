"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runQuery = runQuery;
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../../core/config/index.js");
const serializer_js_1 = require("../../core/graph/serializer.js");
const query_js_1 = require("../../core/graph/query.js");
const llm_js_1 = require("../../core/summarizer/llm.js");
const logger_js_1 = require("../../utils/logger.js");
async function runQuery(question) {
    const cwd = process.cwd();
    const config = await (0, index_js_1.loadConfig)(cwd);
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    const graph = await (0, serializer_js_1.loadGraph)(outputDir);
    if (!graph) {
        logger_js_1.logger.error("No graph found. Run `ck index` first.");
        process.exit(1);
    }
    logger_js_1.logger.info(`Query: "${question}"`);
    // 1. Try structural queries first
    if (question.match(/^(who uses|find usages of|what uses)\s+(.+)/i)) {
        const symbol = question.replace(/^(who uses|find usages of|what uses)\s+/i, "").trim();
        const results = (0, query_js_1.findUsages)(graph, symbol);
        if (results.length === 0) {
            console.log(`No usages found for "${symbol}"`);
        }
        else {
            console.log(`\nUsages of "${symbol}" (${results.length} results):\n`);
            for (const node of results) {
                console.log(`  • ${node.id} [${node.type}]`);
                if (node.summary)
                    console.log(`    ${node.summary}`);
            }
        }
        return;
    }
    if (question.match(/^(impact of|what breaks if|what depends on)\s+(.+)/i)) {
        const target = question.replace(/^(impact of|what breaks if|what depends on)\s+/i, "").trim();
        const result = (0, query_js_1.computeImpact)(graph, target);
        if (!result) {
            console.log(`Node "${target}" not found in graph.`);
        }
        else {
            console.log(`\nImpact of changing "${result.changed.id}":\n`);
            if (result.affected.length === 0) {
                console.log("  No dependents found.");
            }
            else {
                for (const { node, depth } of result.affected) {
                    const indent = "  ".repeat(depth);
                    console.log(`${indent}• [depth ${depth}] ${node.id}`);
                    if (node.summary)
                        console.log(`${indent}  ${node.summary.slice(0, 100)}`);
                }
            }
        }
        return;
    }
    // 2. If an API key is configured, use LLM with graph context
    if ((0, index_js_1.hasApiKey)(config)) {
        await llmQuery(question, graph, config);
        return;
    }
    // 3. Fallback: structural search
    const results = graph.search(question);
    if (results.length === 0) {
        console.log(`No results found for "${question}"`);
        return;
    }
    console.log(`\nSearch results for "${question}" (${results.length} matches):\n`);
    for (const node of results.slice(0, 10)) {
        console.log(`  • ${node.id} [${node.type}]`);
        if (node.summary)
            console.log(`    ${node.summary.slice(0, 120)}`);
        console.log();
    }
}
async function llmQuery(question, graph, config) {
    const results = graph.search(question).slice(0, 15);
    const allNodes = graph.nodes().filter((n) => n.type === "file" && n.summary);
    const context = (results.length > 0 ? results : allNodes.slice(0, 15))
        .map((n) => {
        const deps = graph.successors(n.id).map((d) => d.id).join(", ");
        return `[${n.id}] ${n.summary ?? "(no summary)"}${deps ? `\n  Imports: ${deps}` : ""}`;
    })
        .join("\n\n");
    const prompt = `You are analyzing a codebase. Use the knowledge graph context below to answer the question.

Knowledge Graph Context:
${context}

Question: ${question}

Answer concisely based on the graph data. If you don't have enough context, say so.`;
    const answer = await (0, llm_js_1.callLLM)(prompt, config, 1024);
    if (answer) {
        console.log(`\n${answer}\n`);
    }
}
//# sourceMappingURL=query.js.map