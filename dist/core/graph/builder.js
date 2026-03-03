"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGraph = buildGraph;
exports.mergeIntoGraph = mergeIntoGraph;
const index_js_1 = require("./index.js");
function buildGraph(allNodes, allEdges, existingGraph) {
    const graph = existingGraph ?? new index_js_1.CodeGraph();
    const now = new Date().toISOString();
    for (const node of allNodes) {
        const existing = graph.getNode(node.id);
        const graphNode = {
            ...node,
            stale: false,
            last_indexed: now,
            summary: existing?.summary,
            tags: existing?.tags,
        };
        graph.addNode(graphNode);
    }
    for (const edge of allEdges) {
        graph.addEdge(edge);
    }
    return graph;
}
function mergeIntoGraph(graph, newNodes, newEdges) {
    const now = new Date().toISOString();
    for (const node of newNodes) {
        const existing = graph.getNode(node.id);
        const needsSummaryUpdate = !existing || existing.hash !== node.hash;
        const graphNode = {
            ...node,
            stale: needsSummaryUpdate,
            last_indexed: now,
            summary: needsSummaryUpdate ? undefined : existing?.summary,
            tags: needsSummaryUpdate ? undefined : existing?.tags,
        };
        graph.addNode(graphNode);
    }
    for (const edge of newEdges) {
        graph.addEdge(edge);
    }
}
//# sourceMappingURL=builder.js.map