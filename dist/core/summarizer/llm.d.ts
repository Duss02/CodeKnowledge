import type { CKConfig } from "../config/index.js";
export interface LLMSummaryResult {
    summary: string;
    exports: string[];
    tags: string[];
}
export declare function generateSummary(code: string, filePath: string, language: string, config: CKConfig): Promise<LLMSummaryResult | null>;
/** Generic LLM call used by ck_query and CLI query command */
export declare function callLLM(prompt: string, config: CKConfig, maxTokens?: number): Promise<string | null>;
//# sourceMappingURL=llm.d.ts.map