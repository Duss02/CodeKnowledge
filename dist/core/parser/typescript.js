"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTypeScript = parseTypeScript;
const tree_sitter_1 = __importDefault(require("tree-sitter"));
const tree_sitter_typescript_1 = __importDefault(require("tree-sitter-typescript"));
const tree_sitter_javascript_1 = __importDefault(require("tree-sitter-javascript"));
const path_1 = __importDefault(require("path"));
const hash_js_1 = require("../../utils/hash.js");
function makeFileId(filePath, rootDir) {
    return path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
}
function extractStringValue(node) {
    if (node.type === "string") {
        const text = node.text;
        return text.slice(1, -1);
    }
    if (node.type === "template_string") {
        return node.text.slice(1, -1);
    }
    return null;
}
function resolveImportTarget(importPath, fromFile, rootDir) {
    if (!importPath.startsWith(".")) {
        return null; // external module
    }
    const dir = path_1.default.dirname(fromFile);
    let resolved = path_1.default.resolve(dir, importPath);
    // Try with common extensions if no extension
    if (!path_1.default.extname(resolved)) {
        const candidates = [
            resolved + ".ts",
            resolved + ".tsx",
            resolved + ".js",
            resolved + "/index.ts",
            resolved + "/index.js",
        ];
        // We can't check file existence here without async, so we pick the first candidate
        resolved = candidates[0];
    }
    return path_1.default.relative(rootDir, resolved).replace(/\\/g, "/");
}
function visitNode(node, ctx, depth = 0) {
    switch (node.type) {
        case "import_declaration":
        case "import_statement": {
            handleImport(node, ctx);
            break;
        }
        case "export_statement": {
            handleExport(node, ctx);
            break;
        }
        case "class_declaration":
        case "abstract_class_declaration": {
            handleClass(node, ctx);
            break;
        }
        case "function_declaration":
        case "function_definition": {
            if (depth <= 2)
                handleFunction(node, ctx);
            break;
        }
        case "lexical_declaration":
        case "variable_declaration": {
            if (depth <= 2)
                handleVariableDecl(node, ctx);
            break;
        }
    }
    for (const child of node.children) {
        visitNode(child, ctx, depth + 1);
    }
}
function handleImport(node, ctx) {
    // Find the string source of import
    const sourceNode = node.children.find((c) => c.type === "string" || c.type === "template_string");
    if (!sourceNode)
        return;
    const importPath = extractStringValue(sourceNode);
    if (!importPath)
        return;
    const target = resolveImportTarget(importPath, ctx.filePath, ctx.rootDir);
    if (!target)
        return;
    // Collect named imports for "via" info
    const clause = node.children.find((c) => c.type === "import_clause" || c.type === "named_imports");
    const via = clause ? `import ${clause.text} from '${importPath}'` : `import '${importPath}'`;
    ctx.edges.push({
        source: ctx.fileId,
        target,
        type: "imports",
        via,
    });
}
function handleExport(node, ctx) {
    // export function foo / export class Foo / export const bar
    for (const child of node.children) {
        if (child.type === "function_declaration" ||
            child.type === "class_declaration" ||
            child.type === "abstract_class_declaration") {
            const nameNode = child.children.find((c) => c.type === "identifier" || c.type === "type_identifier");
            if (nameNode)
                ctx.fileExports.push(nameNode.text);
        }
        if (child.type === "lexical_declaration" || child.type === "variable_declaration") {
            for (const dec of child.children) {
                if (dec.type === "variable_declarator") {
                    const nameNode = dec.children.find((c) => c.type === "identifier");
                    if (nameNode)
                        ctx.fileExports.push(nameNode.text);
                }
            }
        }
        // export { a, b }
        if (child.type === "export_clause" || child.type === "named_exports") {
            for (const spec of child.children) {
                if (spec.type === "export_specifier") {
                    const nameNode = spec.children.find((c) => c.type === "identifier");
                    if (nameNode)
                        ctx.fileExports.push(nameNode.text);
                }
            }
        }
    }
}
function handleClass(node, ctx) {
    const nameNode = node.children.find((c) => c.type === "type_identifier" || c.type === "identifier");
    if (!nameNode)
        return;
    const className = nameNode.text;
    const classId = `${ctx.fileId}#${className}`;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    // Collect methods
    const methods = [];
    const body = node.children.find((c) => c.type === "class_body");
    if (body) {
        for (const member of body.children) {
            if (member.type === "method_definition" || member.type === "public_field_definition") {
                const mName = member.children.find((c) => c.type === "property_identifier" || c.type === "identifier");
                if (mName && !["constructor", "get", "set"].includes(mName.text)) {
                    methods.push(mName.text);
                }
            }
        }
    }
    // Check heritage (extends/implements)
    const heritage = node.children.find((c) => c.type === "class_heritage");
    if (heritage) {
        for (const clause of heritage.children) {
            if (clause.type === "extends_clause") {
                const superName = clause.children.find((c) => c.type === "identifier" || c.type === "type_identifier");
                if (superName) {
                    ctx.edges.push({
                        source: classId,
                        target: superName.text,
                        type: "inherits",
                        via: `extends ${superName.text}`,
                    });
                }
            }
            if (clause.type === "implements_clause") {
                const ifaces = clause.children.filter((c) => c.type === "type_identifier" || c.type === "identifier");
                for (const iface of ifaces) {
                    ctx.edges.push({
                        source: classId,
                        target: iface.text,
                        type: "implements",
                        via: `implements ${iface.text}`,
                    });
                }
            }
        }
    }
    ctx.nodes.push({
        id: classId,
        type: "class",
        language: ctx.language,
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
    const fnId = `${ctx.fileId}#${fnName}`;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    ctx.nodes.push({
        id: fnId,
        type: "function",
        language: ctx.language,
        path: ctx.fileId,
        name: fnName,
        lines: [startLine, endLine],
        hash: (0, hash_js_1.sha256)(node.text),
        exports: [],
    });
}
function handleVariableDecl(node, ctx) {
    for (const child of node.children) {
        if (child.type !== "variable_declarator")
            continue;
        const nameNode = child.children.find((c) => c.type === "identifier");
        const valueNode = child.children.find((c) => c.type === "arrow_function" || c.type === "function");
        if (nameNode && valueNode) {
            const fnId = `${ctx.fileId}#${nameNode.text}`;
            ctx.nodes.push({
                id: fnId,
                type: "function",
                language: ctx.language,
                path: ctx.fileId,
                name: nameNode.text,
                lines: [child.startPosition.row + 1, child.endPosition.row + 1],
                hash: (0, hash_js_1.sha256)(child.text),
                exports: [],
            });
        }
    }
}
function parseTypeScript(filePath, content, rootDir, language) {
    const parser = new tree_sitter_1.default();
    if (language === "typescript") {
        // tree-sitter-typescript exports { typescript, tsx }
        const tsLang = tree_sitter_typescript_1.default;
        const isJsx = filePath.endsWith(".tsx");
        parser.setLanguage(isJsx ? tsLang.tsx : tsLang.typescript);
    }
    else {
        parser.setLanguage(tree_sitter_javascript_1.default);
    }
    const tree = parser.parse(content);
    const fileId = makeFileId(filePath, rootDir);
    const hash = (0, hash_js_1.sha256)(content);
    const ctx = {
        fileId,
        filePath,
        rootDir,
        language,
        content,
        hash,
        nodes: [],
        edges: [],
        fileExports: [],
    };
    visitNode(tree.rootNode, ctx);
    // File-level node
    const lines = content.split("\n");
    ctx.nodes.unshift({
        id: fileId,
        type: "file",
        language,
        path: fileId,
        name: path_1.default.basename(filePath),
        lines: [1, lines.length],
        hash,
        exports: [...new Set(ctx.fileExports)],
    });
    return {
        nodes: ctx.nodes,
        edges: ctx.edges,
    };
}
//# sourceMappingURL=typescript.js.map