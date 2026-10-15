import type { SupportedLanguage } from "../../utils/language.js";

export type NodeType = "file" | "class" | "function" | "module";
export type EdgeType = "imports" | "calls" | "inherits" | "implements" | "contains";

export type ParseErrorReason =
  | "file_not_found"
  | "file_empty"
  | "file_too_large"
  | "unsupported_language"
  | "ast_parse_error"
  | "binary_file"
  | "read_error";

export interface ParseError {
  file: string;
  reason: ParseErrorReason;
  message: string;
  byteSize?: number;
  language?: SupportedLanguage | null;
}

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
  errors: ParseError[];
}
