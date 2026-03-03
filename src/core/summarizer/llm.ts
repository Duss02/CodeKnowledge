import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { CKConfig } from "../config/index.js";
import { hasApiKey } from "../config/index.js";

export interface LLMSummaryResult {
  summary: string;
  exports: string[];
  tags: string[];
}

const SYSTEM_PROMPT = `You are a code analyzer. Given a code snippet, produce a concise summary.
Focus on: what it does, key functions/classes, dependencies, side effects.
Be factual and specific. No fluff. Output plain text, no markdown.`;

function truncateCode(code: string, maxLines: number): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
}

function parseResponse(text: string): LLMSummaryResult {
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=EXPORTS:|$)/i);
  const exportsMatch = text.match(/EXPORTS:\s*([\s\S]*?)(?=TAGS:|$)/i);
  const tagsMatch = text.match(/TAGS:\s*([\s\S]*?)$/i);

  const summary = summaryMatch?.[1]?.trim() ?? text.slice(0, 300).trim();
  const exportsRaw = exportsMatch?.[1]?.trim() ?? "";
  const tagsRaw = tagsMatch?.[1]?.trim() ?? "";

  const exports = exportsRaw
    ? exportsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const tags = tagsRaw
    ? tagsRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  return { summary, exports, tags };
}

function buildUserMessage(code: string, filePath: string, language: string, maxLines: number): string {
  const truncated = truncateCode(code, maxLines);
  return `Language: ${language}
File: ${filePath}
---
${truncated}
---

Respond in this exact format:
SUMMARY: <3-5 lines describing what this file/class does>
EXPORTS: <comma-separated list of main exports>
TAGS: <3-6 lowercase keywords>`;
}

async function callAnthropic(
  userMessage: string,
  config: CKConfig
): Promise<string | null> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const message = await client.messages.create({
    model: config.model,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const content = message.content[0];
  return content.type === "text" ? content.text : null;
}

async function callOpenAI(
  userMessage: string,
  config: CKConfig
): Promise<string | null> {
  const client = new OpenAI({ apiKey: config.openAIApiKey });
  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: 512,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });
  return response.choices[0]?.message?.content ?? null;
}

export async function generateSummary(
  code: string,
  filePath: string,
  language: string,
  config: CKConfig
): Promise<LLMSummaryResult | null> {
  if (!hasApiKey(config)) return null;

  const userMessage = buildUserMessage(code, filePath, language, config.summaryMaxLines);

  try {
    let text: string | null = null;

    if (config.provider === "openai") {
      text = await callOpenAI(userMessage, config);
    } else {
      text = await callAnthropic(userMessage, config);
    }

    if (!text) return null;
    return parseResponse(text);
  } catch {
    return null;
  }
}

/** Generic LLM call used by ck_query and CLI query command */
export async function callLLM(
  prompt: string,
  config: CKConfig,
  maxTokens = 1024
): Promise<string | null> {
  if (!hasApiKey(config)) return null;

  try {
    if (config.provider === "openai") {
      const client = new OpenAI({ apiKey: config.openAIApiKey });
      const response = await client.chat.completions.create({
        model: config.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return response.choices[0]?.message?.content ?? null;
    } else {
      const client = new Anthropic({ apiKey: config.apiKey });
      const message = await client.messages.create({
        model: config.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      const content = message.content[0];
      return content.type === "text" ? content.text : null;
    }
  } catch {
    return null;
  }
}
