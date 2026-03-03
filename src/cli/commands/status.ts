import path from "path";
import fs from "fs/promises";
import { loadConfig } from "../../core/config/index.js";
import { loadGraph } from "../../core/graph/serializer.js";
import { getOverview } from "../../core/graph/query.js";
import { logger } from "../../utils/logger.js";

export async function runStatus(): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const outputDir = path.resolve(cwd, config.outputDir);

  const graph = await loadGraph(outputDir);

  if (!graph) {
    console.log("No knowledge graph found. Run `ck index` to build one.");
    return;
  }

  const overview = getOverview(graph);

  // Read graph.json metadata for generated_at
  let generatedAt = "unknown";
  try {
    const raw = await fs.readFile(path.join(outputDir, "graph.json"), "utf8");
    const data = JSON.parse(raw);
    generatedAt = data.generated_at ?? "unknown";
  } catch {}

  console.log("\n📊 codeknowledge — Graph Status\n");
  console.log(`  Last indexed:  ${generatedAt}`);
  console.log(`  Output dir:    ${outputDir}`);
  console.log();
  console.log(`  Total nodes:   ${overview.totalNodes}`);
  console.log(`  ├─ Files:      ${overview.fileCount}`);
  console.log(`  ├─ Classes:    ${overview.classCount}`);
  console.log(`  └─ Functions:  ${overview.functionCount}`);
  console.log(`  Total edges:   ${overview.totalEdges}`);
  console.log();

  const langEntries = Object.entries(overview.languages);
  if (langEntries.length > 0) {
    console.log("  Languages:");
    for (const [lang, count] of langEntries) {
      console.log(`    ${lang.padEnd(14)} ${count} nodes`);
    }
    console.log();
  }

  if (overview.staleCount > 0) {
    console.log(`  ⚠️  Stale nodes:  ${overview.staleCount} (run \`ck index\` to update)`);
    console.log();
  } else {
    console.log(`  ✅ All nodes up-to-date`);
    console.log();
  }

  if (overview.entryPoints.length > 0) {
    console.log("  Entry points (files with no incoming imports):");
    for (const ep of overview.entryPoints.slice(0, 5)) {
      console.log(`    • ${ep.id}`);
    }
    if (overview.entryPoints.length > 5) {
      console.log(`    ... and ${overview.entryPoints.length - 5} more`);
    }
    console.log();
  }
}
