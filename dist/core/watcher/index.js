"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWatcher = startWatcher;
const chokidar_1 = __importDefault(require("chokidar"));
const path_1 = __importDefault(require("path"));
const language_js_1 = require("../../utils/language.js");
const index_js_1 = require("../parser/index.js");
const builder_js_1 = require("../graph/builder.js");
const serializer_js_1 = require("../graph/serializer.js");
const index_js_2 = require("../summarizer/index.js");
const markdown_js_1 = require("../summarizer/markdown.js");
function startWatcher(opts) {
    const { rootDir, outputDir, config, logger } = opts;
    let graph = null;
    let reindexQueue = new Set();
    let reindexTimer = null;
    async function ensureGraph() {
        if (!graph) {
            graph = await (0, serializer_js_1.loadGraph)(outputDir);
        }
        if (!graph) {
            throw new Error("No graph found. Run `ck index` first.");
        }
        return graph;
    }
    async function processQueue() {
        if (reindexQueue.size === 0)
            return;
        const toProcess = [...reindexQueue];
        reindexQueue.clear();
        const g = await ensureGraph();
        const start = Date.now();
        let reindexed = 0;
        const newNodes = [];
        const newEdges = [];
        for (const filePath of toProcess) {
            const result = await (0, index_js_1.parseFile)(filePath, rootDir);
            if (!result)
                continue;
            newNodes.push(...result.nodes);
            newEdges.push(...result.edges);
            reindexed++;
        }
        (0, builder_js_1.mergeIntoGraph)(g, newNodes, newEdges);
        await (0, index_js_2.summarizeGraph)(g, rootDir, outputDir, config, logger);
        await (0, serializer_js_1.saveGraph)(g, outputDir);
        if (config.generateMarkdown) {
            await (0, markdown_js_1.generateAllMarkdown)(g, outputDir, rootDir);
        }
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        logger.info(`Re-indexed ${reindexed} file(s) in ${elapsed}s`);
    }
    function scheduleReindex(filePath) {
        reindexQueue.add(filePath);
        if (reindexTimer)
            clearTimeout(reindexTimer);
        reindexTimer = setTimeout(() => {
            processQueue().catch((err) => logger.error({ err }, "Error during re-index"));
        }, 500);
    }
    const ignored = config.exclude.map((p) => p.startsWith("**/") ? p : `**/${p}`);
    const watcher = chokidar_1.default.watch(rootDir, {
        ignored: [
            ...ignored,
            path_1.default.join(outputDir, "**"),
            "**/node_modules/**",
            "**/.git/**",
        ],
        persistent: true,
        ignoreInitial: true,
    });
    watcher
        .on("change", (filePath) => {
        if (!(0, language_js_1.isSupported)(filePath))
            return;
        const relPath = path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
        logger.info({ path: relPath }, "File changed, scheduling re-index");
        scheduleReindex(filePath);
    })
        .on("add", (filePath) => {
        if (!(0, language_js_1.isSupported)(filePath))
            return;
        const relPath = path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
        logger.info({ path: relPath }, "New file detected, scheduling index");
        scheduleReindex(filePath);
    })
        .on("unlink", async (filePath) => {
        if (!(0, language_js_1.isSupported)(filePath))
            return;
        const relPath = path_1.default.relative(rootDir, filePath).replace(/\\/g, "/");
        logger.info({ path: relPath }, "File removed, updating graph");
        try {
            const g = await ensureGraph();
            g.removeNode(relPath);
            await (0, serializer_js_1.saveGraph)(g, outputDir);
        }
        catch (err) {
            logger.error({ err, path: relPath }, "Error removing node");
        }
    });
    return watcher;
}
//# sourceMappingURL=index.js.map