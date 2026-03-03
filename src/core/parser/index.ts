import fs from "fs/promises";
import { detectLanguage } from "../../utils/language.js";
import { parseTypeScript } from "./typescript.js";
import { parsePython } from "./python.js";
import { parseGo } from "./go.js";
import { parseNotebook } from "./notebook.js";
import type { ParseResult } from "./types.js";

export * from "./types.js";

export async function parseFile(
  filePath: string,
  rootDir: string
): Promise<ParseResult | null> {
  const language = detectLanguage(filePath);
  if (!language) return null;

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  if (!content.trim()) return null;

  try {
    switch (language) {
      case "typescript":
      case "javascript":
        return parseTypeScript(filePath, content, rootDir, language);
      case "python":
        return parsePython(filePath, content, rootDir);
      case "go":
        return parseGo(filePath, content, rootDir);
      case "notebook":
        return parseNotebook(filePath, content, rootDir);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
