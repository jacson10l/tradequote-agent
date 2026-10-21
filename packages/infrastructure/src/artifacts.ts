import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ArtifactStore } from "@tradequote/domain";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export class FileArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error("ARTIFACT_SYMLINK");
    if ((await realpath(this.root)) !== resolve(this.root))
      throw new Error("ARTIFACT_ANCESTOR_SYMLINK");
    return resolve(this.root);
  }
  async putImmutable(bytes: Uint8Array) {
    const id = hash(bytes);
    const dir = await this.directory();
    const temp = resolve(dir, `${randomUUID()}.tmp`);
    await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
    try {
      try {
        await link(temp, resolve(dir, id));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
      if (!(await this.verifyHash(id))) throw new Error("ARTIFACT_CORRUPTED");
    } finally {
      await unlink(temp);
    }
    return id;
  }
  async readById(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("INVALID_ARTIFACT_ID");
    const file = resolve(await this.directory(), id);
    if (!(await lstat(file)).isFile()) throw new Error("ARTIFACT_NOT_REGULAR");
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const bytes = await handle.readFile();
      if (hash(bytes) !== id) throw new Error("ARTIFACT_CORRUPTED");
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async verifyHash(id: string) {
    try {
      await this.readById(id);
      return true;
    } catch {
      return false;
    }
  }
}
