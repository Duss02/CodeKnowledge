import { describe, it, expect } from "vitest";
import { sha256, sha256File } from "../hash.js";

describe("sha256", () => {
    it("returns consistent hash for same input", () => {
        const hash1 = sha256("hello world");
        const hash2 = sha256("hello world");
        expect(hash1).toBe(hash2);
    });

    it("returns a 64-character hex string", () => {
        const hash = sha256("test");
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("returns different hash for different input", () => {
        const hash1 = sha256("hello");
        const hash2 = sha256("world");
        expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", () => {
        const hash = sha256("");
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        // SHA-256 of empty string is a well-known constant
        expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("handles unicode content", () => {
        const hash = sha256("こんにちは世界");
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles very long strings", () => {
        const longStr = "a".repeat(100_000);
        const hash = sha256(longStr);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe("sha256File", () => {
    it("returns consistent hash for same buffer", () => {
        const buf = Buffer.from("hello world");
        const hash1 = sha256File(buf);
        const hash2 = sha256File(buf);
        expect(hash1).toBe(hash2);
    });

    it("matches sha256 for equivalent content", () => {
        const text = "hello world";
        const hashStr = sha256(text);
        const hashBuf = sha256File(Buffer.from(text, "utf8"));
        expect(hashStr).toBe(hashBuf);
    });

    it("handles empty buffer", () => {
        const hash = sha256File(Buffer.alloc(0));
        expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });
});
