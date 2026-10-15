import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseFile } from "../index.js";
import type { ParseResult } from "../types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-py-parser-"));
});

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("T2.3 — Python parser contains edges", () => {
    let result: ParseResult;

    beforeAll(async () => {
        const filePath = path.join(tmpDir, "models.py");
        await fs.writeFile(
            filePath,
            `from dataclasses import dataclass

class BaseModel:
    def validate(self):
        pass

    def serialize(self):
        pass

class User(BaseModel):
    def __init__(self, name, email):
        self.name = name
        self.email = email

    def to_dict(self):
        return {"name": self.name, "email": self.email}

def create_user(name, email):
    return User(name, email)
`,
            "utf8"
        );
        result = await parseFile(filePath, tmpDir);
    });

    it("parses without errors", () => {
        expect(result.errors).toHaveLength(0);
    });

    it("produces file node", () => {
        const file = result.nodes.find((n) => n.type === "file");
        expect(file).toBeDefined();
        expect(file!.id).toBe("models.py");
    });

    it("produces class nodes for BaseModel and User", () => {
        const base = result.nodes.find((n) => n.type === "class" && n.name === "BaseModel");
        const user = result.nodes.find((n) => n.type === "class" && n.name === "User");
        expect(base).toBeDefined();
        expect(user).toBeDefined();
        expect(base!.id).toBe("models.py#BaseModel");
        expect(user!.id).toBe("models.py#User");
    });

    it("emits file → class contains edges", () => {
        const fileClassEdges = result.edges.filter(
            (e) => e.source === "models.py" && e.type === "contains"
        );
        const targets = fileClassEdges.map((e) => e.target);
        expect(targets).toContain("models.py#BaseModel");
        expect(targets).toContain("models.py#User");
    });

    it("emits class → method contains edges for BaseModel", () => {
        const edges = result.edges.filter(
            (e) => e.source === "models.py#BaseModel" && e.type === "contains"
        );
        expect(edges.length).toBeGreaterThanOrEqual(2);
        const targets = edges.map((e) => e.target);
        expect(targets).toContain("models.py#BaseModel.validate");
        expect(targets).toContain("models.py#BaseModel.serialize");
    });

    it("emits class → method contains edge for User.to_dict", () => {
        const edges = result.edges.filter(
            (e) => e.source === "models.py#User" && e.type === "contains"
        );
        expect(edges.length).toBeGreaterThanOrEqual(1);
        expect(edges.some((e) => e.target === "models.py#User.to_dict")).toBe(true);
    });

    it("does NOT emit __init__ as method node", () => {
        const initNode = result.nodes.find((n) => n.name === "__init__");
        expect(initNode).toBeUndefined();
    });

    it("produces method nodes with correct IDs", () => {
        const validate = result.nodes.find((n) => n.name === "validate");
        expect(validate).toBeDefined();
        expect(validate!.id).toBe("models.py#BaseModel.validate");
        expect(validate!.type).toBe("function");
    });

    it("emits file → function contains edge for create_user", () => {
        const fnEdge = result.edges.find(
            (e) =>
                e.source === "models.py" &&
                e.target === "models.py#create_user" &&
                e.type === "contains"
        );
        expect(fnEdge).toBeDefined();
    });

    it("emits inherits edge from User to BaseModel", () => {
        const inherits = result.edges.find(
            (e) => e.type === "inherits" && e.source.includes("User")
        );
        expect(inherits).toBeDefined();
        expect(inherits!.target).toBe("BaseModel");
    });
});
