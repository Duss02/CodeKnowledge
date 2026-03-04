import Parser from "tree-sitter";
import TSLang from "tree-sitter-typescript";
import JSLang from "tree-sitter-javascript";
import path from "path";
import { sha256 } from "../../utils/hash.js";
import type { SupportedLanguage } from "../../utils/language.js";
import type { ParsedNode, ParsedEdge, ParseResult } from "./types.js";

function makeFileId(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function extractStringValue(node: Parser.SyntaxNode): string | null {
  if (node.type === "string") {
    const text = node.text;
    return text.slice(1, -1);
  }
  if (node.type === "template_string") {
    return node.text.slice(1, -1);
  }
  return null;
}

function resolveImportTarget(
  importPath: string,
  fromFile: string,
  rootDir: string
): string | null {
  if (!importPath.startsWith(".")) {
    return null; // external module
  }
  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, importPath);

  // Try with common extensions if no extension
  if (!path.extname(resolved)) {
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

  return path.relative(rootDir, resolved).replace(/\\/g, "/");
}

interface ParseContext {
  fileId: string;
  filePath: string;
  rootDir: string;
  language: SupportedLanguage;
  content: string;
  hash: string;
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  fileExports: string[];
}

function visitNode(node: Parser.SyntaxNode, ctx: ParseContext, depth = 0): void {
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
      if (depth <= 2) handleFunction(node, ctx);
      break;
    }
    case "lexical_declaration":
    case "variable_declaration": {
      if (depth <= 2) handleVariableDecl(node, ctx);
      break;
    }
    case "call_expression": {
      // CommonJS: require('./module') or require('module')
      handleRequireCall(node, ctx);
      break;
    }
    case "expression_statement": {
      // CommonJS: module.exports = X or exports.X = Y
      handleCommonJSExport(node, ctx);
      break;
    }
  }

  for (const child of node.children) {
    visitNode(child, ctx, depth + 1);
  }
}

function handleImport(node: Parser.SyntaxNode, ctx: ParseContext): void {
  // Find the string source of import
  const sourceNode = node.children.find(
    (c) => c.type === "string" || c.type === "template_string"
  );
  if (!sourceNode) return;

  const importPath = extractStringValue(sourceNode);
  if (!importPath) return;

  const target = resolveImportTarget(importPath, ctx.filePath, ctx.rootDir);
  if (!target) return;

  // Collect named imports for "via" info
  const clause = node.children.find(
    (c) => c.type === "import_clause" || c.type === "named_imports"
  );
  const via = clause ? `import ${clause.text} from '${importPath}'` : `import '${importPath}'`;

  ctx.edges.push({
    source: ctx.fileId,
    target,
    type: "imports",
    via,
  });
}

/**
 * Handle CommonJS require() calls.
 * Patterns:
 *   const x = require('./module')
 *   require('./module')
 *   const { a, b } = require('./module')
 */
function handleRequireCall(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const fn = node.children[0];
  if (!fn || fn.type !== "identifier" || fn.text !== "require") return;

  const args = node.children.find((c) => c.type === "arguments");
  if (!args) return;

  const strArg = args.children.find((c) => c.type === "string" || c.type === "template_string");
  if (!strArg) return;

  const importPath = extractStringValue(strArg);
  if (!importPath) return;

  const target = resolveImportTarget(importPath, ctx.filePath, ctx.rootDir);
  if (!target) return;

  ctx.edges.push({
    source: ctx.fileId,
    target,
    type: "imports",
    via: `require('${importPath}')`,
  });
}

/**
 * Handle CommonJS module.exports / exports.X assignments.
 * Patterns:
 *   module.exports = value
 *   module.exports = { a, b, c }
 *   module.exports.foo = value
 *   exports.foo = value
 */
function handleCommonJSExport(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const expr = node.children[0];
  if (!expr || expr.type !== "assignment_expression") return;

  const left = expr.children[0];
  if (!left) return;

  // module.exports = X
  if (left.type === "member_expression") {
    const obj = left.children[0];
    const prop = left.children.find((c) => c.type === "property_identifier");
    if (!obj || !prop) return;

    // module.exports = value  or  module.exports = { a, b, c }
    if (obj.type === "identifier" && obj.text === "module" && prop.text === "exports") {
      const right = expr.children.find((c) => c.type === "object");
      if (right) {
        // module.exports = { a, b, c }
        for (const child of right.children) {
          if (child.type === "pair" || child.type === "shorthand_property_identifier" || child.type === "shorthand_property_identifier_pattern") {
            const key = child.type === "pair"
              ? child.children.find((c) => c.type === "property_identifier" || c.type === "identifier")
              : child;
            if (key) ctx.fileExports.push(key.text);
          }
        }
      } else {
        // module.exports = someValue (single export)
        const right2 = expr.children[expr.children.length - 1];
        if (right2 && right2.type === "identifier") {
          ctx.fileExports.push(right2.text);
        }
      }
      return;
    }

    // module.exports.foo = value
    if (obj.type === "member_expression") {
      const innerObj = obj.children[0];
      const innerProp = obj.children.find((c) => c.type === "property_identifier");
      if (innerObj?.text === "module" && innerProp?.text === "exports" && prop) {
        ctx.fileExports.push(prop.text);
      }
      return;
    }

    // exports.foo = value
    if (obj.type === "identifier" && obj.text === "exports" && prop) {
      ctx.fileExports.push(prop.text);
    }
  }
}

