import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseFilesParallel, defaultWorkerCount } from "../pool.js";
import { parseFile } from "../index.js";
import type { ParsedNode, ParsedEdge } from "../types.js";
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

describe("T6 — defaultWorkerCount", () => {
    it("returns a positive number ≤ 8", () => {
        const count = defaultWorkerCount();
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(8);
    });
});

describe("T6 — parseFilesParallel on self-index", () => {
    let files: string[];

    beforeAll(async () => {
        files = await collectFiles(path.join(ROOT, "src"), [".ts"]);
    });

    it("parses all files with workers=1 (sequential baseline)", async () => {
        const result = await parseFilesParallel(files, ROOT, { workers: 1 });
        expect(result.fileCount).toBe(files.length);
        expect(result.nodes.length).toBeGreaterThan(100);
        expect(result.edges.length).toBeGreaterThan(100);
        console.log(`  Sequential (w=1): ${result.fileCount} files, ${result.nodes.length} nodes, ${result.elapsedMs.toFixed(0)}ms`);
    }, 30000);

    it("parses all files with workers=4 (parallel)", async () => {
        const result = await parseFilesParallel(files, ROOT, { workers: 4 });
        expect(result.fileCount).toBe(files.length);
        expect(result.nodes.length).toBeGreaterThan(100);
        console.log(`  Parallel   (w=4): ${result.fileCount} files, ${result.nodes.length} nodes, ${result.elapsedMs.toFixed(0)}ms`);
    }, 30000);

    it("produces same node count regardless of worker count", async () => {
        const r1 = await parseFilesParallel(files, ROOT, { workers: 1 });
        const r4 = await parseFilesParallel(files, ROOT, { workers: 4 });
        expect(r1.nodes.length).toBe(r4.nodes.length);
        expect(r1.edges.length).toBe(r4.edges.length);
    }, 30000);

    it("reports progress callbacks", async () => {
        let progressCount = 0;
        await parseFilesParallel(files, ROOT, {
            workers: 2,
            onProgress: (done, total) => {
                progressCount++;
                expect(done).toBeLessThanOrEqual(total);
            },
        });
        expect(progressCount).toBe(files.length);
    }, 30000);
});

describe("T6 — parseFilesParallel on zod (large repo)", () => {
    it("benchmark: sequential vs parallel on 114 files", async () => {
        const zodSrc = path.join(FIXTURES, "zod", "packages", "zod", "src");
        const files = await collectFiles(zodSrc, [".ts"]);
        if (files.length === 0) {
            console.log("  zod not found, skipping");
            return;
        }

        const r1 = await parseFilesParallel(files, zodSrc, { workers: 1, maxFileSizeKB: 500 });
        const r4 = await parseFilesParallel(files, zodSrc, { workers: 4, maxFileSizeKB: 500 });
        const r8 = await parseFilesParallel(files, zodSrc, { workers: 8, maxFileSizeKB: 500 });

        console.log(`\n  ── zod (${files.length} TS files) ──`);
        console.log(`  w=1: ${r1.elapsedMs.toFixed(0)}ms (${Math.round(r1.fileCount / r1.elapsedMs * 1000)} files/s)`);
        console.log(`  w=4: ${r4.elapsedMs.toFixed(0)}ms (${Math.round(r4.fileCount / r4.elapsedMs * 1000)} files/s)`);
        console.log(`  w=8: ${r8.elapsedMs.toFixed(0)}ms (${Math.round(r8.fileCount / r8.elapsedMs * 1000)} files/s)`);
        console.log(`  Speedup (w=4): ${(r1.elapsedMs / r4.elapsedMs).toFixed(2)}x`);
        console.log(`  Speedup (w=8): ${(r1.elapsedMs / r8.elapsedMs).toFixed(2)}x`);

        // Same output regardless of workers
        expect(r1.nodes.length).toBe(r4.nodes.length);
        expect(r4.nodes.length).toBe(r8.nodes.length);
    }, 60000);
});

describe("T6 — parseFilesParallel error handling", () => {
    it("handles non-existent files gracefully", async () => {
        const result = await parseFilesParallel(
            ["/tmp/nonexistent_file_12345.ts"],
            "/tmp",
            { workers: 1 }
        );
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.nodes.length).toBe(0);
    });

    it("handles mixed valid and invalid files", async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-pool-"));
        const validFile = path.join(tmpDir, "valid.ts");
        await fs.writeFile(validFile, "export const x = 1;");

        const result = await parseFilesParallel(
            [validFile, "/tmp/nonexistent_12345.ts"],
            tmpDir,
            { workers: 2 }
        );
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.errors.length).toBeGreaterThan(0);

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
});
