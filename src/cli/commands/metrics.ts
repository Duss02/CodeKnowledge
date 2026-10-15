/**
 * ck metrics — graph statistics and code metrics.
 */
import path from "path";
import { loadConfig } from "../../core/config/index.js";
import { loadGraph } from "../../core/graph/serializer.js";

export async function runMetrics(): Promise<void> {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const outputDir = path.resolve(cwd, config.outputDir);
    const graph = await loadGraph(outputDir);

    if (!graph) {
        console.log("No graph found. Run `ck index` first.");
        return;
    }

    const nodes = graph.nodes();
    const edges = graph.edges();

    const files = nodes.filter((n) => n.type === "file");
    const classes = nodes.filter((n) => n.type === "class");
    const functions = nodes.filter((n) => n.type === "function");
    const stale = nodes.filter((n) => n.stale);

    const importEdges = edges.filter((e) => e.type === "imports");
    const containsEdges = edges.filter((e) => e.type === "contains");
    const inheritsEdges = edges.filter((e) => e.type === "inherits");

    const languages = new Map<string, number>();
    for (const n of files) {
        languages.set(n.language, (languages.get(n.language) || 0) + 1);
    }

    const summarized = nodes.filter((n) => n.summary).length;

    console.log("\n📊 CodeKnowledge Metrics\n");
    console.log("  Nodes");
    console.log(`    Total:     ${nodes.length}`);
    console.log(`    Files:     ${files.length}`);
    console.log(`    Classes:   ${classes.length}`);
    console.log(`    Functions: ${functions.length}`);
    console.log(`    Stale:     ${stale.length}`);
    console.log();
    console.log("  Edges");
    console.log(`    Total:     ${edges.length}`);
    console.log(`    Imports:   ${importEdges.length}`);
    console.log(`    Contains:  ${containsEdges.length}`);
    console.log(`    Inherits:  ${inheritsEdges.length}`);
    console.log();
    console.log("  Languages");
    for (const [lang, count] of [...languages.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${lang}: ${count} files`);
    }
    console.log();
    console.log(`  Summaries: ${summarized}/${nodes.length} (${Math.round(summarized / nodes.length * 100)}%)`);
    console.log();
}
