import type { DesktopClient } from "@tradequote/contracts";
import { ArrowRight, FileText, MessageSquare, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/button";
import { Notification } from "../shared/notification";
import { useWorkspace } from "./workspace";

export function Workbench({ client }: { client: DesktopClient }) {
  const query = useWorkspace(client);
  const [preview, setPreview] = useState(false);
  return (
    <>
      <h1 className="sr-only">单据工作台</h1>
      {query.isError && (
        <Notification
          title="工作区读取失败"
          description={query.error.message}
          action={{
            label: "重新加载",
            onClick: () => void query.refetch(),
            pending: query.isFetching,
          }}
        />
      )}
      <div className="workbench-grid">
        <section className="panel document">
          <div className="section-heading">
            <div className="flex items-center gap-2">
              <FileText size={18} />
              <h2>{preview ? "单据布局预览" : "报价单据"}</h2>
            </div>
            <Button variant="outline" onClick={() => setPreview(!preview)}>
              {preview ? "返回空工作台" : "查看合成样例"}
            </Button>
          </div>
          {preview ? (
            <>
              <div className="sample-note">合成样例 · 仅用于布局评审，未保存为报价</div>
              <div className="grid grid-cols-2 gap-4 my-6 text-sm">
                <div>
                  <span className="text-muted-foreground">原始询盘摘要</span>
                  <p>请分别提供两个候选商品的数量、单价与交期。</p>
                </div>
                <div>
                  <span className="text-muted-foreground">交易条款</span>
                  <p>币种、贸易术语与交期均待确认</p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">合成商品行示例</caption>
                  <thead>
                    <tr>
                      <th>商品 / 资料状态</th>
                      <th className="numeric">数量</th>
                      <th>单位</th>
                      <th className="numeric">单价</th>
                      <th>依据</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        候选商品 A<br />
                        <small>属性由资料配置</small>
                      </td>
                      <td className="numeric">100</td>
                      <td>待确认</td>
                      <td className="numeric">待确认</td>
                      <td>尚未导入</td>
                    </tr>
                    <tr>
                      <td>
                        候选商品 B<br />
                        <small>跨品类样例</small>
                      </td>
                      <td className="numeric">240</td>
                      <td>待确认</td>
                      <td className="numeric">待确认</td>
                      <td>尚未导入</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="basis">
                <span>金额依据</span>
                <strong>等待商品与价格资料</strong>
                <small>缺项保持未知，不按 0 计算。</small>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mt-6">
                <section className="inset">
                  <h3>
                    <ShieldAlert size={16} />
                    待确认事项
                  </h3>
                  <p>补充商品来源、计价单位和交易条款。</p>
                  <p className="text-muted-foreground">采购确认任务将在规则模块接入后创建。</p>
                </section>
                <section className="inset">
                  <h3>版本差异 · 展示样例</h3>
                  <p>候选商品 A 数量：100 → 120</p>
                  <p className="text-muted-foreground">尚无真实 V1/V2，变更不会写入工作区。</p>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <FileText size={30} />
              </div>
              <h2>从一份询盘开始</h2>
              <p>
                {query.data
                  ? `「${query.data.name}」已准备好。可以导入 CSV 并保存真实报价草稿 V1。`
                  : "先创建本地工作区，再开始整理商品与客户需求。"}
              </p>
              <Button asChild>
                <Link to={query.data ? "/quotes" : "/workspace"}>
                  {query.data ? "建立真实报价 V1" : "创建工作区"}
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          )}
          <footer className="document-footer">
            <span>此处为布局预览；真实草稿请前往资料与报价</span>
            <Button disabled title="需完成报价与审批模块">
              提交人工审核
            </Button>
          </footer>
        </section>
        <aside className="agent-panel">
          <div className="section-heading">
            <h2 className="flex items-center gap-2">
              <MessageSquare size={18} />
              Agent 助手
            </h2>
            <span className="status-badge">待接入</span>
          </div>
          <div className="agent-intro">
            <div className="agent-mark">TQ</div>
            <h3>让沟通回到单据上</h3>
            <p>后续可用自然语言整理询盘、比较候选、修改草稿。每次保存都将展示新版本与变更依据。</p>
          </div>
          <div className="mt-auto">
            <label htmlFor="agent-input">告诉 Agent 你想完成什么</label>
            <textarea id="agent-input" disabled placeholder="模型与业务工具接入后启用" />
            <Button disabled className="w-full mt-2">
              发送给 Agent
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              当前未调用模型，也不会发送工作区资料。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
