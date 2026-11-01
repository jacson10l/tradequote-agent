import type { TradeBoard } from "@tradequote/contracts";

/**
 * 把报价板（冻结快照）提炼成一段文本，供小人对话引用（只读）。
 *
 * 纯函数、无副作用。金额仅展示快照中已确定的值；nullable 金额（未计算/待定）
 * 显式标注"待定"，遵守"未知不等于零、金额由确定性模块计算"约束，绝不推算或编造。
 *
 * 返回 undefined 表示工作区无可用报价上下文（无场景、无商品、无报价）。
 */
export function summarizeQuoteBoard(board: TradeBoard): string | undefined {
  const { scenario, products, quotes } = board;
  if (products.length === 0 && quotes.length === 0 && !scenario) return undefined;

  const lines: string[] = [];
  if (scenario) lines.push(`场景：${scenario.name ?? scenario.id}`);
  if (products.length > 0) {
    lines.push(
      `商品目录 ${products.length} 条：${products
        .slice(0, 20)
        .map((p) => p.name)
        .join("、")}${products.length > 20 ? "…" : ""}`,
    );
  }
  if (quotes.length > 0) {
    const buyers = [...new Set(quotes.map((q) => q.buyer).filter(Boolean))];
    lines.push(
      `当前报价 ${quotes.length} 份${buyers.length > 0 ? `，涉及客户：${buyers.slice(0, 10).join("、")}` : ""}`,
    );
    for (const q of quotes.slice(0, 8)) {
      const total = q.goodsTotal ? `${q.goodsTotal} ${q.currency}` : "总价待定";
      lines.push(
        `  报价 ${q.number}（客户 ${q.buyer || "未填"}）：${total}，${q.lines.length} 行商品`,
      );
    }
    if (quotes.length > 8) lines.push(`  …其余 ${quotes.length - 8} 份报价略`);
  }

  return `当前工作区的报价上下文（仅供你回答参考，不要编造未列出的数据；金额以"待定"标注的表示尚未确定）：\n${lines.map((l) => `- ${l}`).join("\n")}`;
}
