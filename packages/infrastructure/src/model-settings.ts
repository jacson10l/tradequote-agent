import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type ModelCredentials,
  ModelCredentialsSchema,
  type ModelResult,
  ModelStatusSchema,
  SavedCredentialsSchema,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
export interface SecretCipher {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}
export class ModelSettingsStore {
  private credentials: ModelCredentials | undefined;
  private storage: "encrypted" | "memory" = "memory";
  private verifiedAt: string | null = null;
  private unreadable = false;
  constructor(
    private readonly file: string,
    private readonly cipher: SecretCipher,
  ) {}
  async init() {
    try {
      const data = SavedCredentialsSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
      if (!this.cipher.available()) {
        this.unreadable = true;
        return;
      }
      this.credentials = ModelCredentialsSchema.parse({
        key: this.cipher.decrypt(Buffer.from(data.encrypted, "base64")),
        model: data.model,
      });
      this.storage = "encrypted";
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        this.unreadable = true;
    }
  }
  status(): ModelResult {
    if (this.unreadable)
      throw new TradeFault(
        "CAPABILITY_UNAVAILABLE",
        "原模型凭据无法解密；请重新保存 Key 或清除设置。旧文件尚未改动。",
      );
    return {
      ok: true,
      data: ModelStatusSchema.parse({
        hasKey: !!this.credentials,
        model: this.credentials?.model ?? "",
        storage: this.storage,
        verifiedAt: this.verifiedAt,
      }),
      warnings: [],
      evidenceIds: [],
    };
  }
  getCredentials() {
    return this.credentials ? { ...this.credentials } : undefined;
  }
  async save(key: string, model: string) {
    const parsed = ModelCredentialsSchema.safeParse({ key: key || this.credentials?.key, model });
    if (!parsed.success) throw new TradeFault("VALIDATION_ERROR", "请输入 API Key 和有效模型 ID");
    const encrypted = this.cipher.available();
    if (encrypted) {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(
        `${this.file}.tmp`,
        JSON.stringify({
          model,
          encrypted: this.cipher.encrypt(parsed.data.key).toString("base64"),
        }),
        { mode: 0o600 },
      );
      await rename(`${this.file}.tmp`, this.file);
    } else await rm(this.file, { force: true });
    this.credentials = parsed.data;
    this.storage = encrypted ? "encrypted" : "memory";
    this.verifiedAt = null;
    this.unreadable = false;
    return this.status();
  }
  async clear() {
    await rm(this.file, { force: true });
    await rm(`${this.file}.tmp`, { force: true });
    this.credentials = undefined;
    this.verifiedAt = null;
    this.storage = "memory";
    this.unreadable = false;
    return this.status();
  }
  verified() {
    this.verifiedAt = new Date().toISOString();
    return this.status();
  }
}
