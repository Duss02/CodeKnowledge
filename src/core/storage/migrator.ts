/**
 * Migrator: graph.json → SQLite (graph.db)
 *
 * Reads an existing graph.json file and imports all nodes/edges
 * into a GraphStore SQLite database.
 */
import fs from "fs/promises";
import path from "path";
import { GraphStore } from "./index.js";
import type { GraphNode, GraphEdge } from "../graph/index.js";

interface GraphJsonV1 {
    version: string;
    generated_at: string;
    nodes: Array<{
        id: string;
        type: string;
        language: string;
        path: string;
        name: string;
        lines?: [number, number];
        hash: string;
        exports?: string[];
        summary?: string;
        tags?: string[];
        stale?: boolean;
        last_indexed?: string;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type: string;
        via?: string;
    }>;
}

export interface MigrationResult {
    success: boolean;
    nodeCount: number;
    edgeCount: number;
    sourceFile: string;
    error?: string;
}

/**
 * Migrate a graph.json file to SQLite.
 * The original graph.json is NOT deleted (user can delete manually).
 */
export async function migrateJsonToSqlite(
    outputDir: string
): Promise<MigrationResult> {
    const jsonPath = path.join(outputDir, "graph.json");

    // Check if graph.json exists
    try {
        await fs.access(jsonPath);
    } catch {
        return {
            success: false,
            nodeCount: 0,
            edgeCount: 0,
            sourceFile: jsonPath,
            error: "graph.json not found",
        };
    }

    // Read and parse
    let data: GraphJsonV1;
    try {
        const raw = await fs.readFile(jsonPath, "utf8");
        data = JSON.parse(raw);
    } catch (err) {
        return {
            success: false,
            nodeCount: 0,
            edgeCount: 0,
            sourceFile: jsonPath,
            error: `Failed to parse graph.json: ${(err as Error).message}`,
        };
    }

    // Open/create SQLite store
    const store = await GraphStore.open(outputDir);

    // Map JSON nodes to GraphNode
    const nodes: GraphNode[] = data.nodes.map((n) => ({
        id: n.id,
        type: n.type as GraphNode["type"],
        language: n.language as GraphNode["language"],
        path: n.path,
        name: n.name,
        lines: (n.lines && Array.isArray(n.lines) ? n.lines : [0, 0]) as [number, number],
        hash: n.hash,
        exports: n.exports || [],
        summary: n.summary,
        tags: n.tags || [],
        stale: n.stale || false,
        last_indexed: n.last_indexed || new Date().toISOString(),
    }));

    // Map JSON edges to GraphEdge
    const edges: GraphEdge[] = data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type as GraphEdge["type"],
        via: e.via || "",
    }));

    // Bulk insert
    store.bulkUpsert(nodes, edges);
    await store.save();
    store.close();

    return {
        success: true,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        sourceFile: jsonPath,
    };
}
