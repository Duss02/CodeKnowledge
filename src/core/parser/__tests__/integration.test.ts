/**
 * T1 Integration Test — Real-world parser verification
 * These tests exercise the parser against real files and edge cases,
 * capturing actual output for the verification report.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseFile } from "../index.js";
import type { ParseResult } from "../types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Shared temp dir for all tests
let tmpDir: string;

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-integration-"));
});

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("UC1 — Parse a real TypeScript source file", () => {
    let result: ParseResult;

    beforeAll(async () => {
        // Use the actual CodeGraph source file from this project
        const rootDir = path.resolve(__dirname, "../../../../");
        const srcDir = path.join(rootDir, "src");
        const filePath = path.join(srcDir, "core/graph/index.ts");
        result = await parseFile(filePath, srcDir);
    });

    it("parses without errors", () => {
        expect(result.errors).toHaveLength(0);
    });

    it("produces file-level node with correct id", () => {
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode).toBeDefined();
        expect(fileNode!.id).toBe("core/graph/index.ts");
        expect(fileNode!.language).toBe("typescript");
    });

    it("detects CodeGraph class", () => {
        const cls = result.nodes.find(
            (n) => n.type === "class" && n.name === "CodeGraph"
        );
        expect(cls).toBeDefined();
        expect(cls!.id).toContain("CodeGraph");
    });

    it("detects import edges", () => {
        expect(result.edges.length).toBeGreaterThan(0);
        // Should import graphology
        const hasImport = result.edges.some((e) => e.type === "imports");
        expect(hasImport).toBe(true);
    });

    it("reports exports", () => {
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode!.exports.length).toBeGreaterThan(0);
    });
});

describe("UC2 — Parse a Python file", () => {
    let result: ParseResult;

    beforeAll(async () => {
        const pyFile = path.join(tmpDir, "example.py");
        await fs.writeFile(
            pyFile,
            `import os
from pathlib import Path

class DataProcessor:
    def __init__(self, path):
        self.path = path

    def process(self):
        return Path(self.path).read_text()

def load_config(path):
    return DataProcessor(path)
`,
            "utf8"
        );
        result = await parseFile(pyFile, tmpDir);
    });

    it("parses without errors", () => {
        expect(result.errors).toHaveLength(0);
    });

    it("finds DataProcessor class", () => {
        const cls = result.nodes.find(
            (n) => n.type === "class" && n.name === "DataProcessor"
        );
        expect(cls).toBeDefined();
    });

    it("finds load_config function", () => {
        const fn = result.nodes.find(
            (n) => n.type === "function" && n.name === "load_config"
        );
        expect(fn).toBeDefined();
    });
});

describe("UC3 — Error: missing file", () => {
    it("returns file_not_found with structured error", async () => {
        const result = await parseFile(
            path.join(tmpDir, "does_not_exist.ts"),
            tmpDir
        );
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("file_not_found");
        expect(result.errors[0].file).toBe("does_not_exist.ts");
        expect(result.errors[0].message).toContain("not found");
    });
});

describe("UC4 — Error: empty file", () => {
    it("returns file_empty with structured error", async () => {
        const f = path.join(tmpDir, "empty.ts");
        await fs.writeFile(f, "", "utf8");
        const result = await parseFile(f, tmpDir);
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("file_empty");
    });

    it("treats whitespace-only as empty", async () => {
        const f = path.join(tmpDir, "blank.ts");
        await fs.writeFile(f, "   \n\n\t\n", "utf8");
        const result = await parseFile(f, tmpDir);
        expect(result.errors[0].reason).toBe("file_empty");
    });
});

describe("UC5 — Error: binary file", () => {
    it("returns binary_file error for files with null bytes", async () => {
        const f = path.join(tmpDir, "image.ts");
        await fs.writeFile(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]));
        const result = await parseFile(f, tmpDir);
        expect(result.nodes).toHaveLength(0);
        expect(result.errors[0].reason).toBe("binary_file");
        expect(result.errors[0].message).toContain("null bytes");
    });
});

describe("UC6 — Error: unsupported language", () => {
    it("returns unsupported_language for .css without fallback", async () => {
        const f = path.join(tmpDir, "style.css");
        await fs.writeFile(f, "body { color: red; }", "utf8");
        const result = await parseFile(f, tmpDir);
        expect(result.nodes).toHaveLength(0);
        expect(result.errors[0].reason).toBe("unsupported_language");
    });

    it("returns generic file node WITH fallback enabled", async () => {
        const f = path.join(tmpDir, "style2.css");
        await fs.writeFile(f, "body { color: red; }", "utf8");
        const result = await parseFile(f, tmpDir, { genericFallback: true });
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].type).toBe("file");
        expect(result.nodes[0].name).toBe("style2.css");
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("unsupported_language");
    });
});

describe("UC7 — Error: file too large", () => {
    it("returns file_too_large with byte size info", async () => {
        const f = path.join(tmpDir, "huge.ts");
        await fs.writeFile(f, "x".repeat(300 * 1024), "utf8");
        const result = await parseFile(f, tmpDir, { maxFileSizeKB: 200 });
        expect(result.nodes).toHaveLength(0);
        expect(result.errors[0].reason).toBe("file_too_large");
        expect(result.errors[0].byteSize).toBeGreaterThan(200 * 1024);
    });
});

describe("UC8 — Self-index: parse all ck source files", () => {
    it("parses every .ts source file without errors", async () => {
        const rootDir = path.resolve(__dirname, "../../../../");
        const srcDir = path.join(rootDir, "src");

        const allFiles: string[] = [];
        async function walk(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory() && e.name !== "__tests__" && e.name !== "node_modules")
                    await walk(full);
                else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
                    allFiles.push(full);
            }
        }
        await walk(srcDir);

        expect(allFiles.length).toBeGreaterThan(20); // sanity: ~30+ source files

        let totalNodes = 0;
        let totalEdges = 0;
        let totalErrors = 0;
        const failedFiles: string[] = [];

        for (const f of allFiles) {
            const r = await parseFile(f, srcDir);
            totalNodes += r.nodes.length;
            totalEdges += r.edges.length;
            if (r.errors.length > 0) {
                totalErrors += r.errors.length;
                failedFiles.push(`${path.relative(srcDir, f)}: ${r.errors[0].reason}`);
            }
        }

        // Report
        console.log(`  Self-index: ${allFiles.length} files, ${totalNodes} nodes, ${totalEdges} edges, ${totalErrors} errors`);
        if (failedFiles.length > 0) console.log(`  Failed: ${failedFiles.join(", ")}`);

        expect(totalErrors).toBe(0);
        expect(totalNodes).toBeGreaterThan(allFiles.length); // more nodes than files (classes, functions)
    });
});
