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
export declare function hasApiKey(config: CKConfig): boolean;
export declare const DEFAULT_CONFIG: CKConfig;
export declare function loadConfig(cwd?: string): Promise<CKConfig>;
export declare function saveConfig(config: CKConfig, outputDir: string): Promise<void>;
//# sourceMappingURL=index.d.ts.map