/**
 * Local TF-IDF Code Embedder — zero external dependencies.
 *
 * Generates sparse vector embeddings from code/documentation text using:
 *   1. Code-aware tokenization (split on camelCase, snake_case, punctuation)
 *   2. TF-IDF weighting for vocabulary
 *   3. Cosine similarity for nearest-neighbor search
 */

// ──────────── Tokenizer ────────────

const STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "this", "that", "these", "those", "it", "its", "if", "else", "then",
    "and", "but", "or", "not", "no", "nor", "so", "too", "very",
    "import", "from", "export", "default", "const", "let", "var",
    "function", "class", "return", "new", "typeof", "instanceof",
    "true", "false", "null", "undefined", "void",
]);

/**
 * Code-aware tokenizer: splits on camelCase, snake_case, dots, brackets, etc.
 */
export function tokenize(text: string): string[] {
    return text
        // Split camelCase: insertSpace before uppercase letters
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        // Split on non-alphanumeric
        .split(/[^a-zA-Z0-9]+/)
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length > 1 && t.length < 40 && !STOP_WORDS.has(t));
}

// ──────────── TF-IDF ────────────

/** Term Frequency: count of each token in a document */
function termFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
    }
    // Normalize by max frequency
    const maxFreq = Math.max(...tf.values(), 1);
    for (const [k, v] of tf) {
        tf.set(k, 0.5 + 0.5 * (v / maxFreq)); // augmented TF
    }
    return tf;
}

export interface Vocabulary {
    /** Map of term → global index in the vocabulary */
    termIndex: Map<string, number>;
    /** Inverse document frequency for each term */
    idf: Map<string, number>;
    /** Total number of documents used to build the vocab */
    docCount: number;
}

/**
 * Build a vocabulary from a corpus of document token arrays.
 */
export function buildVocabulary(corpus: string[][]): Vocabulary {
    const docFreq = new Map<string, number>();
    const allTerms = new Set<string>();

    for (const tokens of corpus) {
        const unique = new Set(tokens);
        for (const t of unique) {
            allTerms.add(t);
            docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
    }

    const N = corpus.length;
    const idf = new Map<string, number>();
    const termIndex = new Map<string, number>();
    let idx = 0;
    for (const term of allTerms) {
        termIndex.set(term, idx++);
        idf.set(term, Math.log((N + 1) / ((docFreq.get(term) || 0) + 1)) + 1);
    }

    return { termIndex, idf, docCount: N };
}

/**
 * Convert a token array to a TF-IDF vector (sparse representation).
 */
export function toVector(tokens: string[], vocab: Vocabulary): Float32Array {
    const tf = termFrequency(tokens);
    const vec = new Float32Array(vocab.termIndex.size);

    for (const [term, freq] of tf) {
        const idx = vocab.termIndex.get(term);
        if (idx !== undefined) {
            vec[idx] = freq * (vocab.idf.get(term) || 1);
        }
    }

    return vec;
}

// ──────────── Similarity ────────────

/** Cosine similarity between two vectors. Returns 0-1. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

// ──────────── ANN Index ────────────

export interface IndexEntry {
    id: string;
    vector: Float32Array;
}

export interface SearchResult {
    id: string;
    score: number;
}

/**
 * Brute-force nearest-neighbor index using cosine similarity.
 * For codebases < 10K nodes, brute-force is fast enough (< 10ms).
 * Can be replaced with HNSW for larger corpora.
 */
export class ANNIndex {
    private entries: IndexEntry[] = [];

    add(id: string, vector: Float32Array): void {
        this.entries.push({ id, vector });
    }

    addAll(items: Array<{ id: string; vector: Float32Array }>): void {
        this.entries.push(...items);
    }

    /** Search for k nearest neighbors to a query vector. */
    search(query: Float32Array, k: number = 10): SearchResult[] {
        const scores: SearchResult[] = this.entries.map((entry) => ({
            id: entry.id,
            score: cosineSimilarity(query, entry.vector),
        }));

        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, k);
    }

    /** Number of entries in the index. */
    get size(): number {
        return this.entries.length;
    }

    /** Clear all entries. */
    clear(): void {
        this.entries = [];
    }
}

// ──────────── Code Embedder (high-level) ────────────

export interface EmbeddingResult {
    id: string;
    tokens: string[];
    vector: Float32Array;
}

/**
 * Generate embeddings for a set of code documents.
 * Returns the vocabulary and per-document embedding results.
 */
export function embedDocuments(
    documents: Array<{ id: string; text: string }>
): { vocab: Vocabulary; results: EmbeddingResult[]; index: ANNIndex } {
    // Tokenize all documents
    const tokenized = documents.map((d) => ({
        id: d.id,
        tokens: tokenize(d.text),
    }));

    // Build vocabulary from corpus
    const corpus = tokenized.map((t) => t.tokens);
    const vocab = buildVocabulary(corpus);

    // Generate vectors
    const results: EmbeddingResult[] = tokenized.map((t) => ({
        id: t.id,
        tokens: t.tokens,
        vector: toVector(t.tokens, vocab),
    }));

    // Build index
    const index = new ANNIndex();
    for (const r of results) {
        index.add(r.id, r.vector);
    }

    return { vocab, results, index };
}

/**
 * Embed a query string using an existing vocabulary.
 */
export function embedQuery(query: string, vocab: Vocabulary): Float32Array {
    const tokens = tokenize(query);
    return toVector(tokens, vocab);
}
