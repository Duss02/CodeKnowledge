import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseFile } from "../index.js";
import type { ParseResult } from "../types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-ts-parser-"));
});

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("T2.2 — TypeScript parser contains edges", () => {
    let result: ParseResult;

    beforeAll(async () => {
        const filePath = path.join(tmpDir, "service.ts");
        await fs.writeFile(
            filePath,
            `import { Db } from './db';

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
`,
            "utf8"
        );
        result = await parseFile(filePath, tmpDir);
    });

    it("has no parse errors", () => {
        expect(result.errors).toHaveLength(0);
    });

    // --- File node ---
    it("produces a file node", () => {
        const file = result.nodes.find((n) => n.type === "file");
        expect(file).toBeDefined();
        expect(file!.id).toBe("service.ts");
    });

    // --- Class node ---
    it("produces a class node for UserService", () => {
        const cls = result.nodes.find(
            (n) => n.type === "class" && n.name === "UserService"
        );
        expect(cls).toBeDefined();
        expect(cls!.id).toBe("service.ts#UserService");
        expect(cls!.exports).toContain("getUser");
        expect(cls!.exports).toContain("deleteUser");
    });

    // --- Method nodes ---
    it("produces method nodes for class methods", () => {
        const getUser = result.nodes.find(
            (n) => n.type === "function" && n.name === "getUser"
        );
        const deleteUser = result.nodes.find(
            (n) => n.type === "function" && n.name === "deleteUser"
        );
        expect(getUser).toBeDefined();
        expect(getUser!.id).toBe("service.ts#UserService.getUser");
        expect(deleteUser).toBeDefined();
        expect(deleteUser!.id).toBe("service.ts#UserService.deleteUser");
    });

    // --- Top-level function node ---
    it("produces a function node for createService", () => {
        const fn = result.nodes.find(
            (n) => n.type === "function" && n.name === "createService"
        );
        expect(fn).toBeDefined();
        expect(fn!.id).toBe("service.ts#createService");
    });

    // --- Arrow function node ---
    it("produces a function node for arrow function helper", () => {
        const fn = result.nodes.find(
            (n) => n.type === "function" && n.name === "helper"
        );
        expect(fn).toBeDefined();
        expect(fn!.id).toBe("service.ts#helper");
    });

    // --- Contains edges: file → class ---
    it("emits file → class contains edge", () => {
        const edge = result.edges.find(
            (e) =>
                e.source === "service.ts" &&
                e.target === "service.ts#UserService" &&
                e.type === "contains"
        );
        expect(edge).toBeDefined();
        expect(edge!.via).toContain("class UserService");
    });

    // --- Contains edges: class → methods ---
    it("emits class → method contains edges", () => {
        const methodEdges = result.edges.filter(
            (e) =>
                e.source === "service.ts#UserService" && e.type === "contains"
        );
        // getUser, deleteUser (+ possibly `db` field)
        expect(methodEdges.length).toBeGreaterThanOrEqual(2);
        const targets = methodEdges.map((e) => e.target);
        expect(targets).toContain("service.ts#UserService.getUser");
        expect(targets).toContain("service.ts#UserService.deleteUser");
    });

    // --- Contains edges: file → functions ---
    it("emits file → function contains edges for top-level functions", () => {
        const fnEdges = result.edges.filter(
            (e) =>
                e.source === "service.ts" &&
                e.type === "contains" &&
                e.target !== "service.ts#UserService" // exclude file→class
        );
        expect(fnEdges.length).toBeGreaterThanOrEqual(2); // createService + helper
        const targets = fnEdges.map((e) => e.target);
        expect(targets).toContain("service.ts#createService");
        expect(targets).toContain("service.ts#helper");
    });

    // --- Import edge still works ---
    it("still emits import edge", () => {
        const imp = result.edges.find((e) => e.type === "imports");
        expect(imp).toBeDefined();
        expect(imp!.source).toBe("service.ts");
    });

    // --- Node count sanity ---
    it("total node count matches expected", () => {
        // 1 file + 1 class + 2 methods + 2 top-level functions = 6+
        expect(result.nodes.length).toBeGreaterThanOrEqual(6);
    });
});

describe("T2.2 — TypeScript parser: class with inheritance", () => {
    let result: ParseResult;

    beforeAll(async () => {
        const filePath = path.join(tmpDir, "extended.ts");
        await fs.writeFile(
            filePath,
            `class Animal {
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
`,
            "utf8"
        );
        result = await parseFile(filePath, tmpDir);
    });

    it("creates class nodes for Animal and Dog", () => {
        const animal = result.nodes.find((n) => n.name === "Animal" && n.type === "class");
        const dog = result.nodes.find((n) => n.name === "Dog" && n.type === "class");
        expect(animal).toBeDefined();
        expect(dog).toBeDefined();
    });

    it("creates inherits edge from Dog to Animal", () => {
        const inherits = result.edges.find(
            (e) => e.type === "inherits" && e.source.includes("Dog")
        );
        expect(inherits).toBeDefined();
        expect(inherits!.target).toBe("Animal");
    });

    it("creates contains edges for methods", () => {
        const moveContains = result.edges.find(
            (e) => e.type === "contains" && e.via.includes("method move")
        );
        const barkContains = result.edges.find(
            (e) => e.type === "contains" && e.via.includes("method bark")
        );
        expect(moveContains).toBeDefined();
        expect(barkContains).toBeDefined();
    });
});
