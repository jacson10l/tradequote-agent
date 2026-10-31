import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type PetMemoryItem,
  PetMemoryItemSchema,
  type PetPersona,
  PetPersonaSchema,
  type PetResult,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import Database from "better-sqlite3";
import type { DeepSeekProvider } from "./deepseek";

/**
 * 虚拟形象（报价小人）记忆存储。独立 pet-memory.db，与业务 SQLite 完全隔离。
 *
 * - 人设（persona）：人工审核后才生效（status=candidate → approved）。
 * - 会话记忆（memory）：免审自动写，kind ∈ {fact, summary}，有界（最多保留
 *   MAX_MEMORIES 条，超出按时间滚动删除最旧）。
 * - 不写入 wiki-project，不接入业务迁移谱系（独立 user_version=1）。
 */

const MAX_MEMORIES = 100;
/** fact 记忆达到该数量时触发压缩：旧 fact 合并为一条 summary。 */
const SUMMARIZE_THRESHOLD = 30;

const DDL = `
CREATE TABLE IF NOT EXISTS pet_persona (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('candidate','approved')),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pet_memory (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('fact','summary')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pet_memory_created ON pet_memory(created_at);
`;

export class PetMemoryStore {
  private readonly db: Database.Database;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    try {
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = FULL");
      this.db.exec(DDL);
      this.db.pragma("user_version = 1");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private readPersona(): PetPersona | null {
    const row = this.db
      .prepare(
        "SELECT id, version, content, status, approved_by, approved_at, created_at FROM pet_persona ORDER BY version DESC LIMIT 1",
      )
      .get() as
      | {
          id: string;
          version: number;
          content: string;
          status: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return PetPersonaSchema.parse({
      id: row.id,
      version: row.version,
      content: row.content,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
    });
  }

  private readMemories(): PetMemoryItem[] {
    const rows = this.db
      .prepare("SELECT id, kind, content, created_at FROM pet_memory ORDER BY created_at ASC")
      .all() as { id: string; kind: string; content: string; created_at: string }[];
    return rows.map((r) =>
      PetMemoryItemSchema.parse({
        id: r.id,
        kind: r.kind,
        content: r.content,
        createdAt: r.created_at,
      }),
    );
  }

  getState(): Extract<PetResult, { ok: true }> {
    return {
      ok: true,
      data: { persona: this.readPersona(), memories: this.readMemories() },
      warnings: [],
      evidenceIds: [],
    };
  }

  proposePersona(content: string): PetResult {
    const latest = this.readPersona();
    const now = new Date().toISOString();
    const nextVersion = latest ? latest.version + 1 : 1;
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO pet_persona(id, version, content, status, approved_by, approved_at, created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(id, nextVersion, content, "candidate", null, null, now);
    return this.getState();
  }

  approvePersona(personaId: string, approvedBy: string): PetResult {
    const row = this.db
      .prepare("SELECT id, version, status FROM pet_persona WHERE id=?")
      .get(personaId) as { id: string; version: number; status: string } | undefined;
    if (!row) throw new TradeFault("VALIDATION_ERROR", "人设候选不存在，请重新提交");
    if (row.status !== "candidate")
      throw new TradeFault("VALIDATION_ERROR", "该人设已审核，不可重复");
    // 撤回旧 approved，仅保留最新一个生效人设。
    this.db.prepare("UPDATE pet_persona SET status='candidate' WHERE status='approved'").run();
    this.db
      .prepare("UPDATE pet_persona SET status='approved', approved_by=?, approved_at=? WHERE id=?")
      .run(approvedBy, new Date().toISOString(), personaId);
    return this.getState();
  }

  /** 追加一条记忆，超出上限时滚动删除最旧。返回写入后的记忆条数。 */
  appendMemory(kind: "fact" | "summary", content: string): void {
    this.db
      .transaction(() => {
        this.db
          .prepare("INSERT INTO pet_memory(id, kind, content, created_at) VALUES (?,?,?,?)")
          .run(randomUUID(), kind, content, new Date().toISOString());
        const count = (
          this.db.prepare("SELECT COUNT(*) AS n FROM pet_memory").get() as { n: number }
        ).n;
        if (count > MAX_MEMORIES) {
          this.db
            .prepare(
              "DELETE FROM pet_memory WHERE id IN (SELECT id FROM pet_memory ORDER BY created_at ASC LIMIT ?)",
            )
            .run(count - MAX_MEMORIES);
        }
      })
      .immediate();
  }

  /** 当前生效人设（仅 approved）。 */
  activePersona(): PetPersona | null {
    const persona = this.readPersona();
    return persona && persona.status === "approved" ? persona : null;
  }

  /**
   * 当 fact 记忆超过阈值时，将最旧的 fact 合并压缩为一条 summary（调用模型），
   * 并删除被压缩的 fact。有界、幂等：压缩失败时不清除原 fact，下次仍可重试。
   * 仅在存在凭据/模型可用时由调用方触发；这里只负责存储层的压缩写入。
   */
  async maybeSummarize(provider: DeepSeekProvider): Promise<void> {
    const facts = this.db
      .prepare("SELECT id, content FROM pet_memory WHERE kind='fact' ORDER BY created_at ASC")
      .all() as { id: string; content: string }[];
    if (facts.length < SUMMARIZE_THRESHOLD) return;
    // 压缩最旧的 SUMMARIZE_THRESHOLD 条，保留最近一条不动。
    const toSummarize = facts.slice(0, facts.length - 1);
    if (toSummarize.length === 0) return;
    const summary = await provider.chat([
      {
        role: "system",
        content:
          "你是 TradeQuote 虚拟形象助手的记忆整理器。把下面这段与用户的对话事实压缩成简洁的中文长期记忆要点（保留偏好、称呼、重要约定，去掉重复和寒暄）。直接输出要点文本，不要解释。",
      },
      { role: "user", content: toSummarize.map((f) => f.content).join("\n") },
    ]);
    const trimmed = summary.trim().slice(0, 4000);
    if (!trimmed) return;
    this.db
      .transaction(() => {
        for (const f of toSummarize) this.db.prepare("DELETE FROM pet_memory WHERE id=?").run(f.id);
        this.db
          .prepare("INSERT INTO pet_memory(id, kind, content, created_at) VALUES (?,?,?,?)")
          .run(randomUUID(), "summary", trimmed, new Date().toISOString());
      })
      .immediate();
  }

  close() {
    this.db.close();
  }
}
