"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../index.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
let tmpDir;
(0, vitest_1.beforeAll)(async () => {
    tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-ts-parser-"));
});
(0, vitest_1.afterAll)(async () => {
    await promises_1.default.rm(tmpDir, { recursive: true, force: true });
});
(0, vitest_1.describe)("T2.2 — TypeScript parser contains edges", () => {
    let result;
    (0, vitest_1.beforeAll)(async () => {
        const filePath = path_1.default.join(tmpDir, "service.ts");
        await promises_1.default.writeFile(filePath, `import { Db } from './db';

export class UserService {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async getUser(id: string) {
    return this.db.find(id);
  }

  async deleteUser(id: string) {
    return this.db.remove(id);
  }
}

export function createService(db: Db): UserService {
  return new UserService(db);
}

export const helper = (x: number) => x * 2;
`, "utf8");
        result = await (0, index_js_1.parseFile)(filePath, tmpDir);
    });
    (0, vitest_1.it)("has no parse errors", () => {
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    // --- File node ---
    (0, vitest_1.it)("produces a file node", () => {
        const file = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(file).toBeDefined();
        (0, vitest_1.expect)(file.id).toBe("service.ts");
    });
    // --- Class node ---
    (0, vitest_1.it)("produces a class node for UserService", () => {
        const cls = result.nodes.find((n) => n.type === "class" && n.name === "UserService");
        (0, vitest_1.expect)(cls).toBeDefined();
        (0, vitest_1.expect)(cls.id).toBe("service.ts#UserService");
        (0, vitest_1.expect)(cls.exports).toContain("getUser");
        (0, vitest_1.expect)(cls.exports).toContain("deleteUser");
    });
    // --- Method nodes ---
    (0, vitest_1.it)("produces method nodes for class methods", () => {
        const getUser = result.nodes.find((n) => n.type === "function" && n.name === "getUser");
        const deleteUser = result.nodes.find((n) => n.type === "function" && n.name === "deleteUser");
        (0, vitest_1.expect)(getUser).toBeDefined();
        (0, vitest_1.expect)(getUser.id).toBe("service.ts#UserService.getUser");
        (0, vitest_1.expect)(deleteUser).toBeDefined();
        (0, vitest_1.expect)(deleteUser.id).toBe("service.ts#UserService.deleteUser");
    });
    // --- Top-level function node ---
    (0, vitest_1.it)("produces a function node for createService", () => {
        const fn = result.nodes.find((n) => n.type === "function" && n.name === "createService");
        (0, vitest_1.expect)(fn).toBeDefined();
        (0, vitest_1.expect)(fn.id).toBe("service.ts#createService");
    });
    // --- Arrow function node ---
    (0, vitest_1.it)("produces a function node for arrow function helper", () => {
        const fn = result.nodes.find((n) => n.type === "function" && n.name === "helper");
        (0, vitest_1.expect)(fn).toBeDefined();
        (0, vitest_1.expect)(fn.id).toBe("service.ts#helper");
    });
    // --- Contains edges: file → class ---
    (0, vitest_1.it)("emits file → class contains edge", () => {
        const edge = result.edges.find((e) => e.source === "service.ts" &&
            e.target === "service.ts#UserService" &&
            e.type === "contains");
        (0, vitest_1.expect)(edge).toBeDefined();
        (0, vitest_1.expect)(edge.via).toContain("class UserService");
    });
    // --- Contains edges: class → methods ---
    (0, vitest_1.it)("emits class → method contains edges", () => {
        const methodEdges = result.edges.filter((e) => e.source === "service.ts#UserService" && e.type === "contains");
        // getUser, deleteUser (+ possibly `db` field)
        (0, vitest_1.expect)(methodEdges.length).toBeGreaterThanOrEqual(2);
        const targets = methodEdges.map((e) => e.target);
        (0, vitest_1.expect)(targets).toContain("service.ts#UserService.getUser");
        (0, vitest_1.expect)(targets).toContain("service.ts#UserService.deleteUser");
    });
    // --- Contains edges: file → functions ---
    (0, vitest_1.it)("emits file → function contains edges for top-level functions", () => {
        const fnEdges = result.edges.filter((e) => e.source === "service.ts" &&
            e.type === "contains" &&
            e.target !== "service.ts#UserService" // exclude file→class
        );
        (0, vitest_1.expect)(fnEdges.length).toBeGreaterThanOrEqual(2); // createService + helper
        const targets = fnEdges.map((e) => e.target);
        (0, vitest_1.expect)(targets).toContain("service.ts#createService");
        (0, vitest_1.expect)(targets).toContain("service.ts#helper");
    });
    // --- Import edge still works ---
    (0, vitest_1.it)("still emits import edge", () => {
        const imp = result.edges.find((e) => e.type === "imports");
        (0, vitest_1.expect)(imp).toBeDefined();
        (0, vitest_1.expect)(imp.source).toBe("service.ts");
    });
    // --- Node count sanity ---
    (0, vitest_1.it)("total node count matches expected", () => {
        // 1 file + 1 class + 2 methods + 2 top-level functions = 6+
        (0, vitest_1.expect)(result.nodes.length).toBeGreaterThanOrEqual(6);
    });
});
(0, vitest_1.describe)("T2.2 — TypeScript parser: class with inheritance", () => {
    let result;
    (0, vitest_1.beforeAll)(async () => {
        const filePath = path_1.default.join(tmpDir, "extended.ts");
        await promises_1.default.writeFile(filePath, `class Animal {
  name: string;

  move(distance: number) {
    console.log(\`moved \${distance}m\`);
  }
}

class Dog extends Animal {
  bark() {
    console.log("Woof!");
  }
}
`, "utf8");
        result = await (0, index_js_1.parseFile)(filePath, tmpDir);
    });
    (0, vitest_1.it)("creates class nodes for Animal and Dog", () => {
        const animal = result.nodes.find((n) => n.name === "Animal" && n.type === "class");
        const dog = result.nodes.find((n) => n.name === "Dog" && n.type === "class");
        (0, vitest_1.expect)(animal).toBeDefined();
        (0, vitest_1.expect)(dog).toBeDefined();
    });
    (0, vitest_1.it)("creates inherits edge from Dog to Animal", () => {
        const inherits = result.edges.find((e) => e.type === "inherits" && e.source.includes("Dog"));
        (0, vitest_1.expect)(inherits).toBeDefined();
        (0, vitest_1.expect)(inherits.target).toBe("Animal");
    });
    (0, vitest_1.it)("creates contains edges for methods", () => {
        const moveContains = result.edges.find((e) => e.type === "contains" && e.via.includes("method move"));
        const barkContains = result.edges.find((e) => e.type === "contains" && e.via.includes("method bark"));
        (0, vitest_1.expect)(moveContains).toBeDefined();
        (0, vitest_1.expect)(barkContains).toBeDefined();
    });
});
//# sourceMappingURL=ts-contains.test.js.map