import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseFile } from "../index.js";

describe("parseFile — error reporting & robustness", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-parser-test-"));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    // --- File not found ---

    it("returns file_not_found error for missing file", async () => {
        const result = await parseFile(
            path.join(tmpDir, "nonexistent.ts"),
            tmpDir
        );
        expect(result.nodes).toHaveLength(0);
        expect(result.edges).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("file_not_found");
        expect(result.errors[0].file).toBe("nonexistent.ts");
    });

    // --- Empty file ---

    it("returns file_empty error for empty file", async () => {
        const filePath = path.join(tmpDir, "empty.ts");
        await fs.writeFile(filePath, "", "utf8");
        const result = await parseFile(filePath, tmpDir);
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("file_empty");
    });

    it("returns file_empty for whitespace-only file", async () => {
        const filePath = path.join(tmpDir, "whitespace.ts");
        await fs.writeFile(filePath, "   \n\n  \n", "utf8");
        const result = await parseFile(filePath, tmpDir);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("file_empty");
    });

    // --- File too large ---

    it("returns file_too_large error when file exceeds maxFileSizeKB", async () => {
        const filePath = path.join(tmpDir, "huge.ts");
        // Create a file slightly over 1KB
        await fs.writeFile(filePath, "x".repeat(2048), "utf8");
        const result = await parseFile(filePath, tmpDir, { maxFileSizeKB: 1 });
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("file_too_large");
        expect(result.errors[0].byteSize).toBe(2048);
    });

    it("allows file within size limit", async () => {
        const filePath = path.join(tmpDir, "small.ts");
        await fs.writeFile(filePath, 'export const x = 1;\n', "utf8");
        const result = await parseFile(filePath, tmpDir, { maxFileSizeKB: 100 });
        expect(result.errors).toHaveLength(0);
        expect(result.nodes.length).toBeGreaterThan(0);
    });

    // --- Binary file ---

    it("returns binary_file error for files with null bytes", async () => {
        const filePath = path.join(tmpDir, "binary.ts");
        const buf = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]); // "Hel\0o"
        await fs.writeFile(filePath, buf);
        const result = await parseFile(filePath, tmpDir);
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("binary_file");
    });

    // --- Unsupported language ---

    it("returns unsupported_language error for .txt file", async () => {
        const filePath = path.join(tmpDir, "notes.txt");
        await fs.writeFile(filePath, "some notes here", "utf8");
        const result = await parseFile(filePath, tmpDir);
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("unsupported_language");
        expect(result.errors[0].language).toBeNull();
    });

    it("returns unsupported_language for .md file", async () => {
        const filePath = path.join(tmpDir, "readme.md");
        await fs.writeFile(filePath, "# Hello", "utf8");
        const result = await parseFile(filePath, tmpDir);
        expect(result.errors[0].reason).toBe("unsupported_language");
    });

    // --- Generic fallback ---

    it("creates generic file node with genericFallback for unsupported language", async () => {
        const filePath = path.join(tmpDir, "styles.css");
        await fs.writeFile(filePath, "body { color: red; }", "utf8");
        const result = await parseFile(filePath, tmpDir, { genericFallback: true });
        // Should have a node even though CSS isn't supported
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].type).toBe("file");
        expect(result.nodes[0].name).toBe("styles.css");
        // Should still have an error to report
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].reason).toBe("unsupported_language");
    });

    it("does not create generic node without genericFallback", async () => {
        const filePath = path.join(tmpDir, "styles.css");
        await fs.writeFile(filePath, "body { color: red; }", "utf8");
        const result = await parseFile(filePath, tmpDir, { genericFallback: false });
        expect(result.nodes).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
    });

    // --- Successful parsing ---

    it("parses valid TypeScript file with no errors", async () => {
        const filePath = path.join(tmpDir, "hello.ts");
        await fs.writeFile(
            filePath,
            `export function greet(name: string): string {\n  return \`Hello, \${name}\`;\n}\n`,
            "utf8"
        );
        const result = await parseFile(filePath, tmpDir);
        expect(result.errors).toHaveLength(0);
        expect(result.nodes.length).toBeGreaterThanOrEqual(1);
        // Should have a file node
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode).toBeDefined();
        expect(fileNode!.name).toBe("hello.ts");
        expect(fileNode!.language).toBe("typescript");
    });

    it("parses valid JavaScript file", async () => {
        const filePath = path.join(tmpDir, "util.js");
        await fs.writeFile(filePath, 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n', "utf8");
        const result = await parseFile(filePath, tmpDir);
        expect(result.errors).toHaveLength(0);
        expect(result.nodes.find((n) => n.type === "file")).toBeDefined();
    });

    it("parses valid Python file", async () => {
        const filePath = path.join(tmpDir, "math_utils.py");
        await fs.writeFile(
            filePath,
            `def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n`,
            "utf8"
        );
        const result = await parseFile(filePath, tmpDir);
        expect(result.errors).toHaveLength(0);
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode).toBeDefined();
        expect(fileNode!.language).toBe("python");
    });

    // --- Error shape validation ---

    it("error has all required fields", async () => {
        const result = await parseFile(
            path.join(tmpDir, "nope.ts"),
            tmpDir
        );
        const err = result.errors[0];
        expect(err).toHaveProperty("file");
        expect(err).toHaveProperty("reason");
        expect(err).toHaveProperty("message");
        expect(typeof err.file).toBe("string");
        expect(typeof err.reason).toBe("string");
        expect(typeof err.message).toBe("string");
    });

    it("always returns an object (never null)", async () => {
        // Missing file
        const r1 = await parseFile(path.join(tmpDir, "x.ts"), tmpDir);
        expect(r1).toBeDefined();
        expect(r1).toHaveProperty("nodes");
        expect(r1).toHaveProperty("edges");
        expect(r1).toHaveProperty("errors");

        // Empty file
        const empty = path.join(tmpDir, "e.ts");
        await fs.writeFile(empty, "", "utf8");
        const r2 = await parseFile(empty, tmpDir);
        expect(r2).toBeDefined();
        expect(r2).toHaveProperty("nodes");
    });

    // --- ParseResult structure ---

    it("returns correct relative path in file node", async () => {
        const subDir = path.join(tmpDir, "src", "lib");
        await fs.mkdir(subDir, { recursive: true });
        const filePath = path.join(subDir, "helper.ts");
        await fs.writeFile(filePath, 'export const x = 42;\n', "utf8");
        const result = await parseFile(filePath, tmpDir);
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode!.path).toBe("src/lib/helper.ts");
        expect(fileNode!.id).toBe("src/lib/helper.ts");
    });

    it("detects exports from TypeScript", async () => {
        const filePath = path.join(tmpDir, "exports.ts");
        await fs.writeFile(
            filePath,
            `export function foo() {}\nexport const bar = 1;\nexport class Baz {}\n`,
            "utf8"
        );
        const result = await parseFile(filePath, tmpDir);
        const fileNode = result.nodes.find((n) => n.type === "file");
        expect(fileNode!.exports).toContain("foo");
        expect(fileNode!.exports).toContain("bar");
        expect(fileNode!.exports).toContain("Baz");
    });
});
