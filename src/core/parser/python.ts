import Parser from "tree-sitter";
import PythonLang from "tree-sitter-python";
import path from "path";
import fs from "fs";
import { sha256 } from "../../utils/hash.js";
import type { ParsedNode, ParsedEdge, ParseResult } from "./types.js";

function makeFileId(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function resolveImportTarget(
  modulePath: string,
  fromFile: string,
  rootDir: string
): string | null {
  // Relative import: from .module import X  or  from ..pkg.module import X
  if (modulePath.startsWith(".")) {
    const dir = path.dirname(fromFile);
    const stripped = modulePath.replace(/^\.+/, "");
    // Count leading dots to determine how many dirs to go up
    const dots = modulePath.match(/^\.+/)?.[0].length ?? 1;
    let base = dir;
    for (let i = 1; i < dots; i++) base = path.dirname(base);
    const parts = stripped ? stripped.split(".") : [];
    const resolved = parts.length > 0 ? path.resolve(base, ...parts) : base;
    const rel = path.relative(rootDir, resolved).replace(/\\/g, "/");
    // Could be a module file or a package __init__
    const asFile = rel + ".py";
    const asInit = rel + "/__init__.py";
    if (fs.existsSync(path.join(rootDir, asFile))) return asFile;
    if (fs.existsSync(path.join(rootDir, asInit))) return asInit;
    return asFile; // best effort even if not found
  }

  // Absolute import: from Recommenders.BaseRecommender import X
  // Try resolving as a path within the project root
  const parts = modulePath.split(".");
  const asFile = parts.join("/") + ".py";
  const asInit = parts.join("/") + "/__init__.py";
  if (fs.existsSync(path.join(rootDir, asFile))) return asFile;
  if (fs.existsSync(path.join(rootDir, asInit))) return asInit;

  // Try just the top-level package (e.g. "Recommenders" → "Recommenders/__init__.py")
  if (parts.length > 1) {
    const topInit = parts[0] + "/__init__.py";
    if (fs.existsSync(path.join(rootDir, topInit))) return asFile; // return full path even if only top exists
  }

  return null; // external library — ignore
}

interface ParseContext {
  fileId: string;
  filePath: string;
  rootDir: string;
  content: string;
  hash: string;
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  fileExports: string[];
}

function visitNode(node: Parser.SyntaxNode, ctx: ParseContext, depth = 0): void {
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
      if (depth <= 1) handleFunction(node, ctx);
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

function handleImport(node: Parser.SyntaxNode, ctx: ParseContext): void {
  if (node.type === "import_from_statement") {
    // from X import Y  (relative: from .X, absolute: from Pkg.Module)
    const moduleNode = node.children.find(
      (c) => c.type === "relative_import" || c.type === "dotted_name"
    );
    if (!moduleNode) return;
    const modulePath = moduleNode.text;
    const target = resolveImportTarget(modulePath, ctx.filePath, ctx.rootDir);
    if (!target) return;
    ctx.edges.push({
      source: ctx.fileId,
      target,
      type: "imports",
      via: node.text.slice(0, 80),
    });
  } else if (node.type === "import_statement") {
    // import Pkg.Module  (plain absolute import)
    for (const child of node.children) {
      if (child.type === "dotted_name" || child.type === "aliased_import") {
        const name = child.type === "aliased_import"
          ? child.children.find((c) => c.type === "dotted_name")?.text ?? child.text
          : child.text;
        const target = resolveImportTarget(name, ctx.filePath, ctx.rootDir);
        if (!target) continue;
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

function handleClass(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const nameNode = node.children.find((c) => c.type === "identifier");
  if (!nameNode) return;

  const className = nameNode.text;
  const classId = `${ctx.fileId}#${className}`;
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;

  ctx.fileExports.push(className);

  // Methods from class body — emit method nodes + contains edges
  const methods: string[] = [];
  const body = node.children.find((c) => c.type === "block");
  if (body) {
    for (const member of body.children) {
      if (member.type === "function_definition") {
        const mName = member.children.find((c) => c.type === "identifier");
        if (mName && mName.text !== "__init__") {
          methods.push(mName.text);

          // Emit method node
          const methodId = `${classId}.${mName.text}`;
          ctx.nodes.push({
            id: methodId,
            type: "function",
            language: "python",
            path: ctx.fileId,
            name: mName.text,
            lines: [member.startPosition.row + 1, member.endPosition.row + 1],
            hash: sha256(member.text),
            exports: [],
          });

          // class → method contains edge
          ctx.edges.push({
            source: classId,
            target: methodId,
            type: "contains",
            via: `contains method ${mName.text}`,
          });
        }
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
    hash: sha256(node.text),
    exports: methods,
  });

  // file → class contains edge
  ctx.edges.push({
    source: ctx.fileId,
    target: classId,
    type: "contains",
    via: `contains class ${className}`,
  });
}

function handleFunction(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const nameNode = node.children.find((c) => c.type === "identifier");
  if (!nameNode) return;

  const fnName = nameNode.text;
  if (fnName.startsWith("_") && fnName !== "__init__") return; // skip private

  ctx.fileExports.push(fnName);
  const fnId = `${ctx.fileId}#${fnName}`;

  ctx.nodes.push({
    id: fnId,
    type: "function",
    language: "python",
    path: ctx.fileId,
    name: fnName,
    lines: [node.startPosition.row + 1, node.endPosition.row + 1],
    hash: sha256(node.text),
    exports: [],
  });

  // file → function contains edge
  ctx.edges.push({
    source: ctx.fileId,
    target: fnId,
    type: "contains",
    via: `contains function ${fnName}`,
  });
}

export function parsePython(
  filePath: string,
  content: string,
  rootDir: string
): ParseResult {
  const parser = new Parser();
  parser.setLanguage(PythonLang as unknown);

  const tree = parser.parse(content);
  const fileId = makeFileId(filePath, rootDir);
  const hash = sha256(content);
  const lines = content.split("\n");

  const ctx: ParseContext = {
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
    name: path.basename(filePath),
    lines: [1, lines.length],
    hash,
    exports: [...new Set(ctx.fileExports)],
  });

  return { nodes: ctx.nodes, edges: ctx.edges, errors: [] };
}
