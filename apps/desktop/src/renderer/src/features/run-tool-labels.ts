import type { AgentToolStep } from "@tradequote/contracts";
export const toolLabels: Record<AgentToolStep["tool"], string> = {
  search_catalog: "检索商品",
  get_product_revisions: "读取商品资料",
  get_quote: "读取报价",
  search_knowledge: "读取适用知识",
  calculate_quote: "核价",
  validate_quote: "规则校验",
  create_draft: "保存草稿",
  apply_patch: "保存修订",
};
