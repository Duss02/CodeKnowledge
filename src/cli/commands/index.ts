import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { minimatch } from "minimatch";
import { loadConfig } from "../../core/config/index.js";
import { parseFile } from "../../core/parser/index.js";
import { buildGraph } from "../../core/graph/builder.js";
import { saveGraph, loadGraph } from "../../core/graph/serializer.js";
import { summarizeGraph } from "../../core/summarizer/index.js";
import { generateAllMarkdown } from "../../core/summarizer/markdown.js";
import { logger } from "../../utils/logger.js";
import { isSupported } from "../../utils/language.js";
import { extractNotebook } from "../../utils/notebook.js";
import type { ParsedNode, ParsedEdge } from "../../core/parser/index.js";

export interface IndexOptions {
  force?: boolean;
  noSummaries?: boolean;
  noMarkdown?: boolean;
}

async function collectFiles(
  rootDir: string,
  include: string[],
  exclude: string[],
  maxFileSizeKB: number
): Promise<string[]> {
  const allFiles: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

      // Check exclude patterns
      const isExcluded = exclude.some((pattern) => minimatch(relPath, pattern, { dot: true }));
      if (isExcluded) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (!isSupported(fullPath)) continue;

        // For notebooks, size-check against extracted code only (not raw JSON
        // which is inflated by cell outputs, base64 images, logs, etc.)
        if (fullPath.endsWith(".ipynb")) {
          try {
            const raw = await fs.readFile(fullPath, "utf8");
            const extract = extractNotebook(raw);
            if (!extract) continue;
            const codeSizeKB = Buffer.byteLength(extract.codeContent, "utf8") / 1024;
            if (codeSizeKB > maxFileSizeKB) continue;
          } catch {
            continue;
          }
        } else {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > maxFileSizeKB * 1024) continue;
          } catch {
            continue;
          }
        }

        allFiles.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return allFiles;
}

export async function runIndex(
  targetPaths: string[],
  opts: IndexOptions = {}
): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  if (opts.noSummaries) config.summaries = false;
  if (opts.noMarkdown) config.generateMarkdown = false;

  const roots = targetPaths.length > 0
    ? targetPaths.map((p) => path.resolve(cwd, p))
    : [cwd];

  const outputDir = path.resolve(cwd, config.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  logger.info(`Indexing ${roots.length} path(s)...`);

  const start = Date.now();
  const allNodes: ParsedNode[] = [];
  const allEdges: ParsedEdge[] = [];
  let fileCount = 0;
  let errorCount = 0;

  for (const rootDir of roots) {
    const files = await collectFiles(
      rootDir,
      config.include,
      config.exclude,
      config.maxFileSizeKB
    );

    logger.info(`Found ${files.length} files in ${path.relative(cwd, rootDir) || "."}`);

    for (const filePath of files) {
      try {
        const result = await parseFile(filePath, rootDir);
        if (!result) continue;

        allNodes.push(...result.nodes);
        allEdges.push(...result.edges);
        fileCount++;

        if (fileCount % 50 === 0) {
          logger.info(`Parsed ${fileCount} files...`);
        }
      } catch (err) {
        errorCount++;
        logger.warn(
          { path: path.relative(cwd, filePath), err: (err as Error).message },
          "Error parsing file, skipping"
        );
      }
    }
  }

  logger.info(`Parsed ${fileCount} files (${errorCount} errors). Building graph...`);

  const existingGraph = opts.force ? null : await loadGraph(outputDir);
  const graph = buildGraph(allNodes, allEdges, existingGraph ?? undefined);

  logger.info(
    `Graph built: ${graph.nodeCount()} nodes, ${graph.edgeCount()} edges`
  );

  // LLM summaries
  if (config.summaries) {
    await summarizeGraph(graph, roots[0] ?? cwd, outputDir, config, logger, {
      force: opts.force,
      onProgress: (current, total, nodeId) => {
        if (current % 5 === 0 || current === total) {
          logger.info(`  [${current}/${total}] ${nodeId}`);
        }
      },
    });
  }

  // Save graph
  await saveGraph(graph, outputDir);
  logger.info(`Graph saved to ${path.join(outputDir, "graph.json")}`);

  // Generate SUMMARY.md
  if (config.generateMarkdown) {
    await generateAllMarkdown(graph, outputDir, roots[0] ?? cwd);
    logger.info(`SUMMARY.md files generated in ${outputDir}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  logger.info(`\n✅ Indexed ${fileCount} files in ${elapsed}s`);
  logger.info(`   Nodes: ${graph.nodeCount()}, Edges: ${graph.edgeCount()}`);
  logger.info(`   Output: ${outputDir}`);
}
