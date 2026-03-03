import type { SupportedLanguage } from "../../utils/language.js";

export type NodeType = "file" | "class" | "function" | "module";
export type EdgeType = "imports" | "calls" | "inherits" | "implements";

export interface ParsedNode {
  id: string;
  type: NodeType;
  language: SupportedLanguage;
  path: string;
  name: string;
  lines: [number, number];
  hash: string;
  exports: string[];
}

export interface ParsedEdge {
  source: string;
  target: string;
  type: EdgeType;
  via: string;
}

export interface ParseResult {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
}
