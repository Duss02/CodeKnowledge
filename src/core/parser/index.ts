import fs from "fs/promises";
import path from "path";
import { detectLanguage } from "../../utils/language.js";
import { sha256 } from "../../utils/hash.js";
import { parseTypeScript } from "./typescript.js";
import { parsePython } from "./python.js";
import { parseGo } from "./go.js";
import { parseNotebook } from "./notebook.js";
import type { ParseResult, ParseError, ParsedNode } from "./types.js";

export * from "./types.js";

/**
 * Maximum byte size for binary detection heuristic.
 * If a file's first 8KB contains a null byte, treat it as binary.
 */
const BINARY_CHECK_BYTES = 8192;

function isBinaryContent(content: string): boolean {
  const sample = content.slice(0, BINARY_CHECK_BYTES);
  return sample.includes("\0");
}

function makeFileId(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

/**
 * Create a generic file node for files that can't be parsed
 * (unsupported language or AST failure). This ensures they still
 * appear in the graph with their hash for change tracking.
 */
function makeGenericFileNode(
  filePath: string,
  rootDir: string,
  content: string
): ParsedNode {
  const fileId = makeFileId(filePath, rootDir);
  const lines = content.split("\n");
  return {
    id: fileId,
    type: "file",
    language: (detectLanguage(filePath) ?? "typescript") as ParsedNode["language"],
    path: fileId,
    name: path.basename(filePath),
    lines: [1, lines.length],
    hash: sha256(content),
    exports: [],
  };
}

export interface ParseFileOptions {
  /** Maximum file size in KB. Files larger than this return an error. */
  maxFileSizeKB?: number;
  /** If true, create a generic file node for unsupported languages instead of returning empty. */
  genericFallback?: boolean;
}

export async function parseFile(
  filePath: string,
  rootDir: string,
  options: ParseFileOptions = {}
): Promise<ParseResult> {
  const errors: ParseError[] = [];
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");

  // 1. Read file
  let content: string;
  let byteSize: number;
  try {
    const buffer = await fs.readFile(filePath);
    byteSize = buffer.length;
    content = buffer.toString("utf8");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isNotFound = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    return {
      nodes: [],
      edges: [],
      errors: [
        {
          file: relPath,
          reason: isNotFound ? "file_not_found" : "read_error",
          message: isNotFound
            ? `File not found: ${relPath}`
            : `Cannot read file: ${errMsg}`,
        },
      ],
    };
  }

  // 2. Check file too large
  if (options.maxFileSizeKB && byteSize > options.maxFileSizeKB * 1024) {
    return {
      nodes: [],
      edges: [],
      errors: [
        {
          file: relPath,
          reason: "file_too_large",
          message: `File exceeds size limit: ${(byteSize / 1024).toFixed(0)}KB > ${options.maxFileSizeKB}KB`,
          byteSize,
        },
      ],
    };
  }

  // 3. Check empty
  if (!content.trim()) {
    return {
      nodes: [],
      edges: [],
      errors: [
        {
          file: relPath,
          reason: "file_empty",
          message: `File is empty: ${relPath}`,
          byteSize: 0,
        },
      ],
    };
  }

  // 4. Check binary
  if (isBinaryContent(content)) {
    return {
      nodes: [],
      edges: [],
      errors: [
        {
          file: relPath,
          reason: "binary_file",
          message: `Binary file detected (contains null bytes): ${relPath}`,
          byteSize,
        },
      ],
    };
  }

  // 5. Detect language
  const language = detectLanguage(filePath);
  if (!language) {
    if (options.genericFallback) {
      return {
        nodes: [makeGenericFileNode(filePath, rootDir, content)],
        edges: [],
        errors: [
          {
            file: relPath,
            reason: "unsupported_language",
            message: `Unsupported language for: ${relPath}. Created generic file node.`,
            byteSize,
            language: null,
          },
        ],
      };
    }
    return {
      nodes: [],
      edges: [],
      errors: [
        {
          file: relPath,
          reason: "unsupported_language",
          message: `Unsupported language: ${path.extname(filePath) || "(no extension)"}`,
          byteSize,
          language: null,
        },
      ],
    };
  }

  // 6. Parse with language-specific parser
  try {
    let result: ParseResult | null = null;
    switch (language) {
      case "typescript":
      case "javascript":
        result = parseTypeScript(filePath, content, rootDir, language);
        break;
      case "python":
        result = parsePython(filePath, content, rootDir);
        break;
      case "go":
        result = parseGo(filePath, content, rootDir);
        break;
      case "notebook":
        result = parseNotebook(filePath, content, rootDir);
        break;
      default:
        return {
          nodes: [],
          edges: [],
          errors: [
            {
              file: relPath,
              reason: "unsupported_language",
              message: `No parser available for language: ${language}`,
              byteSize,
              language,
            },
          ],
        };
    }

    if (!result) {
      // Parser returned null (e.g. notebook with no cells)
      // Create a generic node so the file is still tracked
      return {
        nodes: [makeGenericFileNode(filePath, rootDir, content)],
        edges: [],
        errors: [
          {
            file: relPath,
            reason: "ast_parse_error",
            message: `Parser returned no result for: ${relPath}`,
            byteSize,
            language,
          },
        ],
      };
    }

    // Merge any errors from the language-specific parser
    return {
      nodes: result.nodes,
      edges: result.edges,
      errors: [...(result.errors ?? []), ...errors],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // AST parse failure — still create a generic file node so the file is tracked
    return {
      nodes: [makeGenericFileNode(filePath, rootDir, content)],
      edges: [],
      errors: [
        {
          file: relPath,
          reason: "ast_parse_error",
          message: `AST parse failed: ${errMsg}`,
          byteSize,
          language,
        },
      ],
    };
  }
}
