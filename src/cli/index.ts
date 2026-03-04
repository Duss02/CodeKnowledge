#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runIndex } from "./commands/index.js";
import { runQuery } from "./commands/query.js";
import { runStatus } from "./commands/status.js";
import { runWatch } from "./commands/watch.js";
import { startMcpServer } from "../mcp/server.js";
import { runDoctor } from "./commands/doctor.js";
import { runMetrics } from "./commands/metrics.js";
import { runLanguages } from "./commands/languages.js";
import { runExport } from "./commands/export.js";
import { logger } from "../utils/logger.js";

const program = new Command();

program
  .name("ck")
  .description("codeknowledge — AI-ready knowledge graph for your codebase")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold .codeknowledge/ config in current directory")
  .action(async () => {
    await runInit();
  });

program
  .command("index [paths...]")
  .description("Index a codebase and build the knowledge graph")
  .option("-f, --force", "Re-index all nodes even if unchanged")
  .option("--no-summaries", "Skip LLM summaries, graph only")
  .option("--no-markdown", "Skip SUMMARY.md generation")
  .option("--impact-depth <n>", "Staleness propagation depth (default: config value)", parseInt)
  .option("-w, --workers <n>", "Number of concurrent parse workers (default: auto)", parseInt)
  .action(async (paths: string[], opts) => {
    await runIndex(paths, {
      force: opts.force,
      noSummaries: !opts.summaries,
      noMarkdown: !opts.markdown,
      impactDepth: opts.impactDepth,
      workers: opts.workers,
    });
  });

program
  .command("query <question>")
  .alias("q")
  .description("Query the knowledge graph")
  .action(async (question: string) => {
    await runQuery(question);
  });

program
  .command("status")
  .description("Show graph statistics and stale nodes")
  .action(async () => {
    await runStatus();
  });

program
  .command("watch")
  .description("Watch for file changes and incrementally update the graph")
  .action(async () => {
    await runWatch();
  });

program
  .command("serve")
  .description("Start the MCP server on stdio (for Cursor / Claude Code integration)")
  .action(async () => {
    await startMcpServer(process.cwd());
  });

program
  .command("doctor")
  .description("Health check for codeknowledge installation and graph")
  .action(async () => {
    await runDoctor();
  });

program
  .command("metrics")
  .description("Show graph statistics: nodes, edges, languages, summaries")
  .action(async () => {
    await runMetrics();
  });

program
  .command("languages")
  .alias("langs")
  .description("Show supported languages and their parsers")
  .action(() => {
    runLanguages();
  });

program
  .command("export")
  .description("Export the knowledge graph as structured JSON")
  .option("-o, --output <file>", "Write to file instead of stdout")
  .action(async (opts) => {
    await runExport({ output: opts.output });
  });

// Suppress unhandled promise rejection noise in CLI
process.on("unhandledRejection", (err) => {
  logger.error(err, "Unhandled error");
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
