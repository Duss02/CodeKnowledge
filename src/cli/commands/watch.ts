import path from "path";
import { loadConfig } from "../../core/config/index.js";
import { loadGraph } from "../../core/graph/serializer.js";
import { startWatcher } from "../../core/watcher/index.js";
import { logger } from "../../utils/logger.js";

export async function runWatch(): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const outputDir = path.resolve(cwd, config.outputDir);

  const graph = await loadGraph(outputDir);
  if (!graph) {
    logger.error("No graph found. Run `ck index` first.");
    process.exit(1);
  }

  logger.info("Starting watch mode... (press Ctrl+C to stop)");
  logger.info(`Watching: ${cwd}`);

  const watcher = startWatcher({
    rootDir: cwd,
    outputDir,
    config,
    logger,
  });

  process.on("SIGINT", async () => {
    logger.info("\nStopping watcher...");
    await watcher.close();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}
