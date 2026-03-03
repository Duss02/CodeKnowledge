"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMcpServer = startMcpServer;
const path_1 = __importDefault(require("path"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const index_js_1 = require("../core/config/index.js");
const serializer_js_1 = require("../core/graph/serializer.js");
const logger_js_1 = require("../utils/logger.js");
const query_node_js_1 = require("./tools/query_node.js");
const find_usages_js_1 = require("./tools/find_usages.js");
const impact_js_1 = require("./tools/impact.js");
const entry_points_js_1 = require("./tools/entry_points.js");
const overview_js_1 = require("./tools/overview.js");
const query_js_1 = require("./tools/query.js");
async function startMcpServer(cwd = process.cwd()) {
    const config = await (0, index_js_1.loadConfig)(cwd);
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    // Load graph once at startup; tools access via closure
    let graph = await (0, serializer_js_1.loadGraph)(outputDir);
    if (!graph) {
        // Don't crash — log and serve anyway; tools will return friendly errors
        logger_js_1.logger.warn({ outputDir }, "No knowledge graph found. Start the server and run `ck index` to create one.");
    }
    else {
        const nodeCount = graph.nodeCount();
        const edgeCount = graph.edgeCount();
        logger_js_1.logger.info({ nodeCount, edgeCount }, "Knowledge graph loaded");
    }
    const getGraph = () => graph;
    const server = new mcp_js_1.McpServer({
        name: "codeknowledge",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
        },
        instructions: "codeknowledge MCP server — query the knowledge graph of this codebase. " +
            "Use ck_overview to start, then drill into specific files with ck_get_node. " +
            "Use ck_impact before modifying a file to understand the blast radius.",
    });
    // Register all tools
    (0, query_node_js_1.registerQueryNodeTool)(server, getGraph);
    (0, find_usages_js_1.registerFindUsagesTool)(server, getGraph);
    (0, impact_js_1.registerImpactTool)(server, getGraph);
    (0, entry_points_js_1.registerEntryPointsTool)(server, getGraph);
    (0, overview_js_1.registerOverviewTool)(server, getGraph);
    (0, query_js_1.registerQueryTool)(server, getGraph, config);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    // Log to stderr so it doesn't corrupt the stdio MCP protocol
    process.stderr.write(`[codeknowledge] MCP server started. Graph: ${graph ? graph.nodeCount() + " nodes" : "not loaded"}.\n`);
}
//# sourceMappingURL=server.js.map