"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGo = parseGo;
const tree_sitter_1 = __importDefault(require("tree-sitter"));
const tree_sitter_go_1 = __importDefault(require("tree-sitter-go"));
const path_1 = __importDefault(require("path"));
const hash_js_1 = require("../../utils/hash.js");
function makeFileId(filePath, rootDir) {
    return path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
}
function visitNode(node, ctx, depth = 0) {
    switch (node.type) {
        case "import_declaration":
        case "import_spec_list": {
            handleImport(node, ctx);
            break;
        }
        case "type_declaration": {
            handleTypeDecl(node, ctx);
            break;
        }
        case "function_declaration":
        case "method_declaration": {
            handleFunction(node, ctx);
            break;
        }
    }
    for (const child of node.children) {
        visitNode(child, ctx, depth + 1);
    }
}
function handleImport(node, ctx) {
    // Go imports are absolute paths to packages — we note them but can't resolve to local files without module info
    // Only handle local (./...) imports for edge creation
    for (const child of node.children) {
        if (child.type === "import_spec") {
            const pathNode = child.children.find((c) => c.type === "interpreted_string_literal" || c.type === "raw_string_literal");
            if (!pathNode)
                continue;
            const importPath = pathNode.text.slice(1, -1);
            if (importPath.startsWith("./") || importPath.startsWith("../")) {
                const dir = path_1.default.dirname(ctx.filePath);
                const resolved = path_1.default.resolve(dir, importPath);
                const target = path_1.default.relative(ctx.rootDir, resolved).replace(/\\/g, "/");
                ctx.edges.push({
                    source: ctx.fileId,
                    target,
                    type: "imports",
                    via: `import "${importPath}"`,
                });
            }
        }
    }
}
function handleTypeDecl(node, ctx) {
    const spec = node.children.find((c) => c.type === "type_spec");
    if (!spec)
        return;
    const nameNode = spec.children.find((c) => c.type === "type_identifier");
    const bodyNode = spec.children.find((c) => c.type === "struct_type" || c.type === "interface_type");
    if (!nameNode || !bodyNode)
        return;
    const typeName = nameNode.text;
    const typeId = `${ctx.fileId}#${typeName}`;
    // Exported in Go = starts with uppercase
    if (/^[A-Z]/.test(typeName))
        ctx.fileExports.push(typeName);
    ctx.nodes.push({
        id: typeId,
        type: "class",
        language: "go",
        path: ctx.fileId,
        name: typeName,
        lines: [node.startPosition.row + 1, node.endPosition.row + 1],
        hash: (0, hash_js_1.sha256)(node.text),
        exports: [],
    });
}
function handleFunction(node, ctx) {
    const nameNode = node.children.find((c) => c.type === "identifier" || c.type === "field_identifier");
    if (!nameNode)
        return;
    const fnName = nameNode.text;
    if (!/^[A-Z]/.test(fnName))
        return; // only exported functions
    const fnId = `${ctx.fileId}#${fnName}`;
    ctx.fileExports.push(fnName);
    ctx.nodes.push({
        id: fnId,
        type: "function",
        language: "go",
        path: ctx.fileId,
        name: fnName,
        lines: [node.startPosition.row + 1, node.endPosition.row + 1],
        hash: (0, hash_js_1.sha256)(node.text),
        exports: [],
    });
}
function parseGo(filePath, content, rootDir) {
    const parser = new tree_sitter_1.default();
    parser.setLanguage(tree_sitter_go_1.default);
    const tree = parser.parse(content);
    const fileId = makeFileId(filePath, rootDir);
    const hash = (0, hash_js_1.sha256)(content);
    const lines = content.split("\n");
    const ctx = {
        fileId,
        filePath,
        rootDir,
        content,
        hash,
        nodes: [],
        edges: [],
        fileExports: [],
    };
    visitNode(tree.rootNode, ctx);
    ctx.nodes.unshift({
        id: fileId,
        type: "file",
        language: "go",
        path: fileId,
        name: path_1.default.basename(filePath),
        lines: [1, lines.length],
        hash,
        exports: [...new Set(ctx.fileExports)],
    });
    return { nodes: ctx.nodes, edges: ctx.edges };
}
//# sourceMappingURL=go.js.map