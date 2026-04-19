import type { ParsedNode, ParsedEdge, ParseError } from "../parser/types.js";
export interface PoolOptions {
    /** Number of concurrent parse operations (default: 4) */
    workers: number;
    /** Maximum file size in KB (default: 200) */
    maxFileSizeKB?: number;
    /** Progress callback */
    onProgress?: (completed: number, total: number, path: string) => void;
}
export interface PoolResult {
    nodes: ParsedNode[];
    edges: ParsedEdge[];
    errors: ParseError[];
    fileCount: number;
    elapsedMs: number;
}
/**
 * Parse multiple files concurrently using a semaphore-based pool.
 */
export declare function parseFilesParallel(filePaths: string[], rootDir: string, opts: PoolOptions): Promise<PoolResult>;
/**
 * Simple utility to determine optimal worker count.
 * Uses available CPU cores, capped at 8.
 */
export declare function defaultWorkerCount(): number;
//# sourceMappingURL=pool.d.ts.map