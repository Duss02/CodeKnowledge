"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFilesParallel = parseFilesParallel;
exports.defaultWorkerCount = defaultWorkerCount;
/**
 * ParserPool — Concurrent file parsing with configurable parallelism.
 *
 * Uses a Promise-based concurrency pool for parallel file I/O + parsing.
 * Tree-sitter parsers use native modules that don't serialize well across
 * worker_threads, so we use async concurrency within the main thread instead.
 */
const index_js_1 = require("../parser/index.js");
/**
 * Parse multiple files concurrently using a semaphore-based pool.
 */
async function parseFilesParallel(filePaths, rootDir, opts) {
    const { workers, maxFileSizeKB = 200 } = opts;
    const concurrency = Math.max(1, Math.min(workers, filePaths.length));
    const allNodes = [];
    const allEdges = [];
    const allErrors = [];
    let completed = 0;
    const start = performance.now();
    // Semaphore-based concurrency pool
    const queue = [...filePaths];
    const running = new Set();
    async function processNext() {
        while (queue.length > 0) {
            const filePath = queue.shift();
            try {
                const result = await (0, index_js_1.parseFile)(filePath, rootDir, { maxFileSizeKB });
                allNodes.push(...result.nodes);
                allEdges.push(...result.edges);
                allErrors.push(...result.errors);
            }
            catch (err) {
                allErrors.push({
                    file: filePath,
                    reason: "read_error",
                    message: err.message,
                });
            }
            completed++;
            opts.onProgress?.(completed, filePaths.length, filePath);
        }
    }
    // Launch `concurrency` workers
    const workers_arr = [];
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
function defaultWorkerCount() {
    try {
        const os = require("os");
        return Math.min(os.cpus().length, 8);
    }
    catch {
        return 4;
    }
}
//# sourceMappingURL=pool.js.map