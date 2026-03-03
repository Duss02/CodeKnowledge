"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWatch = runWatch;
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../../core/config/index.js");
const serializer_js_1 = require("../../core/graph/serializer.js");
const index_js_2 = require("../../core/watcher/index.js");
const logger_js_1 = require("../../utils/logger.js");
async function runWatch() {
    const cwd = process.cwd();
    const config = await (0, index_js_1.loadConfig)(cwd);
    const outputDir = path_1.default.resolve(cwd, config.outputDir);
    const graph = await (0, serializer_js_1.loadGraph)(outputDir);
    if (!graph) {
        logger_js_1.logger.error("No graph found. Run `ck index` first.");
        process.exit(1);
    }
    logger_js_1.logger.info("Starting watch mode... (press Ctrl+C to stop)");
    logger_js_1.logger.info(`Watching: ${cwd}`);
    const watcher = (0, index_js_2.startWatcher)({
        rootDir: cwd,
        outputDir,
        config,
        logger: logger_js_1.logger,
    });
    process.on("SIGINT", async () => {
        logger_js_1.logger.info("\nStopping watcher...");
        await watcher.close();
        process.exit(0);
    });
    // Keep process alive
    await new Promise(() => { });
}
//# sourceMappingURL=watch.js.map