"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.hasApiKey = hasApiKey;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const cosmiconfig_1 = require("cosmiconfig");
const path_1 = __importDefault(require("path"));
/** Returns true if the config has a usable API key for the chosen provider */
function hasApiKey(config) {
    if (config.provider === "openai")
        return !!config.openAIApiKey;
    return !!config.apiKey;
}
/** Auto-detect provider based on which env var is set; Anthropic wins if both are set */
function detectProvider() {
    if (process.env.ANTHROPIC_API_KEY)
        return { provider: "anthropic", model: "claude-haiku-4-5" };
    if (process.env.OPENAI_API_KEY)
        return { provider: "openai", model: "gpt-4o-mini" };
    return { provider: "anthropic", model: "claude-haiku-4-5" };
}
const detected = detectProvider();
exports.DEFAULT_CONFIG = {
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
async function loadConfig(cwd = process.cwd()) {
    const explorer = (0, cosmiconfig_1.cosmiconfig)("ck");
    const result = await explorer.search(cwd);
    const base = {
        ...exports.DEFAULT_CONFIG,
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
    const ckJsonPath = path_1.default.join(cwd, exports.DEFAULT_CONFIG.outputDir, "config.json");
    try {
        const fs = await Promise.resolve().then(() => __importStar(require("fs/promises")));
        const raw = await fs.readFile(ckJsonPath, "utf8");
        const saved = JSON.parse(raw);
        return { ...base, ...saved };
    }
    catch {
        // no saved config, use defaults
    }
    return base;
}
async function saveConfig(config, outputDir) {
    const fs = await Promise.resolve().then(() => __importStar(require("fs/promises")));
    const configPath = path_1.default.join(outputDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}
//# sourceMappingURL=index.js.map