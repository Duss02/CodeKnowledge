import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeGraph } from "../../core/graph/index.js";
import { getOverview } from "../../core/graph/query.js";

export function registerOverviewTool(server: McpServer, getGraph: () => CodeGraph | null): void {
  server.registerTool(
    "ck_overview",
    {
      description:
        "Get a high-level architectural overview of the entire repository: " +
        "total nodes, files, classes, functions, languages, and main entry points.",
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

      const overview = getOverview(graph);

      const lines: string[] = [
        "## Codebase Overview",
        "",
        "### Graph Statistics",
        `| Metric | Count |`,
        `|--------|-------|`,
        `| Total nodes | ${overview.totalNodes} |`,
        `| Total edges | ${overview.totalEdges} |`,
        `| Files | ${overview.fileCount} |`,
        `| Classes | ${overview.classCount} |`,
        `| Functions | ${overview.functionCount} |`,
        `| Stale nodes | ${overview.staleCount} |`,
        "",
        "### Languages",
      ];

      const langEntries = Object.entries(overview.languages).sort((a, b) => b[1] - a[1]);
      if (langEntries.length > 0) {
        lines.push("| Language | Nodes |", "|----------|-------|");
        for (const [lang, count] of langEntries) {
          lines.push(`| ${lang} | ${count} |`);
        }
      } else {
        lines.push("No language information available.");
      }

      lines.push("");

      if (overview.entryPoints.length > 0) {
        lines.push("### Main Entry Points");
        for (const ep of overview.entryPoints) {
          lines.push(`- \`${ep.id}\`${ep.summary ? ": " + ep.summary.slice(0, 120) : ""}`);
        }
        lines.push("");
      }

      // Show files with summaries as a high-level module map
      const filesWithSummaries = graph
        .nodes()
        .filter((n) => n.type === "file" && n.summary)
        .slice(0, 20);

      if (filesWithSummaries.length > 0) {
        lines.push("### Key Modules");
        for (const file of filesWithSummaries) {
          lines.push(`**\`${file.id}\`**`);
          lines.push(file.summary!.slice(0, 150));
          lines.push("");
        }
      }

      if (overview.staleCount > 0) {
        lines.push(
          `> ⚠️ ${overview.staleCount} node(s) are stale. Run \`ck index\` to update them.`
        );
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
