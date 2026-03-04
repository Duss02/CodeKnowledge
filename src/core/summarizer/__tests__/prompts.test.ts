import { describe, it, expect } from "vitest";
import {
    buildPrompt,
    buildBatchPrompt,
    parseFileSummary,
    parseSymbolSummary,
    parseBatchResponse,
    validateExports,
    mergeExports,
    groupForBatching,
} from "../prompts.js";
import type { GraphNode } from "../../graph/index.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id: "src/auth.ts",
        type: "file",
        language: "typescript",
        path: "src/auth.ts",
        name: "auth.ts",
        lines: [1, 100] as [number, number],
        hash: "abc123",
        exports: ["AuthService", "login"],
        stale: false,
        last_indexed: new Date().toISOString(),
        ...overrides,
    };
}

// ────────── Prompt Builders ──────────

describe("T5 — buildPrompt", () => {
    it("builds file-level prompt with FILE template", () => {
        const prompt = buildPrompt("const x = 1;", makeNode(), 200);
        expect(prompt).toContain("File: src/auth.ts");
        expect(prompt).toContain("SUMMARY:");
        expect(prompt).toContain("EXPORTS:");
        expect(prompt).toContain("CLASS");
        expect(prompt).toContain("FUNC");
        expect(prompt).toContain("const x = 1;");
    });

    it("builds class-level prompt with CLASS template", () => {
        const node = makeNode({ type: "class", name: "AuthService" });
        const prompt = buildPrompt("class AuthService {}", node, 200);
        expect(prompt).toContain("Symbol: AuthService (class)");
        expect(prompt).toContain("SUMMARY:");
        expect(prompt).not.toContain("CLASS ");
        expect(prompt).not.toContain("FUNC ");
    });

    it("builds function-level prompt with FUNCTION template", () => {
        const node = makeNode({ type: "function", name: "login" });
        const prompt = buildPrompt("function login() {}", node, 200);
        expect(prompt).toContain("Symbol: login (function)");
        expect(prompt).toContain("TAGS:");
        expect(prompt).not.toContain("EXPORTS:");
    });

    it("truncates code beyond maxLines", () => {
        const code = Array(50).fill("const x = 1;").join("\n");
        const prompt = buildPrompt(code, makeNode(), 10);
        expect(prompt).toContain("(truncated)");
    });

    it("handles notebook language conversion", () => {
        const node = makeNode({ language: "notebook" as any });
        const prompt = buildPrompt("x = 1", node, 200);
        expect(prompt).toContain("python (jupyter notebook)");
    });
});

// ────────── Batch Prompt ──────────

describe("T5 — buildBatchPrompt", () => {
    it("builds batch prompt with multiple files", () => {
        const items = [
            { node: makeNode({ path: "a.ts" }), code: "const a = 1;" },
            { node: makeNode({ path: "b.ts" }), code: "const b = 2;" },
        ];
        const prompt = buildBatchPrompt(items, 200);
        expect(prompt).toContain("--- FILE: a.ts ---");
        expect(prompt).toContain("--- FILE: b.ts ---");
        expect(prompt).toContain("--- END ---");
        expect(prompt).toContain("const a = 1;");
        expect(prompt).toContain("const b = 2;");
    });
});

// ────────── Response Parsers ──────────

describe("T5 — parseSymbolSummary", () => {
    it("parses standard SUMMARY/EXPORTS/TAGS response", () => {
        const text = `SUMMARY: This module handles authentication.
EXPORTS: AuthService, login, logout
TAGS: auth, security, jwt`;
        const result = parseSymbolSummary(text);
        expect(result.summary).toBe("This module handles authentication.");
        expect(result.exports).toEqual(["AuthService", "login", "logout"]);
        expect(result.tags).toEqual(["auth", "security", "jwt"]);
    });

    it("handles missing EXPORTS section", () => {
        const text = `SUMMARY: A simple utility.
TAGS: util`;
        const result = parseSymbolSummary(text);
        expect(result.summary).toBe("A simple utility.");
        expect(result.exports).toEqual([]);
        expect(result.tags).toEqual(["util"]);
    });

    it("handles missing all sections (fallback to truncated text)", () => {
        const text = "Just some raw text about the code";
        const result = parseSymbolSummary(text);
        expect(result.summary).toBe("Just some raw text about the code");
        expect(result.exports).toEqual([]);
        expect(result.tags).toEqual([]);
    });
});

