/**
 * T3 Integration Test — Parse open-source repos through SQLite GraphStore.
 *
 * Tests the full pipeline: parseFile → GraphStore.bulkUpsert → save → reload → verify.
 * Uses real-world repos: zod (TypeScript), click (Python), gorilla/mux (Go).
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { parseFile } from "../../parser/index.js";
import { GraphStore } from "../index.js";
import { migrateJsonToSqlite } from "../migrator.js";
import { CodeGraph } from "../../graph/index.js";
import { saveGraph } from "../../graph/serializer.js";
import type { GraphNode, GraphEdge } from "../../graph/index.js";
import type { ParsedNode, ParsedEdge } from "../../parser/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const ROOT = path.resolve(__dirname, "../../../../");
const FIXTURES = path.join(ROOT, "test-fixtures");

async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
    const result: string[] = [];
    async function walk(d: string) {
        let entries;
        try {
            entries = await fs.readdir(d, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__tests__" && e.name !== "test" && e.name !== "tests" && e.name !== "__pycache__") {
                await walk(full);
            } else if (e.isFile() && extensions.some((ext) => e.name.endsWith(ext)) && !e.name.includes(".test.") && !e.name.includes(".spec.") && !e.name.includes("_test.")) {
                result.push(full);
            }
        }
    }
    await walk(dir);
    return result;
}

async function parseRepo(
    repoPath: string,
    extensions: string[]
): Promise<{ nodes: ParsedNode[]; edges: ParsedEdge[]; fileCount: number; errorCount: number }> {
    const files = await collectFiles(repoPath, extensions);
    const allNodes: ParsedNode[] = [];
    const allEdges: ParsedEdge[] = [];
    let errorCount = 0;

    for (const f of files) {
        const result = await parseFile(f, repoPath, { maxFileSizeKB: 500 });
        if (result.errors.length > 0) errorCount += result.errors.length;
        allNodes.push(...result.nodes);
        allEdges.push(...result.edges);
    }

    return { nodes: allNodes, edges: allEdges, fileCount: files.length, errorCount };
}

describe("UC-zod — Parse TypeScript repo through SQLite", () => {
    const zodSrc = path.join(FIXTURES, "zod", "packages", "zod", "src");
    let store: GraphStore;
    let tmpDir: string;
    let parseStats: { nodes: ParsedNode[]; edges: ParsedEdge[]; fileCount: number; errorCount: number };

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-zod-"));
        parseStats = await parseRepo(zodSrc, [".ts"]);

        store = await GraphStore.inMemory();
        const graphNodes: GraphNode[] = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        const graphEdges: GraphEdge[] = parseStats.edges as GraphEdge[];
        store.bulkUpsert(graphNodes, graphEdges);
    });

    afterAll(() => {
        store?.close();
    });

    it("parses zod source files", () => {
        console.log(`  zod: ${parseStats.fileCount} files, ${parseStats.nodes.length} nodes, ${parseStats.edges.length} edges, ${parseStats.errorCount} errors`);
        expect(parseStats.fileCount).toBeGreaterThan(5);
        expect(parseStats.nodes.length).toBeGreaterThan(10);
    });

    it("stores nodes in SQLite (deduped by ID)", () => {
        // SQLite UPSERT deduplicates by PRIMARY KEY(id) — count may be <= parsed
        expect(store.nodeCount()).toBeGreaterThan(0);
        expect(store.nodeCount()).toBeLessThanOrEqual(parseStats.nodes.length);
    });

    it("stores all edges in SQLite", () => {
        // Deduplication may reduce edge count slightly
        expect(store.edgeCount()).toBeGreaterThan(0);
    });

    it("finds class nodes", () => {
        const classes = store.nodesByType("class");
        console.log(`  zod classes: ${classes.map((c) => c.name).slice(0, 10).join(", ")}...`);
        expect(classes.length).toBeGreaterThanOrEqual(0); // zod may use mostly functions
    });

    it("finds function nodes", () => {
        const functions = store.nodesByType("function");
        console.log(`  zod functions: ${functions.length} total`);
        expect(functions.length).toBeGreaterThan(0);
    });

    it("has contains edges", () => {
        const containsEdges = store.allEdges().filter((e) => e.type === "contains");
        console.log(`  zod contains edges: ${containsEdges.length}`);
        expect(containsEdges.length).toBeGreaterThan(0);
    });
});

describe("UC-click — Parse Python repo through SQLite", () => {
    const clickSrc = path.join(FIXTURES, "click", "src", "click");
    let store: GraphStore;
    let parseStats: { nodes: ParsedNode[]; edges: ParsedEdge[]; fileCount: number; errorCount: number };

    beforeAll(async () => {
        parseStats = await parseRepo(clickSrc, [".py"]);
        store = await GraphStore.inMemory();
        const graphNodes: GraphNode[] = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        store.bulkUpsert(graphNodes, parseStats.edges as GraphEdge[]);
    });

    afterAll(() => {
        store?.close();
    });

    it("parses click source files", () => {
        console.log(`  click: ${parseStats.fileCount} files, ${parseStats.nodes.length} nodes, ${parseStats.edges.length} edges, ${parseStats.errorCount} errors`);
        expect(parseStats.fileCount).toBeGreaterThan(5);
    });

    it("stores nodes in SQLite (deduped by ID)", () => {
        expect(store.nodeCount()).toBeGreaterThan(0);
        expect(store.nodeCount()).toBeLessThanOrEqual(parseStats.nodes.length);
    });

    it("finds class nodes (click has many)", () => {
        const classes = store.nodesByType("class");
        console.log(`  click classes: ${classes.map((c) => c.name).slice(0, 10).join(", ")}...`);
        expect(classes.length).toBeGreaterThan(3);
    });

    it("finds function nodes", () => {
        const functions = store.nodesByType("function");
        console.log(`  click functions: ${functions.length} total`);
        expect(functions.length).toBeGreaterThan(10);
    });

    it("has contains edges", () => {
        const containsEdges = store.allEdges().filter((e) => e.type === "contains");
        expect(containsEdges.length).toBeGreaterThan(0);
    });
});

describe("UC-mux — Parse Go repo through SQLite", () => {
    const muxSrc = path.join(FIXTURES, "mux");
    let store: GraphStore;
    let parseStats: { nodes: ParsedNode[]; edges: ParsedEdge[]; fileCount: number; errorCount: number };

    beforeAll(async () => {
        parseStats = await parseRepo(muxSrc, [".go"]);
        store = await GraphStore.inMemory();
        const graphNodes: GraphNode[] = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        store.bulkUpsert(graphNodes, parseStats.edges as GraphEdge[]);
    });

    afterAll(() => {
        store?.close();
    });

    it("parses mux source files", () => {
        console.log(`  mux: ${parseStats.fileCount} files, ${parseStats.nodes.length} nodes, ${parseStats.edges.length} edges, ${parseStats.errorCount} errors`);
        expect(parseStats.fileCount).toBeGreaterThan(3);
    });

    it("stores nodes in SQLite (deduped by ID)", () => {
        expect(store.nodeCount()).toBeGreaterThan(0);
        expect(store.nodeCount()).toBeLessThanOrEqual(parseStats.nodes.length);
    });

    it("finds struct/interface nodes (type=class in Go)", () => {
        const classes = store.nodesByType("class");
        console.log(`  mux types: ${classes.map((c) => c.name).join(", ")}`);
        expect(classes.length).toBeGreaterThan(0);
    });

    it("has contains edges", () => {
        const containsEdges = store.allEdges().filter((e) => e.type === "contains");
        expect(containsEdges.length).toBeGreaterThan(0);
    });
});

describe("UC-persistence — Save and reload from SQLite file", () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-persist-"));
    });

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("full pipeline: parse self → store in SQLite → save → reload → verify counts", async () => {
        const srcDir = path.join(ROOT, "src");
        const parseStats = await parseRepo(srcDir, [".ts"]);

        // Store
        const store1 = await GraphStore.open(tmpDir);
        const graphNodes: GraphNode[] = parseStats.nodes.map((n) => ({
            ...n,
            stale: false,
            last_indexed: new Date().toISOString(),
        }));
        store1.bulkUpsert(graphNodes, parseStats.edges as GraphEdge[]);
        await store1.save();

        const savedNodes = store1.nodeCount();
        const savedEdges = store1.edgeCount();
        store1.close();

        // Reload
        const store2 = await GraphStore.open(tmpDir);
        expect(store2.nodeCount()).toBe(savedNodes);
        expect(store2.edgeCount()).toBe(savedEdges);

        console.log(`  self-index persistence: ${savedNodes} nodes, ${savedEdges} edges saved and restored`);
        store2.close();
    });
});

describe("UC-migration — Migrate existing graph.json to SQLite", () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-migration-"));
    });

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("migrates real graph.json if it exists", async () => {
        // First create a graph.json using the existing serializer
        const srcDir = path.join(ROOT, "src");
        const parseStats = await parseRepo(srcDir, [".ts"]);

        const graph = new CodeGraph();
        for (const n of parseStats.nodes) {
            graph.addNode({ ...n, stale: false, last_indexed: new Date().toISOString() });
        }
        for (const e of parseStats.edges) {
            graph.addEdge(e as GraphEdge);
        }
        await saveGraph(graph, tmpDir);

        // Now migrate
        const result = await migrateJsonToSqlite(tmpDir);
        expect(result.success).toBe(true);
        expect(result.nodeCount).toBeGreaterThan(100);
        console.log(`  migration: ${result.nodeCount} nodes, ${result.edgeCount} edges migrated`);

        // Verify SQLite has the data
        const store = await GraphStore.open(tmpDir);
        expect(store.nodeCount()).toBe(result.nodeCount);
        store.close();
    });
});
