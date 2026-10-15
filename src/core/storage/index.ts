/**
 * GraphStore — SQLite-backed graph persistence.
 *
 * Replaces the JSON-based graph.json with indexed SQLite storage.
 * Uses sql.js (pure JS/Wasm SQLite) for portability.
 */
import initSqlJs, { type Database } from "sql.js";
import fs from "fs/promises";
import path from "path";
import type { GraphNode, GraphEdge } from "../graph/index.js";
import { SCHEMA_VERSION, CREATE_TABLES_SQL } from "./schema.js";

const DB_FILENAME = "graph.db";

export class GraphStore {
    private db: Database;
    private dbPath: string | null;

    private constructor(db: Database, dbPath: string | null) {
        this.db = db;
        this.dbPath = dbPath;
    }

    /**
     * Open or create a GraphStore at the given directory.
     * If the database file doesn't exist, it creates one with the schema.
     */
    static async open(outputDir: string): Promise<GraphStore> {
        const SQL = await initSqlJs();
        const dbPath = path.join(outputDir, DB_FILENAME);

        let db: Database;
        try {
            const buffer = await fs.readFile(dbPath);
            db = new SQL.Database(buffer);
        } catch {
            // File doesn't exist or is corrupted — create fresh
            db = new SQL.Database();
        }

        db.run(CREATE_TABLES_SQL);

        // Set schema version
        db.run(
            `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`,
            [String(SCHEMA_VERSION)]
        );

        return new GraphStore(db, dbPath);
    }

    /**
     * Create an in-memory GraphStore (for testing).
     */
    static async inMemory(): Promise<GraphStore> {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.run(CREATE_TABLES_SQL);
        db.run(
            `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`,
            [String(SCHEMA_VERSION)]
        );
        return new GraphStore(db, null);
    }

    // ──────────── Node operations ────────────

