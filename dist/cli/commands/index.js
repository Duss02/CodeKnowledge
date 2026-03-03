"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIndex = runIndex;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const minimatch_1 = require("minimatch");
const index_js_1 = require("../../core/config/index.js");
const index_js_2 = require("../../core/parser/index.js");
const builder_js_1 = require("../../core/graph/builder.js");
const serializer_js_1 = require("../../core/graph/serializer.js");
const index_js_3 = require("../../core/summarizer/index.js");
const markdown_js_1 = require("../../core/summarizer/markdown.js");
const logger_js_1 = require("../../utils/logger.js");
const language_js_1 = require("../../utils/language.js");
async function collectFiles(rootDir, include, exclude, maxFileSizeKB) {
    const allFiles = [];
    async function walk(dir) {
        let entries;
        try {
            entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path_1.default.join(dir, entry.name);
            const relPath = path_1.default.relative(rootDir, fullPath).replace(/\\/g, "/");
            // Check exclude patterns
            const isExcluded = exclude.some((pattern) => (0, minimatch_1.minimatch)(relPath, pattern, { dot: true }));
            if (isExcluded)
                continue;
            if (entry.isDirectory()) {
                await walk(fullPath);
            }
            else if (entry.isFile()) {
                if (!(0, language_js_1.isSupported)(fullPath))
                    continue;
                // Check file size
                try {
                    const stat = await promises_1.default.stat(fullPath);
                    if (stat.size > maxFileSizeKB * 1024)
                        continue;
                }
                catch {
                    continue;
                }
                allFiles.push(fullPath);
            }
        }
    }
    await walk(rootDir);
    return allFiles;
}
async function runIndex(targetPaths, opts = {}) {
    const cwd = process.cwd();
    const config = await (0, index_js_1.loadConfig)(cwd);
    if (opts.noSummaries)
        config.summaries = false;
    if (opts.noMarkdown)
        config.generateMarkdown = false;
    const roots = targetPaths.length > 0
        ? targetPaths.map((p) => path_1.default.resolve(cwd, p))
        : [cwd];
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    await promises_1.default.mkdir(outputDir, { recursive: true });
    logger_js_1.logger.info(`Indexing ${roots.length} path(s)...`);
    const start = Date.now();
    const allNodes = [];
    const allEdges = [];
    let fileCount = 0;
    let errorCount = 0;
    for (const rootDir of roots) {
        const files = await collectFiles(rootDir, config.include, config.exclude, config.maxFileSizeKB);
        logger_js_1.logger.info(`Found ${files.length} files in ${path_1.default.relative(cwd, rootDir) || "."}`);
        for (const filePath of files) {
            try {
                const result = await (0, index_js_2.parseFile)(filePath, rootDir);
                if (!result)
                    continue;
                allNodes.push(...result.nodes);
                allEdges.push(...result.edges);
                fileCount++;
                if (fileCount % 50 === 0) {
                    logger_js_1.logger.info(`Parsed ${fileCount} files...`);
                }
            }
            catch (err) {
                errorCount++;
                logger_js_1.logger.warn({ path: path_1.default.relative(cwd, filePath), err: err.message }, "Error parsing file, skipping");
            }
        }
    }
    logger_js_1.logger.info(`Parsed ${fileCount} files (${errorCount} errors). Building graph...`);
    const existingGraph = opts.force ? null : await (0, serializer_js_1.loadGraph)(outputDir);
    const graph = (0, builder_js_1.buildGraph)(allNodes, allEdges, existingGraph ?? undefined);
    logger_js_1.logger.info(`Graph built: ${graph.nodeCount()} nodes, ${graph.edgeCount()} edges`);
    // LLM summaries
    if (config.summaries) {
        await (0, index_js_3.summarizeGraph)(graph, roots[0] ?? cwd, outputDir, config, logger_js_1.logger, {
            force: opts.force,
            onProgress: (current, total, nodeId) => {
                if (current % 5 === 0 || current === total) {
                    logger_js_1.logger.info(`  [${current}/${total}] ${nodeId}`);
                }
            },
        });
    }
    // Save graph
    await (0, serializer_js_1.saveGraph)(graph, outputDir);
    logger_js_1.logger.info(`Graph saved to ${path_1.default.join(outputDir, "graph.json")}`);
    // Generate SUMMARY.md
    if (config.generateMarkdown) {
        await (0, markdown_js_1.generateAllMarkdown)(graph, outputDir, roots[0] ?? cwd);
        logger_js_1.logger.info(`SUMMARY.md files generated in ${outputDir}`);
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger_js_1.logger.info(`\n✅ Indexed ${fileCount} files in ${elapsed}s`);
    logger_js_1.logger.info(`   Nodes: ${graph.nodeCount()}, Edges: ${graph.edgeCount()}`);
    logger_js_1.logger.info(`   Output: ${outputDir}`);
}
//# sourceMappingURL=index.js.map