"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Tests for CommonJS module system support in the JS/TS parser.
 * Covers require(), module.exports, and exports.X patterns.
 */
const vitest_1 = require("vitest");
const typescript_js_1 = require("../typescript.js");
const ROOT = "/tmp/cjs-test";
(0, vitest_1.describe)("CommonJS — require() imports", () => {
    (0, vitest_1.it)("detects const X = require('./module')", () => {
        const code = `const router = require('./router');`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBe(1);
        (0, vitest_1.expect)(importEdges[0].target).toBe("router.ts");
        (0, vitest_1.expect)(importEdges[0].via).toContain("require");
    });
    (0, vitest_1.it)("detects const { a, b } = require('./utils')", () => {
        const code = `const { merge, flatten } = require('./utils');`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBe(1);
        (0, vitest_1.expect)(importEdges[0].target).toContain("utils");
    });
    (0, vitest_1.it)("detects require('./middleware') in expression position", () => {
        const code = `app.use(require('./middleware'));`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBe(1);
        (0, vitest_1.expect)(importEdges[0].target).toContain("middleware");
    });
    (0, vitest_1.it)("ignores external require('express')", () => {
        const code = `const express = require('express');`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBe(0); // external module, not relative
    });
    (0, vitest_1.it)("detects multiple require() calls", () => {
        const code = `
const Router = require('./router');
const proto = require('./application');
const utils = require('./utils');
const debug = require('debug');
`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/index.js", code, ROOT, "javascript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBe(3); // 3 relative, 1 external skipped
    });
});
(0, vitest_1.describe)("CommonJS — module.exports", () => {
    (0, vitest_1.it)("detects module.exports = { a, b, c }", () => {
        const code = `
function createApp() {}
function Router() {}
module.exports = { createApp, Router };
`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("createApp");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("Router");
    });
    (0, vitest_1.it)("detects module.exports = singleExport", () => {
        const code = `
function Application() {}
module.exports = Application;
`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("Application");
    });
    (0, vitest_1.it)("detects exports.foo = value", () => {
        const code = `
exports.query = function() {};
exports.json = function() {};
exports.urlencoded = function() {};
`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("query");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("json");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("urlencoded");
    });
    (0, vitest_1.it)("detects module.exports.foo = value", () => {
        const code = `module.exports.Router = function Router() {};`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/app.js", code, ROOT, "javascript");
        (0, vitest_1.expect)(result.nodes[0].exports).toContain("Router");
    });
});
(0, vitest_1.describe)("CommonJS — mixed ESM + CommonJS", () => {
    (0, vitest_1.it)("handles file with both import and require", () => {
        const code = `
import { something } from './esm-module';
const legacy = require('./cjs-module');
export default function main() {}
`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/hybrid.ts", code, ROOT, "typescript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        (0, vitest_1.expect)(importEdges.length).toBe(2);
        const targets = importEdges.map((e) => e.target);
        (0, vitest_1.expect)(targets.some((t) => t.includes("esm-module"))).toBe(true);
        (0, vitest_1.expect)(targets.some((t) => t.includes("cjs-module"))).toBe(true);
    });
});
(0, vitest_1.describe)("CommonJS — Express.js-style patterns", () => {
    (0, vitest_1.it)("handles Express.js index.js pattern", () => {
        const code = `
'use strict';

var bodyParser = require('body-parser');
var EventEmitter = require('events').EventEmitter;
var mixin = require('merge-descriptors');
var proto = require('./application');
var Route = require('./router/route');
var Router = require('./router');
var req = require('./request');
var res = require('./response');

exports = module.exports = createApplication;
exports.application = proto;
exports.request = req;
exports.response = res;
exports.Route = Route;
exports.Router = Router;
exports.json = bodyParser.json;
exports.query = require('./middleware/query');
exports.static = require('serve-static');

function createApplication() {
  var app = function(req, res, next) {
    app.handle(req, res, next);
  };
  return app;
}
`;
        const result = (0, typescript_js_1.parseTypeScript)("/tmp/cjs-test/index.js", code, ROOT, "javascript");
        const importEdges = result.edges.filter((e) => e.type === "imports");
        // Should detect: ./application, ./router/route, ./router, ./request, ./response, ./middleware/query
        (0, vitest_1.expect)(importEdges.length).toBeGreaterThanOrEqual(5);
        const targets = importEdges.map((e) => e.target);
        (0, vitest_1.expect)(targets.some((t) => t.includes("application"))).toBe(true);
        (0, vitest_1.expect)(targets.some((t) => t.includes("router"))).toBe(true);
        (0, vitest_1.expect)(targets.some((t) => t.includes("request"))).toBe(true);
        (0, vitest_1.expect)(targets.some((t) => t.includes("response"))).toBe(true);
        // Should detect exports
        const fileNode = result.nodes[0];
        (0, vitest_1.expect)(fileNode.exports.length).toBeGreaterThanOrEqual(3);
    });
});
//# sourceMappingURL=commonjs.test.js.map