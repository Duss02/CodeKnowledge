"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePython = parsePython;
const tree_sitter_1 = __importDefault(require("tree-sitter"));
const tree_sitter_python_1 = __importDefault(require("tree-sitter-python"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const hash_js_1 = require("../../utils/hash.js");
function makeFileId(filePath, rootDir) {
    return path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
}
function resolveImportTarget(modulePath, fromFile, rootDir) {
    // Relative import: from .module import X  or  from ..pkg.module import X
    if (modulePath.startsWith(".")) {
        const dir = path_1.default.dirname(fromFile);
        const stripped = modulePath.replace(/^\.+/, "");
        // Count leading dots to determine how many dirs to go up
        const dots = modulePath.match(/^\.+/)?.[0].length ?? 1;
        let base = dir;
        for (let i = 1; i < dots; i++)
            base = path_1.default.dirname(base);
        const parts = stripped ? stripped.split(".") : [];
        const resolved = parts.length > 0 ? path_1.default.resolve(base, ...parts) : base;
        const rel = path_1.default.relative(rootDir, resolved).replace(/\\/g, "/");
        // Could be a module file or a package __init__
        const asFile = rel + ".py";
        const asInit = rel + "/__init__.py";
        if (fs_1.default.existsSync(path_1.default.join(rootDir, asFile)))
            return asFile;
        if (fs_1.default.existsSync(path_1.default.join(rootDir, asInit)))
            return asInit;
        return asFile; // best effort even if not found
    }
    // Absolute import: from Recommenders.BaseRecommender import X
    // Try resolving as a path within the project root
    const parts = modulePath.split(".");
    const asFile = parts.join("/") + ".py";
    const asInit = parts.join("/") + "/__init__.py";
    if (fs_1.default.existsSync(path_1.default.join(rootDir, asFile)))
        return asFile;
    if (fs_1.default.existsSync(path_1.default.join(rootDir, asInit)))
        return asInit;
    // Try just the top-level package (e.g. "Recommenders" → "Recommenders/__init__.py")
    if (parts.length > 1) {
        const topInit = parts[0] + "/__init__.py";
        if (fs_1.default.existsSync(path_1.default.join(rootDir, topInit)))
            return asFile; // return full path even if only top exists
    }
    return null; // external library — ignore
}
function visitNode(node, ctx, depth = 0) {
    switch (node.type) {
        case "import_statement":
        case "import_from_statement": {
            handleImport(node, ctx);
            break;
        }
        case "class_definition": {
            handleClass(node, ctx);
            return; // don't recurse into class body from top level
        }
        case "function_definition": {
            if (depth <= 1)
                handleFunction(node, ctx);
            break;
        }
        case "decorated_definition": {
            for (const child of node.children) {
                if (child.type === "function_definition" || child.type === "class_definition") {
                    visitNode(child, ctx, depth);
                }
            }
            return;
        }
    }
    for (const child of node.children) {
        visitNode(child, ctx, depth + 1);
    }
}
function handleImport(node, ctx) {
    if (node.type === "import_from_statement") {
        // from X import Y  (relative: from .X, absolute: from Pkg.Module)
        const moduleNode = node.children.find((c) => c.type === "relative_import" || c.type === "dotted_name");
        if (!moduleNode)
            return;
        const modulePath = moduleNode.text;
        const target = resolveImportTarget(modulePath, ctx.filePath, ctx.rootDir);
        if (!target)
            return;
        ctx.edges.push({
            source: ctx.fileId,
            target,
            type: "imports",
            via: node.text.slice(0, 80),
        });
    }
    else if (node.type === "import_statement") {
        // import Pkg.Module  (plain absolute import)
        for (const child of node.children) {
            if (child.type === "dotted_name" || child.type === "aliased_import") {
                const name = child.type === "aliased_import"
                    ? child.children.find((c) => c.type === "dotted_name")?.text ?? child.text
                    : child.text;
                const target = resolveImportTarget(name, ctx.filePath, ctx.rootDir);
                if (!target)
                    continue;
                ctx.edges.push({
                    source: ctx.fileId,
                    target,
                    type: "imports",
                    via: node.text.slice(0, 80),
                });
            }
        }
    }
}
function handleClass(node, ctx) {
    const nameNode = node.children.find((c) => c.type === "identifier");
    if (!nameNode)
        return;
    const className = nameNode.text;
    const classId = `${ctx.fileId}#${className}`;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    ctx.fileExports.push(className);
    // Methods from class body
    const methods = [];
    const body = node.children.find((c) => c.type === "block");
    if (body) {
        for (const member of body.children) {
            if (member.type === "function_definition") {
                const mName = member.children.find((c) => c.type === "identifier");
                if (mName && mName.text !== "__init__")
                    methods.push(mName.text);
            }
        }
    }
    // Superclasses
    const argList = node.children.find((c) => c.type === "argument_list");
    if (argList) {
        for (const arg of argList.children) {
            if (arg.type === "identifier" || arg.type === "attribute") {
                ctx.edges.push({
                    source: classId,
                    target: arg.text,
                    type: "inherits",
                    via: `class ${className}(${arg.text})`,
                });
            }
        }
    }
    ctx.nodes.push({
        id: classId,
        type: "class",
        language: "python",
        path: ctx.fileId,
        name: className,
        lines: [startLine, endLine],
        hash: (0, hash_js_1.sha256)(node.text),
        exports: methods,
    });
}
function handleFunction(node, ctx) {
    const nameNode = node.children.find((c) => c.type === "identifier");
    if (!nameNode)
        return;
    const fnName = nameNode.text;
    if (fnName.startsWith("_") && fnName !== "__init__")
        return; // skip private
    ctx.fileExports.push(fnName);
    const fnId = `${ctx.fileId}#${fnName}`;
    ctx.nodes.push({
        id: fnId,
        type: "function",
        language: "python",
        path: ctx.fileId,
        name: fnName,
        lines: [node.startPosition.row + 1, node.endPosition.row + 1],
        hash: (0, hash_js_1.sha256)(node.text),
        exports: [],
    });
}
function parsePython(filePath, content, rootDir) {
    const parser = new tree_sitter_1.default();
    parser.setLanguage(tree_sitter_python_1.default);
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
        language: "python",
        path: fileId,
        name: path_1.default.basename(filePath),
        lines: [1, lines.length],
        hash,
        exports: [...new Set(ctx.fileExports)],
    });
    return { nodes: ctx.nodes, edges: ctx.edges };
}
//# sourceMappingURL=python.js.map