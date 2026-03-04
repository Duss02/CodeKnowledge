/**
 * Synonym-enriched local embeddings — bridges the vocabulary gap
 * that TF-IDF can't handle without API calls.
 *
 * Strategy: expand code identifiers with natural-language synonyms
 * so queries like "authentication" match code containing "verifyJWT".
 *
 * This runs locally, zero cost, and provides measurable improvement
 * over raw TF-IDF on natural-language queries.
 */
import { tokenize, buildVocabulary, toVector, type Vocabulary } from "./index.js";
import type { GraphNode } from "../graph/index.js";

// ──────────── Code → NL Synonym Map ────────────

/**
 * Maps code-domain terms to natural-language equivalents.
 * These are the exact vocabulary bridges that TF-IDF misses.
 */
const SYNONYM_MAP: Record<string, string[]> = {
    // Auth domain
    auth: ["authentication", "credential", "login", "verify", "identity", "session", "token", "jwt", "password"],
    jwt: ["token", "authentication", "verify", "credential", "json", "web"],
    login: ["authenticate", "sign", "credential", "session", "user"],
    verify: ["validate", "check", "authenticate", "confirm"],
    credential: ["password", "auth", "identity", "login", "user"],

    // Parsing domain
    parse: ["analyze", "extract", "process", "read", "interpret", "tokenize", "ast", "syntax"],
    parser: ["analyzer", "processor", "reader", "interpreter", "ast"],
    tokenize: ["split", "lex", "scan", "parse", "token"],
    ast: ["syntax", "tree", "parse", "node", "abstract"],

    // Graph domain
    node: ["vertex", "element", "symbol", "entity"],
    edge: ["connection", "link", "relationship", "dependency", "import"],
    graph: ["network", "tree", "structure", "connection", "relationship"],
    traverse: ["walk", "visit", "explore", "search", "bfs"],
    bfs: ["breadth", "first", "search", "traverse", "explore"],

    // Storage domain
    store: ["save", "persist", "write", "database", "storage", "disk"],
    storage: ["persistence", "database", "save", "disk", "sqlite"],
    save: ["write", "persist", "store", "flush", "commit"],
    load: ["read", "restore", "fetch", "retrieve", "open"],
    database: ["store", "persist", "sqlite", "db", "query"],
    serialize: ["encode", "marshal", "convert", "write", "json", "disk"],

    // Search / Retrieval domain
    search: ["find", "query", "retrieve", "lookup", "locate", "match"],
    retrieve: ["fetch", "find", "get", "query", "search"],
    query: ["search", "find", "ask", "request", "lookup"],
    rank: ["score", "sort", "order", "priority", "weight"],
    fusion: ["merge", "combine", "blend", "aggregate", "rrf"],

    // Config domain
    config: ["configuration", "setting", "option", "parameter", "preference"],
    setting: ["config", "option", "parameter", "preference"],

    // Code structure
    export: ["expose", "public", "api", "interface", "provide"],
    import: ["require", "dependency", "include", "load", "module"],
    function: ["method", "procedure", "operation", "handler", "routine"],
    class: ["type", "struct", "object", "definition", "interface"],
    module: ["file", "package", "library", "component", "unit"],

    // Embedding domain
    embed: ["vector", "encode", "represent", "feature"],
    embedding: ["vector", "representation", "encode", "feature", "dense"],
    vector: ["array", "embedding", "feature", "encode", "dimension"],
    similarity: ["distance", "compare", "match", "cosine", "score"],
    cosine: ["similarity", "distance", "angle", "compare"],

    // LLM domain
    llm: ["language", "model", "ai", "generate", "prompt", "summary"],
    prompt: ["instruction", "message", "template", "input", "context"],
    summary: ["description", "overview", "abstract", "synopsis", "explain"],
    generate: ["create", "produce", "build", "synthesize", "output"],

    // CLI domain
    cli: ["command", "terminal", "console", "shell", "interface"],
    command: ["action", "operation", "instruction", "cli"],

    // File operations
    file: ["document", "source", "path", "module", "resource"],
    path: ["file", "location", "directory", "route", "resolve"],
    resolve: ["find", "locate", "determine", "path", "lookup"],
    detect: ["find", "identify", "discover", "recognize", "check"],

    // Staleness
    stale: ["outdated", "dirty", "changed", "modified", "invalid", "refresh"],
    watch: ["monitor", "observe", "track", "listen", "detect"],

    // Error handling
    error: ["exception", "failure", "problem", "issue", "bug"],
    handle: ["process", "manage", "catch", "deal", "respond"],

    // Data flow
    budget: ["limit", "cap", "threshold", "maximum", "constraint"],
    token: ["word", "unit", "element", "piece", "jwt", "auth"],
    count: ["total", "number", "size", "length", "amount"],
    estimate: ["approximate", "calculate", "compute", "predict"],

    // Common verbs
    build: ["create", "construct", "make", "generate", "assemble"],
    create: ["build", "make", "generate", "produce", "new"],
    compute: ["calculate", "determine", "evaluate", "process"],
    extract: ["get", "pull", "parse", "retrieve", "obtain"],
    boundary: ["limit", "edge", "border", "scope", "range"],
};

/**
 * Expand a token with code→NL synonyms.
 */
function expandWithSynonyms(token: string): string[] {
    const lower = token.toLowerCase();
    const synonyms = SYNONYM_MAP[lower];
    return synonyms ? [lower, ...synonyms] : [lower];
}

/**
 * Generate enriched text from a graph node by expanding code identifiers
 * with natural-language synonyms.
 */
export function enrichNodeText(node: GraphNode): string {
    const parts = [
        node.name || "",
        node.path || "",
        node.summary || "",
        (node.tags || []).join(" "),
        (node.exports || []).join(" "),
    ];

    // Tokenize and expand each token
    const rawTokens = tokenize(parts.join(" "));
    const enriched = rawTokens.flatMap(expandWithSynonyms);

    return enriched.join(" ");
}

/**
 * Generate enriched embeddings for all nodes in a graph.
 * Returns a vocabulary and a map of nodeId → vector.
 */
export function generateEnrichedEmbeddings(
    nodes: GraphNode[]
): { vocab: Vocabulary; vectors: Map<string, Float32Array> } {
    // Enrich each node's text
    const enrichedTexts = nodes.map((n) => tokenize(enrichNodeText(n)));

    // Build vocabulary from enriched corpus
    const vocab = buildVocabulary(enrichedTexts);

    // Generate vectors
    const vectors = new Map<string, Float32Array>();
    for (let i = 0; i < nodes.length; i++) {
        vectors.set(nodes[i].id, toVector(enrichedTexts[i], vocab));
    }

    return { vocab, vectors };
}

/**
 * Embed a query string using the enriched vocabulary.
 * Applies the same synonym expansion to the query.
 */
export function embedEnrichedQuery(
    query: string,
    vocab: Vocabulary
): Float32Array {
    const queryTokens = tokenize(query);
    const expanded = queryTokens.flatMap(expandWithSynonyms);
    return toVector(expanded, vocab);
}
