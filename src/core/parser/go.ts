import Parser from "tree-sitter";
import GoLang from "tree-sitter-go";
import path from "path";
import { sha256 } from "../../utils/hash.js";
import type { ParsedNode, ParsedEdge, ParseResult } from "./types.js";

function makeFileId(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
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

function handleImport(node: Parser.SyntaxNode, ctx: ParseContext): void {
  // Go imports are absolute paths to packages — we note them but can't resolve to local files without module info
  // Only handle local (./...) imports for edge creation
  for (const child of node.children) {
    if (child.type === "import_spec") {
      const pathNode = child.children.find((c) => c.type === "interpreted_string_literal" || c.type === "raw_string_literal");
      if (!pathNode) continue;
      const importPath = pathNode.text.slice(1, -1);
      if (importPath.startsWith("./") || importPath.startsWith("../")) {
        const dir = path.dirname(ctx.filePath);
        const resolved = path.resolve(dir, importPath);
        const target = path.relative(ctx.rootDir, resolved).replace(/\\/g, "/");
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

function handleTypeDecl(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const spec = node.children.find((c) => c.type === "type_spec");
  if (!spec) return;
  const nameNode = spec.children.find((c) => c.type === "type_identifier");
  const bodyNode = spec.children.find((c) => c.type === "struct_type" || c.type === "interface_type");
  if (!nameNode || !bodyNode) return;

  const typeName = nameNode.text;
  const typeId = `${ctx.fileId}#${typeName}`;

  // Exported in Go = starts with uppercase
  if (/^[A-Z]/.test(typeName)) ctx.fileExports.push(typeName);

  ctx.nodes.push({
    id: typeId,
    type: "class",
    language: "go",
    path: ctx.fileId,
    name: typeName,
    lines: [node.startPosition.row + 1, node.endPosition.row + 1],
    hash: sha256(node.text),
    exports: [],
  });
}

function handleFunction(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const nameNode = node.children.find((c) => c.type === "identifier" || c.type === "field_identifier");
  if (!nameNode) return;

  const fnName = nameNode.text;
  if (!/^[A-Z]/.test(fnName)) return; // only exported functions

  const fnId = `${ctx.fileId}#${fnName}`;
  ctx.fileExports.push(fnName);

  ctx.nodes.push({
    id: fnId,
    type: "function",
    language: "go",
    path: ctx.fileId,
    name: fnName,
    lines: [node.startPosition.row + 1, node.endPosition.row + 1],
    hash: sha256(node.text),
    exports: [],
  });
}

export function parseGo(
  filePath: string,
  content: string,
  rootDir: string
): ParseResult {
  const parser = new Parser();
  parser.setLanguage(GoLang as unknown);

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
    language: "go",
    path: fileId,
    name: path.basename(filePath),
    lines: [1, lines.length],
    hash,
    exports: [...new Set(ctx.fileExports)],
  });

  return { nodes: ctx.nodes, edges: ctx.edges };
}