    upsertNode(node: GraphNode): void {
        this.db.run(
            `INSERT OR REPLACE INTO nodes
       (id, type, language, path, name, line_start, line_end, hash, exports, summary, tags, stale, last_indexed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                node.id,
                node.type || "file",
                node.language || "unknown",
                node.path || node.id,
                node.name || node.id,
                node.lines ? node.lines[0] : 0,
                node.lines ? node.lines[1] : 0,
                node.hash || "",
                JSON.stringify(node.exports || []),
                node.summary !== undefined ? node.summary : null,
                JSON.stringify(node.tags || []),
                node.stale ? 1 : 0,
                node.last_indexed || new Date().toISOString(),
            ]
        );
    }

    getNode(id: string): GraphNode | undefined {
        const rows = this.db.exec(
            `SELECT * FROM nodes WHERE id = ?`,
            [id]
        );
        if (rows.length === 0 || rows[0].values.length === 0) return undefined;
        return this.rowToNode(rows[0].columns, rows[0].values[0]);
    }

    hasNode(id: string): boolean {
        const rows = this.db.exec(`SELECT 1 FROM nodes WHERE id = ? LIMIT 1`, [id]);
        return rows.length > 0 && rows[0].values.length > 0;
    }

    removeNode(id: string): void {
        this.db.run(`DELETE FROM nodes WHERE id = ?`, [id]);
        this.db.run(`DELETE FROM edges WHERE source = ? OR target = ?`, [id, id]);
    }

    updateNode(id: string, updates: Partial<GraphNode>): void {
        const existing = this.getNode(id);
        if (!existing) return;
        const merged = { ...existing, ...updates };
        this.upsertNode(merged);
    }

    allNodes(): GraphNode[] {
        const rows = this.db.exec(`SELECT * FROM nodes`);
        if (rows.length === 0) return [];
        return rows[0].values.map((v) => this.rowToNode(rows[0].columns, v));
    }

    nodeCount(): number {
        const rows = this.db.exec(`SELECT COUNT(*) FROM nodes`);
        return Number(rows[0].values[0][0]);
    }

    nodesByType(type: string): GraphNode[] {
        const rows = this.db.exec(`SELECT * FROM nodes WHERE type = ?`, [type]);
        if (rows.length === 0) return [];
        return rows[0].values.map((v) => this.rowToNode(rows[0].columns, v));
    }

    staleNodes(): GraphNode[] {
        const rows = this.db.exec(`SELECT * FROM nodes WHERE stale = 1`);
        if (rows.length === 0) return [];
        return rows[0].values.map((v) => this.rowToNode(rows[0].columns, v));
    }

    markStale(id: string): void {
        this.db.run(`UPDATE nodes SET stale = 1 WHERE id = ?`, [id]);
    }

    clearStale(id: string): void {
        this.db.run(`UPDATE nodes SET stale = 0 WHERE id = ?`, [id]);
    }

    // ──────────── Embedding Storage ────────────

    /** Save a neural embedding vector for a node. */
    saveEmbedding(nodeId: string, vector: Float32Array): void {
        const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
        this.db.run(`UPDATE nodes SET embedding = ? WHERE id = ?`, [buffer, nodeId]);
    }

    /** Save embeddings for multiple nodes in a single transaction. */
    saveEmbeddings(embeddings: Map<string, Float32Array>): void {
        this.db.run("BEGIN TRANSACTION");
        try {
            for (const [nodeId, vector] of embeddings) {
                this.saveEmbedding(nodeId, vector);
            }
            this.db.run("COMMIT");
        } catch (e) {
            this.db.run("ROLLBACK");
            throw e;
        }
    }

    /** Load all stored embeddings as a Map<nodeId, Float32Array>. */
    loadEmbeddings(): Map<string, Float32Array> {
        const result = new Map<string, Float32Array>();
        const rows = this.db.exec(`SELECT id, embedding FROM nodes WHERE embedding IS NOT NULL`);
        if (rows.length > 0) {
            for (const values of rows[0].values) {
                const [id, blob] = values as [string, Uint8Array];
                if (blob && blob.byteLength > 0) {
                    result.set(id, new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
                }
            }
        }
        return result;
    }

    /** Check how many nodes have stored embeddings. */
    embeddingCount(): number {
        const rows = this.db.exec(`SELECT COUNT(*) FROM nodes WHERE embedding IS NOT NULL`);
        return rows.length > 0 ? (rows[0].values[0][0] as number) : 0;
    }

    // ──────────── Edge operations ────────────

    upsertEdge(edge: GraphEdge): void {
        this.db.run(
            `INSERT OR IGNORE INTO edges (source, target, type, via)
       VALUES (?, ?, ?, ?)`,
            [edge.source, edge.target, edge.type, edge.via || ""]
        );
    }

    allEdges(): GraphEdge[] {
        const rows = this.db.exec(`SELECT source, target, type, via FROM edges`);
        if (rows.length === 0) return [];
        return rows[0].values.map((v) => ({
            source: String(v[0]),
            target: String(v[1]),
            type: String(v[2]) as GraphEdge["type"],
            via: String(v[3]),
        }));
    }

    edgeCount(): number {
        const rows = this.db.exec(`SELECT COUNT(*) FROM edges`);
        return Number(rows[0].values[0][0]);
    }

    edgesFrom(source: string): GraphEdge[] {
        const rows = this.db.exec(
            `SELECT source, target, type, via FROM edges WHERE source = ?`,
            [source]
        );
        if (rows.length === 0) return [];
        return rows[0].values.map((v) => ({
            source: String(v[0]),
            target: String(v[1]),
            type: String(v[2]) as GraphEdge["type"],
            via: String(v[3]),
        }));
    }

    edgesTo(target: string): GraphEdge[] {
        const rows = this.db.exec(
            `SELECT source, target, type, via FROM edges WHERE target = ?`,
            [target]
        );
        if (rows.length === 0) return [];
        return rows[0].values.map((v) => ({
            source: String(v[0]),
            target: String(v[1]),
            type: String(v[2]) as GraphEdge["type"],
            via: String(v[3]),
        }));
    }

    removeEdgesFor(nodeId: string): void {
        this.db.run(`DELETE FROM edges WHERE source = ? OR target = ?`, [nodeId, nodeId]);
    }

    // ──────────── Bulk operations ────────────

    /**
     * Bulk upsert nodes and edges within a single transaction for performance.
     */
    bulkUpsert(nodes: GraphNode[], edges: GraphEdge[]): void {
        this.db.run("BEGIN TRANSACTION");
        try {
            for (const node of nodes) {
                this.upsertNode(node);
            }
            for (const edge of edges) {
                this.upsertEdge(edge);
            }
            this.db.run("COMMIT");
        } catch (err) {
            this.db.run("ROLLBACK");
            throw err;
        }
    }

    /**
     * Clear all nodes and edges.
     */
    clear(): void {
        this.db.run("DELETE FROM edges");
        this.db.run("DELETE FROM nodes");
    }

    // ──────────── Persistence ────────────

    /**
     * Save the in-memory database to disk.
     */
    async save(): Promise<void> {
        if (!this.dbPath) return; // in-memory only
        const dir = path.dirname(this.dbPath);
        await fs.mkdir(dir, { recursive: true });
        const data = this.db.export();
        await fs.writeFile(this.dbPath, Buffer.from(data));
    }

    /**
     * Get schema version.
     */
    schemaVersion(): number {
        const rows = this.db.exec(
            `SELECT value FROM meta WHERE key = 'schema_version'`
        );
        if (rows.length === 0 || rows[0].values.length === 0) return 0;
        return Number(rows[0].values[0][0]);
    }

    /**
     * Close the database.
     */
    close(): void {
        this.db.close();
    }

    // ──────────── Private helpers ────────────

    private rowToNode(columns: string[], values: unknown[]): GraphNode {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => (obj[col] = values[i]));

        return {
            id: String(obj.id),
            type: String(obj.type) as GraphNode["type"],
            language: String(obj.language) as GraphNode["language"],
            path: String(obj.path),
            name: String(obj.name),
            lines: [Number(obj.line_start), Number(obj.line_end)] as [number, number],
            hash: String(obj.hash),
            exports: JSON.parse(String(obj.exports || "[]")),
            summary: obj.summary ? String(obj.summary) : undefined,
            tags: JSON.parse(String(obj.tags || "[]")),
            stale: Number(obj.stale) === 1,
            last_indexed: String(obj.last_indexed),
        };
    }
}
