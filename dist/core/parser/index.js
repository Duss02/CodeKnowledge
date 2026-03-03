"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFile = parseFile;
const promises_1 = __importDefault(require("fs/promises"));
const language_js_1 = require("../../utils/language.js");
const typescript_js_1 = require("./typescript.js");
const python_js_1 = require("./python.js");
const go_js_1 = require("./go.js");
__exportStar(require("./types.js"), exports);
async function parseFile(filePath, rootDir) {
    const language = (0, language_js_1.detectLanguage)(filePath);
    if (!language)
        return null;
    let content;
    try {
        content = await promises_1.default.readFile(filePath, "utf8");
    }
    catch (err) {
        return null;
    }
    if (!content.trim())
        return null;
    try {
        switch (language) {
            case "typescript":
            case "javascript":
                return (0, typescript_js_1.parseTypeScript)(filePath, content, rootDir, language);
            case "python":
                return (0, python_js_1.parsePython)(filePath, content, rootDir);
            case "go":
                return (0, go_js_1.parseGo)(filePath, content, rootDir);
            default:
                return null;
        }
    }
    catch (err) {
        return null;
    }
}
//# sourceMappingURL=index.js.map