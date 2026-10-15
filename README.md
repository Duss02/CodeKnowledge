# CodeKnowledge

A persistent knowledge graph of your codebase, built for AI coding agents.

AI agents that land in an unfamiliar repository usually start by reading files until they have enough context to act. That is slow, and it spends a large share of the context window on code that turns out to be irrelevant. CodeKnowledge does that exploration once. It parses the repository, records how its parts depend on each other, adds a short summary for each file, and stores the result locally. Agents, and people, can then ask questions of the graph instead of re-reading the source.

The command-line tool is `ck`. It also runs as an [MCP](https://modelcontextprotocol.io) server, so Claude Code, Cursor, and other MCP clients can query the graph directly.

## What it does

- **Maps structure.** Tree-sitter parses each file into classes, functions, exports, and import relationships, and these become a directed graph.
- **Summarizes files.** An LLM writes a short summary per file. Summaries are cached by content hash, so a file is only summarized again when it changes.
- **Answers questions.** Find where something lives, who uses a symbol, or what could break if a file changes.
- **Stays current.** A watch mode re-indexes only what changed, along with the files that import it.
- **Writes readable output.** The graph is stored as JSON, and each folder gets a `SUMMARY.md` that is useful to read or commit alongside your code.

Everything runs locally. The only network traffic is the summarization call to your chosen LLM provider, and you can skip that entirely.

## Installation

Requires Node.js 20 or later.

```bash
npm install -g codeknowledge
```

Or run it without installing:

```bash
npx codeknowledge --help
```

## Quick start

From the root of the project you want to index:

```bash
# Create a config file
ck init

# Build the graph without calling an LLM
ck index --no-summaries

# Or build it with summaries (set one provider key first)
export ANTHROPIC_API_KEY=sk-ant-...
ck index

# Ask questions
ck query "where is authentication handled?"
ck query "who uses AuthService"
ck query "impact of src/auth/AuthService.ts"

# Check the state of the index
ck status

# Keep the index up to date as you work
ck watch
```

Without an API key, `ck` still builds the full structural graph and tells you that summaries were skipped.

## Commands

| Command | Description |
|---|---|
| `ck init` | Create a `ck.config.js` and the `.codeknowledge/` directory |
| `ck index [paths...]` | Index the current directory, or only the paths you give it |
| `ck index --force` | Re-index every file, even if unchanged |
| `ck index --no-summaries` | Build the graph only; make no LLM calls |
| `ck index --no-markdown` | Skip generating `SUMMARY.md` files |
| `ck query "<question>"` | Ask a structural or natural-language question |
| `ck status` | Show graph statistics and any stale nodes |
| `ck watch` | Re-index incrementally when files change |
| `ck serve` | Start the MCP server on stdio |

## Querying

Structural queries run against the graph directly and need no API key:

```bash
ck query "who uses AuthService"
ck query "find usages of parseFile"
ck query "impact of src/core/graph/index.ts"
ck query "what breaks if src/utils/hash.ts changes"
```

Other questions are answered in natural language. With an API key configured, `ck` retrieves the relevant part of the graph and has the model answer from it. Without one, it falls back to text search over file names and summaries.

## Using it with AI agents

`ck serve` exposes the graph over MCP. Index your project first, then register the server with your client.

**Claude Code**

```bash
claude mcp add codeknowledge -- ck serve
```

**Cursor** (`mcp.json`)

```json
{
  "mcpServers": {
    "codeknowledge": {
      "command": "ck",
      "args": ["serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

If you have not installed `ck` globally, use `"command": "npx"` with `"args": ["codeknowledge", "serve"]`.

### Tools exposed

| Tool | Purpose |
|---|---|
| `ck_overview` | Repository summary: size, languages, entry points, key modules |
| `ck_get_node` | Summary, dependencies, and dependents for a file or symbol |
| `ck_find_usages` | Everything that imports or calls a given symbol |
| `ck_impact` | Files affected by a change, traced up to three hops out |
| `ck_entry_points` | Files that nothing else imports |
| `ck_query` | A natural-language question answered from the graph |

Example prompts once connected:

```
Give me an overview of this codebase.
What does AuthService do, and who depends on it?
If I change src/core/graph/index.ts, what else might break?
```

## Supported languages

| Language | Extensions | Parser |
|---|---|---|
| TypeScript | `.ts`, `.tsx` | tree-sitter-typescript |
| JavaScript | `.js`, `.jsx`, `.mjs` | tree-sitter-javascript |
| Python | `.py` | tree-sitter-python |
| Go | `.go` | tree-sitter-go |
| Jupyter notebooks | `.ipynb` | Code cells parsed as Python; markdown cells used for context |

Notebooks are read cell by cell, so the model sees your code and prose rather than raw JSON.

## Configuration

`ck init` creates a `ck.config.js` in the project root:

```js
module.exports = {
  // "anthropic" or "openai". Detected from your environment if omitted.
  provider: "anthropic",
  model: "claude-haiku-4-5",
  apiKey: process.env.ANTHROPIC_API_KEY,

  include: ["src/**", "lib/**"],
  exclude: ["**/*.test.*", "**/node_modules/**", "**/*.d.ts", "**/dist/**"],
  languages: ["typescript", "javascript", "python", "go"],
  maxFileSizeKB: 200,

  summaries: true,
  summaryMaxLines: 200,      // lines of each file sent to the model

  outputDir: ".codeknowledge",
  generateMarkdown: true,    // write a SUMMARY.md per folder
};
```

Keep API keys in environment variables rather than in the file. If both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set, Anthropic is used unless you set `provider` explicitly.

Suggested models:

| Provider | Model | Notes |
|---|---|---|
| Anthropic | `claude-haiku-4-5` | Default. Fast and inexpensive |
| Anthropic | `claude-sonnet-4-5` | Better summaries at higher cost |
| OpenAI | `gpt-4o-mini` | Default for OpenAI |
| OpenAI | `gpt-4o` | Better summaries at higher cost |

## Output

Everything is written to `.codeknowledge/`:

```
.codeknowledge/
├── graph.json        # nodes and edges
├── summaries.json    # summary cache, keyed by file hash
├── config.json       # the effective configuration
└── src/
    ├── SUMMARY.md    # one per indexed folder
    └── core/
        └── SUMMARY.md
```

Each node in `graph.json` records its type, language, path, line range, summary, content hash, exports, and whether it is stale. Edges carry a type (`imports`, `calls`, or `inherits`) and the source line that created them. A folder's `SUMMARY.md` lists its purpose, files, key exports, and what it depends on or is used by.

## Monorepos

Pass several paths to build a single graph across packages:

```bash
ck index packages/auth packages/api packages/shared
```

## Watch mode

`ck watch` listens for file changes with chokidar. When a file changes, it compares the new hash against the graph, marks that file and its direct importers as stale, then re-parses and re-summarizes only those nodes. Affected `SUMMARY.md` files are regenerated.

## Design principles

- **Local first.** No hosted service, no telemetry. The only credential is the LLM key, and it is optional.
- **Cheap to maintain.** Hash-based caching means each unique version of a file is summarized once.
- **Readable.** `graph.json` is pretty-printed and `SUMMARY.md` files are plain Markdown you can review in a pull request.
- **Fault tolerant.** A file that fails to parse is logged with its path and the reason, and indexing continues.
- **Degrades gracefully.** Missing API key? You still get the graph.

## Development

```bash
git clone <repository-url>
cd codeknowledge
npm install
npm run build
npm run dev -- index --no-summaries   # run from source
```

Built with TypeScript, [tree-sitter](https://tree-sitter.github.io/), [graphology](https://graphology.github.io/), [commander](https://github.com/tj/commander.js/), [chokidar](https://github.com/paulmillr/chokidar), [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), and the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## License

MIT
