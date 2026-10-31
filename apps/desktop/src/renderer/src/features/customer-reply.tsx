import { useQuery } from "@tanstack/react-query";
import type { CheckClient, QuoteSnapshot } from "@tradequote/contracts";
import { useId, useState } from "react";
import { Button } from "../shared/button";
import { useMessage } from "../shared/message";
import { createCustomerReplyDraft, type ReplyLanguage } from "./customer-reply-format";
import { checkQueryKey, loadQuoteChecks } from "./quote-checks";

export function CustomerReply({ quote, client }: { quote: QuoteSnapshot; client: CheckClient }) {
  const [language, setLanguage] = useState<ReplyLanguage>("en");
  const prefix = useId();
  const message = useMessage();
  const query = useQuery({
    queryKey: checkQueryKey(quote),
    queryFn: () => loadQuoteChecks(client, quote),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const draft = createCustomerReplyDraft(
    quote,
    language,
    query.isSuccess && !query.isFetching ? query.data : null,
  );
  return (
    <section
      className="space-y-4 min-w-0 rounded-lg border border-border p-4"
      aria-label={`报价 V${quote.version} 客户回复草稿`}
    >
      <div className="section-heading">
        <h3>客户回复草稿 · V{quote.version}</h3>
        <span className="status-badge">未审核</span>
      </div>
      <p className="description">
        本地模板复用本版本的金额、原始条款与来源；条款不自动翻译，外用前请核对语言。复制不会审批或发送。
      </p>
      <label htmlFor={`${prefix}-language`}>回复语言</label>
      <select
        id={`${prefix}-language`}
        value={language}
        onChange={(e) => setLanguage(e.target.value === "de" ? "de" : "en")}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
      {query.isPending && <p role="status">正在读取检查报告，规则仍待核实…</p>}
      {query.isError && (
        <div>
          <p role="alert">检查报告读取失败，草稿中的条款与风险仍待核实。</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试草稿报告读取
          </Button>
        </div>
      )}
      <label htmlFor={`${prefix}-text`}>客户回复正文</label>
      <textarea id={`${prefix}-text`} rows={18} readOnly value={draft.text} />
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(draft.text);
            message.success("已复制未审核草稿，请人工核对后使用");
          } catch {
            message.error("复制失败，请选中正文手动复制");
          }
        }}
      >
        复制未审核草稿
      </Button>
    </section>
  );
}
