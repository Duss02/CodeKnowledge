"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStatus = runStatus;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const index_js_1 = require("../../core/config/index.js");
const serializer_js_1 = require("../../core/graph/serializer.js");
const query_js_1 = require("../../core/graph/query.js");
async function runStatus() {
    const cwd = process.cwd();
    const config = await (0, index_js_1.loadConfig)(cwd);
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    const graph = await (0, serializer_js_1.loadGraph)(outputDir);
    if (!graph) {
        console.log("No knowledge graph found. Run `ck index` to build one.");
        return;
    }
    const overview = (0, query_js_1.getOverview)(graph);
    // Read graph.json metadata for generated_at
    let generatedAt = "unknown";
    try {
        const raw = await promises_1.default.readFile(path_1.default.join(outputDir, "graph.json"), "utf8");
        const data = JSON.parse(raw);
        generatedAt = data.generated_at ?? "unknown";
    }
    catch { }
    console.log("\n📊 codeknowledge — Graph Status\n");
    console.log(`  Last indexed:  ${generatedAt}`);
    console.log(`  Output dir:    ${outputDir}`);
    console.log();
    console.log(`  Total nodes:   ${overview.totalNodes}`);
    console.log(`  ├─ Files:      ${overview.fileCount}`);
    console.log(`  ├─ Classes:    ${overview.classCount}`);
    console.log(`  └─ Functions:  ${overview.functionCount}`);
    console.log(`  Total edges:   ${overview.totalEdges}`);
    console.log();
    const langEntries = Object.entries(overview.languages);
    if (langEntries.length > 0) {
        console.log("  Languages:");
        for (const [lang, count] of langEntries) {
            console.log(`    ${lang.padEnd(14)} ${count} nodes`);
        }
        console.log();
    }
    if (overview.staleCount > 0) {
        console.log(`  ⚠️  Stale nodes:  ${overview.staleCount} (run \`ck index\` to update)`);
        console.log();
    }
    else {
        console.log(`  ✅ All nodes up-to-date`);
        console.log();
    }
    if (overview.entryPoints.length > 0) {
        console.log("  Entry points (files with no incoming imports):");
        for (const ep of overview.entryPoints.slice(0, 5)) {
            console.log(`    • ${ep.id}`);
        }
        if (overview.entryPoints.length > 5) {
            console.log(`    ... and ${overview.entryPoints.length - 5} more`);
        }
        console.log();
    }
}
//# sourceMappingURL=status.js.map