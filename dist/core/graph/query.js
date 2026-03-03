"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryNode = queryNode;
exports.findUsages = findUsages;
exports.computeImpact = computeImpact;
exports.getEntryPoints = getEntryPoints;
exports.getOverview = getOverview;
function queryNode(graph, pathOrId) {
    // Try exact match first
    let node = graph.getNode(pathOrId);
    // Try partial match
    if (!node) {
        const matches = graph.search(pathOrId).filter((n) => n.type === "file");
        if (matches.length === 1)
            node = matches[0];
        else if (matches.length > 1) {
            // Prefer closest match
            node = matches.find((n) => n.id === pathOrId || n.name === pathOrId) ?? matches[0];
        }
    }
    if (!node)
        return null;
    return {
        node,
        dependencies: graph.successors(node.id),
        dependents: graph.predecessors(node.id),
    };
}
function findUsages(graph, symbol) {
    const lower = symbol.toLowerCase();
    return graph.nodes().filter((n) => {
        return (n.exports?.some((e) => e.toLowerCase() === lower) ||
            n.name?.toLowerCase() === lower ||
            n.id.toLowerCase().includes(lower));
    });
}
function computeImpact(graph, pathOrId, maxDepth = 3) {
    const node = graph.getNode(pathOrId);
    if (!node)
        return null;
    const visited = new Set();
    const affected = [];
    function traverse(id, depth, via) {
        if (depth > maxDepth || visited.has(id))
            return;
        visited.add(id);
        const preds = graph.predecessors(id);
        for (const pred of preds) {
            if (pred.id === pathOrId)
                continue;
            affected.push({ node: pred, depth, via });
            traverse(pred.id, depth + 1, pred.id);
        }
    }
    traverse(pathOrId, 1, pathOrId);
    return { changed: node, affected };
}
function getEntryPoints(graph) {
    return graph.entryPoints();
}
function getOverview(graph) {
    const nodes = graph.nodes();
    const languages = {};
    for (const node of nodes) {
        if (node.language) {
            languages[node.language] = (languages[node.language] ?? 0) + 1;
        }
    }
    return {
        totalNodes: graph.nodeCount(),
        totalEdges: graph.edgeCount(),
        fileCount: nodes.filter((n) => n.type === "file").length,
        classCount: nodes.filter((n) => n.type === "class").length,
        functionCount: nodes.filter((n) => n.type === "function").length,
        languages,
        entryPoints: graph.entryPoints().slice(0, 10),
        staleCount: graph.staleNodes().length,
    };
}
//# sourceMappingURL=query.js.map