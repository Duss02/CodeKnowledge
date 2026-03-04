/**
 * Neural embedding client — optional layer using OpenAI's embedding API.
 * Falls back silently when no API key is configured.
 */
import OpenAI from "openai";
import type { CKConfig } from "../config/index.js";

/**
 * Embed a batch of texts using the configured embedding model.
 * Returns Float32Array vectors aligned with the input texts.
 */
export async function embedTexts(
    texts: string[],
    config: CKConfig
): Promise<Float32Array[]> {
    if (config.embeddingProvider !== "openai" || !config.openAIApiKey) {
        return [];
    }

    const client = new OpenAI({ apiKey: config.openAIApiKey });
    const batchSize = 100; // OpenAI max is 2048, but 100 keeps requests small
    const allVectors: Float32Array[] = [];

    // Sanitize: replace empty/whitespace-only strings with a placeholder
    const sanitized = texts.map((t) => (t.trim() || "empty"));

    for (let i = 0; i < sanitized.length; i += batchSize) {
        const batch = sanitized.slice(i, i + batchSize);
        const response = await client.embeddings.create({
            model: config.embeddingModel,
            input: batch,
        });

        for (const item of response.data) {
            allVectors.push(new Float32Array(item.embedding));
        }
    }

    return allVectors;
}

/**
 * Embed a single query string.
 */
export async function embedSingle(
    text: string,
    config: CKConfig
): Promise<Float32Array | null> {
    const results = await embedTexts([text], config);
    return results.length > 0 ? results[0] : null;
}

/**
 * Prepare document text for embedding from a graph node.
 */
export function nodeToEmbeddingText(node: {
    name: string;
    path: string;
    summary?: string;
    tags?: string[];
    exports?: string[];
}): string {
    return [
        node.name,
        node.path,
        node.summary || "",
        (node.tags || []).join(" "),
        (node.exports || []).join(" "),
    ]
        .filter(Boolean)
        .join(" ");
}
