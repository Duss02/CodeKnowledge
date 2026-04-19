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
    tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-py-parser-"));
});
(0, vitest_1.afterAll)(async () => {
    await promises_1.default.rm(tmpDir, { recursive: true, force: true });
});
(0, vitest_1.describe)("T2.3 — Python parser contains edges", () => {
    let result;
    (0, vitest_1.beforeAll)(async () => {
        const filePath = path_1.default.join(tmpDir, "models.py");
        await promises_1.default.writeFile(filePath, `from dataclasses import dataclass

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
`, "utf8");
        result = await (0, index_js_1.parseFile)(filePath, tmpDir);
    });
    (0, vitest_1.it)("parses without errors", () => {
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.it)("produces file node", () => {
        const file = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(file).toBeDefined();
        (0, vitest_1.expect)(file.id).toBe("models.py");
    });
    (0, vitest_1.it)("produces class nodes for BaseModel and User", () => {
        const base = result.nodes.find((n) => n.type === "class" && n.name === "BaseModel");
        const user = result.nodes.find((n) => n.type === "class" && n.name === "User");
        (0, vitest_1.expect)(base).toBeDefined();
        (0, vitest_1.expect)(user).toBeDefined();
        (0, vitest_1.expect)(base.id).toBe("models.py#BaseModel");
        (0, vitest_1.expect)(user.id).toBe("models.py#User");
    });
    (0, vitest_1.it)("emits file → class contains edges", () => {
        const fileClassEdges = result.edges.filter((e) => e.source === "models.py" && e.type === "contains");
        const targets = fileClassEdges.map((e) => e.target);
        (0, vitest_1.expect)(targets).toContain("models.py#BaseModel");
        (0, vitest_1.expect)(targets).toContain("models.py#User");
    });
    (0, vitest_1.it)("emits class → method contains edges for BaseModel", () => {
        const edges = result.edges.filter((e) => e.source === "models.py#BaseModel" && e.type === "contains");
        (0, vitest_1.expect)(edges.length).toBeGreaterThanOrEqual(2);
        const targets = edges.map((e) => e.target);
        (0, vitest_1.expect)(targets).toContain("models.py#BaseModel.validate");
        (0, vitest_1.expect)(targets).toContain("models.py#BaseModel.serialize");
    });
    (0, vitest_1.it)("emits class → method contains edge for User.to_dict", () => {
        const edges = result.edges.filter((e) => e.source === "models.py#User" && e.type === "contains");
        (0, vitest_1.expect)(edges.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(edges.some((e) => e.target === "models.py#User.to_dict")).toBe(true);
    });
    (0, vitest_1.it)("does NOT emit __init__ as method node", () => {
        const initNode = result.nodes.find((n) => n.name === "__init__");
        (0, vitest_1.expect)(initNode).toBeUndefined();
    });
    (0, vitest_1.it)("produces method nodes with correct IDs", () => {
        const validate = result.nodes.find((n) => n.name === "validate");
        (0, vitest_1.expect)(validate).toBeDefined();
        (0, vitest_1.expect)(validate.id).toBe("models.py#BaseModel.validate");
        (0, vitest_1.expect)(validate.type).toBe("function");
    });
    (0, vitest_1.it)("emits file → function contains edge for create_user", () => {
        const fnEdge = result.edges.find((e) => e.source === "models.py" &&
            e.target === "models.py#create_user" &&
            e.type === "contains");
        (0, vitest_1.expect)(fnEdge).toBeDefined();
    });
    (0, vitest_1.it)("emits inherits edge from User to BaseModel", () => {
        const inherits = result.edges.find((e) => e.type === "inherits" && e.source.includes("User"));
        (0, vitest_1.expect)(inherits).toBeDefined();
        (0, vitest_1.expect)(inherits.target).toBe("BaseModel");
    });
});
//# sourceMappingURL=py-contains.test.js.map