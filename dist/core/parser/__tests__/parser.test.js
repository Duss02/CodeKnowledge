"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const index_js_1 = require("../index.js");
(0, vitest_1.describe)("parseFile — error reporting & robustness", () => {
    let tmpDir;
    (0, vitest_1.beforeEach)(async () => {
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-parser-test-"));
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(tmpDir, { recursive: true, force: true });
    });
    // --- File not found ---
    (0, vitest_1.it)("returns file_not_found error for missing file", async () => {
        const result = await (0, index_js_1.parseFile)(path_1.default.join(tmpDir, "nonexistent.ts"), tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.edges).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_not_found");
        (0, vitest_1.expect)(result.errors[0].file).toBe("nonexistent.ts");
    });
    // --- Empty file ---
    (0, vitest_1.it)("returns file_empty error for empty file", async () => {
        const filePath = path_1.default.join(tmpDir, "empty.ts");
        await promises_1.default.writeFile(filePath, "", "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_empty");
    });
    (0, vitest_1.it)("returns file_empty for whitespace-only file", async () => {
        const filePath = path_1.default.join(tmpDir, "whitespace.ts");
        await promises_1.default.writeFile(filePath, "   \n\n  \n", "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_empty");
    });
    // --- File too large ---
    (0, vitest_1.it)("returns file_too_large error when file exceeds maxFileSizeKB", async () => {
        const filePath = path_1.default.join(tmpDir, "huge.ts");
        // Create a file slightly over 1KB
        await promises_1.default.writeFile(filePath, "x".repeat(2048), "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir, { maxFileSizeKB: 1 });
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("file_too_large");
        (0, vitest_1.expect)(result.errors[0].byteSize).toBe(2048);
    });
    (0, vitest_1.it)("allows file within size limit", async () => {
        const filePath = path_1.default.join(tmpDir, "small.ts");
        await promises_1.default.writeFile(filePath, 'export const x = 1;\n', "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir, { maxFileSizeKB: 100 });
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.nodes.length).toBeGreaterThan(0);
    });
    // --- Binary file ---
    (0, vitest_1.it)("returns binary_file error for files with null bytes", async () => {
        const filePath = path_1.default.join(tmpDir, "binary.ts");
        const buf = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]); // "Hel\0o"
        await promises_1.default.writeFile(filePath, buf);
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("binary_file");
    });
    // --- Unsupported language ---
    (0, vitest_1.it)("returns unsupported_language error for .txt file", async () => {
        const filePath = path_1.default.join(tmpDir, "notes.txt");
        await promises_1.default.writeFile(filePath, "some notes here", "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("unsupported_language");
        (0, vitest_1.expect)(result.errors[0].language).toBeNull();
    });
    (0, vitest_1.it)("returns unsupported_language for .md file", async () => {
        const filePath = path_1.default.join(tmpDir, "readme.md");
        await promises_1.default.writeFile(filePath, "# Hello", "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("unsupported_language");
    });
    // --- Generic fallback ---
    (0, vitest_1.it)("creates generic file node with genericFallback for unsupported language", async () => {
        const filePath = path_1.default.join(tmpDir, "styles.css");
        await promises_1.default.writeFile(filePath, "body { color: red; }", "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir, { genericFallback: true });
        // Should have a node even though CSS isn't supported
        (0, vitest_1.expect)(result.nodes).toHaveLength(1);
        (0, vitest_1.expect)(result.nodes[0].type).toBe("file");
        (0, vitest_1.expect)(result.nodes[0].name).toBe("styles.css");
        // Should still have an error to report
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
        (0, vitest_1.expect)(result.errors[0].reason).toBe("unsupported_language");
    });
    (0, vitest_1.it)("does not create generic node without genericFallback", async () => {
        const filePath = path_1.default.join(tmpDir, "styles.css");
        await promises_1.default.writeFile(filePath, "body { color: red; }", "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir, { genericFallback: false });
        (0, vitest_1.expect)(result.nodes).toHaveLength(0);
        (0, vitest_1.expect)(result.errors).toHaveLength(1);
    });
    // --- Successful parsing ---
    (0, vitest_1.it)("parses valid TypeScript file with no errors", async () => {
        const filePath = path_1.default.join(tmpDir, "hello.ts");
        await promises_1.default.writeFile(filePath, `export function greet(name: string): string {\n  return \`Hello, \${name}\`;\n}\n`, "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.nodes.length).toBeGreaterThanOrEqual(1);
        // Should have a file node
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode).toBeDefined();
        (0, vitest_1.expect)(fileNode.name).toBe("hello.ts");
        (0, vitest_1.expect)(fileNode.language).toBe("typescript");
    });
    (0, vitest_1.it)("parses valid JavaScript file", async () => {
        const filePath = path_1.default.join(tmpDir, "util.js");
        await promises_1.default.writeFile(filePath, 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n', "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        (0, vitest_1.expect)(result.nodes.find((n) => n.type === "file")).toBeDefined();
    });
    (0, vitest_1.it)("parses valid Python file", async () => {
        const filePath = path_1.default.join(tmpDir, "math_utils.py");
        await promises_1.default.writeFile(filePath, `def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n`, "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode).toBeDefined();
        (0, vitest_1.expect)(fileNode.language).toBe("python");
    });
    // --- Error shape validation ---
    (0, vitest_1.it)("error has all required fields", async () => {
        const result = await (0, index_js_1.parseFile)(path_1.default.join(tmpDir, "nope.ts"), tmpDir);
        const err = result.errors[0];
        (0, vitest_1.expect)(err).toHaveProperty("file");
        (0, vitest_1.expect)(err).toHaveProperty("reason");
        (0, vitest_1.expect)(err).toHaveProperty("message");
        (0, vitest_1.expect)(typeof err.file).toBe("string");
        (0, vitest_1.expect)(typeof err.reason).toBe("string");
        (0, vitest_1.expect)(typeof err.message).toBe("string");
    });
    (0, vitest_1.it)("always returns an object (never null)", async () => {
        // Missing file
        const r1 = await (0, index_js_1.parseFile)(path_1.default.join(tmpDir, "x.ts"), tmpDir);
        (0, vitest_1.expect)(r1).toBeDefined();
        (0, vitest_1.expect)(r1).toHaveProperty("nodes");
        (0, vitest_1.expect)(r1).toHaveProperty("edges");
        (0, vitest_1.expect)(r1).toHaveProperty("errors");
        // Empty file
        const empty = path_1.default.join(tmpDir, "e.ts");
        await promises_1.default.writeFile(empty, "", "utf8");
        const r2 = await (0, index_js_1.parseFile)(empty, tmpDir);
        (0, vitest_1.expect)(r2).toBeDefined();
        (0, vitest_1.expect)(r2).toHaveProperty("nodes");
    });
    // --- ParseResult structure ---
    (0, vitest_1.it)("returns correct relative path in file node", async () => {
        const subDir = path_1.default.join(tmpDir, "src", "lib");
        await promises_1.default.mkdir(subDir, { recursive: true });
        const filePath = path_1.default.join(subDir, "helper.ts");
        await promises_1.default.writeFile(filePath, 'export const x = 42;\n', "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode.path).toBe("src/lib/helper.ts");
        (0, vitest_1.expect)(fileNode.id).toBe("src/lib/helper.ts");
    });
    (0, vitest_1.it)("detects exports from TypeScript", async () => {
        const filePath = path_1.default.join(tmpDir, "exports.ts");
        await promises_1.default.writeFile(filePath, `export function foo() {}\nexport const bar = 1;\nexport class Baz {}\n`, "utf8");
        const result = await (0, index_js_1.parseFile)(filePath, tmpDir);
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode.exports).toContain("foo");
        (0, vitest_1.expect)(fileNode.exports).toContain("bar");
        (0, vitest_1.expect)(fileNode.exports).toContain("Baz");
    });
});
//# sourceMappingURL=parser.test.js.map