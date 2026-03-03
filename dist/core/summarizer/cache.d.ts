import type { LLMSummaryResult } from "./llm.js";
export interface SummaryCache {
    [nodeId: string]: {
        hash: string;
        result: LLMSummaryResult;
        cached_at: string;
    };
}
export declare function loadSummaryCache(outputDir: string): Promise<SummaryCache>;
export declare function saveSummaryCache(cache: SummaryCache, outputDir: string): Promise<void>;
export declare function getCached(cache: SummaryCache, nodeId: string, currentHash: string): LLMSummaryResult | null;
export declare function setCached(cache: SummaryCache, nodeId: string, hash: string, result: LLMSummaryResult): void;
//# sourceMappingURL=cache.d.ts.map