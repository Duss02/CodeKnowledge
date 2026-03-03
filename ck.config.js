// codeknowledge config
// See: https://github.com/codeknowledge/codeknowledge#configuration
module.exports = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  apiKey: process.env.ANTHROPIC_API_KEY,

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

  outputDir: ".codeknowledge",
  generateMarkdown: true,

  mcpPort: "stdio",
};
