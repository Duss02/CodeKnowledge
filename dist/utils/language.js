"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguage = detectLanguage;
exports.isSupported = isSupported;
const EXT_MAP = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".go": "go",
    ".ipynb": "notebook",
};
function detectLanguage(filePath) {
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    return EXT_MAP[ext] ?? null;
}
function isSupported(filePath) {
    return detectLanguage(filePath) !== null;
}
//# sourceMappingURL=language.js.map