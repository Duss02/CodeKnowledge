"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const language_js_1 = require("../language.js");
(0, vitest_1.describe)("detectLanguage", () => {
    (0, vitest_1.it)("detects .ts as typescript", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("src/foo.ts")).toBe("typescript");
    });
    (0, vitest_1.it)("detects .tsx as typescript", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("components/App.tsx")).toBe("typescript");
    });
    (0, vitest_1.it)("detects .js as javascript", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("lib/index.js")).toBe("javascript");
    });
    (0, vitest_1.it)("detects .jsx as javascript", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("App.jsx")).toBe("javascript");
    });
    (0, vitest_1.it)("detects .mjs as javascript", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("module.mjs")).toBe("javascript");
    });
    (0, vitest_1.it)("detects .cjs as javascript", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("config.cjs")).toBe("javascript");
    });
    (0, vitest_1.it)("detects .py as python", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("main.py")).toBe("python");
    });
    (0, vitest_1.it)("detects .go as go", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("main.go")).toBe("go");
    });
    (0, vitest_1.it)("detects .ipynb as notebook", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("analysis.ipynb")).toBe("notebook");
    });
    (0, vitest_1.it)("returns null for unsupported extensions", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("readme.md")).toBeNull();
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("style.css")).toBeNull();
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("data.json")).toBeNull();
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("image.png")).toBeNull();
    });
    (0, vitest_1.it)("returns null for file with no extension", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("Makefile")).toBeNull();
    });
    (0, vitest_1.it)("handles uppercase extensions", () => {
        // Current implementation calls .toLowerCase() on the extension
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("Main.TS")).toBe("typescript");
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("App.PY")).toBe("python");
    });
    (0, vitest_1.it)("handles nested paths", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("src/core/graph/index.ts")).toBe("typescript");
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("/absolute/path/to/module.py")).toBe("python");
    });
    (0, vitest_1.it)("handles files with multiple dots", () => {
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("my.component.tsx")).toBe("typescript");
        (0, vitest_1.expect)((0, language_js_1.detectLanguage)("config.test.ts")).toBe("typescript");
    });
});
(0, vitest_1.describe)("isSupported", () => {
    (0, vitest_1.it)("returns true for supported files", () => {
        (0, vitest_1.expect)((0, language_js_1.isSupported)("foo.ts")).toBe(true);
        (0, vitest_1.expect)((0, language_js_1.isSupported)("bar.py")).toBe(true);
        (0, vitest_1.expect)((0, language_js_1.isSupported)("main.go")).toBe(true);
    });
    (0, vitest_1.it)("returns false for unsupported files", () => {
        (0, vitest_1.expect)((0, language_js_1.isSupported)("readme.md")).toBe(false);
        (0, vitest_1.expect)((0, language_js_1.isSupported)("style.css")).toBe(false);
    });
});
//# sourceMappingURL=language.test.js.map