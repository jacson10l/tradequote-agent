import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "./theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("ROOT_ELEMENT_MISSING");
const queries = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queries}>
      <HashRouter>
        <App client={window.tradequote} />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
