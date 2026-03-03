import { cosmiconfig } from "cosmiconfig";
import path from "path";

export type LLMProvider = "anthropic" | "openai";

export interface CKConfig {
  provider: LLMProvider;
  model: string;
  /** Anthropic API key — env: ANTHROPIC_API_KEY */
  apiKey: string | undefined;
  /** OpenAI API key — env: OPENAI_API_KEY */
  openAIApiKey: string | undefined;

  include: string[];
  exclude: string[];
  languages: string[];
  maxFileSizeKB: number;

  summaries: boolean;
  summaryMaxLines: number;
  /** Number of files to summarize in parallel (default: 5) */
  summaryBatchSize: number;

  outputDir: string;
  generateMarkdown: boolean;

  mcpPort: "stdio" | number;
}

/** Returns true if the config has a usable API key for the chosen provider */
export function hasApiKey(config: CKConfig): boolean {
  if (config.provider === "openai") return !!config.openAIApiKey;
  return !!config.apiKey;
}

/** Auto-detect provider based on which env var is set; Anthropic wins if both are set */
function detectProvider(): { provider: LLMProvider; model: string } {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: "claude-haiku-4-5" };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", model: "gpt-4o-mini" };
  return { provider: "anthropic", model: "claude-haiku-4-5" };
}

const detected = detectProvider();

export const DEFAULT_CONFIG: CKConfig = {
  provider: detected.provider,
  model: detected.model,
  apiKey: process.env.ANTHROPIC_API_KEY,
  openAIApiKey: process.env.OPENAI_API_KEY,

  include: ["src/**", "lib/**", "**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.ipynb"],
  exclude: [
    "**/*.test.*",
    "**/*.spec.*",
    "**/node_modules/**",
    "**/*.d.ts",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/.codeknowledge/**",
    "**/coverage/**",
    "**/__pycache__/**",
    "**/*.min.js",
    "**/.ipynb_checkpoints/**",
  ],
  languages: ["typescript", "javascript", "python", "go", "notebook"],
  maxFileSizeKB: 200,

  summaries: true,
  summaryMaxLines: 200,
  summaryBatchSize: 5,

  outputDir: ".codeknowledge",
  generateMarkdown: true,

  mcpPort: "stdio",
};

export async function loadConfig(cwd: string = process.cwd()): Promise<CKConfig> {
  const explorer = cosmiconfig("ck");
  const result = await explorer.search(cwd);

  const base: CKConfig = {
    ...DEFAULT_CONFIG,
    // Always re-read env vars at load time (in case they changed)
    apiKey: process.env.ANTHROPIC_API_KEY,
    openAIApiKey: process.env.OPENAI_API_KEY,
  };

  if (result?.config) {
    const merged = { ...base, ...result.config };
    // If the config file doesn't specify a model but we switched provider, use a sensible default
    if (!result.config.model) {
      merged.model = merged.provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5";
    }
    return merged;
  }

  const ckJsonPath = path.join(cwd, DEFAULT_CONFIG.outputDir, "config.json");
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(ckJsonPath, "utf8");
    const saved = JSON.parse(raw);
    return { ...base, ...saved };
  } catch {
    // no saved config, use defaults
  }

  return base;
}

export async function saveConfig(config: CKConfig, outputDir: string): Promise<void> {
  const fs = await import("fs/promises");
  const configPath = path.join(outputDir, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}
