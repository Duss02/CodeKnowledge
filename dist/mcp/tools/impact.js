"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerImpactTool = registerImpactTool;
const v4_1 = require("zod/v4");
const query_js_1 = require("../../core/graph/query.js");
function registerImpactTool(server, getGraph) {
    server.registerTool("ck_impact", {
        description: "Analyze the blast radius: if you modify a file, which other files might break? " +
            "Returns transitive dependents up to 3 hops deep.",
        inputSchema: {
            path: v4_1.z
                .string()
                .describe("File path or node ID to analyze impact for (e.g. 'src/auth/AuthService.ts')"),
            max_depth: v4_1.z
                .number()
                .optional()
                .describe("Maximum dependency depth to traverse (default: 3)"),
        },
    }, async ({ path, max_depth }) => {
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
        const depth = max_depth ?? 3;
        const result = (0, query_js_1.computeImpact)(graph, path, depth);
        if (!result) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Node "${path}" not found in knowledge graph.`,
                    },
                ],
            };
        }
        const { changed, affected } = result;
        const lines = [
            `## Impact Analysis: \`${changed.id}\``,
            "",
            `**Changed node:** ${changed.type} | ${changed.language ?? "unknown"}`,
        ];
        if (changed.summary)
            lines.push(`**Summary:** ${changed.summary}`);
        lines.push("");
        if (affected.length === 0) {
            lines.push("✅ No dependents found — this node is not imported by anything.");
        }
        else {
            lines.push(`⚠️ **${affected.length} node(s) may be affected** (up to depth ${depth}):`, "");
            // Group by depth
            const byDepth = new Map();
            for (const item of affected) {
                if (!byDepth.has(item.depth))
                    byDepth.set(item.depth, []);
                byDepth.get(item.depth).push(item);
            }
            for (const [d, items] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
                lines.push(`### Depth ${d} (${items.length} file${items.length > 1 ? "s" : ""})`);
                for (const { node } of items) {
                    lines.push(`- \`${node.id}\` [${node.type}]${node.summary ? ": " + node.summary.slice(0, 100) : ""}`);
                }
                lines.push("");
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: lines.join("\n"),
                },
            ],
        };
    });
}
//# sourceMappingURL=impact.js.map