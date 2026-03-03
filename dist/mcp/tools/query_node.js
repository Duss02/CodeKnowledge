"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerQueryNodeTool = registerQueryNodeTool;
const v4_1 = require("zod/v4");
const query_js_1 = require("../../core/graph/query.js");
function registerQueryNodeTool(server, getGraph) {
    server.registerTool("ck_get_node", {
        description: "Get the summary, metadata, dependencies and dependents of a file or class in the knowledge graph. " +
            "Pass a file path like 'src/auth/AuthService.ts' or a class/function name.",
        inputSchema: {
            path: v4_1.z
                .string()
                .describe("File path or node ID to look up (e.g. 'src/auth/AuthService.ts')"),
        },
    }, async ({ path }) => {
        const graph = getGraph();
        if (!graph) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No knowledge graph loaded. Run `ck index` first.",
                    },
                ],
            };
        }
        const result = (0, query_js_1.queryNode)(graph, path);
        if (!result) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Node "${path}" not found in knowledge graph. Try a partial name or file path.`,
                    },
                ],
            };
        }
        const { node, dependencies, dependents } = result;
        const lines = [
            `## ${node.name ?? node.id}`,
            `**Type:** ${node.type} | **Language:** ${node.language ?? "unknown"}`,
            `**Path:** ${node.path ?? node.id}`,
            `**Last indexed:** ${node.last_indexed}`,
            node.stale ? "⚠️ **STALE** — needs re-indexing" : "",
            "",
        ];
        if (node.summary) {
            lines.push("### Summary", node.summary, "");
        }
        if (node.exports?.length) {
            lines.push("### Exports", node.exports.join(", "), "");
        }
        if (node.tags?.length) {
            lines.push("### Tags", node.tags.join(", "), "");
        }
        if (dependencies.length > 0) {
            lines.push("### Dependencies (imports)", ...dependencies.map((d) => `- \`${d.id}\`${d.summary ? ": " + d.summary.slice(0, 80) : ""}`), "");
        }
        if (dependents.length > 0) {
            lines.push("### Dependents (used by)", ...dependents.map((d) => `- \`${d.id}\`${d.summary ? ": " + d.summary.slice(0, 80) : ""}`), "");
        }
        return {
            content: [
                {
                    type: "text",
                    text: lines.filter((l) => l !== undefined).join("\n"),
                },
            ],
        };
    });
}
//# sourceMappingURL=query_node.js.map