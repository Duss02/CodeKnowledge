/**
 * ck languages — show supported languages and their parsers.
 */
import type { SupportedLanguage } from "../../utils/language.js";

interface LanguageInfo {
    name: string;
    extensions: string[];
    parser: string;
}

const LANGUAGE_INFO: Record<string, LanguageInfo> = {
    typescript: { name: "TypeScript", extensions: [".ts", ".tsx"], parser: "tree-sitter-typescript" },
    javascript: { name: "JavaScript", extensions: [".js", ".jsx", ".mjs", ".cjs"], parser: "tree-sitter-javascript" },
    python: { name: "Python", extensions: [".py", ".pyi"], parser: "tree-sitter-python" },
    go: { name: "Go", extensions: [".go"], parser: "tree-sitter-go" },
    notebook: { name: "Jupyter Notebook", extensions: [".ipynb"], parser: "cell extraction + language parser" },
};

export function runLanguages(): void {
    console.log("\n🌐 Supported Languages\n");
    console.log("  Language          Extensions          Parser");
    console.log("  ─────────         ──────────          ──────");
    for (const [key, info] of Object.entries(LANGUAGE_INFO)) {
        const name = info.name.padEnd(18);
        const exts = info.extensions.join(", ").padEnd(20);
        console.log(`  ${name}${exts}${info.parser}`);
    }
    console.log();
    console.log("  Node types extracted: file, class, function, method");
    console.log("  Edge types extracted: imports, contains, inherits, calls, implements");
    console.log();
}
