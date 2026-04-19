"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoctor = runDoctor;
/**
 * ck doctor — health check for the codeknowledge installation and graph.
 */
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const index_js_1 = require("../../core/config/index.js");
const serializer_js_1 = require("../../core/graph/serializer.js");
async function runDoctor() {
    const checks = [];
    const cwd = process.cwd();
    // 1. Config check
    let config;
    try {
        config = await (0, index_js_1.loadConfig)(cwd);
        checks.push({ name: "Config", status: "pass", message: "Configuration loaded successfully" });
    }
    catch {
        checks.push({ name: "Config", status: "fail", message: "Failed to load configuration" });
        printResults(checks);
        return;
    }
    // 2. Output directory
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    try {
        await promises_1.default.access(outputDir);
        checks.push({ name: "Output Dir", status: "pass", message: `${config.outputDir}/ exists` });
    }
    catch {
        checks.push({ name: "Output Dir", status: "warn", message: `${config.outputDir}/ not found. Run \`ck init\` first.` });
    }
    // 3. Graph file
    const graphPath = path_1.default.join(outputDir, "graph.json");
    const dbPath = path_1.default.join(outputDir, "graph.db");
    try {
        await promises_1.default.access(dbPath);
        checks.push({ name: "Graph DB", status: "pass", message: "SQLite database (graph.db) exists" });
    }
    catch {
        try {
            await promises_1.default.access(graphPath);
            checks.push({ name: "Graph JSON", status: "warn", message: "Legacy graph.json found. Consider running migrator." });
        }
        catch {
            checks.push({ name: "Graph", status: "warn", message: "No graph file found. Run `ck index` to create one." });
        }
    }
    // 4. Graph integrity
    try {
        const graph = await (0, serializer_js_1.loadGraph)(outputDir);
        if (graph) {
            const nodes = graph.nodeCount();
            const edges = graph.edgeCount();
            const stale = graph.staleNodes().length;
            checks.push({ name: "Graph Data", status: "pass", message: `${nodes} nodes, ${edges} edges, ${stale} stale` });
            if (stale > 0) {
                checks.push({ name: "Stale Nodes", status: "warn", message: `${stale} nodes need re-indexing. Run \`ck index\`.` });
            }
        }
    }
    catch {
        checks.push({ name: "Graph Data", status: "fail", message: "Failed to load graph" });
    }
    // 5. API key
    if (config.apiKey || config.openAIApiKey) {
        checks.push({ name: "API Key", status: "pass", message: `${config.provider} key configured` });
    }
    else {
        checks.push({ name: "API Key", status: "warn", message: "No API key. Summaries will be skipped." });
    }
    printResults(checks);
}
function printResults(checks) {
    console.log("\n🩺 CodeKnowledge Doctor\n");
    for (const c of checks) {
        const icon = c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
        console.log(`  ${icon} ${c.name}: ${c.message}`);
    }
    const pass = checks.filter((c) => c.status === "pass").length;
    const warn = checks.filter((c) => c.status === "warn").length;
    const fail = checks.filter((c) => c.status === "fail").length;
    console.log(`\n  ${pass} pass, ${warn} warn, ${fail} fail\n`);
}
//# sourceMappingURL=doctor.js.map