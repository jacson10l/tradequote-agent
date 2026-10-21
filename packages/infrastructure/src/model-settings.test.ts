import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ModelSettingsStore } from "./model-settings";

// Synthetic cipher isolates storage lifecycle; real safeStorage is exercised by desktop E2E.
const cipher = {
  available: () => true,
  encrypt: (value: string) => Buffer.from([...value].reverse().join("")),
  decrypt: (value: Buffer) => [...value.toString()].reverse().join(""),
};
it("saves encrypted material, retains key on blank update, never echoes secret, reopens and clears", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tq-key-"));
  const file = join(dir, "credentials.enc");
  try {
    const store = new ModelSettingsStore(file, cipher);
    await store.init();
    await store.save("synthetic-key", "test-model");
    expect(await readFile(file, "utf8")).not.toContain("synthetic-key");
    expect(JSON.stringify(store.status())).not.toContain("synthetic-key");
    await store.save("", "changed-model");
    expect(store.getCredentials()).toEqual({ key: "synthetic-key", model: "changed-model" });
    expect(store.verified()).toMatchObject({ ok: true, data: { verifiedAt: expect.any(String) } });
    const reopened = new ModelSettingsStore(file, cipher);
    await reopened.init();
    expect(reopened.getCredentials()).toEqual(store.getCredentials());
    expect(reopened.status()).toMatchObject({ ok: true, data: { verifiedAt: null } });
    await reopened.clear();
    expect(reopened.getCredentials()).toBeUndefined();
    await expect(readFile(file)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("does not persist plaintext when encryption unavailable, reports corrupt records without overwriting until explicit save", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tq-key-"));
  const file = join(dir, "credentials.enc");
  try {
    await writeFile(file, "invalid");
    const store = new ModelSettingsStore(file, { ...cipher, available: () => false });
    await store.init();
    expect(() => store.status()).toThrow("无法解密");
    expect(await readFile(file, "utf8")).toBe("invalid");
    await store.save("synthetic-key", "test-model");
    expect(store.status()).toMatchObject({ ok: true, data: { storage: "memory", hasKey: true } });
    await expect(readFile(file)).rejects.toThrow();
    const reopened = new ModelSettingsStore(file, cipher);
    await reopened.init();
    expect(reopened.getCredentials()).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
