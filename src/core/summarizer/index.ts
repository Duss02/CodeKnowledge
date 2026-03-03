import fs from "fs/promises";
import path from "path";
import { generateSummary } from "./llm.js";
import {
  loadSummaryCache,
  saveSummaryCache,
  getCached,
  setCached,
  type SummaryCache,
} from "./cache.js";
import { extractNotebook } from "../../utils/notebook.js";
import type { CodeGraph } from "../graph/index.js";
import type { CKConfig } from "../config/index.js";
import { hasApiKey } from "../config/index.js";
import type { Logger } from "pino";

/** Returns the content string to send to the LLM for a given file.
 *  For notebooks, extracts code+markdown cells instead of sending raw JSON. */
async function readContentForSummary(filePath: string): Promise<{ code: string; language: string } | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  if (path.extname(filePath).toLowerCase() === ".ipynb") {
    const extract = extractNotebook(raw);
    if (!extract || !extract.llmContent.trim()) return null;
    // Use the LLM-friendly representation (markdown headings + code blocks)
    return { code: extract.llmContent, language: "python" };
  }

  return { code: raw, language: path.extname(filePath).toLowerCase().replace(".", "") };
}

export interface SummarizerOptions {
  force?: boolean;
  onProgress?: (current: number, total: number, nodeId: string) => void;
}

export async function summarizeGraph(
  graph: CodeGraph,
  rootDir: string,
  outputDir: string,
  config: CKConfig,
  logger: Logger,
  opts: SummarizerOptions = {}
): Promise<void> {
  if (!config.summaries) {
    logger.info("Summaries disabled, skipping LLM calls");
    return;
  }

  if (!hasApiKey(config)) {
    logger.warn(
      "No API key found — skipping summaries. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable."
    );
    return;
  }

  const cache: SummaryCache = await loadSummaryCache(outputDir);

  // Only summarize file-level nodes (classes/functions get their context from the file)
  const filesToSummarize = graph
    .nodes()
    .filter((n) => n.type === "file")
    .filter((n) => opts.force || !getCached(cache, n.id, n.hash));

  if (filesToSummarize.length === 0) {
    logger.info("All summaries up-to-date (cache hit)");
    return;
  }

  const batchSize = config.summaryBatchSize ?? 5;
  logger.info(
    `Generating summaries for ${filesToSummarize.length} files (${batchSize} parallel)...`
  );

  let completed = 0;

  async function processNode(node: (typeof filesToSummarize)[0]): Promise<void> {
    const filePath = `${rootDir}/${node.path}`;

    const cached = getCached(cache, node.id, node.hash);
    if (cached && !opts.force) {
      graph.updateNode(node.id, {
        summary: cached.summary,
        tags: cached.tags,
        exports: cached.exports.length > 0 ? cached.exports : node.exports,
      });
      completed++;
      opts.onProgress?.(completed, filesToSummarize.length, node.id);
      return;
    }

    const content = await readContentForSummary(filePath);
    if (!content) {
      logger.warn({ path: node.path }, "Could not read file for summarization, skipping");
      completed++;
      return;
    }

    const effectiveLanguage = node.language === "notebook" ? "python (jupyter notebook)" : (node.language ?? "python");
    const result = await generateSummary(content.code, node.path, effectiveLanguage, config);

    if (result) {
      graph.updateNode(node.id, {
        summary: result.summary,
        tags: result.tags,
        exports: result.exports.length > 0 ? result.exports : node.exports,
        stale: false,
      });
      setCached(cache, node.id, node.hash, result);
      logger.debug({ path: node.path }, "Summary generated");
    } else {
      logger.warn({ path: node.path }, "LLM returned no result, skipping");
    }

    completed++;
    opts.onProgress?.(completed, filesToSummarize.length, node.id);

    // Save cache incrementally every 20 completions
    if (completed % 20 === 0) {
      await saveSummaryCache(cache, outputDir);
    }
  }

  // Process in batches of batchSize (parallel within each batch)
  for (let i = 0; i < filesToSummarize.length; i += batchSize) {
    const batch = filesToSummarize.slice(i, i + batchSize);
    await Promise.all(batch.map(processNode));

    const pct = Math.round((completed / filesToSummarize.length) * 100);
    logger.info(`  [${completed}/${filesToSummarize.length}] ${pct}% complete`);
  }

  await saveSummaryCache(cache, outputDir);
  logger.info(`Summaries complete: ${completed}/${filesToSummarize.length} processed`);
}
