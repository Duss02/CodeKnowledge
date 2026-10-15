import { describe, it, expect } from "vitest";
import {
    tokenize,
    buildVocabulary,
    toVector,
    cosineSimilarity,
    ANNIndex,
    embedDocuments,
    embedQuery,
} from "../index.js";

// ────────── Tokenizer ──────────

describe("T7 — tokenize", () => {
    it("splits camelCase", () => {
        const tokens = tokenize("getUserById");
        expect(tokens).toContain("get");
        expect(tokens).toContain("user");
        expect(tokens).toContain("id");
    });

    it("splits snake_case", () => {
        const tokens = tokenize("get_user_by_id");
        expect(tokens).toContain("get");
        expect(tokens).toContain("user");
        expect(tokens).toContain("id");
    });

    it("removes stop words", () => {
        const tokens = tokenize("this is a test function that returns the value");
        expect(tokens).not.toContain("this");
        expect(tokens).not.toContain("is");
        expect(tokens).not.toContain("the");
        expect(tokens).toContain("test");
        expect(tokens).toContain("value");
    });

    it("filters single chars and very long tokens", () => {
        const tokens = tokenize("a x reallyValidToken " + "a".repeat(50));
        expect(tokens).not.toContain("a");
        expect(tokens).not.toContain("x");
        expect(tokens).toContain("really");
    });

    it("handles code with symbols", () => {
        const tokens = tokenize("export class AuthService { login(email: string) {} }");
        expect(tokens).toContain("auth");
        expect(tokens).toContain("service");
        expect(tokens).toContain("login");
        expect(tokens).toContain("email");
        expect(tokens).toContain("string");
    });
});

// ────────── TF-IDF ──────────

describe("T7 — buildVocabulary + toVector", () => {
    it("builds vocab from corpus", () => {
        const corpus = [
            tokenize("authentication service login"),
            tokenize("database connection pool"),
            tokenize("authentication token validation"),
        ];
        const vocab = buildVocabulary(corpus);
        expect(vocab.termIndex.size).toBeGreaterThan(0);
        expect(vocab.docCount).toBe(3);
        // "authentication" appears in 2/3 docs, so lower IDF than "pool"
        const authIdf = vocab.idf.get("authentication")!;
        const poolIdf = vocab.idf.get("pool")!;
        expect(poolIdf).toBeGreaterThan(authIdf);
    });

    it("toVector produces non-zero sparse vector", () => {
        const corpus = [
            tokenize("auth service login"),
            tokenize("database pool"),
        ];
        const vocab = buildVocabulary(corpus);
        const vec = toVector(tokenize("auth service login"), vocab);
        expect(vec.length).toBe(vocab.termIndex.size);
        // At least some non-zero entries
        const nonZero = Array.from(vec).filter((v) => v !== 0);
        expect(nonZero.length).toBeGreaterThan(0);
    });
});

// ────────── Cosine Similarity ──────────

