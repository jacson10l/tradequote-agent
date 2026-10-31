import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { TradeFault } from "@tradequote/domain";
import Database from "better-sqlite3";

/** OS-backed SQLite file lock, held for the entire writer lifetime, before opening
 * the business database. Kernel releases it on SIGKILL; no PID/stale-file guessing. */
export class WorkerOwnership {
  private readonly lock: Database.Database;
  constructor(database: string) {
    mkdirSync(dirname(database), { recursive: true });
    // Existing database-file symlinks must share the target writer lock as well as
    // directory aliases. A new database still uses its canonical parent directory.
    const canonical = existsSync(database)
      ? realpathSync(database)
      : join(realpathSync(dirname(database)), basename(database));
    const path = `${canonical}.owner`;
    this.lock = new Database(path, { timeout: 0 });
    try {
      this.lock.exec("BEGIN EXCLUSIVE");
    } catch {
      this.lock.close();
      throw new TradeFault("CAPABILITY_UNAVAILABLE", "旧业务进程仍占用工作区，请等待退出后重试");
    }
  }
  close() {
    this.lock.close();
  }
}
