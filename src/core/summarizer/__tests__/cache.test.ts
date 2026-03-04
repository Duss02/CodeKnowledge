import { describe, it, expect } from "vitest";
import type { LLMSummaryResult } from "../llm.js";
import { getCached, setCached, type SummaryCache } from "../cache.js";

function makeSummaryResult(overrides: Partial<LLMSummaryResult> = {}): LLMSummaryResult {
    return {
        summary: "Test summary",
        exports: ["foo", "bar"],
        tags: ["test"],
        ...overrides,
    };
}

describe("SummaryCache — in-memory operations", () => {
    describe("getCached", () => {
        it("returns null when cache is empty", () => {
            const cache: SummaryCache = {};
            expect(getCached(cache, "src/a.ts", "hash123")).toBeNull();
        });

        it("returns null when nodeId is not in cache", () => {
            const cache: SummaryCache = {};
            setCached(cache, "src/other.ts", "hash123", makeSummaryResult());
            expect(getCached(cache, "src/a.ts", "hash123")).toBeNull();
        });

        it("returns null when hash doesn't match (file changed)", () => {
            const cache: SummaryCache = {};
            setCached(cache, "src/a.ts", "old-hash", makeSummaryResult());
            expect(getCached(cache, "src/a.ts", "new-hash")).toBeNull();
        });

        it("returns cached result when hash matches", () => {
            const cache: SummaryCache = {};
            const result = makeSummaryResult({ summary: "Cached summary" });
            setCached(cache, "src/a.ts", "hash123", result);
            const cached = getCached(cache, "src/a.ts", "hash123");
            expect(cached).not.toBeNull();
            expect(cached!.summary).toBe("Cached summary");
            expect(cached!.exports).toEqual(["foo", "bar"]);
            expect(cached!.tags).toEqual(["test"]);
        });
    });

    describe("setCached", () => {
        it("stores entry with hash and timestamp", () => {
            const cache: SummaryCache = {};
            const result = makeSummaryResult();
            setCached(cache, "src/a.ts", "hash123", result);
            expect(cache["src/a.ts"]).toBeDefined();
            expect(cache["src/a.ts"].hash).toBe("hash123");
            expect(cache["src/a.ts"].result).toEqual(result);
            expect(cache["src/a.ts"].cached_at).toBeTruthy();
        });

        it("overwrites previous entry for same nodeId", () => {
            const cache: SummaryCache = {};
            setCached(cache, "src/a.ts", "hash1", makeSummaryResult({ summary: "old" }));
            setCached(cache, "src/a.ts", "hash2", makeSummaryResult({ summary: "new" }));
            expect(cache["src/a.ts"].hash).toBe("hash2");
            expect(cache["src/a.ts"].result.summary).toBe("new");
        });
    });
});
