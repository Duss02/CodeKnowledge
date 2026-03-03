"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateIfChanged = invalidateIfChanged;
exports.markFileStale = markFileStale;
const hash_js_1 = require("../../utils/hash.js");
/**
 * Given a file path and new content, determine if the node is stale
 * and mark it (and its dependents) as stale in the graph.
 * Returns true if the node was stale (needs re-index).
 */
function invalidateIfChanged(graph, nodeId, newContent) {
    const node = graph.getNode(nodeId);
    if (!node)
        return true; // new file, needs indexing
    const newHash = (0, hash_js_1.sha256)(newContent);
    if (node.hash === newHash)
        return false; // unchanged
    graph.markStale(nodeId);
    return true;
}
function markFileStale(graph, nodeId) {
    graph.markStale(nodeId);
}
//# sourceMappingURL=invalidator.js.map