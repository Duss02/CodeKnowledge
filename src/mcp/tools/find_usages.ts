import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { CodeGraph } from "../../core/graph/index.js";
import { findUsages } from "../../core/graph/query.js";

export function registerFindUsagesTool(server: McpServer, getGraph: () => CodeGraph | null): void {
  server.registerTool(
    "ck_find_usages",
    {
      description:
        "Find all files, classes or functions that import or use a given symbol. " +
        "E.g. 'AuthService', 'useAuth', 'UserRepository'.",
      inputSchema: {
        symbol: z
          .string()
          .describe("Symbol name to search for (class, function, file name, or partial path)"),
      },
    },
    async ({ symbol }) => {
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

      const results = findUsages(graph, symbol);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No usages found for "${symbol}". Try a broader search term.`,
            },
          ],
        };
      }

      const lines: string[] = [
        `## Usages of "${symbol}" — ${results.length} result(s)`,
        "",
      ];

      for (const node of results.slice(0, 20)) {
        lines.push(`### \`${node.id}\` [${node.type}]`);
        if (node.summary) lines.push(node.summary);
        if (node.exports?.length) lines.push(`**Exports:** ${node.exports.slice(0, 5).join(", ")}`);

        // Show who imports this node
        const importers = graph.predecessors(node.id);
        if (importers.length > 0) {
          lines.push(
            `**Used by:** ${importers
              .slice(0, 5)
              .map((n) => `\`${n.id}\``)
              .join(", ")}`
          );
        }
        lines.push("");
      }

      if (results.length > 20) {
        lines.push(`_... and ${results.length - 20} more results_`);
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
