"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * T1 Integration Test — Real-world parser verification
 * These tests exercise the parser against real files and edge cases,
 * capturing actual output for the verification report.
 */
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
// Shared temp dir for all tests
let tmpDir;
(0, vitest_1.beforeAll)(async () => {
    tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-integration-"));
});
(0, vitest_1.afterAll)(async () => {
    await promises_1.default.rm(tmpDir, { recursive: true, force: true });
});
(0, vitest_1.describe)("UC1 — Parse a real TypeScript source file", () => {
    let result;
    (0, vitest_1.beforeAll)(async () => {
        // Use the actual CodeGraph source file from this project
        const rootDir = path_1.default.resolve(__dirname, "../../../../");
        const srcDir = path_1.default.join(rootDir, "src");
        const filePath = path_1.default.join(srcDir, "core/graph/index.ts");
        result = await (0, index_js_1.parseFile)(filePath, srcDir);
    });
    (0, vitest_1.it)("parses without errors", () => {
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.it)("produces file-level node with correct id", () => {
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode).toBeDefined();
        (0, vitest_1.expect)(fileNode.id).toBe("core/graph/index.ts");
        (0, vitest_1.expect)(fileNode.language).toBe("typescript");
    });
    (0, vitest_1.it)("detects CodeGraph class", () => {
        const cls = result.nodes.find((n) => n.type === "class" && n.name === "CodeGraph");
        (0, vitest_1.expect)(cls).toBeDefined();
        (0, vitest_1.expect)(cls.id).toContain("CodeGraph");
    });
    (0, vitest_1.it)("detects import edges", () => {
        (0, vitest_1.expect)(result.edges.length).toBeGreaterThan(0);
        // Should import graphology
        const hasImport = result.edges.some((e) => e.type === "imports");
        (0, vitest_1.expect)(hasImport).toBe(true);
    });
    (0, vitest_1.it)("reports exports", () => {
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode.exports.length).toBeGreaterThan(0);
    });
});
(0, vitest_1.describe)("UC2 — Parse a Python file", () => {
    let result;
    (0, vitest_1.beforeAll)(async () => {
        const pyFile = path_1.default.join(tmpDir, "example.py");
        await promises_1.default.writeFile(pyFile, `import os
from pathlib import Path

class DataProcessor:
    def __init__(self, path):
        self.path = path

    def process(self):
        return Path(self.path).read_text()

def load_config(path):
    return DataProcessor(path)
`, "utf8");
        result = await (0, index_js_1.parseFile)(pyFile, tmpDir);
    });
    (0, vitest_1.it)("parses without errors", () => {
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.it)("finds DataProcessor class", () => {
        const cls = result.nodes.find((n) => n.type === "class" && n.name === "DataProcessor");
        (0, vitest_1.expect)(cls).toBeDefined();
    });
    (0, vitest_1.it)("finds load_config function", () => {
        const fn = result.nodes.find((n) => n.type === "function" && n.name === "load_config");
        (0, vitest_1.expect)(fn).toBeDefined();
    });
});
(0, vitest_1.describe)("UC3 — Error: missing file", () => {
    (0, vitest_1.it)("returns file_not_found with structured error", async () => {
        const result = await (0, index_js_1.parseFile)(path_1.default.join(tmpDir, "does_not_exist.ts"), tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_not_found");
        (0, vitest_1.expect)(result.errors[0].file).toBe("does_not_exist.ts");
        (0, vitest_1.expect)(result.errors[0].message).toContain("not found");
    });
});
(0, vitest_1.describe)("UC4 — Error: empty file", () => {
    (0, vitest_1.it)("returns file_empty with structured error", async () => {
        const f = path_1.default.join(tmpDir, "empty.ts");
        await promises_1.default.writeFile(f, "", "utf8");
        const result = await (0, index_js_1.parseFile)(f, tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_empty");
    });
    (0, vitest_1.it)("treats whitespace-only as empty", async () => {
        const f = path_1.default.join(tmpDir, "blank.ts");
        await promises_1.default.writeFile(f, "   \n\n\t\n", "utf8");
        const result = await (0, index_js_1.parseFile)(f, tmpDir);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_empty");
    });
});
(0, vitest_1.describe)("UC5 — Error: binary file", () => {
    (0, vitest_1.it)("returns binary_file error for files with null bytes", async () => {
        const f = path_1.default.join(tmpDir, "image.ts");
        await promises_1.default.writeFile(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]));
        const result = await (0, index_js_1.parseFile)(f, tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("binary_file");
        (0, vitest_1.expect)(result.errors[0].message).toContain("null bytes");
    });
});
(0, vitest_1.describe)("UC6 — Error: unsupported language", () => {
    (0, vitest_1.it)("returns unsupported_language for .css without fallback", async () => {
        const f = path_1.default.join(tmpDir, "style.css");
        await promises_1.default.writeFile(f, "body { color: red; }", "utf8");
        const result = await (0, index_js_1.parseFile)(f, tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("unsupported_language");
    });
    (0, vitest_1.it)("returns generic file node WITH fallback enabled", async () => {
        const f = path_1.default.join(tmpDir, "style2.css");
        await promises_1.default.writeFile(f, "body { color: red; }", "utf8");
        const result = await (0, index_js_1.parseFile)(f, tmpDir, { genericFallback: true });
        (0, vitest_1.expect)(result.nodes).toHaveLength(1);
        (0, vitest_1.expect)(result.nodes[0].type).toBe("file");
        (0, vitest_1.expect)(result.nodes[0].name).toBe("style2.css");
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("unsupported_language");
    });
});
(0, vitest_1.describe)("UC7 — Error: file too large", () => {
    (0, vitest_1.it)("returns file_too_large with byte size info", async () => {
        const f = path_1.default.join(tmpDir, "huge.ts");
        await promises_1.default.writeFile(f, "x".repeat(300 * 1024), "utf8");
        const result = await (0, index_js_1.parseFile)(f, tmpDir, { maxFileSizeKB: 200 });
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_too_large");
        (0, vitest_1.expect)(result.errors[0].byteSize).toBeGreaterThan(200 * 1024);
    });
});
(0, vitest_1.describe)("UC8 — Self-index: parse all ck source files", () => {
    (0, vitest_1.it)("parses every .ts source file without errors", async () => {
        const rootDir = path_1.default.resolve(__dirname, "../../../../");
        const srcDir = path_1.default.join(rootDir, "src");
        const allFiles = [];
        async function walk(dir) {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                const full = path_1.default.join(dir, e.name);
                if (e.isDirectory() && e.name !== "__tests__" && e.name !== "node_modules")
                    await walk(full);
                else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
                    allFiles.push(full);
            }
        }
        await walk(srcDir);
        (0, vitest_1.expect)(allFiles.length).toBeGreaterThan(20); // sanity: ~30+ source files
        let totalNodes = 0;
        let totalEdges = 0;
        let totalErrors = 0;
        const failedFiles = [];
        for (const f of allFiles) {
            const r = await (0, index_js_1.parseFile)(f, srcDir);
            totalNodes += r.nodes.length;
            totalEdges += r.edges.length;
            if (r.errors.length > 0) {
                totalErrors += r.errors.length;
                failedFiles.push(`${path_1.default.relative(srcDir, f)}: ${r.errors[0].reason}`);
            }
        }
        // Report
        console.log(`  Self-index: ${allFiles.length} files, ${totalNodes} nodes, ${totalEdges} edges, ${totalErrors} errors`);
        if (failedFiles.length > 0)
            console.log(`  Failed: ${failedFiles.join(", ")}`);
        (0, vitest_1.expect)(totalErrors).toBe(0);
        (0, vitest_1.expect)(totalNodes).toBeGreaterThan(allFiles.length); // more nodes than files (classes, functions)
    });
});
//# sourceMappingURL=integration.test.js.map