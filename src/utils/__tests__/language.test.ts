import { describe, it, expect } from "vitest";
import { detectLanguage, isSupported } from "../language.js";

describe("detectLanguage", () => {
    it("detects .ts as typescript", () => {
        expect(detectLanguage("src/foo.ts")).toBe("typescript");
    });

    it("detects .tsx as typescript", () => {
        expect(detectLanguage("components/App.tsx")).toBe("typescript");
    });

    it("detects .js as javascript", () => {
        expect(detectLanguage("lib/index.js")).toBe("javascript");
    });

    it("detects .jsx as javascript", () => {
        expect(detectLanguage("App.jsx")).toBe("javascript");
    });

    it("detects .mjs as javascript", () => {
        expect(detectLanguage("module.mjs")).toBe("javascript");
    });

    it("detects .cjs as javascript", () => {
        expect(detectLanguage("config.cjs")).toBe("javascript");
    });

    it("detects .py as python", () => {
        expect(detectLanguage("main.py")).toBe("python");
    });

    it("detects .go as go", () => {
        expect(detectLanguage("main.go")).toBe("go");
    });

    it("detects .ipynb as notebook", () => {
        expect(detectLanguage("analysis.ipynb")).toBe("notebook");
    });

    it("returns null for unsupported extensions", () => {
        expect(detectLanguage("readme.md")).toBeNull();
        expect(detectLanguage("style.css")).toBeNull();
        expect(detectLanguage("data.json")).toBeNull();
        expect(detectLanguage("image.png")).toBeNull();
    });

    it("returns null for file with no extension", () => {
        expect(detectLanguage("Makefile")).toBeNull();
    });

    it("handles uppercase extensions", () => {
        // Current implementation calls .toLowerCase() on the extension
        expect(detectLanguage("Main.TS")).toBe("typescript");
        expect(detectLanguage("App.PY")).toBe("python");
    });

    it("handles nested paths", () => {
        expect(detectLanguage("src/core/graph/index.ts")).toBe("typescript");
        expect(detectLanguage("/absolute/path/to/module.py")).toBe("python");
    });

    it("handles files with multiple dots", () => {
        expect(detectLanguage("my.component.tsx")).toBe("typescript");
        expect(detectLanguage("config.test.ts")).toBe("typescript");
    });
});

describe("isSupported", () => {
    it("returns true for supported files", () => {
        expect(isSupported("foo.ts")).toBe(true);
        expect(isSupported("bar.py")).toBe(true);
        expect(isSupported("main.go")).toBe(true);
    });

    it("returns false for unsupported files", () => {
        expect(isSupported("readme.md")).toBe(false);
        expect(isSupported("style.css")).toBe(false);
    });
});
