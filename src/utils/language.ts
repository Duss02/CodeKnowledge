export type SupportedLanguage = "typescript" | "javascript" | "python" | "go";

const EXT_MAP: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
};

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return EXT_MAP[ext] ?? null;
}

export function isSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}
