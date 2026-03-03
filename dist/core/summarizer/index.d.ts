import type { CodeGraph } from "../graph/index.js";
import type { CKConfig } from "../config/index.js";
import type { Logger } from "pino";
export interface SummarizerOptions {
    force?: boolean;
    onProgress?: (current: number, total: number, nodeId: string) => void;
}
export declare function summarizeGraph(graph: CodeGraph, rootDir: string, outputDir: string, config: CKConfig, logger: Logger, opts?: SummarizerOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map