function handleExport(node: Parser.SyntaxNode, ctx: ParseContext): void {
  // export function foo / export class Foo / export const bar
  for (const child of node.children) {
    if (
      child.type === "function_declaration" ||
      child.type === "class_declaration" ||
      child.type === "abstract_class_declaration"
    ) {
      const nameNode = child.children.find((c) => c.type === "identifier" || c.type === "type_identifier");
      if (nameNode) ctx.fileExports.push(nameNode.text);
    }
    if (child.type === "lexical_declaration" || child.type === "variable_declaration") {
      for (const dec of child.children) {
        if (dec.type === "variable_declarator") {
          const nameNode = dec.children.find((c) => c.type === "identifier");
          if (nameNode) ctx.fileExports.push(nameNode.text);
        }
      }
    }
    // export { a, b }
    if (child.type === "export_clause" || child.type === "named_exports") {
      for (const spec of child.children) {
        if (spec.type === "export_specifier") {
          const nameNode = spec.children.find((c) => c.type === "identifier");
          if (nameNode) ctx.fileExports.push(nameNode.text);
        }
      }
    }
  }
}

function handleClass(node: Parser.SyntaxNode, ctx: ParseContext): void {
  const nameNode = node.children.find(
    (c) => c.type === "type_identifier" || c.type === "identifier"
  );
  if (!nameNode) return;

  const className = nameNode.text;
  const classId = `${ctx.fileId}#${className}`;
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;

  // Collect methods and emit class→method contains edges
  const methods: string[] = [];
  const body = node.children.find((c) => c.type === "class_body");
  if (body) {
    for (const member of body.children) {
      if (member.type === "method_definition" || member.type === "public_field_definition") {
        const mName = member.children.find((c) => c.type === "property_identifier" || c.type === "identifier");
        if (mName && !["constructor", "get", "set"].includes(mName.text)) {
          methods.push(mName.text);

          // Emit method node
          const methodId = `${classId}.${mName.text}`;
          ctx.nodes.push({
            id: methodId,
            type: "function",
            language: ctx.language,
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
        const ifaces = clause.children.filter(
          (c) => c.type === "type_identifier" || c.type === "identifier"
        );
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

function handleVariableDecl(node: Parser.SyntaxNode, ctx: ParseContext): void {
  for (const child of node.children) {
    if (child.type !== "variable_declarator") continue;
    const nameNode = child.children.find((c) => c.type === "identifier");
    const valueNode = child.children.find(
      (c) => c.type === "arrow_function" || c.type === "function"
    );
    if (nameNode && valueNode) {
      const fnId = `${ctx.fileId}#${nameNode.text}`;
      ctx.nodes.push({
        id: fnId,
        type: "function",
        language: ctx.language,
        path: ctx.fileId,
        name: nameNode.text,
        lines: [child.startPosition.row + 1, child.endPosition.row + 1],
        hash: sha256(child.text),
        exports: [],
      });

      // file → function contains edge
      ctx.edges.push({
        source: ctx.fileId,
        target: fnId,
        type: "contains",
        via: `contains function ${nameNode.text}`,
      });
    }
  }
}

export function parseTypeScript(
  filePath: string,
  content: string,
  rootDir: string,
  language: SupportedLanguage
): ParseResult {
  const parser = new Parser();

  if (language === "typescript") {
    // tree-sitter-typescript exports { typescript, tsx }
    const tsLang = TSLang as unknown as { typescript: unknown; tsx: unknown };
    const isJsx = filePath.endsWith(".tsx");
    parser.setLanguage(isJsx ? tsLang.tsx : tsLang.typescript);
  } else {
    parser.setLanguage(JSLang as unknown);
  }

  const tree = parser.parse(content);
  const fileId = makeFileId(filePath, rootDir);
  const hash = sha256(content);

  const ctx: ParseContext = {
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
    name: path.basename(filePath),
    lines: [1, lines.length],
    hash,
    exports: [...new Set(ctx.fileExports)],
  });

  return {
    nodes: ctx.nodes,
    edges: ctx.edges,
    errors: [],
  };
}
