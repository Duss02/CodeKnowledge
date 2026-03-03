import { CodeGraph } from "./index.js";
import type { ParsedNode, ParsedEdge } from "../parser/types.js";
export declare function buildGraph(allNodes: ParsedNode[], allEdges: ParsedEdge[], existingGraph?: CodeGraph): CodeGraph;
export declare function mergeIntoGraph(graph: CodeGraph, newNodes: ParsedNode[], newEdges: ParsedEdge[]): void;
//# sourceMappingURL=builder.d.ts.map