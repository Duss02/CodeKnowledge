#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const init_js_1 = require("./commands/init.js");
const index_js_1 = require("./commands/index.js");
const query_js_1 = require("./commands/query.js");
const status_js_1 = require("./commands/status.js");
const watch_js_1 = require("./commands/watch.js");
const server_js_1 = require("../mcp/server.js");
const logger_js_1 = require("../utils/logger.js");
const program = new commander_1.Command();
program
    .name("ck")
    .description("codeknowledge — AI-ready knowledge graph for your codebase")
    .version("0.1.0");
program
    .command("init")
    .description("Scaffold .codeknowledge/ config in current directory")
    .action(async () => {
    await (0, init_js_1.runInit)();
});
program
    .command("index [paths...]")
    .description("Index a codebase and build the knowledge graph")
    .option("-f, --force", "Re-index all nodes even if unchanged")
    .option("--no-summaries", "Skip LLM summaries, graph only")
    .option("--no-markdown", "Skip SUMMARY.md generation")
    .action(async (paths, opts) => {
    await (0, index_js_1.runIndex)(paths, {
        force: opts.force,
        noSummaries: !opts.summaries,
        noMarkdown: !opts.markdown,
    });
});
program
    .command("query <question>")
    .alias("q")
    .description("Query the knowledge graph")
    .action(async (question) => {
    await (0, query_js_1.runQuery)(question);
});
program
    .command("status")
    .description("Show graph statistics and stale nodes")
    .action(async () => {
    await (0, status_js_1.runStatus)();
});
program
    .command("watch")
    .description("Watch for file changes and incrementally update the graph")
    .action(async () => {
    await (0, watch_js_1.runWatch)();
});
program
    .command("serve")
    .description("Start the MCP server on stdio (for Cursor / Claude Code integration)")
    .action(async () => {
    await (0, server_js_1.startMcpServer)(process.cwd());
});
// Suppress unhandled promise rejection noise in CLI
process.on("unhandledRejection", (err) => {
    logger_js_1.logger.error(err, "Unhandled error");
    process.exit(1);
});
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
//# sourceMappingURL=index.js.map