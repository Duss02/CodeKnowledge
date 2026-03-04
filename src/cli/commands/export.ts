/**
 * ck export --json — structured graph export.
 */
import path from "path";
import fs from "fs/promises";
import { loadConfig } from "../../core/config/index.js";
import { loadGraph } from "../../core/graph/serializer.js";

export interface ExportOptions {
    format?: "json" | "csv";
    output?: string;
}

export async function runExport(opts: ExportOptions = {}): Promise<void> {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const outputDir = path.resolve(cwd, config.outputDir);
    const graph = await loadGraph(outputDir);

    if (!graph) {
        console.error("No graph found. Run `ck index` first.");
        return;
    }

    const data = {
        version: "2",
        generated_at: new Date().toISOString(),
        stats: {
            nodes: graph.nodeCount(),
            edges: graph.edgeCount(),
            stale: graph.staleNodes().length,
        },
        nodes: graph.nodes().map((n) => ({
            id: n.id,
            type: n.type,
            language: n.language,
            path: n.path,
            name: n.name,
            lines: n.lines,
            summary: n.summary || null,
            exports: n.exports || [],
            tags: n.tags || [],
            stale: n.stale,
        })),
        edges: graph.edges().map((e) => ({
            source: e.source,
            target: e.target,
            type: e.type,
            via: e.via,
        })),
    };

    const json = JSON.stringify(data, null, 2);

    if (opts.output) {
        await fs.writeFile(opts.output, json, "utf8");
        console.log(`Exported to ${opts.output} (${data.stats.nodes} nodes, ${data.stats.edges} edges)`);
    } else {
        console.log(json);
    }
}
