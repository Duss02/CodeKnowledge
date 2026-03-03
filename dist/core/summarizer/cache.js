"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSummaryCache = loadSummaryCache;
exports.saveSummaryCache = saveSummaryCache;
exports.getCached = getCached;
exports.setCached = setCached;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
async function loadSummaryCache(outputDir) {
    const cachePath = path_1.default.join(outputDir, "summaries.json");
    try {
        const raw = await promises_1.default.readFile(cachePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function saveSummaryCache(cache, outputDir) {
    const cachePath = path_1.default.join(outputDir, "summaries.json");
    await promises_1.default.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}
function getCached(cache, nodeId, currentHash) {
    const entry = cache[nodeId];
    if (!entry)
        return null;
    if (entry.hash !== currentHash)
        return null;
    return entry.result;
}
function setCached(cache, nodeId, hash, result) {
    cache[nodeId] = {
        hash,
        result,
        cached_at: new Date().toISOString(),
    };
}
//# sourceMappingURL=cache.js.map