"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cache_js_1 = require("../cache.js");
function makeSummaryResult(overrides = {}) {
    return {
        summary: "Test summary",
        exports: ["foo", "bar"],
        tags: ["test"],
        ...overrides,
    };
}
(0, vitest_1.describe)("SummaryCache — in-memory operations", () => {
    (0, vitest_1.describe)("getCached", () => {
        (0, vitest_1.it)("returns null when cache is empty", () => {
            const cache = {};
            (0, vitest_1.expect)((0, cache_js_1.getCached)(cache, "src/a.ts", "hash123")).toBeNull();
        });
        (0, vitest_1.it)("returns null when nodeId is not in cache", () => {
            const cache = {};
            (0, cache_js_1.setCached)(cache, "src/other.ts", "hash123", makeSummaryResult());
            (0, vitest_1.expect)((0, cache_js_1.getCached)(cache, "src/a.ts", "hash123")).toBeNull();
        });
        (0, vitest_1.it)("returns null when hash doesn't match (file changed)", () => {
            const cache = {};
            (0, cache_js_1.setCached)(cache, "src/a.ts", "old-hash", makeSummaryResult());
            (0, vitest_1.expect)((0, cache_js_1.getCached)(cache, "src/a.ts", "new-hash")).toBeNull();
        });
        (0, vitest_1.it)("returns cached result when hash matches", () => {
            const cache = {};
            const result = makeSummaryResult({ summary: "Cached summary" });
            (0, cache_js_1.setCached)(cache, "src/a.ts", "hash123", result);
            const cached = (0, cache_js_1.getCached)(cache, "src/a.ts", "hash123");
            (0, vitest_1.expect)(cached).not.toBeNull();
            (0, vitest_1.expect)(cached.summary).toBe("Cached summary");
            (0, vitest_1.expect)(cached.exports).toEqual(["foo", "bar"]);
            (0, vitest_1.expect)(cached.tags).toEqual(["test"]);
        });
    });
    (0, vitest_1.describe)("setCached", () => {
        (0, vitest_1.it)("stores entry with hash and timestamp", () => {
            const cache = {};
            const result = makeSummaryResult();
            (0, cache_js_1.setCached)(cache, "src/a.ts", "hash123", result);
            (0, vitest_1.expect)(cache["src/a.ts"]).toBeDefined();
            (0, vitest_1.expect)(cache["src/a.ts"].hash).toBe("hash123");
            (0, vitest_1.expect)(cache["src/a.ts"].result).toEqual(result);
            (0, vitest_1.expect)(cache["src/a.ts"].cached_at).toBeTruthy();
        });
        (0, vitest_1.it)("overwrites previous entry for same nodeId", () => {
            const cache = {};
            (0, cache_js_1.setCached)(cache, "src/a.ts", "hash1", makeSummaryResult({ summary: "old" }));
            (0, cache_js_1.setCached)(cache, "src/a.ts", "hash2", makeSummaryResult({ summary: "new" }));
            (0, vitest_1.expect)(cache["src/a.ts"].hash).toBe("hash2");
            (0, vitest_1.expect)(cache["src/a.ts"].result.summary).toBe("new");
        });
    });
});
//# sourceMappingURL=cache.test.js.map