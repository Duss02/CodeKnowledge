"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeGraph = void 0;
const graphology_1 = __importDefault(require("graphology"));
const FILE_EXTENSIONS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".ipynb"]);
/** Returns true if the id looks like a real file path (has a known extension or path separator) */
function isFileLikePath(id) {
    if (id.includes("/") || id.includes("\\"))
        return true;
    const lastDot = id.lastIndexOf(".");
    if (lastDot === -1)
        return false;
    return FILE_EXTENSIONS.has(id.slice(lastDot).toLowerCase());
}
class CodeGraph {
    graph;
    constructor() {
        this.graph = new graphology_1.default({ allowSelfLoops: false, multi: false });
    }
    addNode(node) {
        if (this.graph.hasNode(node.id)) {
            this.graph.replaceNodeAttributes(node.id, node);
        }
        else {
            this.graph.addNode(node.id, node);
        }
    }
    addEdge(edge) {
        if (!this.graph.hasNode(edge.source)) {
            this.graph.addNode(edge.source, { id: edge.source, type: "file", stale: false, last_indexed: new Date().toISOString() });
        }
        // Only auto-create a target node if it looks like an actual file path.
        // Bare class/module names (e.g. "object", "Enum", "BaseRecommender") that
        // appear as inheritance targets should NOT become ghost file nodes.
        if (!this.graph.hasNode(edge.target)) {
            if (isFileLikePath(edge.target)) {
                this.graph.addNode(edge.target, { id: edge.target, type: "file", stale: false, last_indexed: new Date().toISOString() });
            }
            else {
                // Dangling reference to a class/symbol that isn't in the graph — skip the edge
                return;
            }
        }
        const edgeKey = `${edge.source}→${edge.target}:${edge.type}`;
        if (!this.graph.hasEdge(edgeKey)) {
            try {
                this.graph.addDirectedEdgeWithKey(edgeKey, edge.source, edge.target, edge);
            }
            catch {
                // ignore duplicate edges
            }
        }
    }
    getNode(id) {
        if (!this.graph.hasNode(id))
            return undefined;
        return this.graph.getNodeAttributes(id);
    }
    updateNode(id, attrs) {
        if (!this.graph.hasNode(id))
            return;
        this.graph.mergeNodeAttributes(id, attrs);
    }
    hasNode(id) {
        return this.graph.hasNode(id);
    }
    removeNode(id) {
        if (this.graph.hasNode(id)) {
            this.graph.dropNode(id);
        }
    }
    nodes() {
        return this.graph.nodes().map((id) => this.graph.getNodeAttributes(id));
    }
    edges() {
        return this.graph.edges().map((key) => this.graph.getEdgeAttributes(key));
    }
    nodeCount() {
        return this.graph.order;
    }
    edgeCount() {
        return this.graph.size;
    }
    /** Returns direct predecessors (nodes that have edges pointing TO id) */
    predecessors(id) {
        if (!this.graph.hasNode(id))
            return [];
        return this.graph.inNeighbors(id).map((n) => this.graph.getNodeAttributes(n));
    }
    /** Returns direct successors (nodes that id has edges pointing TO) */
    successors(id) {
        if (!this.graph.hasNode(id))
            return [];
        return this.graph.outNeighbors(id).map((n) => this.graph.getNodeAttributes(n));
    }
    /** Find all nodes whose id or name fuzzy-matches the query */
    search(query) {
        const lower = query.toLowerCase();
        return this.nodes().filter((n) => {
            return (n.id.toLowerCase().includes(lower) ||
                (n.name && n.name.toLowerCase().includes(lower)) ||
                (n.summary && n.summary.toLowerCase().includes(lower)) ||
                (n.tags && n.tags.some((t) => t.toLowerCase().includes(lower))));
        });
    }
    /** Transitive dependents up to maxDepth hops */
    transitiveSuccessors(id, maxDepth = 3) {
        const visited = new Set();
        const queue = [{ id, depth: 0 }];
        const result = [];
        while (queue.length > 0) {
            const { id: current, depth } = queue.shift();
            if (visited.has(current) || depth > maxDepth)
                continue;
            visited.add(current);
            const node = this.getNode(current);
            if (node && current !== id)
                result.push(node);
            if (depth < maxDepth) {
                for (const succ of this.graph.outNeighbors(current)) {
                    if (!visited.has(succ)) {
                        queue.push({ id: succ, depth: depth + 1 });
                    }
                }
            }
        }
        return result;
    }
    /** Transitive predecessors (who depends on this?) */
    transitivePredecessors(id, maxDepth = 3) {
        const visited = new Set();
        const queue = [{ id, depth: 0 }];
        const result = [];
        while (queue.length > 0) {
            const { id: current, depth } = queue.shift();
            if (visited.has(current) || depth > maxDepth)
                continue;
            visited.add(current);
            const node = this.getNode(current);
            if (node && current !== id)
                result.push(node);
            if (depth < maxDepth) {
                for (const pred of this.graph.inNeighbors(current)) {
                    if (!visited.has(pred)) {
                        queue.push({ id: pred, depth: depth + 1 });
                    }
                }
            }
        }
        return result;
    }
    /** Entry points = nodes with no incoming edges */
    entryPoints() {
        return this.nodes().filter((n) => this.graph.inDegree(n.id) === 0 && n.type === "file");
    }
    /** Mark a node as stale, also stale all nodes that import it */
    markStale(id) {
        if (this.graph.hasNode(id)) {
            this.graph.mergeNodeAttributes(id, { stale: true });
        }
        for (const pred of this.graph.inNeighbors(id)) {
            this.graph.mergeNodeAttributes(pred, { stale: true });
        }
    }
    staleNodes() {
        return this.nodes().filter((n) => n.stale);
    }
    getRawGraph() {
        return this.graph;
    }
}
exports.CodeGraph = CodeGraph;
//# sourceMappingURL=index.js.map