describe("T5 — parseFileSummary", () => {
    it("parses file summary with CLASS and FUNC annotations", () => {
        const text = `SUMMARY: Authentication module with login and session management.
EXPORTS: AuthService, login
TAGS: auth, security
CLASS AuthService: Handles user authentication and token management.
CLASS SessionStore: In-memory session storage with TTL.
FUNC login: Authenticates user with email/password and returns JWT.
FUNC logout: Invalidates the current session.`;

        const result = parseFileSummary(text);
        expect(result.summary).toContain("Authentication module");
        expect(result.classes["AuthService"].summary).toContain("token management");
        expect(result.classes["SessionStore"].summary).toContain("session storage");
        expect(result.functions["login"]).toContain("JWT");
        expect(result.functions["logout"]).toContain("Invalidates");
    });

    it("handles file with no classes or functions", () => {
        const text = `SUMMARY: Constants file.
EXPORTS: MAX_SIZE, DEFAULT_NAME
TAGS: constants`;
        const result = parseFileSummary(text);
        expect(Object.keys(result.classes)).toHaveLength(0);
        expect(Object.keys(result.functions)).toHaveLength(0);
    });
});

describe("T5 — parseBatchResponse", () => {
    it("parses multi-file batch response", () => {
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

        const results = parseBatchResponse(text);
        expect(results.size).toBe(2);
        expect(results.get("a.ts")?.summary).toContain("config");
        expect(results.get("b.ts")?.exports).toEqual(["createLogger"]);
    });
});

// ────────── Export Validation ──────────

describe("T5 — validateExports", () => {
    it("validates matching exports", () => {
        const result = validateExports(
            ["AuthService", "login"],
            ["AuthService", "login"]
        );
        expect(result.valid).toBe(true);
        expect(result.missingExports).toEqual([]);
        expect(result.extraExports).toEqual([]);
    });

    it("detects missing exports (AST has more than LLM)", () => {
        const result = validateExports(
            ["AuthService"],
            ["AuthService", "login", "logout"]
        );
        expect(result.valid).toBe(false);
        expect(result.missingExports).toEqual(["login", "logout"]);
    });

    it("detects extra exports (LLM hallucinated)", () => {
        const result = validateExports(
            ["AuthService", "fakeExport"],
            ["AuthService"]
        );
        expect(result.valid).toBe(false);
        expect(result.extraExports).toEqual(["fakeExport"]);
    });

    it("handles empty arrays", () => {
        expect(validateExports([], []).valid).toBe(true);
        expect(validateExports(["x"], []).missingExports).toEqual([]);
        expect(validateExports(["x"], []).extraExports).toEqual(["x"]);
    });
});

describe("T5 — mergeExports", () => {
    it("merges LLM and AST exports (AST wins, LLM adds)", () => {
        const merged = mergeExports(
            ["AuthService", "dynamicExport"],
            ["AuthService", "login"]
        );
        expect(merged).toEqual(["AuthService", "dynamicExport", "login"]);
    });

    it("deduplicates", () => {
        const merged = mergeExports(["a", "b"], ["b", "c"]);
        expect(merged).toEqual(["a", "b", "c"]);
    });
});

// ────────── Batching ──────────

describe("T5 — groupForBatching", () => {
    function makeItem(path: string, lines: number) {
        return {
            node: makeNode({ path, id: path }),
            code: Array(lines).fill("x").join("\n"),
            lineCount: lines,
        };
    }

    it("groups small files (≤50 lines) together", () => {
        const items = [
            makeItem("a.ts", 10),
            makeItem("b.ts", 15),
            makeItem("c.ts", 20),
        ];
        const batches = groupForBatching(items);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(3);
    });

    it("keeps large files as individual batches", () => {
        const items = [
            makeItem("small.ts", 10),
            makeItem("large.ts", 200),
        ];
        const batches = groupForBatching(items);
        expect(batches).toHaveLength(2);
        expect(batches[0]).toHaveLength(1); // small
        expect(batches[1]).toHaveLength(1); // large
    });

    it("splits small files when batch exceeds maxBatchLines", () => {
        const items = [
            makeItem("a.ts", 40),
            makeItem("b.ts", 40),
            makeItem("c.ts", 40),
        ];
        // Max 60 lines per batch → a+b won't fit, so split
        const batches = groupForBatching(items, 60, 5);
        expect(batches.length).toBeGreaterThan(1);
    });

    it("splits when maxBatchItems is reached", () => {
        const items = Array.from({ length: 8 }, (_, i) => makeItem(`f${i}.ts`, 5));
        const batches = groupForBatching(items, 1000, 3);
        expect(batches.length).toBe(3); // 3 + 3 + 2
    });

    it("handles empty input", () => {
        const batches = groupForBatching([]);
        expect(batches).toHaveLength(0);
    });
});
