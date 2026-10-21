import type { DesktopClient } from "@tradequote/contracts";
import { Folder, LayoutDashboard, Settings } from "lucide-react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import brandIcon from "../../../resources/icon.svg";
import { Workbench } from "./features/workbench";
import { useWorkspace, WorkspacePage } from "./features/workspace";

export function App({ client }: { client: DesktopClient }) {
  const query = useWorkspace(client);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={brandIcon} alt="" />
          <div>
            TradeQuote<small>询报价协同工作台</small>
          </div>
        </div>
        <div className="workspace-label">
          <Folder size={16} />
          <span>{query.data?.name ?? "尚未创建工作区"}</span>
        </div>
        <nav aria-label="主导航">
          <NavLink to="/" end aria-label="单据工作台" title="单据工作台">
            <LayoutDashboard size={18} />
            <span className="nav-label">单据工作台</span>
          </NavLink>
          <NavLink to="/workspace" aria-label="工作区设置" title="工作区设置">
            <Settings size={18} />
            <span className="nav-label">工作区设置</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer" title="本地数据 · 人工审核">
          <span className="dot" />
          本地数据 · 人工审核<p>M1 工程基础</p>
        </div>
      </aside>
      <main tabIndex={-1} aria-label="工作内容">
        <Routes>
          <Route path="/" element={<Workbench client={client} />} />
          <Route path="/workspace" element={<WorkspacePage client={client} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
