"use strict";
/**
 * SQLite schema DDL for the CodeKnowledge graph store.
 * Replaces the JSON-based graph.json with indexed tables.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATE_TABLES_SQL = exports.SCHEMA_VERSION = void 0;
exports.SCHEMA_VERSION = 2;
exports.CREATE_TABLES_SQL = `
-- Meta table for schema version
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Nodes table (files, classes, functions)
CREATE TABLE IF NOT EXISTS nodes (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,  -- 'file' | 'class' | 'function' | 'module'
  language     TEXT NOT NULL,
  path         TEXT NOT NULL,
  name         TEXT NOT NULL,
  line_start   INTEGER NOT NULL,
  line_end     INTEGER NOT NULL,
  hash         TEXT NOT NULL,
  exports      TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  summary      TEXT,
  tags         TEXT DEFAULT '[]',  -- JSON array of strings
  stale        INTEGER NOT NULL DEFAULT 0,  -- 0 = fresh, 1 = stale
  last_indexed TEXT NOT NULL
);

-- Edges table
CREATE TABLE IF NOT EXISTS edges (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type   TEXT NOT NULL,  -- 'imports' | 'calls' | 'inherits' | 'implements' | 'contains'
  via    TEXT NOT NULL DEFAULT '',
  UNIQUE(source, target, type)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
CREATE INDEX IF NOT EXISTS idx_nodes_stale ON nodes(stale);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
`;
//# sourceMappingURL=schema.js.map