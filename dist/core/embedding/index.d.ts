/**
 * Local TF-IDF Code Embedder — zero external dependencies.
 *
 * Generates sparse vector embeddings from code/documentation text using:
 *   1. Code-aware tokenization (split on camelCase, snake_case, punctuation)
 *   2. TF-IDF weighting for vocabulary
 *   3. Cosine similarity for nearest-neighbor search
 */
/**
 * Code-aware tokenizer: splits on camelCase, snake_case, dots, brackets, etc.
 */
export declare function tokenize(text: string): string[];
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
export declare function buildVocabulary(corpus: string[][]): Vocabulary;
/**
 * Convert a token array to a TF-IDF vector (sparse representation).
 */
export declare function toVector(tokens: string[], vocab: Vocabulary): Float32Array;
/** Cosine similarity between two vectors. Returns 0-1. */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
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
export declare class ANNIndex {
    private entries;
    add(id: string, vector: Float32Array): void;
    addAll(items: Array<{
        id: string;
        vector: Float32Array;
    }>): void;
    /** Search for k nearest neighbors to a query vector. */
    search(query: Float32Array, k?: number): SearchResult[];
    /** Number of entries in the index. */
    get size(): number;
    /** Clear all entries. */
    clear(): void;
}
export interface EmbeddingResult {
    id: string;
    tokens: string[];
    vector: Float32Array;
}
/**
 * Generate embeddings for a set of code documents.
 * Returns the vocabulary and per-document embedding results.
 */
export declare function embedDocuments(documents: Array<{
    id: string;
    text: string;
}>): {
    vocab: Vocabulary;
    results: EmbeddingResult[];
    index: ANNIndex;
};
/**
 * Embed a query string using an existing vocabulary.
 */
export declare function embedQuery(query: string, vocab: Vocabulary): Float32Array;
//# sourceMappingURL=index.d.ts.map