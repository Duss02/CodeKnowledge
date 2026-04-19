"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pool_js_1 = require("../pool.js");
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
(0, vitest_1.describe)("T6 — defaultWorkerCount", () => {
    (0, vitest_1.it)("returns a positive number ≤ 8", () => {
        const count = (0, pool_js_1.defaultWorkerCount)();
        (0, vitest_1.expect)(count).toBeGreaterThan(0);
        (0, vitest_1.expect)(count).toBeLessThanOrEqual(8);
    });
});
(0, vitest_1.describe)("T6 — parseFilesParallel on self-index", () => {
    let files;
    (0, vitest_1.beforeAll)(async () => {
        files = await collectFiles(path_1.default.join(ROOT, "src"), [".ts"]);
    });
    (0, vitest_1.it)("parses all files with workers=1 (sequential baseline)", async () => {
        const result = await (0, pool_js_1.parseFilesParallel)(files, ROOT, { workers: 1 });
        (0, vitest_1.expect)(result.fileCount).toBe(files.length);
        (0, vitest_1.expect)(result.nodes.length).toBeGreaterThan(100);
        (0, vitest_1.expect)(result.edges.length).toBeGreaterThan(100);
        console.log(`  Sequential (w=1): ${result.fileCount} files, ${result.nodes.length} nodes, ${result.elapsedMs.toFixed(0)}ms`);
    }, 30000);
    (0, vitest_1.it)("parses all files with workers=4 (parallel)", async () => {
        const result = await (0, pool_js_1.parseFilesParallel)(files, ROOT, { workers: 4 });
        (0, vitest_1.expect)(result.fileCount).toBe(files.length);
        (0, vitest_1.expect)(result.nodes.length).toBeGreaterThan(100);
        console.log(`  Parallel   (w=4): ${result.fileCount} files, ${result.nodes.length} nodes, ${result.elapsedMs.toFixed(0)}ms`);
    }, 30000);
    (0, vitest_1.it)("produces same node count regardless of worker count", async () => {
        const r1 = await (0, pool_js_1.parseFilesParallel)(files, ROOT, { workers: 1 });
        const r4 = await (0, pool_js_1.parseFilesParallel)(files, ROOT, { workers: 4 });
        (0, vitest_1.expect)(r1.nodes.length).toBe(r4.nodes.length);
        (0, vitest_1.expect)(r1.edges.length).toBe(r4.edges.length);
    }, 30000);
    (0, vitest_1.it)("reports progress callbacks", async () => {
        let progressCount = 0;
        await (0, pool_js_1.parseFilesParallel)(files, ROOT, {
            workers: 2,
            onProgress: (done, total) => {
                progressCount++;
                (0, vitest_1.expect)(done).toBeLessThanOrEqual(total);
            },
        });
        (0, vitest_1.expect)(progressCount).toBe(files.length);
    }, 30000);
});
(0, vitest_1.describe)("T6 — parseFilesParallel on zod (large repo)", () => {
    (0, vitest_1.it)("benchmark: sequential vs parallel on 114 files", async () => {
        const zodSrc = path_1.default.join(FIXTURES, "zod", "packages", "zod", "src");
        const files = await collectFiles(zodSrc, [".ts"]);
        if (files.length === 0) {
            console.log("  zod not found, skipping");
            return;
        }
        const r1 = await (0, pool_js_1.parseFilesParallel)(files, zodSrc, { workers: 1, maxFileSizeKB: 500 });
        const r4 = await (0, pool_js_1.parseFilesParallel)(files, zodSrc, { workers: 4, maxFileSizeKB: 500 });
        const r8 = await (0, pool_js_1.parseFilesParallel)(files, zodSrc, { workers: 8, maxFileSizeKB: 500 });
        console.log(`\n  ── zod (${files.length} TS files) ──`);
        console.log(`  w=1: ${r1.elapsedMs.toFixed(0)}ms (${Math.round(r1.fileCount / r1.elapsedMs * 1000)} files/s)`);
        console.log(`  w=4: ${r4.elapsedMs.toFixed(0)}ms (${Math.round(r4.fileCount / r4.elapsedMs * 1000)} files/s)`);
        console.log(`  w=8: ${r8.elapsedMs.toFixed(0)}ms (${Math.round(r8.fileCount / r8.elapsedMs * 1000)} files/s)`);
        console.log(`  Speedup (w=4): ${(r1.elapsedMs / r4.elapsedMs).toFixed(2)}x`);
        console.log(`  Speedup (w=8): ${(r1.elapsedMs / r8.elapsedMs).toFixed(2)}x`);
        // Same output regardless of workers
        (0, vitest_1.expect)(r1.nodes.length).toBe(r4.nodes.length);
        (0, vitest_1.expect)(r4.nodes.length).toBe(r8.nodes.length);
    }, 60000);
});
(0, vitest_1.describe)("T6 — parseFilesParallel error handling", () => {
    (0, vitest_1.it)("handles non-existent files gracefully", async () => {
        const result = await (0, pool_js_1.parseFilesParallel)(["/tmp/nonexistent_file_12345.ts"], "/tmp", { workers: 1 });
        (0, vitest_1.expect)(result.errors.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(result.nodes.length).toBe(0);
    });
    (0, vitest_1.it)("handles mixed valid and invalid files", async () => {
        const tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-pool-"));
        const validFile = path_1.default.join(tmpDir, "valid.ts");
        await promises_1.default.writeFile(validFile, "export const x = 1;");
        const result = await (0, pool_js_1.parseFilesParallel)([validFile, "/tmp/nonexistent_12345.ts"], tmpDir, { workers: 2 });
        (0, vitest_1.expect)(result.nodes.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(result.errors.length).toBeGreaterThan(0);
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
});
//# sourceMappingURL=pool.test.js.map