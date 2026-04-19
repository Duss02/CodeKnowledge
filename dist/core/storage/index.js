"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphStore = void 0;
/**
 * GraphStore — SQLite-backed graph persistence.
 *
 * Replaces the JSON-based graph.json with indexed SQLite storage.
 * Uses sql.js (pure JS/Wasm SQLite) for portability.
 */
const sql_js_1 = __importDefault(require("sql.js"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const schema_js_1 = require("./schema.js");
const DB_FILENAME = "graph.db";
class GraphStore {
    db;
    dbPath;
    constructor(db, dbPath) {
        this.db = db;
        this.dbPath = dbPath;
    }
    /**
     * Open or create a GraphStore at the given directory.
     * If the database file doesn't exist, it creates one with the schema.
     */
    static async open(outputDir) {
        const SQL = await (0, sql_js_1.default)();
        const dbPath = path_1.default.join(outputDir, DB_FILENAME);
        let db;
        try {
            const buffer = await promises_1.default.readFile(dbPath);
            db = new SQL.Database(buffer);
        }
        catch {
            // File doesn't exist or is corrupted — create fresh
            db = new SQL.Database();
        }
        db.run(schema_js_1.CREATE_TABLES_SQL);
        // Set schema version
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`, [String(schema_js_1.SCHEMA_VERSION)]);
        return new GraphStore(db, dbPath);
    }
    /**
     * Create an in-memory GraphStore (for testing).
     */
    static async inMemory() {
        const SQL = await (0, sql_js_1.default)();
        const db = new SQL.Database();
        db.run(schema_js_1.CREATE_TABLES_SQL);
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`, [String(schema_js_1.SCHEMA_VERSION)]);
        return new GraphStore(db, null);
    }
    // ──────────── Node operations ────────────
    upsertNode(node) {
        this.db.run(`INSERT OR REPLACE INTO nodes
       (id, type, language, path, name, line_start, line_end, hash, exports, summary, tags, stale, last_indexed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
        ]);
    }
    getNode(id) {
        const rows = this.db.exec(`SELECT * FROM nodes WHERE id = ?`, [id]);
        if (rows.length === 0 || rows[0].values.length === 0)
            return undefined;
        return this.rowToNode(rows[0].columns, rows[0].values[0]);
    }
    hasNode(id) {
        const rows = this.db.exec(`SELECT 1 FROM nodes WHERE id = ? LIMIT 1`, [id]);
        return rows.length > 0 && rows[0].values.length > 0;
    }
    removeNode(id) {
        this.db.run(`DELETE FROM nodes WHERE id = ?`, [id]);
        this.db.run(`DELETE FROM edges WHERE source = ? OR target = ?`, [id, id]);
    }
    updateNode(id, updates) {
        const existing = this.getNode(id);
        if (!existing)
            return;
        const merged = { ...existing, ...updates };
        this.upsertNode(merged);
    }
    allNodes() {
        const rows = this.db.exec(`SELECT * FROM nodes`);
        if (rows.length === 0)
            return [];
        return rows[0].values.map((v) => this.rowToNode(rows[0].columns, v));
    }
    nodeCount() {
        const rows = this.db.exec(`SELECT COUNT(*) FROM nodes`);
        return Number(rows[0].values[0][0]);
    }
    nodesByType(type) {
        const rows = this.db.exec(`SELECT * FROM nodes WHERE type = ?`, [type]);
        if (rows.length === 0)
            return [];
        return rows[0].values.map((v) => this.rowToNode(rows[0].columns, v));
    }
    staleNodes() {
        const rows = this.db.exec(`SELECT * FROM nodes WHERE stale = 1`);
        if (rows.length === 0)
            return [];
        return rows[0].values.map((v) => this.rowToNode(rows[0].columns, v));
    }
    markStale(id) {
        this.db.run(`UPDATE nodes SET stale = 1 WHERE id = ?`, [id]);
    }
    clearStale(id) {
        this.db.run(`UPDATE nodes SET stale = 0 WHERE id = ?`, [id]);
    }
    // ──────────── Edge operations ────────────
    upsertEdge(edge) {
        this.db.run(`INSERT OR IGNORE INTO edges (source, target, type, via)
       VALUES (?, ?, ?, ?)`, [edge.source, edge.target, edge.type, edge.via || ""]);
    }
    allEdges() {
        const rows = this.db.exec(`SELECT source, target, type, via FROM edges`);
        if (rows.length === 0)
            return [];
        return rows[0].values.map((v) => ({
            source: String(v[0]),
            target: String(v[1]),
            type: String(v[2]),
            via: String(v[3]),
        }));
    }
    edgeCount() {
        const rows = this.db.exec(`SELECT COUNT(*) FROM edges`);
        return Number(rows[0].values[0][0]);
    }
    edgesFrom(source) {
        const rows = this.db.exec(`SELECT source, target, type, via FROM edges WHERE source = ?`, [source]);
        if (rows.length === 0)
            return [];
        return rows[0].values.map((v) => ({
            source: String(v[0]),
            target: String(v[1]),
            type: String(v[2]),
            via: String(v[3]),
        }));
    }
    edgesTo(target) {
        const rows = this.db.exec(`SELECT source, target, type, via FROM edges WHERE target = ?`, [target]);
        if (rows.length === 0)
            return [];
        return rows[0].values.map((v) => ({
            source: String(v[0]),
            target: String(v[1]),
            type: String(v[2]),
            via: String(v[3]),
        }));
    }
    removeEdgesFor(nodeId) {
        this.db.run(`DELETE FROM edges WHERE source = ? OR target = ?`, [nodeId, nodeId]);
    }
    // ──────────── Bulk operations ────────────
    /**
     * Bulk upsert nodes and edges within a single transaction for performance.
     */
    bulkUpsert(nodes, edges) {
        this.db.run("BEGIN TRANSACTION");
        try {
            for (const node of nodes) {
                this.upsertNode(node);
            }
            for (const edge of edges) {
                this.upsertEdge(edge);
            }
            this.db.run("COMMIT");
        }
        catch (err) {
            this.db.run("ROLLBACK");
            throw err;
        }
    }
    /**
     * Clear all nodes and edges.
     */
    clear() {
        this.db.run("DELETE FROM edges");
        this.db.run("DELETE FROM nodes");
    }
    // ──────────── Persistence ────────────
    /**
     * Save the in-memory database to disk.
     */
    async save() {
        if (!this.dbPath)
            return; // in-memory only
        const dir = path_1.default.dirname(this.dbPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        const data = this.db.export();
        await promises_1.default.writeFile(this.dbPath, Buffer.from(data));
    }
    /**
     * Get schema version.
     */
    schemaVersion() {
        const rows = this.db.exec(`SELECT value FROM meta WHERE key = 'schema_version'`);
        if (rows.length === 0 || rows[0].values.length === 0)
            return 0;
        return Number(rows[0].values[0][0]);
    }
    /**
     * Close the database.
     */
    close() {
        this.db.close();
    }
    // ──────────── Private helpers ────────────
    rowToNode(columns, values) {
        const obj = {};
        columns.forEach((col, i) => (obj[col] = values[i]));
        return {
            id: String(obj.id),
            type: String(obj.type),
            language: String(obj.language),
            path: String(obj.path),
            name: String(obj.name),
            lines: [Number(obj.line_start), Number(obj.line_end)],
            hash: String(obj.hash),
            exports: JSON.parse(String(obj.exports || "[]")),
            summary: obj.summary ? String(obj.summary) : undefined,
            tags: JSON.parse(String(obj.tags || "[]")),
            stale: Number(obj.stale) === 1,
            last_indexed: String(obj.last_indexed),
        };
    }
}
exports.GraphStore = GraphStore;
//# sourceMappingURL=index.js.map