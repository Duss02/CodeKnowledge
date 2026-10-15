import { cosmiconfig } from "cosmiconfig";
import path from "path";

export type LLMProvider = "anthropic" | "openai" | "gemini" | "custom" | "openrouter";

export interface CKConfig {
  provider: LLMProvider;
  model: string;
  /** Anthropic API key — env: ANTHROPIC_API_KEY */
  apiKey: string | undefined;
  /** OpenAI API key — env: OPENAI_API_KEY */
  openAIApiKey: string | undefined;
  /** Gemini API key — env: GEMINI_API_KEY */
  geminiApiKey: string | undefined;
  /** OpenRouter API key — env: OPENROUTER_API_KEY */
  openRouterApiKey: string | undefined;
  /** Custom OpenAI-compatible API key — env: CUSTOM_API_KEY */
  customApiKey: string | undefined;
  /** Custom API base URL — env: CUSTOM_BASE_URL */
  customBaseUrl: string | undefined;

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

  /** How many hops staleness propagates through import edges (default: 1) */
  impactDepth: number;

  mcpPort: "stdio" | number;

  /** Optional neural embedding provider (default: 'none' = TF-IDF only) */
  embeddingProvider: "openai" | "none";
  /** Embedding model name (default: 'text-embedding-3-small') */
  embeddingModel: string;
}

/** Returns true if the config has a usable API key for the chosen provider */
export function hasApiKey(config: CKConfig): boolean {
  if (config.provider === "openai") return !!config.openAIApiKey;
  if (config.provider === "gemini") return !!config.geminiApiKey;
  if (config.provider === "openrouter") return !!config.openRouterApiKey;
  if (config.provider === "custom") return !!config.customApiKey;
  return !!config.apiKey;
}

/** Auto-detect provider based on which env var is set; Anthropic wins if both are set */
function detectProvider(): { provider: LLMProvider; model: string } {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: "claude-haiku-4-5" };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", model: "gpt-4o-mini" };
  if (process.env.GEMINI_API_KEY) return { provider: "gemini", model: "gemini-2.5-flash" };
  if (process.env.OPENROUTER_API_KEY) return { provider: "openrouter", model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-3b-instruct" };
  if (process.env.CUSTOM_API_KEY) return { provider: "custom", model: process.env.CUSTOM_MODEL || "llama-3.2-3b-instruct" };
  return { provider: "anthropic", model: "claude-haiku-4-5" };
}

const detected = detectProvider();

export const DEFAULT_CONFIG: CKConfig = {
  provider: detected.provider,
  model: detected.model,
  apiKey: process.env.ANTHROPIC_API_KEY,
  openAIApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  customApiKey: process.env.CUSTOM_API_KEY,
  customBaseUrl: process.env.CUSTOM_BASE_URL,

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

  impactDepth: 1,

  mcpPort: "stdio",

  embeddingProvider: "none",
  embeddingModel: "text-embedding-3-small",
};

export async function loadConfig(cwd: string = process.cwd()): Promise<CKConfig> {
  const explorer = cosmiconfig("ck");
  const result = await explorer.search(cwd);

  const base: CKConfig = {
    ...DEFAULT_CONFIG,
    // Always re-read env vars at load time (in case they changed)
    apiKey: process.env.ANTHROPIC_API_KEY,
    openAIApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    customApiKey: process.env.CUSTOM_API_KEY,
    customBaseUrl: process.env.CUSTOM_BASE_URL,
  };

  if (result?.config) {
    const merged = { ...base, ...result.config };
    if (!result.config.model) {
      if (merged.provider === "openai") merged.model = "gpt-4o-mini";
      else if (merged.provider === "gemini") merged.model = "gemini-2.5-flash";
      else if (merged.provider === "openrouter") merged.model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-3b-instruct";
      else if (merged.provider === "custom") merged.model = process.env.CUSTOM_MODEL || "llama-3.2-3b-instruct";
      else merged.model = "claude-haiku-4-5";
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