describe("T7 — cosineSimilarity", () => {
    it("identical vectors have similarity 1.0", () => {
        const v = new Float32Array([1, 2, 3, 4]);
        expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it("orthogonal vectors have similarity 0.0", () => {
        const a = new Float32Array([1, 0, 0, 0]);
        const b = new Float32Array([0, 1, 0, 0]);
        expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it("opposite vectors have similarity -1.0", () => {
        const a = new Float32Array([1, 2, 3]);
        const b = new Float32Array([-1, -2, -3]);
        expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it("zero vectors return 0", () => {
        const z = new Float32Array(5);
        const v = new Float32Array([1, 2, 3, 4, 5]);
        expect(cosineSimilarity(z, v)).toBe(0);
    });
});

// ────────── ANN Index ──────────

describe("T7 — ANNIndex", () => {
    it("returns nearest neighbors ranked by similarity", () => {
        const index = new ANNIndex();
        index.add("a", new Float32Array([1, 0, 0]));
        index.add("b", new Float32Array([0, 1, 0]));
        index.add("c", new Float32Array([1, 0.5, 0]));

        const results = index.search(new Float32Array([1, 0, 0]), 3);
        expect(results[0].id).toBe("a"); // exact match
        expect(results[0].score).toBeCloseTo(1.0);
        expect(results[1].id).toBe("c"); // close
    });

    it("respects k parameter", () => {
        const index = new ANNIndex();
        for (let i = 0; i < 10; i++) {
            const v = new Float32Array(3);
            v[0] = i;
            index.add(`item-${i}`, v);
        }
        expect(index.search(new Float32Array([5, 0, 0]), 3)).toHaveLength(3);
    });

    it("tracks size correctly", () => {
        const index = new ANNIndex();
        expect(index.size).toBe(0);
        index.add("a", new Float32Array(3));
        expect(index.size).toBe(1);
        index.clear();
        expect(index.size).toBe(0);
    });

    it("addAll adds multiple entries", () => {
        const index = new ANNIndex();
        index.addAll([
            { id: "a", vector: new Float32Array([1, 0]) },
            { id: "b", vector: new Float32Array([0, 1]) },
        ]);
        expect(index.size).toBe(2);
    });
});

// ────────── High-Level API ──────────

describe("T7 — embedDocuments + embedQuery", () => {
    const docs = [
        { id: "auth.ts", text: "export class AuthService { login(email, password) { return jwt.sign(user); } }" },
        { id: "db.ts", text: "export class Database { connect(url) { return pool.acquire(); } query(sql) { return rows; } }" },
        { id: "user.ts", text: "export class UserService { getUser(id) { return db.query('SELECT * FROM users'); } login(email) { return auth.login(email, pw); } }" },
        { id: "utils.ts", text: "export function formatDate(d) { return d.toISOString(); } export function hashPassword(pw) { return bcrypt.hash(pw); }" },
    ];

    it("generates embeddings for all documents", () => {
        const { vocab, results, index } = embedDocuments(docs);
        expect(results).toHaveLength(4);
        expect(vocab.docCount).toBe(4);
        expect(index.size).toBe(4);
        // Each result has a vector
        for (const r of results) {
            expect(r.vector.length).toBe(vocab.termIndex.size);
        }
    });

    it("finds auth-related files when querying 'authentication login'", () => {
        const { vocab, index } = embedDocuments(docs);
        const queryVec = embedQuery("authentication login jwt", vocab);
        const results = index.search(queryVec, 4);
        // auth.ts should be top result
        expect(results[0].id).toBe("auth.ts");
        console.log(`  Query "authentication login jwt" → top results:`, results.map((r) => `${r.id}(${r.score.toFixed(3)})`).join(", "));
    });

    it("finds database-related files when querying 'database connection'", () => {
        const { vocab, index } = embedDocuments(docs);
        const queryVec = embedQuery("database connection sql query", vocab);
        const results = index.search(queryVec, 4);
        // db.ts should be top result
        expect(results[0].id).toBe("db.ts");
    });

    it("finds utility functions when querying 'format hash'", () => {
        const { vocab, index } = embedDocuments(docs);
        const queryVec = embedQuery("format date hash password bcrypt", vocab);
        const results = index.search(queryVec, 4);
        expect(results[0].id).toBe("utils.ts");
    });
});

// ────────── Performance ──────────

describe("T7 — Embedding performance", () => {
    it("handles 1000 documents in reasonable time", () => {
        const docs = Array.from({ length: 1000 }, (_, i) => ({
            id: `file_${i}.ts`,
            text: `export class Module${i} { method${i}() { return data${i % 10}; } helper${i}() {} }`,
        }));
        const start = performance.now();
        const { index, vocab } = embedDocuments(docs);
        const buildTime = performance.now() - start;

        const queryStart = performance.now();
        const queryVec = embedQuery("module data helper", vocab);
        const results = index.search(queryVec, 10);
        const searchTime = performance.now() - queryStart;

        console.log(`  1000 docs: build=${buildTime.toFixed(0)}ms, search=${searchTime.toFixed(1)}ms`);
        expect(index.size).toBe(1000);
        expect(results).toHaveLength(10);
        expect(buildTime).toBeLessThan(5000);
        expect(searchTime).toBeLessThan(100);
    });
});
