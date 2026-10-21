import type { DesktopClient } from "@tradequote/contracts";
import { Folder, LayoutDashboard, Settings } from "lucide-react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Workbench } from "./features/workbench";
import { useWorkspace, WorkspacePage } from "./features/workspace";

export function App({ client }: { client: DesktopClient }) {
  const query = useWorkspace(client);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TQ</span>
          <div>
            TradeQuote<small>询报价协同工作台</small>
          </div>
        </div>
        <div className="workspace-label">
          <Folder size={16} />
          <span>{query.data?.name ?? "尚未创建工作区"}</span>
        </div>
        <nav aria-label="主导航">
          <NavLink to="/" end>
            <LayoutDashboard size={18} />
            单据工作台
          </NavLink>
          <NavLink to="/workspace">
            <Settings size={18} />
            工作区设置
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="dot" />
          本地数据 · 人工审核<p>M1 工程基础</p>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Workbench client={client} />} />
          <Route path="/workspace" element={<WorkspacePage client={client} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
