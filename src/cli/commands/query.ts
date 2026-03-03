import path from "path";
import { loadConfig, hasApiKey } from "../../core/config/index.js";
import { loadGraph } from "../../core/graph/serializer.js";
import { queryNode, findUsages, computeImpact } from "../../core/graph/query.js";
import { callLLM } from "../../core/summarizer/llm.js";
import { logger } from "../../utils/logger.js";

export async function runQuery(question: string): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const outputDir = path.resolve(cwd, config.outputDir);
  const graph = await loadGraph(outputDir);

  if (!graph) {
    logger.error("No graph found. Run `ck index` first.");
    process.exit(1);
  }

  logger.info(`Query: "${question}"`);

  // 1. Try structural queries first
  if (question.match(/^(who uses|find usages of|what uses)\s+(.+)/i)) {
    const symbol = question.replace(/^(who uses|find usages of|what uses)\s+/i, "").trim();
    const results = findUsages(graph, symbol);
    if (results.length === 0) {
      console.log(`No usages found for "${symbol}"`);
    } else {
      console.log(`\nUsages of "${symbol}" (${results.length} results):\n`);
      for (const node of results) {
        console.log(`  • ${node.id} [${node.type}]`);
        if (node.summary) console.log(`    ${node.summary}`);
      }
    }
    return;
  }

  if (question.match(/^(impact of|what breaks if|what depends on)\s+(.+)/i)) {
    const target = question.replace(/^(impact of|what breaks if|what depends on)\s+/i, "").trim();
    const result = computeImpact(graph, target);
    if (!result) {
      console.log(`Node "${target}" not found in graph.`);
    } else {
      console.log(`\nImpact of changing "${result.changed.id}":\n`);
      if (result.affected.length === 0) {
        console.log("  No dependents found.");
      } else {
        for (const { node, depth } of result.affected) {
          const indent = "  ".repeat(depth);
          console.log(`${indent}• [depth ${depth}] ${node.id}`);
          if (node.summary) console.log(`${indent}  ${node.summary.slice(0, 100)}`);
        }
      }
    }
    return;
  }

  // 2. If an API key is configured, use LLM with graph context
  if (hasApiKey(config)) {
    await llmQuery(question, graph, config);
    return;
  }

  // 3. Fallback: structural search
  const results = graph.search(question);
  if (results.length === 0) {
    console.log(`No results found for "${question}"`);
    return;
  }

  console.log(`\nSearch results for "${question}" (${results.length} matches):\n`);
  for (const node of results.slice(0, 10)) {
    console.log(`  • ${node.id} [${node.type}]`);
    if (node.summary) console.log(`    ${node.summary.slice(0, 120)}`);
    console.log();
  }
}

async function llmQuery(
  question: string,
  graph: import("../../core/graph/index.js").CodeGraph,
  config: import("../../core/config/index.js").CKConfig
): Promise<void> {
  const results = graph.search(question).slice(0, 15);
  const allNodes = graph.nodes().filter((n) => n.type === "file" && n.summary);

  const context = (results.length > 0 ? results : allNodes.slice(0, 15))
    .map((n) => {
      const deps = graph.successors(n.id).map((d) => d.id).join(", ");
      return `[${n.id}] ${n.summary ?? "(no summary)"}${deps ? `\n  Imports: ${deps}` : ""}`;
    })
    .join("\n\n");

  const prompt = `You are analyzing a codebase. Use the knowledge graph context below to answer the question.

Knowledge Graph Context:
${context}

Question: ${question}

Answer concisely based on the graph data. If you don't have enough context, say so.`;

  const answer = await callLLM(prompt, config, 1024);
  if (answer) {
    console.log(`\n${answer}\n`);
  }
}
