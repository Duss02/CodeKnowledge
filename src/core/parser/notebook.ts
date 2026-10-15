import path from "path";
import { sha256 } from "../../utils/hash.js";
import { extractNotebook } from "../../utils/notebook.js";
import { parsePython } from "./python.js";
import type { ParseResult, ParsedNode } from "./types.js";

function makeFileId(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

export function parseNotebook(
  filePath: string,
  rawJson: string,
  rootDir: string
): ParseResult | null {
  const extract = extractNotebook(rawJson);
  if (!extract) return null;

  const fileId = makeFileId(filePath, rootDir);
  const hash = sha256(rawJson);
  const totalLines = rawJson.split("\n").length;

  const fileNode: ParsedNode = {
    id: fileId,
    type: "file",
    language: "notebook",
    path: fileId,
    name: path.basename(filePath),
    lines: [1, totalLines],
    hash,
    exports: [],
  };

  // If there's no usable code content, return just the file node
  if (!extract.codeContent.trim()) {
    return { nodes: [fileNode], edges: [], errors: [] };
  }

  // Run the Python parser on the concatenated code cells to extract
  // classes, functions, and import edges within the notebook
  let pythonResult: ParseResult | null = null;
  try {
    pythonResult = parsePython(filePath, extract.codeContent, rootDir);
  } catch {
    // If Python parsing fails (unusual syntax in cells), still return file node
  }

  if (!pythonResult) {
    return { nodes: [fileNode], edges: [], errors: [] };
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
    errors: [...(pythonResult.errors ?? [])],
  };
}
