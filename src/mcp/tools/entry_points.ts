import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeGraph } from "../../core/graph/index.js";
import { getEntryPoints } from "../../core/graph/query.js";

export function registerEntryPointsTool(server: McpServer, getGraph: () => CodeGraph | null): void {
  server.registerTool(
    "ck_entry_points",
    {
      description:
        "List the main entry points of the repository — files with no incoming imports. " +
        "These are the roots of the dependency graph (e.g. main.ts, index.ts, app.ts).",
      inputSchema: {},
    },
    async () => {
      const graph = getGraph();
      if (!graph) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No knowledge graph loaded. Run `ck index` first.",
            },
          ],
        };
      }

      const entries = getEntryPoints(graph);

      if (entries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No entry points found (all files have incoming imports, or graph is empty).",
            },
          ],
        };
      }

      const lines: string[] = [
        `## Entry Points — ${entries.length} file(s) with no incoming imports`,
        "",
      ];

      for (const node of entries) {
        lines.push(`### \`${node.id}\``);
        if (node.summary) lines.push(node.summary);

        const deps = graph.successors(node.id);
        if (deps.length > 0) {
          lines.push(`**Imports:** ${deps.slice(0, 5).map((d) => `\`${d.id}\``).join(", ")}${deps.length > 5 ? ` +${deps.length - 5} more` : ""}`);
        }

        if (node.exports?.length) {
          lines.push(`**Exports:** ${node.exports.slice(0, 5).join(", ")}`);
        }
        lines.push("");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    }
  );
}
