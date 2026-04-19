"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Integration test: Express.js CommonJS repository.
 * Validates that the parser correctly handles require() imports
 * and module.exports in a real-world CommonJS codebase.
 */
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const FIXTURES = path_1.default.resolve(__dirname, "../../../../test-fixtures");
const EXPRESS_LIB = path_1.default.join(FIXTURES, "express", "lib");
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
            if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
                await walk(full);
            }
            else if (e.isFile() && extensions.some((ext) => e.name.endsWith(ext))) {
                result.push(full);
            }
        }
    }
    await walk(dir);
    return result;
}
(0, vitest_1.describe)("Express.js — CommonJS Integration", () => {
    (0, vitest_1.it)("parses Express.js lib/ with >0 edges", async () => {
        const files = await collectFiles(EXPRESS_LIB, [".js"]);
        (0, vitest_1.expect)(files.length).toBeGreaterThan(5);
        let totalNodes = 0;
        let totalEdges = 0;
        let importEdges = 0;
        let containsEdges = 0;
        let totalExports = 0;
        let errors = 0;
        for (const f of files) {
            const result = await (0, index_js_1.parseFile)(f, path_1.default.join(FIXTURES, "express"), { maxFileSizeKB: 500 });
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
        (0, vitest_1.expect)(importEdges).toBeGreaterThan(0);
        (0, vitest_1.expect)(totalEdges).toBeGreaterThan(0);
        (0, vitest_1.expect)(totalExports).toBeGreaterThan(0);
        (0, vitest_1.expect)(totalNodes).toBeGreaterThan(10);
    }, 30000);
    (0, vitest_1.it)("detects imports between Express.js core files", async () => {
        // express/lib/express.js requires ./application, ./router, ./request, ./response
        const expressIndex = path_1.default.join(EXPRESS_LIB, "express.js");
        const result = await (0, index_js_1.parseFile)(expressIndex, path_1.default.join(FIXTURES, "express"), { maxFileSizeKB: 500 });
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBeGreaterThanOrEqual(3);
        const targets = importEdges.map((e) => e.target);
        console.log(`  express.js imports:`, targets);
        (0, vitest_1.expect)(targets.some((t) => t.includes("application"))).toBe(true);
        (0, vitest_1.expect)(targets.some((t) => t.includes("request"))).toBe(true);
        (0, vitest_1.expect)(targets.some((t) => t.includes("response"))).toBe(true);
    });
    (0, vitest_1.it)("detects exports from Express.js core files", async () => {
        const expressIndex = path_1.default.join(EXPRESS_LIB, "express.js");
        const result = await (0, index_js_1.parseFile)(expressIndex, path_1.default.join(FIXTURES, "express"), { maxFileSizeKB: 500 });
        const fileNode = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(fileNode).toBeDefined();
        (0, vitest_1.expect)(fileNode.exports.length).toBeGreaterThan(0);
        console.log(`  express.js exports:`, fileNode.exports);
    });
});
//# sourceMappingURL=express.test.js.map