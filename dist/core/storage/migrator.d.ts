export interface MigrationResult {
    success: boolean;
    nodeCount: number;
    edgeCount: number;
    sourceFile: string;
    error?: string;
}
/**
 * Migrate a graph.json file to SQLite.
 * The original graph.json is NOT deleted (user can delete manually).
 */
export declare function migrateJsonToSqlite(outputDir: string): Promise<MigrationResult>;
//# sourceMappingURL=migrator.d.ts.map