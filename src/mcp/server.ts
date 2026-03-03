import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../core/config/index.js";
import { loadGraph } from "../core/graph/serializer.js";
import type { CodeGraph } from "../core/graph/index.js";
import { logger } from "../utils/logger.js";

import { registerQueryNodeTool } from "./tools/query_node.js";
import { registerFindUsagesTool } from "./tools/find_usages.js";
import { registerImpactTool } from "./tools/impact.js";
import { registerEntryPointsTool } from "./tools/entry_points.js";
import { registerOverviewTool } from "./tools/overview.js";
import { registerQueryTool } from "./tools/query.js";

export async function startMcpServer(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  const outputDir = path.resolve(cwd, config.outputDir);

  // Load graph once at startup; tools access via closure
  let graph: CodeGraph | null = await loadGraph(outputDir);

  if (!graph) {
    // Don't crash — log and serve anyway; tools will return friendly errors
    logger.warn(
      { outputDir },
      "No knowledge graph found. Start the server and run `ck index` to create one."
    );
  } else {
    const nodeCount = graph.nodeCount();
    const edgeCount = graph.edgeCount();
    logger.info({ nodeCount, edgeCount }, "Knowledge graph loaded");
  }

  const getGraph = (): CodeGraph | null => graph;

  const server = new McpServer(
    {
      name: "codeknowledge",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "codeknowledge MCP server — query the knowledge graph of this codebase. " +
        "Use ck_overview to start, then drill into specific files with ck_get_node. " +
        "Use ck_impact before modifying a file to understand the blast radius.",
    }
  );

  // Register all tools
  registerQueryNodeTool(server, getGraph);
  registerFindUsagesTool(server, getGraph);
  registerImpactTool(server, getGraph);
  registerEntryPointsTool(server, getGraph);
  registerOverviewTool(server, getGraph);
  registerQueryTool(server, getGraph, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't corrupt the stdio MCP protocol
  process.stderr.write(
    `[codeknowledge] MCP server started. Graph: ${graph ? graph.nodeCount() + " nodes" : "not loaded"}.\n`
  );
}
