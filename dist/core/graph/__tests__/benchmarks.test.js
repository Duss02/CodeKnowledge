"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Performance Benchmark — CodeKnowledge vs ctags/tree-sitter baselines.
 *
 * Measures parse throughput, node/edge extraction, and SQLite I/O
 * on real open-source repos (zod, click, mux).
 *
 * Compares against `universal-ctags` when available.
 */
const vitest_1 = require("vitest");
const index_js_1 = require("../../parser/index.js");
const index_js_2 = require("../../storage/index.js");
const index_js_3 = require("../../graph/index.js");
const child_process_1 = require("child_process");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const ROOT = path_1.default.resolve(__dirname, "../../../../");
const FIXTURES = path_1.default.join(ROOT, "test-fixtures");
async function collectFiles(dir, extensions) {
    const result = [];
    async function walk(d) {
        let entries;
        try {
            entries = await promises_1.default.readdir(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const full = path_1.default.join(d, e.name);
            if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__tests__" && e.name !== "test" && e.name !== "tests" && e.name !== "__pycache__") {
                await walk(full);
            }
            else if (e.isFile() && extensions.some((ext) => e.name.endsWith(ext)) && !e.name.includes(".test.") && !e.name.includes(".spec.") && !e.name.includes("_test.")) {
                result.push(full);
            }
        }
    }
    await walk(dir);
    return result;
}
function tryCtags(dir, lang) {
    try {
        const start = performance.now();
        const output = (0, child_process_1.execSync)(`ctags -R --output-format=json --languages=${lang} --fields=+n ${dir} -f - 2>/dev/null`, { timeout: 30000, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
        const elapsed = performance.now() - start;
        const lines = output.trim().split("\n").filter(Boolean);
        return { timeMs: elapsed, symbols: lines.length };
    }
    catch {
        return null;
    }
}
async function benchmarkRepo(name, lang, repoPath, extensions, ctagsLang) {
    const files = await collectFiles(repoPath, extensions);
    // ── Parse ──
    const allNodes = [];
    const allEdges = [];
    const parseStart = performance.now();
    for (const f of files) {
        const result = await (0, index_js_1.parseFile)(f, repoPath, { maxFileSizeKB: 500 });
        allNodes.push(...result.nodes);
        allEdges.push(...result.edges);
    }
    const parseTime = performance.now() - parseStart;
    // ── SQLite write ──
    const tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), `ck-bench-${name}-`));
    const store = await index_js_2.GraphStore.open(tmpDir);
    const graphNodes = allNodes.map((n) => ({
        ...n,
        stale: false,
        last_indexed: new Date().toISOString(),
    }));
    const writeStart = performance.now();
    store.bulkUpsert(graphNodes, allEdges);
    await store.save();
    const writeTime = performance.now() - writeStart;
    store.close();
    // ── SQLite read ──
    const readStart = performance.now();
    const store2 = await index_js_2.GraphStore.open(tmpDir);
    store2.allNodes();
    store2.allEdges();
    const readTime = performance.now() - readStart;
    store2.close();
    // ── Staleness BFS ──
    const graph = new index_js_3.CodeGraph();
    for (const n of graphNodes)
        graph.addNode(n);
    for (const e of allEdges)
        graph.addEdge(e);
    const fileNodes = graph.nodes().filter((n) => n.type === "file");
    let bfsTime;
    if (fileNodes.length > 0) {
        const target = fileNodes[fileNodes.length - 1].id;
        const bfsStart = performance.now();
        graph.markStale(target, 3);
        bfsTime = performance.now() - bfsStart;
    }
    // ── ctags baseline ──
    const ctags = tryCtags(repoPath, ctagsLang);
    // Cleanup
    await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    const containsEdges = allEdges.filter((e) => e.type === "contains").length;
    return {
        repo: name,
        language: lang,
        files: files.length,
        parseTimeMs: parseTime,
        nodes: allNodes.length,
        edges: allEdges.length,
        containsEdges,
        sqliteWriteMs: writeTime,
        sqliteReadMs: readTime,
        filesPerSec: Math.round((files.length / parseTime) * 1000),
        nodesPerSec: Math.round((allNodes.length / parseTime) * 1000),
        staleBfsMs: bfsTime,
        ctagsTimeMs: ctags?.timeMs,
        ctagsSymbols: ctags?.symbols,
    };
}
(0, vitest_1.describe)("Performance Benchmarks — CodeKnowledge vs ctags", () => {
    const results = [];
    (0, vitest_1.it)("benchmark: zod (TypeScript)", async () => {
        const r = await benchmarkRepo("zod", "TypeScript", path_1.default.join(FIXTURES, "zod", "packages", "zod", "src"), [".ts"], "TypeScript");
        results.push(r);
        (0, vitest_1.expect)(r.files).toBeGreaterThan(5);
        (0, vitest_1.expect)(r.nodes).toBeGreaterThan(10);
    }, 30000);
    (0, vitest_1.it)("benchmark: click (Python)", async () => {
        const r = await benchmarkRepo("click", "Python", path_1.default.join(FIXTURES, "click", "src", "click"), [".py"], "Python");
        results.push(r);
        (0, vitest_1.expect)(r.files).toBeGreaterThan(5);
    }, 30000);
    (0, vitest_1.it)("benchmark: gorilla/mux (Go)", async () => {
        const r = await benchmarkRepo("mux", "Go", path_1.default.join(FIXTURES, "mux"), [".go"], "Go");
        results.push(r);
        (0, vitest_1.expect)(r.files).toBeGreaterThan(3);
    }, 30000);
    (0, vitest_1.it)("benchmark: self (CodeKnowledge)", async () => {
        const r = await benchmarkRepo("self", "TypeScript", path_1.default.join(ROOT, "src"), [".ts"], "TypeScript");
        results.push(r);
        (0, vitest_1.expect)(r.files).toBeGreaterThan(10);
    }, 30000);
    (0, vitest_1.it)("prints benchmark summary", () => {
        console.log("\n╔════════════════════════════════════════════════════════════════╗");
        console.log("║              CodeKnowledge Performance Benchmarks             ║");
        console.log("╚════════════════════════════════════════════════════════════════╝\n");
        for (const r of results) {
            console.log(`─── ${r.repo} (${r.language}) ─────────────────────────────`);
            console.log(`  Files:          ${r.files}`);
            console.log(`  Parse time:     ${r.parseTimeMs.toFixed(1)}ms`);
            console.log(`  Nodes:          ${r.nodes}`);
            console.log(`  Edges:          ${r.edges} (${r.containsEdges} contains)`);
            console.log(`  Throughput:     ${r.filesPerSec} files/s | ${r.nodesPerSec} nodes/s`);
            console.log(`  SQLite write:   ${r.sqliteWriteMs.toFixed(1)}ms`);
            console.log(`  SQLite read:    ${r.sqliteReadMs.toFixed(1)}ms`);
            if (r.staleBfsMs !== undefined) {
                console.log(`  Stale BFS:      ${r.staleBfsMs.toFixed(2)}ms (depth=3)`);
            }
            if (r.ctagsTimeMs !== undefined) {
                console.log(`  ctags time:     ${r.ctagsTimeMs.toFixed(1)}ms (${r.ctagsSymbols} symbols)`);
                const speedup = r.ctagsTimeMs > 0
                    ? `${(r.ctagsTimeMs / r.parseTimeMs).toFixed(1)}x`
                    : "N/A";
                console.log(`  vs ctags:       CK parse ${speedup} slower (but extracts edges + graph)`);
            }
            else {
                console.log(`  ctags:          not available`);
            }
            console.log();
        }
        (0, vitest_1.expect)(results.length).toBe(4);
    });
});
//# sourceMappingURL=benchmarks.test.js.map