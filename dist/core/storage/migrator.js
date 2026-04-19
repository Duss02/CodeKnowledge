"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateJsonToSqlite = migrateJsonToSqlite;
/**
 * Migrator: graph.json → SQLite (graph.db)
 *
 * Reads an existing graph.json file and imports all nodes/edges
 * into a GraphStore SQLite database.
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("./index.js");
/**
 * Migrate a graph.json file to SQLite.
 * The original graph.json is NOT deleted (user can delete manually).
 */
async function migrateJsonToSqlite(outputDir) {
    const jsonPath = path_1.default.join(outputDir, "graph.json");
    // Check if graph.json exists
    try {
        await promises_1.default.access(jsonPath);
    }
    catch {
        return {
            success: false,
            nodeCount: 0,
            edgeCount: 0,
            sourceFile: jsonPath,
            error: "graph.json not found",
        };
    }
    // Read and parse
    let data;
    try {
        const raw = await promises_1.default.readFile(jsonPath, "utf8");
        data = JSON.parse(raw);
    }
    catch (err) {
        return {
            success: false,
            nodeCount: 0,
            edgeCount: 0,
            sourceFile: jsonPath,
            error: `Failed to parse graph.json: ${err.message}`,
        };
    }
    // Open/create SQLite store
    const store = await index_js_1.GraphStore.open(outputDir);
    // Map JSON nodes to GraphNode
    const nodes = data.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        language: n.language,
        path: n.path,
        name: n.name,
        lines: (n.lines && Array.isArray(n.lines) ? n.lines : [0, 0]),
        hash: n.hash,
        exports: n.exports || [],
        summary: n.summary,
        tags: n.tags || [],
        stale: n.stale || false,
        last_indexed: n.last_indexed || new Date().toISOString(),
    }));
    // Map JSON edges to GraphEdge
    const edges = data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        via: e.via || "",
    }));
    // Bulk insert
    store.bulkUpsert(nodes, edges);
    await store.save();
    store.close();
    return {
        success: true,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        sourceFile: jsonPath,
    };
}
//# sourceMappingURL=migrator.js.map