import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseFile } from "../index.js";
import type { ParseResult } from "../types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-go-parser-"));
});

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("T2.4 — Go parser contains edges", () => {
    let result: ParseResult;

    beforeAll(async () => {
        const filePath = path.join(tmpDir, "server.go");
        await fs.writeFile(
            filePath,
            `package main

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
        expect(file!.id).toBe("server.go");
    });

    it("produces struct node for Server", () => {
        const server = result.nodes.find(
            (n) => n.type === "class" && n.name === "Server"
        );
        expect(server).toBeDefined();
        expect(server!.id).toBe("server.go#Server");
    });

    it("produces interface node for Handler", () => {
        const handler = result.nodes.find(
            (n) => n.type === "class" && n.name === "Handler"
        );
        expect(handler).toBeDefined();
        expect(handler!.id).toBe("server.go#Handler");
    });

    it("emits file → struct contains edge", () => {
        const edge = result.edges.find(
            (e) =>
                e.source === "server.go" &&
                e.target === "server.go#Server" &&
                e.type === "contains"
        );
        expect(edge).toBeDefined();
        expect(edge!.via).toContain("type Server");
    });

    it("emits file → interface contains edge", () => {
        const edge = result.edges.find(
            (e) =>
                e.source === "server.go" &&
                e.target === "server.go#Handler" &&
                e.type === "contains"
        );
        expect(edge).toBeDefined();
    });

    it("produces function node for NewServer", () => {
        const fn = result.nodes.find(
            (n) => n.type === "function" && n.name === "NewServer"
        );
        expect(fn).toBeDefined();
    });

    it("emits file → function contains edge for NewServer", () => {
        const edge = result.edges.find(
            (e) =>
                e.source === "server.go" &&
                e.target === "server.go#NewServer" &&
                e.type === "contains"
        );
        expect(edge).toBeDefined();
    });

    it("produces function node for method Start", () => {
        const fn = result.nodes.find(
            (n) => n.type === "function" && n.name === "Start"
        );
        expect(fn).toBeDefined();
    });

    it("emits file → method contains edge for Start", () => {
        const edge = result.edges.find(
            (e) =>
                e.source === "server.go" &&
                e.target === "server.go#Start" &&
                e.type === "contains"
        );
        expect(edge).toBeDefined();
    });
});
