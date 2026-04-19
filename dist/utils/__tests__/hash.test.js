"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const hash_js_1 = require("../hash.js");
(0, vitest_1.describe)("sha256", () => {
    (0, vitest_1.it)("returns consistent hash for same input", () => {
        const hash1 = (0, hash_js_1.sha256)("hello world");
        const hash2 = (0, hash_js_1.sha256)("hello world");
        (0, vitest_1.expect)(hash1).toBe(hash2);
    });
    (0, vitest_1.it)("returns a 64-character hex string", () => {
        const hash = (0, hash_js_1.sha256)("test");
        (0, vitest_1.expect)(hash).toMatch(/^[a-f0-9]{64}$/);
    });
    (0, vitest_1.it)("returns different hash for different input", () => {
        const hash1 = (0, hash_js_1.sha256)("hello");
        const hash2 = (0, hash_js_1.sha256)("world");
        (0, vitest_1.expect)(hash1).not.toBe(hash2);
    });
    (0, vitest_1.it)("handles empty string", () => {
        const hash = (0, hash_js_1.sha256)("");
        (0, vitest_1.expect)(hash).toMatch(/^[a-f0-9]{64}$/);
        // SHA-256 of empty string is a well-known constant
        (0, vitest_1.expect)(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });
    (0, vitest_1.it)("handles unicode content", () => {
        const hash = (0, hash_js_1.sha256)("こんにちは世界");
        (0, vitest_1.expect)(hash).toMatch(/^[a-f0-9]{64}$/);
    });
    (0, vitest_1.it)("handles very long strings", () => {
        const longStr = "a".repeat(100_000);
        const hash = (0, hash_js_1.sha256)(longStr);
        (0, vitest_1.expect)(hash).toMatch(/^[a-f0-9]{64}$/);
    });
});
(0, vitest_1.describe)("sha256File", () => {
    (0, vitest_1.it)("returns consistent hash for same buffer", () => {
        const buf = Buffer.from("hello world");
        const hash1 = (0, hash_js_1.sha256File)(buf);
        const hash2 = (0, hash_js_1.sha256File)(buf);
        (0, vitest_1.expect)(hash1).toBe(hash2);
    });
    (0, vitest_1.it)("matches sha256 for equivalent content", () => {
        const text = "hello world";
        const hashStr = (0, hash_js_1.sha256)(text);
        const hashBuf = (0, hash_js_1.sha256File)(Buffer.from(text, "utf8"));
        (0, vitest_1.expect)(hashStr).toBe(hashBuf);
    });
    (0, vitest_1.it)("handles empty buffer", () => {
        const hash = (0, hash_js_1.sha256File)(Buffer.alloc(0));
        (0, vitest_1.expect)(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });
});
//# sourceMappingURL=hash.test.js.map