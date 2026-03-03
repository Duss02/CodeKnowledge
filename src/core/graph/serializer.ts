import fs from "fs/promises";
import path from "path";
import { CodeGraph, type GraphNode, type GraphEdge } from "./index.js";

export interface GraphJson {
  version: "1";
  generated_at: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function saveGraph(graph: CodeGraph, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  const data: GraphJson = {
    version: "1",
    generated_at: new Date().toISOString(),
    nodes: graph.nodes(),
    edges: graph.edges(),
  };

  const graphPath = path.join(outputDir, "graph.json");
  await fs.writeFile(graphPath, JSON.stringify(data, null, 2), "utf8");
}

export async function loadGraph(outputDir: string): Promise<CodeGraph | null> {
  const graphPath = path.join(outputDir, "graph.json");

  try {
    const raw = await fs.readFile(graphPath, "utf8");
    const data = JSON.parse(raw) as GraphJson;

    const graph = new CodeGraph();

    for (const node of data.nodes) {
      graph.addNode(node);
    }
    for (const edge of data.edges) {
      graph.addEdge(edge);
    }

    return graph;
  } catch {
    return null;
  }
}

export async function graphExists(outputDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(outputDir, "graph.json"));
    return true;
  } catch {
    return false;
  }
}
