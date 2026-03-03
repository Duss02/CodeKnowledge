"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNotebook = parseNotebook;
const path_1 = __importDefault(require("path"));
const hash_js_1 = require("../../utils/hash.js");
const notebook_js_1 = require("../../utils/notebook.js");
const python_js_1 = require("./python.js");
function makeFileId(filePath, rootDir) {
    return path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
}
function parseNotebook(filePath, rawJson, rootDir) {
    const extract = (0, notebook_js_1.extractNotebook)(rawJson);
    if (!extract)
        return null;
    const fileId = makeFileId(filePath, rootDir);
    const hash = (0, hash_js_1.sha256)(rawJson);
    const totalLines = rawJson.split("\n").length;
    const fileNode = {
        id: fileId,
        type: "file",
        language: "notebook",
        path: fileId,
        name: path_1.default.basename(filePath),
        lines: [1, totalLines],
        hash,
        exports: [],
    };
    // If there's no usable code content, return just the file node
    if (!extract.codeContent.trim()) {
        return { nodes: [fileNode], edges: [] };
    }
    // Run the Python parser on the concatenated code cells to extract
    // classes, functions, and import edges within the notebook
    let pythonResult = null;
    try {
        pythonResult = (0, python_js_1.parsePython)(filePath, extract.codeContent, rootDir);
    }
    catch {
        // If Python parsing fails (unusual syntax in cells), still return file node
    }
    if (!pythonResult) {
        return { nodes: [fileNode], edges: [] };
    }
    // Replace the Python parser's file node with our notebook file node
    // (it would have the same path but wrong hash/language)
    const otherNodes = pythonResult.nodes.filter((n) => n.type !== "file");
    // Collect exports from classes and functions found in the notebook
    const exports = otherNodes.map((n) => n.name).filter(Boolean);
    fileNode.exports = [...new Set(exports)];
    return {
        nodes: [fileNode, ...otherNodes],
        edges: pythonResult.edges,
    };
}
//# sourceMappingURL=notebook.js.map