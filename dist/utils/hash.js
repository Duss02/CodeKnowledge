"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256 = sha256;
exports.sha256File = sha256File;
const crypto_1 = require("crypto");
function sha256(content) {
    return (0, crypto_1.createHash)("sha256").update(content, "utf8").digest("hex");
}
function sha256File(content) {
    return (0, crypto_1.createHash)("sha256").update(content).digest("hex");
}
//# sourceMappingURL=hash.js.map