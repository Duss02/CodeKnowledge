"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExport = runExport;
/**
 * ck export --json — structured graph export.
 */
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const index_js_1 = require("../../core/config/index.js");
const serializer_js_1 = require("../../core/graph/serializer.js");
async function runExport(opts = {}) {
    const cwd = process.cwd();
    const config = await (0, index_js_1.loadConfig)(cwd);
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    const graph = await (0, serializer_js_1.loadGraph)(outputDir);
    if (!graph) {
        console.error("No graph found. Run `ck index` first.");
        return;
    }
    const data = {
        version: "2",
        generated_at: new Date().toISOString(),
        stats: {
            nodes: graph.nodeCount(),
            edges: graph.edgeCount(),
            stale: graph.staleNodes().length,
        },
        nodes: graph.nodes().map((n) => ({
            id: n.id,
            type: n.type,
            language: n.language,
            path: n.path,
            name: n.name,
            lines: n.lines,
            summary: n.summary || null,
            exports: n.exports || [],
            tags: n.tags || [],
            stale: n.stale,
        })),
        edges: graph.edges().map((e) => ({
            source: e.source,
            target: e.target,
            type: e.type,
            via: e.via,
        })),
    };
    const json = JSON.stringify(data, null, 2);
    if (opts.output) {
        await promises_1.default.writeFile(opts.output, json, "utf8");
        console.log(`Exported to ${opts.output} (${data.stats.nodes} nodes, ${data.stats.edges} edges)`);
    }
    else {
        console.log(json);
    }
}
//# sourceMappingURL=export.js.map