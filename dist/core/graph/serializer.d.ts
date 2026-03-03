import { CodeGraph, type GraphNode, type GraphEdge } from "./index.js";
export interface GraphJson {
    version: "1";
    generated_at: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}
export declare function saveGraph(graph: CodeGraph, outputDir: string): Promise<void>;
export declare function loadGraph(outputDir: string): Promise<CodeGraph | null>;
export declare function graphExists(outputDir: string): Promise<boolean>;
//# sourceMappingURL=serializer.d.ts.map