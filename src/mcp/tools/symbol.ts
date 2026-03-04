import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { CodeGraph } from "../../core/graph/index.js";
import { estimateTokens } from "../../core/retrieval/index.js";

export function registerSymbolTool(server: McpServer, getGraph: () => CodeGraph | null): void {
    server.registerTool(
        "ck_symbol",
        {
            description:
                "Search for a symbol (class, function, method) by name in the knowledge graph. " +
                "Returns matching nodes with their metadata, location, and relationships.",
            inputSchema: {
                name: z.string().describe("Symbol name to search for (e.g. 'AuthService', 'login', 'parseFile')"),
                type: z.string().optional().describe("Optional: filter by node type ('class', 'function', 'file')"),
            },
        },
        async ({ name, type }) => {
            const graph = getGraph();
            if (!graph) {
                return {
                    content: [{ type: "text" as const, text: "No knowledge graph loaded. Run `ck index` first." }],
                };
            }

            const query = name.toLowerCase();
            let matches = graph.nodes().filter((n) => {
                const nameMatch = n.name.toLowerCase().includes(query) || n.id.toLowerCase().includes(query);
                if (type) return nameMatch && n.type === type;
                return nameMatch;
            });

            // Sort: exact matches first, then by name length (shorter = more relevant)
            matches.sort((a, b) => {
                const aExact = a.name.toLowerCase() === query ? 0 : 1;
                const bExact = b.name.toLowerCase() === query ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                return a.name.length - b.name.length;
            });

            matches = matches.slice(0, 20);

            if (matches.length === 0) {
                return {
                    content: [{ type: "text" as const, text: `No symbol matching "${name}" found.` }],
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
            const tokens = estimateTokens(json);

            return {
                content: [{
                    type: "text" as const,
                    text: json,
                }],
                _meta: { token_estimate: tokens },
            };
        }
    );
}
