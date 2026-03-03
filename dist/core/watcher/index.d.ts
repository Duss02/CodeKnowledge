import chokidar from "chokidar";
import type { CKConfig } from "../config/index.js";
import type { Logger } from "pino";
export interface WatchOptions {
    rootDir: string;
    outputDir: string;
    config: CKConfig;
    logger: Logger;
}
export declare function startWatcher(opts: WatchOptions): chokidar.FSWatcher;
//# sourceMappingURL=index.d.ts.map