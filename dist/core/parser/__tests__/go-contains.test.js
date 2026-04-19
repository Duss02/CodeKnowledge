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
    tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "ck-go-parser-"));
});
(0, vitest_1.afterAll)(async () => {
    await promises_1.default.rm(tmpDir, { recursive: true, force: true });
});
(0, vitest_1.describe)("T2.4 — Go parser contains edges", () => {
    let result;
    (0, vitest_1.beforeAll)(async () => {
        const filePath = path_1.default.join(tmpDir, "server.go");
        await promises_1.default.writeFile(filePath, `package main

import "fmt"

type Server struct {
    Host string
    Port int
}

type Handler interface {
    ServeHTTP()
}

func NewServer(host string, port int) *Server {
    return &Server{Host: host, Port: port}
}

func (s *Server) Start() {
    fmt.Printf("Listening on %s:%d", s.Host, s.Port)
}
`, "utf8");
        result = await (0, index_js_1.parseFile)(filePath, tmpDir);
    });
    (0, vitest_1.it)("parses without errors", () => {
        (0, vitest_1.expect)(result.errors).toHaveLength(0);
    });
    (0, vitest_1.it)("produces file node", () => {
        const file = result.nodes.find((n) => n.type === "file");
        (0, vitest_1.expect)(file).toBeDefined();
        (0, vitest_1.expect)(file.id).toBe("server.go");
    });
    (0, vitest_1.it)("produces struct node for Server", () => {
        const server = result.nodes.find((n) => n.type === "class" && n.name === "Server");
        (0, vitest_1.expect)(server).toBeDefined();
        (0, vitest_1.expect)(server.id).toBe("server.go#Server");
    });
    (0, vitest_1.it)("produces interface node for Handler", () => {
        const handler = result.nodes.find((n) => n.type === "class" && n.name === "Handler");
        (0, vitest_1.expect)(handler).toBeDefined();
        (0, vitest_1.expect)(handler.id).toBe("server.go#Handler");
    });
    (0, vitest_1.it)("emits file → struct contains edge", () => {
        const edge = result.edges.find((e) => e.source === "server.go" &&
            e.target === "server.go#Server" &&
            e.type === "contains");
        (0, vitest_1.expect)(edge).toBeDefined();
        (0, vitest_1.expect)(edge.via).toContain("type Server");
    });
    (0, vitest_1.it)("emits file → interface contains edge", () => {
        const edge = result.edges.find((e) => e.source === "server.go" &&
            e.target === "server.go#Handler" &&
            e.type === "contains");
        (0, vitest_1.expect)(edge).toBeDefined();
    });
    (0, vitest_1.it)("produces function node for NewServer", () => {
        const fn = result.nodes.find((n) => n.type === "function" && n.name === "NewServer");
        (0, vitest_1.expect)(fn).toBeDefined();
    });
    (0, vitest_1.it)("emits file → function contains edge for NewServer", () => {
        const edge = result.edges.find((e) => e.source === "server.go" &&
            e.target === "server.go#NewServer" &&
            e.type === "contains");
        (0, vitest_1.expect)(edge).toBeDefined();
    });
    (0, vitest_1.it)("produces function node for method Start", () => {
        const fn = result.nodes.find((n) => n.type === "function" && n.name === "Start");
        (0, vitest_1.expect)(fn).toBeDefined();
    });
    (0, vitest_1.it)("emits file → method contains edge for Start", () => {
        const edge = result.edges.find((e) => e.source === "server.go" &&
            e.target === "server.go#Start" &&
            e.type === "contains");
        (0, vitest_1.expect)(edge).toBeDefined();
    });
});
//# sourceMappingURL=go-contains.test.js.map