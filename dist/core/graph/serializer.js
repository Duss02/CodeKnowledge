"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGraph = saveGraph;
exports.loadGraph = loadGraph;
exports.graphExists = graphExists;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("./index.js");
async function saveGraph(graph, outputDir) {
    await promises_1.default.mkdir(outputDir, { recursive: true });
    const data = {
        version: "1",
        generated_at: new Date().toISOString(),
        nodes: graph.nodes(),
        edges: graph.edges(),
    };
    const graphPath = path_1.default.join(outputDir, "graph.json");
    await promises_1.default.writeFile(graphPath, JSON.stringify(data, null, 2), "utf8");
}
async function loadGraph(outputDir) {
    const graphPath = path_1.default.join(outputDir, "graph.json");
    try {
        const raw = await promises_1.default.readFile(graphPath, "utf8");
        const data = JSON.parse(raw);
        const graph = new index_js_1.CodeGraph();
        for (const node of data.nodes) {
            graph.addNode(node);
        }
        for (const edge of data.edges) {
            graph.addEdge(edge);
        }
        return graph;
    }
    catch {
        return null;
    }
}
async function graphExists(outputDir) {
    try {
        await promises_1.default.access(path_1.default.join(outputDir, "graph.json"));
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=serializer.js.map