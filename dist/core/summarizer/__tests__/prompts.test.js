"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const prompts_js_1 = require("../prompts.js");
function makeNode(overrides = {}) {
    return {
        id: "src/auth.ts",
        type: "file",
        language: "typescript",
        path: "src/auth.ts",
        name: "auth.ts",
        lines: [1, 100],
        hash: "abc123",
        exports: ["AuthService", "login"],
        stale: false,
        last_indexed: new Date().toISOString(),
        ...overrides,
    };
}
// ────────── Prompt Builders ──────────
(0, vitest_1.describe)("T5 — buildPrompt", () => {
    (0, vitest_1.it)("builds file-level prompt with FILE template", () => {
        const prompt = (0, prompts_js_1.buildPrompt)("const x = 1;", makeNode(), 200);
        (0, vitest_1.expect)(prompt).toContain("File: src/auth.ts");
        (0, vitest_1.expect)(prompt).toContain("SUMMARY:");
        (0, vitest_1.expect)(prompt).toContain("EXPORTS:");
        (0, vitest_1.expect)(prompt).toContain("CLASS");
        (0, vitest_1.expect)(prompt).toContain("FUNC");
        (0, vitest_1.expect)(prompt).toContain("const x = 1;");
    });
    (0, vitest_1.it)("builds class-level prompt with CLASS template", () => {
        const node = makeNode({ type: "class", name: "AuthService" });
        const prompt = (0, prompts_js_1.buildPrompt)("class AuthService {}", node, 200);
        (0, vitest_1.expect)(prompt).toContain("Symbol: AuthService (class)");
        (0, vitest_1.expect)(prompt).toContain("SUMMARY:");
        (0, vitest_1.expect)(prompt).not.toContain("CLASS ");
        (0, vitest_1.expect)(prompt).not.toContain("FUNC ");
    });
    (0, vitest_1.it)("builds function-level prompt with FUNCTION template", () => {
        const node = makeNode({ type: "function", name: "login" });
        const prompt = (0, prompts_js_1.buildPrompt)("function login() {}", node, 200);
        (0, vitest_1.expect)(prompt).toContain("Symbol: login (function)");
        (0, vitest_1.expect)(prompt).toContain("TAGS:");
        (0, vitest_1.expect)(prompt).not.toContain("EXPORTS:");
    });
    (0, vitest_1.it)("truncates code beyond maxLines", () => {
        const code = Array(50).fill("const x = 1;").join("\n");
        const prompt = (0, prompts_js_1.buildPrompt)(code, makeNode(), 10);
        (0, vitest_1.expect)(prompt).toContain("(truncated)");
    });
    (0, vitest_1.it)("handles notebook language conversion", () => {
        const node = makeNode({ language: "notebook" });
        const prompt = (0, prompts_js_1.buildPrompt)("x = 1", node, 200);
        (0, vitest_1.expect)(prompt).toContain("python (jupyter notebook)");
    });
});
// ────────── Batch Prompt ──────────
(0, vitest_1.describe)("T5 — buildBatchPrompt", () => {
    (0, vitest_1.it)("builds batch prompt with multiple files", () => {
        const items = [
            { node: makeNode({ path: "a.ts" }), code: "const a = 1;" },
            { node: makeNode({ path: "b.ts" }), code: "const b = 2;" },
        ];
        const prompt = (0, prompts_js_1.buildBatchPrompt)(items, 200);
        (0, vitest_1.expect)(prompt).toContain("--- FILE: a.ts ---");
        (0, vitest_1.expect)(prompt).toContain("--- FILE: b.ts ---");
        (0, vitest_1.expect)(prompt).toContain("--- END ---");
        (0, vitest_1.expect)(prompt).toContain("const a = 1;");
        (0, vitest_1.expect)(prompt).toContain("const b = 2;");
    });
});
// ────────── Response Parsers ──────────
(0, vitest_1.describe)("T5 — parseSymbolSummary", () => {
    (0, vitest_1.it)("parses standard SUMMARY/EXPORTS/TAGS response", () => {
        const text = `SUMMARY: This module handles authentication.
EXPORTS: AuthService, login, logout
TAGS: auth, security, jwt`;
        const result = (0, prompts_js_1.parseSymbolSummary)(text);
        (0, vitest_1.expect)(result.summary).toBe("This module handles authentication.");
        (0, vitest_1.expect)(result.exports).toEqual(["AuthService", "login", "logout"]);
        (0, vitest_1.expect)(result.tags).toEqual(["auth", "security", "jwt"]);
    });
    (0, vitest_1.it)("handles missing EXPORTS section", () => {
        const text = `SUMMARY: A simple utility.
TAGS: util`;
        const result = (0, prompts_js_1.parseSymbolSummary)(text);
        (0, vitest_1.expect)(result.summary).toBe("A simple utility.");
        (0, vitest_1.expect)(result.exports).toEqual([]);
        (0, vitest_1.expect)(result.tags).toEqual(["util"]);
    });
    (0, vitest_1.it)("handles missing all sections (fallback to truncated text)", () => {
        const text = "Just some raw text about the code";
        const result = (0, prompts_js_1.parseSymbolSummary)(text);
        (0, vitest_1.expect)(result.summary).toBe("Just some raw text about the code");
        (0, vitest_1.expect)(result.exports).toEqual([]);
        (0, vitest_1.expect)(result.tags).toEqual([]);
    });
});
(0, vitest_1.describe)("T5 — parseFileSummary", () => {
    (0, vitest_1.it)("parses file summary with CLASS and FUNC annotations", () => {
        const text = `SUMMARY: Authentication module with login and session management.
EXPORTS: AuthService, login
TAGS: auth, security
CLASS AuthService: Handles user authentication and token management.
CLASS SessionStore: In-memory session storage with TTL.
FUNC login: Authenticates user with email/password and returns JWT.
FUNC logout: Invalidates the current session.`;
        const result = (0, prompts_js_1.parseFileSummary)(text);
        (0, vitest_1.expect)(result.summary).toContain("Authentication module");
        (0, vitest_1.expect)(result.classes["AuthService"].summary).toContain("token management");
        (0, vitest_1.expect)(result.classes["SessionStore"].summary).toContain("session storage");
        (0, vitest_1.expect)(result.functions["login"]).toContain("JWT");
        (0, vitest_1.expect)(result.functions["logout"]).toContain("Invalidates");
    });
    (0, vitest_1.it)("handles file with no classes or functions", () => {
        const text = `SUMMARY: Constants file.
EXPORTS: MAX_SIZE, DEFAULT_NAME
TAGS: constants`;
        const result = (0, prompts_js_1.parseFileSummary)(text);
        (0, vitest_1.expect)(Object.keys(result.classes)).toHaveLength(0);
        (0, vitest_1.expect)(Object.keys(result.functions)).toHaveLength(0);
    });
});
(0, vitest_1.describe)("T5 — parseBatchResponse", () => {
    (0, vitest_1.it)("parses multi-file batch response", () => {
        const text = `--- FILE: a.ts ---
SUMMARY: Module A handles config.
EXPORTS: loadConfig
TAGS: config
--- END ---
--- FILE: b.ts ---
SUMMARY: Module B handles logging.
EXPORTS: createLogger
TAGS: logging
--- END ---`;
        const results = (0, prompts_js_1.parseBatchResponse)(text);
        (0, vitest_1.expect)(results.size).toBe(2);
        (0, vitest_1.expect)(results.get("a.ts")?.summary).toContain("config");
        (0, vitest_1.expect)(results.get("b.ts")?.exports).toEqual(["createLogger"]);
    });
});
// ────────── Export Validation ──────────
(0, vitest_1.describe)("T5 — validateExports", () => {
    (0, vitest_1.it)("validates matching exports", () => {
        const result = (0, prompts_js_1.validateExports)(["AuthService", "login"], ["AuthService", "login"]);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.missingExports).toEqual([]);
        (0, vitest_1.expect)(result.extraExports).toEqual([]);
    });
    (0, vitest_1.it)("detects missing exports (AST has more than LLM)", () => {
        const result = (0, prompts_js_1.validateExports)(["AuthService"], ["AuthService", "login", "logout"]);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.missingExports).toEqual(["login", "logout"]);
    });
    (0, vitest_1.it)("detects extra exports (LLM hallucinated)", () => {
        const result = (0, prompts_js_1.validateExports)(["AuthService", "fakeExport"], ["AuthService"]);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.extraExports).toEqual(["fakeExport"]);
    });
    (0, vitest_1.it)("handles empty arrays", () => {
        (0, vitest_1.expect)((0, prompts_js_1.validateExports)([], []).valid).toBe(true);
        (0, vitest_1.expect)((0, prompts_js_1.validateExports)(["x"], []).missingExports).toEqual([]);
        (0, vitest_1.expect)((0, prompts_js_1.validateExports)(["x"], []).extraExports).toEqual(["x"]);
    });
});
(0, vitest_1.describe)("T5 — mergeExports", () => {
    (0, vitest_1.it)("merges LLM and AST exports (AST wins, LLM adds)", () => {
        const merged = (0, prompts_js_1.mergeExports)(["AuthService", "dynamicExport"], ["AuthService", "login"]);
        (0, vitest_1.expect)(merged).toEqual(["AuthService", "dynamicExport", "login"]);
    });
    (0, vitest_1.it)("deduplicates", () => {
        const merged = (0, prompts_js_1.mergeExports)(["a", "b"], ["b", "c"]);
        (0, vitest_1.expect)(merged).toEqual(["a", "b", "c"]);
    });
});
// ────────── Batching ──────────
(0, vitest_1.describe)("T5 — groupForBatching", () => {
    function makeItem(path, lines) {
        return {
            node: makeNode({ path, id: path }),
            code: Array(lines).fill("x").join("\n"),
            lineCount: lines,
        };
    }
    (0, vitest_1.it)("groups small files (≤50 lines) together", () => {
        const items = [
            makeItem("a.ts", 10),
            makeItem("b.ts", 15),
            makeItem("c.ts", 20),
        ];
        const batches = (0, prompts_js_1.groupForBatching)(items);
        (0, vitest_1.expect)(batches).toHaveLength(1);
        (0, vitest_1.expect)(batches[0]).toHaveLength(3);
    });
    (0, vitest_1.it)("keeps large files as individual batches", () => {
        const items = [
            makeItem("small.ts", 10),
            makeItem("large.ts", 200),
        ];
        const batches = (0, prompts_js_1.groupForBatching)(items);
        (0, vitest_1.expect)(batches).toHaveLength(2);
        (0, vitest_1.expect)(batches[0]).toHaveLength(1); // small
        (0, vitest_1.expect)(batches[1]).toHaveLength(1); // large
    });
    (0, vitest_1.it)("splits small files when batch exceeds maxBatchLines", () => {
        const items = [
            makeItem("a.ts", 40),
            makeItem("b.ts", 40),
            makeItem("c.ts", 40),
        ];
        // Max 60 lines per batch → a+b won't fit, so split
        const batches = (0, prompts_js_1.groupForBatching)(items, 60, 5);
        (0, vitest_1.expect)(batches.length).toBeGreaterThan(1);
    });
    (0, vitest_1.it)("splits when maxBatchItems is reached", () => {
        const items = Array.from({ length: 8 }, (_, i) => makeItem(`f${i}.ts`, 5));
        const batches = (0, prompts_js_1.groupForBatching)(items, 1000, 3);
        (0, vitest_1.expect)(batches.length).toBe(3); // 3 + 3 + 2
    });
    (0, vitest_1.it)("handles empty input", () => {
        const batches = (0, prompts_js_1.groupForBatching)([]);
        (0, vitest_1.expect)(batches).toHaveLength(0);
    });
});
//# sourceMappingURL=prompts.test.js.map