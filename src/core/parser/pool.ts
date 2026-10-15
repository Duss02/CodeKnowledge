/**
 * ParserPool — Concurrent file parsing with configurable parallelism.
 *
 * Uses a Promise-based concurrency pool for parallel file I/O + parsing.
 * Tree-sitter parsers use native modules that don't serialize well across
 * worker_threads, so we use async concurrency within the main thread instead.
 */
import { parseFile } from "../parser/index.js";
import type { ParseResult, ParsedNode, ParsedEdge, ParseError } from "../parser/types.js";

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
export async function parseFilesParallel(
    filePaths: string[],
    rootDir: string,
    opts: PoolOptions
): Promise<PoolResult> {
    const { workers, maxFileSizeKB = 200 } = opts;
    const concurrency = Math.max(1, Math.min(workers, filePaths.length));

    const allNodes: ParsedNode[] = [];
    const allEdges: ParsedEdge[] = [];
    const allErrors: ParseError[] = [];
    let completed = 0;

    const start = performance.now();

    // Semaphore-based concurrency pool
    const queue = [...filePaths];
    const running = new Set<Promise<void>>();

    async function processNext(): Promise<void> {
        while (queue.length > 0) {
            const filePath = queue.shift()!;
            try {
                const result = await parseFile(filePath, rootDir, { maxFileSizeKB });
                allNodes.push(...result.nodes);
                allEdges.push(...result.edges);
                allErrors.push(...result.errors);
            } catch (err) {
                allErrors.push({
                    file: filePath,
                    reason: "read_error",
                    message: (err as Error).message,
                });
            }
            completed++;
            opts.onProgress?.(completed, filePaths.length, filePath);
        }
    }

    // Launch `concurrency` workers
    const workers_arr: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
        workers_arr.push(processNext());
    }
    await Promise.all(workers_arr);

    const elapsed = performance.now() - start;

    return {
        nodes: allNodes,
        edges: allEdges,
        errors: allErrors,
        fileCount: filePaths.length,
        elapsedMs: elapsed,
    };
}

/**
 * Simple utility to determine optimal worker count.
 * Uses available CPU cores, capped at 8.
 */
export function defaultWorkerCount(): number {
    try {
        const os = require("os");
        return Math.min(os.cpus().length, 8);
    } catch {
        return 4;
    }
}
