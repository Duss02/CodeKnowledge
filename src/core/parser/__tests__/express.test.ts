/**
 * Integration test: Express.js CommonJS repository.
 * Validates that the parser correctly handles require() imports
 * and module.exports in a real-world CommonJS codebase.
 */
import { describe, it, expect } from "vitest";
import { parseFile } from "../index.js";
import type { ParsedEdge } from "../types.js";
import fs from "fs/promises";
import path from "path";

const FIXTURES = path.resolve(__dirname, "../../../../test-fixtures");
const EXPRESS_LIB = path.join(FIXTURES, "express", "lib");

async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
    const result: string[] = [];
    async function walk(d: string) {
        let entries;
        try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
                await walk(full);
            } else if (e.isFile() && extensions.some((ext) => e.name.endsWith(ext))) {
                result.push(full);
            }
        }
    }
    await walk(dir);
    return result;
}

describe("Express.js — CommonJS Integration", () => {
    it("parses Express.js lib/ with >0 edges", async () => {
        const files = await collectFiles(EXPRESS_LIB, [".js"]);
        expect(files.length).toBeGreaterThan(5);

        let totalNodes = 0;
        let totalEdges = 0;
        let importEdges = 0;
        let containsEdges = 0;
        let totalExports = 0;
        let errors = 0;

        for (const f of files) {
            const result = await parseFile(f, path.join(FIXTURES, "express"), { maxFileSizeKB: 500 });
            totalNodes += result.nodes.length;
            totalEdges += result.edges.length;
            importEdges += result.edges.filter((e) => e.type === "imports").length;
            containsEdges += result.edges.filter((e) => e.type === "contains").length;
            errors += result.errors.length;

            // Count exports
            for (const n of result.nodes) {
                if (n.type === "file" && n.exports.length > 0) {
                    totalExports += n.exports.length;
                }
            }
        }

        console.log(`  Express.js: ${files.length} files, ${totalNodes} nodes, ${totalEdges} edges`);
        console.log(`    Import edges: ${importEdges}`);
        console.log(`    Contains edges: ${containsEdges}`);
        console.log(`    Exports found: ${totalExports}`);
        console.log(`    Errors: ${errors}`);

        // CRITICAL: This was 0 before the fix
        expect(importEdges).toBeGreaterThan(0);
        expect(totalEdges).toBeGreaterThan(0);
        expect(totalExports).toBeGreaterThan(0);
        expect(totalNodes).toBeGreaterThan(10);
    }, 30000);

    it("detects imports between Express.js core files", async () => {
        // express/lib/express.js requires ./application, ./router, ./request, ./response
        const expressIndex = path.join(EXPRESS_LIB, "express.js");
        const result = await parseFile(expressIndex, path.join(FIXTURES, "express"), { maxFileSizeKB: 500 });
        const importEdges = result.edges.filter((e) => e.type === "imports");
        expect(importEdges.length).toBeGreaterThanOrEqual(3);

        const targets = importEdges.map((e) => e.target);
        console.log(`  express.js imports:`, targets);
        expect(targets.some((t) => t.includes("application"))).toBe(true);
        expect(targets.some((t) => t.includes("request"))).toBe(true);
        expect(targets.some((t) => t.includes("response"))).toBe(true);
    });

    it("detects exports from Express.js core files", async () => {
        const expressIndex = path.join(EXPRESS_LIB, "express.js");
        const result = await parseFile(expressIndex, path.join(FIXTURES, "express"), { maxFileSizeKB: 500 });
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode).toBeDefined();
        expect(fileNode!.exports.length).toBeGreaterThan(0);
        console.log(`  express.js exports:`, fileNode!.exports);
    });
});
