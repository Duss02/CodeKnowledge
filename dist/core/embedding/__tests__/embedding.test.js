"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
// ────────── Tokenizer ──────────
(0, vitest_1.describe)("T7 — tokenize", () => {
    (0, vitest_1.it)("splits camelCase", () => {
        const tokens = (0, index_js_1.tokenize)("getUserById");
        (0, vitest_1.expect)(tokens).toContain("get");
        (0, vitest_1.expect)(tokens).toContain("user");
        (0, vitest_1.expect)(tokens).toContain("id");
    });
    (0, vitest_1.it)("splits snake_case", () => {
        const tokens = (0, index_js_1.tokenize)("get_user_by_id");
        (0, vitest_1.expect)(tokens).toContain("get");
        (0, vitest_1.expect)(tokens).toContain("user");
        (0, vitest_1.expect)(tokens).toContain("id");
    });
    (0, vitest_1.it)("removes stop words", () => {
        const tokens = (0, index_js_1.tokenize)("this is a test function that returns the value");
        (0, vitest_1.expect)(tokens).not.toContain("this");
        (0, vitest_1.expect)(tokens).not.toContain("is");
        (0, vitest_1.expect)(tokens).not.toContain("the");
        (0, vitest_1.expect)(tokens).toContain("test");
        (0, vitest_1.expect)(tokens).toContain("value");
    });
    (0, vitest_1.it)("filters single chars and very long tokens", () => {
        const tokens = (0, index_js_1.tokenize)("a x reallyValidToken " + "a".repeat(50));
        (0, vitest_1.expect)(tokens).not.toContain("a");
        (0, vitest_1.expect)(tokens).not.toContain("x");
        (0, vitest_1.expect)(tokens).toContain("really");
    });
    (0, vitest_1.it)("handles code with symbols", () => {
        const tokens = (0, index_js_1.tokenize)("export class AuthService { login(email: string) {} }");
        (0, vitest_1.expect)(tokens).toContain("auth");
        (0, vitest_1.expect)(tokens).toContain("service");
        (0, vitest_1.expect)(tokens).toContain("login");
        (0, vitest_1.expect)(tokens).toContain("email");
        (0, vitest_1.expect)(tokens).toContain("string");
    });
});
// ────────── TF-IDF ──────────
(0, vitest_1.describe)("T7 — buildVocabulary + toVector", () => {
    (0, vitest_1.it)("builds vocab from corpus", () => {
        const corpus = [
            (0, index_js_1.tokenize)("authentication service login"),
            (0, index_js_1.tokenize)("database connection pool"),
            (0, index_js_1.tokenize)("authentication token validation"),
        ];
        const vocab = (0, index_js_1.buildVocabulary)(corpus);
        (0, vitest_1.expect)(vocab.termIndex.size).toBeGreaterThan(0);
        (0, vitest_1.expect)(vocab.docCount).toBe(3);
        // "authentication" appears in 2/3 docs, so lower IDF than "pool"
        const authIdf = vocab.idf.get("authentication");
        const poolIdf = vocab.idf.get("pool");
        (0, vitest_1.expect)(poolIdf).toBeGreaterThan(authIdf);
    });
    (0, vitest_1.it)("toVector produces non-zero sparse vector", () => {
        const corpus = [
            (0, index_js_1.tokenize)("auth service login"),
            (0, index_js_1.tokenize)("database pool"),
        ];
        const vocab = (0, index_js_1.buildVocabulary)(corpus);
        const vec = (0, index_js_1.toVector)((0, index_js_1.tokenize)("auth service login"), vocab);
        (0, vitest_1.expect)(vec.length).toBe(vocab.termIndex.size);
        // At least some non-zero entries
        const nonZero = Array.from(vec).filter((v) => v !== 0);
        (0, vitest_1.expect)(nonZero.length).toBeGreaterThan(0);
    });
});
// ────────── Cosine Similarity ──────────
(0, vitest_1.describe)("T7 — cosineSimilarity", () => {
    (0, vitest_1.it)("identical vectors have similarity 1.0", () => {
        const v = new Float32Array([1, 2, 3, 4]);
        (0, vitest_1.expect)((0, index_js_1.cosineSimilarity)(v, v)).toBeCloseTo(1.0);
    });
    (0, vitest_1.it)("orthogonal vectors have similarity 0.0", () => {
        const a = new Float32Array([1, 0, 0, 0]);
        const b = new Float32Array([0, 1, 0, 0]);
        (0, vitest_1.expect)((0, index_js_1.cosineSimilarity)(a, b)).toBeCloseTo(0.0);
    });
    (0, vitest_1.it)("opposite vectors have similarity -1.0", () => {
        const a = new Float32Array([1, 2, 3]);
        const b = new Float32Array([-1, -2, -3]);
        (0, vitest_1.expect)((0, index_js_1.cosineSimilarity)(a, b)).toBeCloseTo(-1.0);
    });
    (0, vitest_1.it)("zero vectors return 0", () => {
        const z = new Float32Array(5);
        const v = new Float32Array([1, 2, 3, 4, 5]);
        (0, vitest_1.expect)((0, index_js_1.cosineSimilarity)(z, v)).toBe(0);
    });
});
// ────────── ANN Index ──────────
(0, vitest_1.describe)("T7 — ANNIndex", () => {
    (0, vitest_1.it)("returns nearest neighbors ranked by similarity", () => {
        const index = new index_js_1.ANNIndex();
        index.add("a", new Float32Array([1, 0, 0]));
        index.add("b", new Float32Array([0, 1, 0]));
        index.add("c", new Float32Array([1, 0.5, 0]));
        const results = index.search(new Float32Array([1, 0, 0]), 3);
        (0, vitest_1.expect)(results[0].id).toBe("a"); // exact match
        (0, vitest_1.expect)(results[0].score).toBeCloseTo(1.0);
        (0, vitest_1.expect)(results[1].id).toBe("c"); // close
    });
    (0, vitest_1.it)("respects k parameter", () => {
        const index = new index_js_1.ANNIndex();
        for (let i = 0; i < 10; i++) {
            const v = new Float32Array(3);
            v[0] = i;
            index.add(`item-${i}`, v);
        }
        (0, vitest_1.expect)(index.search(new Float32Array([5, 0, 0]), 3)).toHaveLength(3);
    });
    (0, vitest_1.it)("tracks size correctly", () => {
        const index = new index_js_1.ANNIndex();
        (0, vitest_1.expect)(index.size).toBe(0);
        index.add("a", new Float32Array(3));
        (0, vitest_1.expect)(index.size).toBe(1);
        index.clear();
        (0, vitest_1.expect)(index.size).toBe(0);
    });
    (0, vitest_1.it)("addAll adds multiple entries", () => {
        const index = new index_js_1.ANNIndex();
        index.addAll([
            { id: "a", vector: new Float32Array([1, 0]) },
            { id: "b", vector: new Float32Array([0, 1]) },
        ]);
        (0, vitest_1.expect)(index.size).toBe(2);
    });
});
// ────────── High-Level API ──────────
(0, vitest_1.describe)("T7 — embedDocuments + embedQuery", () => {
    const docs = [
        { id: "auth.ts", text: "export class AuthService { login(email, password) { return jwt.sign(user); } }" },
        { id: "db.ts", text: "export class Database { connect(url) { return pool.acquire(); } query(sql) { return rows; } }" },
        { id: "user.ts", text: "export class UserService { getUser(id) { return db.query('SELECT * FROM users'); } login(email) { return auth.login(email, pw); } }" },
        { id: "utils.ts", text: "export function formatDate(d) { return d.toISOString(); } export function hashPassword(pw) { return bcrypt.hash(pw); }" },
    ];
    (0, vitest_1.it)("generates embeddings for all documents", () => {
        const { vocab, results, index } = (0, index_js_1.embedDocuments)(docs);
        (0, vitest_1.expect)(results).toHaveLength(4);
        (0, vitest_1.expect)(vocab.docCount).toBe(4);
        (0, vitest_1.expect)(index.size).toBe(4);
        // Each result has a vector
        for (const r of results) {
            (0, vitest_1.expect)(r.vector.length).toBe(vocab.termIndex.size);
        }
    });
    (0, vitest_1.it)("finds auth-related files when querying 'authentication login'", () => {
        const { vocab, index } = (0, index_js_1.embedDocuments)(docs);
        const queryVec = (0, index_js_1.embedQuery)("authentication login jwt", vocab);
        const results = index.search(queryVec, 4);
        // auth.ts should be top result
        (0, vitest_1.expect)(results[0].id).toBe("auth.ts");
        console.log(`  Query "authentication login jwt" → top results:`, results.map((r) => `${r.id}(${r.score.toFixed(3)})`).join(", "));
    });
    (0, vitest_1.it)("finds database-related files when querying 'database connection'", () => {
        const { vocab, index } = (0, index_js_1.embedDocuments)(docs);
        const queryVec = (0, index_js_1.embedQuery)("database connection sql query", vocab);
        const results = index.search(queryVec, 4);
        // db.ts should be top result
        (0, vitest_1.expect)(results[0].id).toBe("db.ts");
    });
    (0, vitest_1.it)("finds utility functions when querying 'format hash'", () => {
        const { vocab, index } = (0, index_js_1.embedDocuments)(docs);
        const queryVec = (0, index_js_1.embedQuery)("format date hash password bcrypt", vocab);
        const results = index.search(queryVec, 4);
        (0, vitest_1.expect)(results[0].id).toBe("utils.ts");
    });
});
// ────────── Performance ──────────
(0, vitest_1.describe)("T7 — Embedding performance", () => {
    (0, vitest_1.it)("handles 1000 documents in reasonable time", () => {
        const docs = Array.from({ length: 1000 }, (_, i) => ({
            id: `file_${i}.ts`,
            text: `export class Module${i} { method${i}() { return data${i % 10}; } helper${i}() {} }`,
        }));
        const start = performance.now();
        const { index, vocab } = (0, index_js_1.embedDocuments)(docs);
        const buildTime = performance.now() - start;
        const queryStart = performance.now();
        const queryVec = (0, index_js_1.embedQuery)("module data helper", vocab);
        const results = index.search(queryVec, 10);
        const searchTime = performance.now() - queryStart;
        console.log(`  1000 docs: build=${buildTime.toFixed(0)}ms, search=${searchTime.toFixed(1)}ms`);
        (0, vitest_1.expect)(index.size).toBe(1000);
        (0, vitest_1.expect)(results).toHaveLength(10);
        (0, vitest_1.expect)(buildTime).toBeLessThan(5000);
        (0, vitest_1.expect)(searchTime).toBeLessThan(100);
    });
});
//# sourceMappingURL=embedding.test.js.map