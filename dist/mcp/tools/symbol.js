"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSymbolTool = registerSymbolTool;
const v4_1 = require("zod/v4");
const index_js_1 = require("../../core/retrieval/index.js");
function registerSymbolTool(server, getGraph) {
    server.registerTool("ck_symbol", {
        description: "Search for a symbol (class, function, method) by name in the knowledge graph. " +
            "Returns matching nodes with their metadata, location, and relationships.",
        inputSchema: {
            name: v4_1.z.string().describe("Symbol name to search for (e.g. 'AuthService', 'login', 'parseFile')"),
            type: v4_1.z.string().optional().describe("Optional: filter by node type ('class', 'function', 'file')"),
        },
    }, async ({ name, type }) => {
        const graph = getGraph();
        if (!graph) {
            return {
                content: [{ type: "text", text: "No knowledge graph loaded. Run `ck index` first." }],
            };
        }
        const query = name.toLowerCase();
        let matches = graph.nodes().filter((n) => {
            const nameMatch = n.name.toLowerCase().includes(query) || n.id.toLowerCase().includes(query);
            if (type)
                return nameMatch && n.type === type;
            return nameMatch;
        });
        // Sort: exact matches first, then by name length (shorter = more relevant)
        matches.sort((a, b) => {
            const aExact = a.name.toLowerCase() === query ? 0 : 1;
            const bExact = b.name.toLowerCase() === query ? 0 : 1;
            if (aExact !== bExact)
                return aExact - bExact;
            return a.name.length - b.name.length;
        });
        matches = matches.slice(0, 20);
        if (matches.length === 0) {
            return {
                content: [{ type: "text", text: `No symbol matching "${name}" found.` }],
            };
        }
        const results = matches.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            language: n.language,
            path: n.path,
            lines: n.lines,
            summary: n.summary || null,
            exports: n.exports || [],
            stale: n.stale,
        }));
        const json = JSON.stringify({ symbols: results, count: results.length }, null, 2);
        const tokens = (0, index_js_1.estimateTokens)(json);
        return {
            content: [{
                    type: "text",
                    text: json,
                }],
            _meta: { token_estimate: tokens },
        };
    });
}
//# sourceMappingURL=symbol.js.map