"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerQueryTool = registerQueryTool;
const v4_1 = require("zod/v4");
const index_js_1 = require("../../core/config/index.js");
const llm_js_1 = require("../../core/summarizer/llm.js");
function registerQueryTool(server, getGraph, config) {
    server.registerTool("ck_query", {
        description: "Ask a natural language question about the codebase. " +
            "Uses the knowledge graph + LLM to answer. " +
            'Examples: "where is authentication handled?", "what does the UserRepository do?", ' +
            '"which files handle payment processing?"',
        inputSchema: {
            question: v4_1.z
                .string()
                .describe("Natural language question about the codebase"),
        },
    }, async ({ question }) => {
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
        // Find relevant nodes via keyword search
        const searchResults = graph.search(question).slice(0, 15);
        const fileNodesWithSummaries = graph
            .nodes()
            .filter((n) => n.type === "file" && n.summary)
            .slice(0, 15);
        const relevantNodes = searchResults.length > 0 ? searchResults : fileNodesWithSummaries;
        const context = relevantNodes
            .map((n) => {
            const deps = graph.successors(n.id).map((d) => d.id);
            const dependents = graph.predecessors(n.id).map((d) => d.id);
            const parts = [`[${n.id}] (${n.type}, ${n.language ?? "unknown"})`];
            if (n.summary)
                parts.push(`Summary: ${n.summary}`);
            if (n.exports?.length)
                parts.push(`Exports: ${n.exports.slice(0, 5).join(", ")}`);
            if (deps.length)
                parts.push(`Imports: ${deps.slice(0, 5).join(", ")}`);
            if (dependents.length)
                parts.push(`Used by: ${dependents.slice(0, 5).join(", ")}`);
            if (n.tags?.length)
                parts.push(`Tags: ${n.tags.join(", ")}`);
            return parts.join("\n  ");
        })
            .join("\n\n---\n\n");
        // If no API key, fall back to structural search
        if (!(0, index_js_1.hasApiKey)(config)) {
            if (relevantNodes.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No results found for "${question}".\n\nTip: Set ANTHROPIC_API_KEY and re-run \`ck index\` to enable LLM-powered summaries and queries.`,
                        },
                    ],
                };
            }
            const lines = [
                `## Structural search results for: "${question}"`,
                `_(No ANTHROPIC_API_KEY set — showing keyword matches only)_`,
                "",
                ...relevantNodes.slice(0, 10).map((n) => {
                    const summary = n.summary ? `\n  ${n.summary.slice(0, 150)}` : "";
                    return `- **\`${n.id}\`** [${n.type}]${summary}`;
                }),
            ];
            return {
                content: [{ type: "text", text: lines.join("\n") }],
            };
        }
        // LLM-powered query
        const prompt = `You are analyzing a codebase using its knowledge graph. Answer the developer's question using the graph context below.

Knowledge Graph Context (${relevantNodes.length} most relevant nodes):
${context}

Developer Question: ${question}

Instructions:
- Answer based on the graph data provided
- Be specific: mention actual file paths, class names, function names
- If the answer spans multiple files, explain how they connect
- If context is insufficient, say so and suggest which files to inspect
- Keep the answer focused and practical`;
        try {
            const answer = await (0, llm_js_1.callLLM)(prompt, config, 1024);
            return {
                content: [
                    {
                        type: "text",
                        text: `## Answer: ${question}\n\n${answer ?? "Unable to generate answer."}`,
                    },
                ],
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `LLM query failed: ${msg}\n\nFalling back to structural search:\n\n${context.slice(0, 2000)}`,
                    },
                ],
            };
        }
    });
}
//# sourceMappingURL=query.js.map