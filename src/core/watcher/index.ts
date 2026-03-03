import chokidar from "chokidar";
import path from "path";
import { isSupported } from "../../utils/language.js";
import { parseFile } from "../parser/index.js";
import { mergeIntoGraph } from "../graph/builder.js";
import { saveGraph, loadGraph } from "../graph/serializer.js";
import { summarizeGraph } from "../summarizer/index.js";
import { generateAllMarkdown } from "../summarizer/markdown.js";
import { invalidateIfChanged } from "./invalidator.js";
import type { CKConfig } from "../config/index.js";
import type { CodeGraph } from "../graph/index.js";
import type { Logger } from "pino";
import fs from "fs/promises";

export interface WatchOptions {
  rootDir: string;
  outputDir: string;
  config: CKConfig;
  logger: Logger;
}

export function startWatcher(opts: WatchOptions): chokidar.FSWatcher {
  const { rootDir, outputDir, config, logger } = opts;

  let graph: CodeGraph | null = null;
  let reindexQueue = new Set<string>();
  let reindexTimer: NodeJS.Timeout | null = null;

  async function ensureGraph(): Promise<CodeGraph> {
    if (!graph) {
      graph = await loadGraph(outputDir);
    }
    if (!graph) {
      throw new Error("No graph found. Run `ck index` first.");
    }
    return graph;
  }

  async function processQueue(): Promise<void> {
    if (reindexQueue.size === 0) return;

    const toProcess = [...reindexQueue];
    reindexQueue.clear();

    const g = await ensureGraph();
    const start = Date.now();

    let reindexed = 0;
    const newNodes: import("../parser/types.js").ParsedNode[] = [];
    const newEdges: import("../parser/types.js").ParsedEdge[] = [];

    for (const filePath of toProcess) {
      const result = await parseFile(filePath, rootDir);
      if (!result) continue;
      newNodes.push(...result.nodes);
      newEdges.push(...result.edges);
      reindexed++;
    }

    mergeIntoGraph(g, newNodes, newEdges);

    await summarizeGraph(g, rootDir, outputDir, config, logger);
    await saveGraph(g, outputDir);

    if (config.generateMarkdown) {
      await generateAllMarkdown(g, outputDir, rootDir);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(`Re-indexed ${reindexed} file(s) in ${elapsed}s`);
  }

  function scheduleReindex(filePath: string): void {
    reindexQueue.add(filePath);
    if (reindexTimer) clearTimeout(reindexTimer);
    reindexTimer = setTimeout(() => {
      processQueue().catch((err) =>
        logger.error({ err }, "Error during re-index")
      );
    }, 500);
  }

  const ignored = config.exclude.map((p) =>
    p.startsWith("**/") ? p : `**/${p}`
  );

  const watcher = chokidar.watch(rootDir, {
    ignored: [
      ...ignored,
      path.join(outputDir, "**"),
      "**/node_modules/**",
      "**/.git/**",
    ],
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on("change", (filePath) => {
      if (!isSupported(filePath)) return;
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
      logger.info({ path: relPath }, "File changed, scheduling re-index");
      scheduleReindex(filePath);
    })
    .on("add", (filePath) => {
      if (!isSupported(filePath)) return;
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
      logger.info({ path: relPath }, "New file detected, scheduling index");
      scheduleReindex(filePath);
    })
    .on("unlink", async (filePath) => {
      if (!isSupported(filePath)) return;
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
      logger.info({ path: relPath }, "File removed, updating graph");
      try {
        const g = await ensureGraph();
        g.removeNode(relPath);
        await saveGraph(g, outputDir);
      } catch (err) {
        logger.error({ err, path: relPath }, "Error removing node");
      }
    });

  return watcher;
}
