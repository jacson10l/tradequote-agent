import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { DeepSeekProvider } from "./deepseek";
import { PetMemoryStore } from "./pet-memory-store";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "tq-pet-"));
  return { dir, store: new PetMemoryStore(join(dir, "pet-memory.db")) };
}

function fakeProvider(reply: string) {
  const chat = vi.fn().mockResolvedValue(reply);
  return { provider: { chat } as unknown as DeepSeekProvider, chat };
}

it("人设须人工审核后才生效，且仅保留最新一个生效人设", async () => {
  const { dir, store } = await fixture();
  try {
    expect(store.getState().data.persona).toBeNull();

    store.proposePersona("第一版人设：温暖专业");
    const candidate = store.getState().data.persona;
    expect(candidate).not.toBeNull();
    expect(candidate!.status).toBe("candidate");
    expect(store.activePersona()).toBeNull();

    store.approvePersona(candidate!.id, "操作员A");
    const approved = store.getState().data.persona;
    expect(approved!.status).toBe("approved");
    expect(approved!.approvedBy).toBe("操作员A");
    expect(store.activePersona()!.content).toBe("第一版人设：温暖专业");

    // 新候选 + 审核后，旧 approved 被撤回。
    store.proposePersona("第二版人设：更活泼");
    const second = store.getState().data.persona!;
    store.approvePersona(second.id, "操作员B");
    expect(store.activePersona()!.content).toBe("第二版人设：更活泼");
    const first = store.getState().data.persona;
    expect(first!.status).toBe("approved");
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("重复审核已审核人设会被拒绝", async () => {
  const { dir, store } = await fixture();
  try {
    store.proposePersona("人设");
    const id = store.getState().data.persona!.id;
    store.approvePersona(id, "操作员");
    expect(() => store.approvePersona(id, "操作员")).toThrow();
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("会话记忆自动追加，超出上限滚动删除最旧", async () => {
  const { dir, store } = await fixture();
  try {
    for (let i = 0; i < 110; i++) store.appendMemory("fact", `记忆 ${i}`);
    const state = store.getState();
    expect(state.data.memories.length).toBe(100);
    // 最旧的 10 条被滚动删除，最早保留的是"记忆 10"。
    expect(state.data.memories[0]!.content).toBe("记忆 10");
    expect(state.data.memories.at(-1)!.content).toBe("记忆 109");
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("fact 记忆超过阈值时压缩为 summary，并删除被压缩的 fact", async () => {
  const { dir, store } = await fixture();
  try {
    for (let i = 0; i < 31; i++) store.appendMemory("fact", `用户偏好 ${i}`);
    const { provider } = fakeProvider("用户偏好橙色、喜欢直接报价");
    await store.maybeSummarize(provider);

    const state = store.getState();
    const summaries = state.data.memories.filter((m) => m.kind === "summary");
    const facts = state.data.memories.filter((m) => m.kind === "fact");
    // 最旧的 30 条 fact 被压缩成 1 条 summary，仅保留最新 1 条 fact。
    expect(summaries.length).toBe(1);
    expect(summaries[0]!.content).toBe("用户偏好橙色、喜欢直接报价");
    expect(facts.length).toBe(1);
    expect(facts[0]!.content).toBe("用户偏好 30");
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("fact 未达阈值时不触发压缩", async () => {
  const { dir, store } = await fixture();
  try {
    for (let i = 0; i < 5; i++) store.appendMemory("fact", `记忆 ${i}`);
    const { provider, chat } = fakeProvider("不应被调用");
    await store.maybeSummarize(provider);
    expect(chat).not.toHaveBeenCalled();
    expect(store.getState().data.memories.filter((m) => m.kind === "summary").length).toBe(0);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
