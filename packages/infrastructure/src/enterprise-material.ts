import { createHash, randomUUID } from "node:crypto";
import {
  failure,
  type KnowledgeDesktopCommand,
  type KnowledgeDesktopResult,
  KnowledgeDesktopResultSchema,
  type WikiHostContext,
  type WikiSourceRevision,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import type Database from "better-sqlite3";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { SqliteWikiStore } from "./wiki-store";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const unknown = { status: "unknown" as const, validFrom: null, validUntil: null };
const demos = [
  [
    "企业与服务范围",
    "合成演示企业：澄海贸易工作室。为中小采购商提供服装、紧固件及板材询价资料整理与报价草稿。品类能力仅为演示设定，不代表真实公司或供应商承诺。",
  ],
  [
    "询盘处理流程",
    "演示SOP：收到询盘后核对SKU、数量、单位、币种、目的市场与报价语言；缺失信息向业务员追问。查询已发布目录并调用确定性核价；运费和税费未知时保持未知；生成未审核回复草稿供人工复核。",
  ],
  [
    "付款与交期管理",
    "演示规则：付款和交期必须由业务员按客户与供应商实际确认内容录入；企业历史经验不等于当前订单承诺。严禁在付款内容中出现 FREE 字样。该规则仅用于合成场景验证，不代表真实合同。",
  ],
  [
    "质量与认证核查",
    "演示SOP：商品描述提到GRS、OEKO-TEX或REACH等名称时，只视为来源声明；索取当前证书、适用型号、持证主体及有效期后人工核验。缺少证书原件时不得向买家承诺已认证。",
  ],
  [
    "目录与阶梯价口径",
    "演示术语：MOQ表示来源目录中的起订数量；数量阶梯用于选择对应单价。商品合计由十进制业务服务计算，Wiki里的价格描述不覆盖价目表。样品价不可替代量产单价，空值不等于零。",
  ],
  [
    "报价版本与回复审核",
    "演示SOP：修改数量或条件时生成新报价版本，保留旧版及当时引用。对照商品合计变化、待确认项和知识来源，人工核对后复制客户回复。复制不代表正式审批或邮件已发送。",
  ],
];
type Material = {
  title: string;
  text: string;
  category: string;
  status: "synthetic" | "user_provided";
};
export function importEnterpriseMaterial(
  db: Database.Database,
  command: Extract<
    KnowledgeDesktopCommand,
    { method: "knowledge.importCatalog" | "knowledge.seedDemo" }
  >,
  context: WikiHostContext,
): KnowledgeDesktopResult {
  try {
    const fingerprint = hash(
      JSON.stringify({
        method: command.method,
        payload: command.payload,
        workspace: context.workspaceId,
      }),
    );
    // Content addressing also prevents repeated imports with fresh UI operation keys.
    const key = `enterprise-material:${fingerprint}`;
    return db
      .transaction(() => {
        const operation = db
          .prepare("SELECT request_hash,result_json FROM idempotency WHERE key=?")
          .get(command.idempotencyKey) as { request_hash: string; result_json: string } | undefined;
        if (operation)
          return operation.request_hash === fingerprint
            ? KnowledgeDesktopResultSchema.parse(JSON.parse(operation.result_json))
            : failure("IDEMPOTENCY_CONFLICT", "同一导入操作标识不能用于不同内容");
        const remember = (result: KnowledgeDesktopResult) => {
          db.prepare("INSERT INTO idempotency(key,request_hash,result_json) VALUES(?,?,?)").run(
            command.idempotencyKey,
            fingerprint,
            JSON.stringify(result),
          );
          return result;
        };
        const prior = db.prepare("SELECT result_json FROM idempotency WHERE key=?").get(key) as
          | { result_json: string }
          | undefined;
        if (prior) {
          const result = KnowledgeDesktopResultSchema.parse(JSON.parse(prior.result_json));
          if (result.ok && result.data.kind === "imported") result.data.reused = true;
          return remember(result);
        }
        const materials: Material[] = [];
        if (command.method === "knowledge.seedDemo")
          for (const [title, text] of demos)
            materials.push({
              title: `${title}（合成演示）`,
              text: text!,
              category: "",
              status: "synthetic",
            });
        else {
          const parsedRows: unknown = parse(command.payload.csv, {
            bom: true,
            raw: true,
            skip_empty_lines: true,
            max_record_size: 32000,
          });
          const rows = z
            .array(z.object({ record: z.array(z.string()), raw: z.string() }))
            .parse(parsedRows);
          const header = rows.shift();
          if (!header) throw new TradeFault("VALIDATION_ERROR", "CSV为空");
          const skuIndex = header.record.indexOf("sku"),
            nameIndex = header.record.indexOf("name"),
            categoryIndex = header.record.indexOf("category");
          if (skuIndex < 0 || nameIndex < 0 || categoryIndex < 0)
            throw new TradeFault("VALIDATION_ERROR", "CSV需包含sku、name、category列");
          if (rows.length > 2000)
            throw new TradeFault("VALIDATION_ERROR", "单次最多2000行，请拆分CSV");
          const products = new Map<string, Material>();
          for (const row of rows) {
            const sku = row.record[skuIndex]?.trim();
            if (!sku) throw new TradeFault("VALIDATION_ERROR", "CSV含空SKU，未导入");
            const category = row.record[categoryIndex]?.trim() ?? "";
            const productKey = JSON.stringify([sku, category]);
            let product = products.get(productKey);
            if (!product) {
              product = {
                title: `${sku} · ${row.record[nameIndex] ?? "商品"}`.slice(0, 190),
                text: header.raw,
                category,
                status: "user_provided",
              };
              products.set(productKey, product);
            }
            product.text += row.raw;
            if (product.text.length > 30000)
              throw new TradeFault("VALIDATION_ERROR", "单个SKU资料超过30000字，请拆分原文件");
          }
          if (products.size > 200)
            throw new TradeFault("VALIDATION_ERROR", "单次最多200个SKU，请拆分CSV");
          materials.push(...products.values());
        }
        const wiki = new SqliteWikiStore(db);
        const fileHash =
          command.method === "knowledge.importCatalog"
            ? hash(command.payload.csv)
            : hash(JSON.stringify(demos));
        for (const material of materials) {
          const staged = wiki.stageSource(
            {
              sourceId: randomUUID(),
              expectedVersion: 0,
              label: material.title,
              sourceStatus: material.status,
              mediaType: "text/plain",
              sourceText: material.text,
              acquiredAt: context.now,
              sourceUri: null,
              permissionNote:
                command.method === "knowledge.importCatalog"
                  ? `用户明确授权导入 ${command.payload.label}；完整文件SHA-256=${fileHash}。此版本为该SKU的原始CSV行与表头，供应商/认证/价格均为来源声明，待核实。`
                  : `自编合成演示资料，非真实企业承诺；批次SHA-256=${fileHash}`,
              validity: unknown,
            },
            context,
            randomUUID(),
          );
          if (!staged.ok) throw new TradeFault(staged.error.code, staged.error.message);
          if (staged.data.kind !== "sourceRevision") throw new Error("source");
          const source: WikiSourceRevision = staged.data.revision;
          const prefix = `# ${material.title}\n\n${material.status === "synthetic" ? "明确合成演示资料，不代表真实企业事实。" : "用户CSV资料摘录，尚未人工核实。价格/起订量/认证/供应商按原文保留，不能自动用作已确认报价事实。"}\n\n`;
          const markdown = prefix + material.text;
          const sectionId = randomUUID(),
            referenceId = randomUUID();
          const result = wiki.stageWiki(
            {
              documentId: randomUUID(),
              expectedVersion: 0,
              parentRevisionId: null,
              content: {
                kind: "sop",
                title: material.title,
                locale: "zh-CN",
                scope: {
                  platforms: [],
                  markets: [],
                  categories: material.category ? [material.category] : [],
                },
                markdown,
                validity: unknown,
                sections: [
                  {
                    sectionId,
                    title: "来源原文摘录",
                    location: { kind: "text", start: prefix.length, end: markdown.length },
                    sourceReferenceIds: [referenceId],
                  },
                ],
                sourceRefs: [
                  {
                    referenceId,
                    sourceId: source.sourceId,
                    sourceRevisionId: source.sourceRevisionId,
                    sourceVersion: source.version,
                    artifactHash: source.artifactHash,
                    location: { kind: "text", start: 0, end: material.text.length },
                    excerptHash: hash(material.text),
                    assertion: "human_note",
                  },
                ],
                relations: [],
                rules: [],
              },
            },
            context,
            randomUUID(),
          );
          if (!result.ok) throw new TradeFault(result.error.code, result.error.message);
        }
        const result: KnowledgeDesktopResult = {
          ok: true,
          data: {
            kind: "imported",
            sources: materials.length,
            records: materials.length,
            reused: false,
          },
          warnings: [],
          evidenceIds: [],
        };
        db.prepare("INSERT INTO idempotency(key,request_hash,result_json) VALUES(?,?,?)").run(
          key,
          fingerprint,
          JSON.stringify(result),
        );
        return remember(result);
      })
      .immediate();
  } catch (e) {
    return e instanceof TradeFault
      ? failure(e.code, e.message)
      : failure("VALIDATION_ERROR", "资料导入失败，原文格式或长度不合法；本批未写入");
  }
}
