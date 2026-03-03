"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../../core/config/index.js");
const logger_js_1 = require("../../utils/logger.js");
async function runInit(targetDir = process.cwd()) {
    const outputDir = path_1.default.resolve(targetDir, index_js_1.DEFAULT_CONFIG.outputDir);
    try {
        await promises_1.default.mkdir(outputDir, { recursive: true });
        logger_js_1.logger.info(`Created ${outputDir}`);
    }
    catch (err) {
        logger_js_1.logger.error({ err }, "Failed to create output directory");
        process.exit(1);
    }
    // Write config.json
    await (0, index_js_1.saveConfig)(index_js_1.DEFAULT_CONFIG, outputDir);
    logger_js_1.logger.info(`Config saved to ${path_1.default.join(outputDir, "config.json")}`);
    // Write default ck.config.js if not present
    const ckConfigPath = path_1.default.join(targetDir, "ck.config.js");
    try {
        await promises_1.default.access(ckConfigPath);
        logger_js_1.logger.info("ck.config.js already exists, skipping");
    }
    catch {
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
        await promises_1.default.writeFile(ckConfigPath, defaultConfig, "utf8");
        logger_js_1.logger.info(`Created ck.config.js`);
    }
    // Write .gitignore suggestion
    const gitignorePath = path_1.default.join(outputDir, ".gitignore-suggestion.txt");
    const suggestion = `# Add to your .gitignore if you don't want to commit the graph:
# .codeknowledge/graph.json
# .codeknowledge/summaries.json
#
# RECOMMENDED: Commit SUMMARY.md files for documentation:
# (do NOT gitignore .codeknowledge/**/SUMMARY.md)
`;
    await promises_1.default.writeFile(gitignorePath, suggestion, "utf8");
    logger_js_1.logger.info("\n✅ codeknowledge initialized!");
    logger_js_1.logger.info("   Next step: run `ck index` to build the knowledge graph");
    logger_js_1.logger.info("   Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM summaries");
}
//# sourceMappingURL=init.js.map