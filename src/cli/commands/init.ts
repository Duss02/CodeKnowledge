import fs from "fs/promises";
import path from "path";
import { DEFAULT_CONFIG, saveConfig } from "../../core/config/index.js";
import { logger } from "../../utils/logger.js";

export async function runInit(targetDir: string = process.cwd()): Promise<void> {
  const outputDir = path.resolve(targetDir, DEFAULT_CONFIG.outputDir);

  try {
    await fs.mkdir(outputDir, { recursive: true });
    logger.info(`Created ${outputDir}`);
  } catch (err) {
    logger.error({ err }, "Failed to create output directory");
    process.exit(1);
  }

  // Write config.json
  await saveConfig(DEFAULT_CONFIG, outputDir);
  logger.info(`Config saved to ${path.join(outputDir, "config.json")}`);

  // Write default ck.config.js if not present
  const ckConfigPath = path.join(targetDir, "ck.config.js");
  try {
    await fs.access(ckConfigPath);
    logger.info("ck.config.js already exists, skipping");
  } catch {
    const defaultConfig = `// codeknowledge config
// See: https://github.com/codeknowledge/codeknowledge#configuration
//
// LLM provider — choose one:
//   Anthropic: set ANTHROPIC_API_KEY  →  provider: "anthropic", model: "claude-haiku-4-5"
//   OpenAI:    set OPENAI_API_KEY     →  provider: "openai",    model: "gpt-4o-mini"
//
// The provider is auto-detected from env vars if you leave this file as-is.
// Anthropic takes priority if both keys are set.
module.exports = {
  provider: "anthropic",          // "anthropic" | "openai"
  model: "claude-haiku-4-5",      // anthropic: "claude-haiku-4-5" | openai: "gpt-4o-mini"
  apiKey: process.env.ANTHROPIC_API_KEY,
  openAIApiKey: process.env.OPENAI_API_KEY,

  include: ["src/**", "lib/**"],
  exclude: [
    "**/*.test.*",
    "**/*.spec.*",
    "**/node_modules/**",
    "**/*.d.ts",
    "**/dist/**",
    "**/build/**",
  ],
  languages: ["typescript", "javascript", "python", "go"],
  maxFileSizeKB: 200,

  summaries: true,
  summaryMaxLines: 200,
  summaryBatchSize: 5,           // parallel LLM calls (increase to 10 for speed, reduce if rate-limited)

  outputDir: ".codeknowledge",
  generateMarkdown: true,

  mcpPort: "stdio",
};
`;
    await fs.writeFile(ckConfigPath, defaultConfig, "utf8");
    logger.info(`Created ck.config.js`);
  }

  // Write .gitignore suggestion
  const gitignorePath = path.join(outputDir, ".gitignore-suggestion.txt");
  const suggestion = `# Add to your .gitignore if you don't want to commit the graph:
# .codeknowledge/graph.json
# .codeknowledge/summaries.json
#
# RECOMMENDED: Commit SUMMARY.md files for documentation:
# (do NOT gitignore .codeknowledge/**/SUMMARY.md)
`;
  await fs.writeFile(gitignorePath, suggestion, "utf8");

  logger.info("\n✅ codeknowledge initialized!");
  logger.info("   Next step: run `ck index` to build the knowledge graph");
  logger.info("   Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM summaries");
}
