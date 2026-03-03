import fs from "fs/promises";
import path from "path";
import type { LLMSummaryResult } from "./llm.js";

export interface SummaryCache {
  [nodeId: string]: {
    hash: string;
    result: LLMSummaryResult;
    cached_at: string;
  };
}

export async function loadSummaryCache(outputDir: string): Promise<SummaryCache> {
  const cachePath = path.join(outputDir, "summaries.json");
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    return JSON.parse(raw) as SummaryCache;
  } catch {
    return {};
  }
}

export async function saveSummaryCache(
  cache: SummaryCache,
  outputDir: string
): Promise<void> {
  const cachePath = path.join(outputDir, "summaries.json");
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

export function getCached(
  cache: SummaryCache,
  nodeId: string,
  currentHash: string
): LLMSummaryResult | null {
  const entry = cache[nodeId];
  if (!entry) return null;
  if (entry.hash !== currentHash) return null;
  return entry.result;
}

export function setCached(
  cache: SummaryCache,
  nodeId: string,
  hash: string,
  result: LLMSummaryResult
): void {
  cache[nodeId] = {
    hash,
    result,
    cached_at: new Date().toISOString(),
  };
}
