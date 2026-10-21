import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DesktopClient,
  type Workspace,
  WorkspaceFormSchema,
  type WorkspaceResult,
} from "@tradequote/contracts";
import { FolderPlus, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../shared/button";

export function useWorkspace(client: DesktopClient) {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const result = await client.getWorkspace();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}
export function WorkspacePage({ client }: { client: DesktopClient }) {
  const query = useWorkspace(client);
  if (query.isPending) return <p role="status">正在读取本地工作区…</p>;
  if (query.isError)
    return (
      <section className="panel">
        <h1>工作区暂时无法读取</h1>
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          重新加载
        </Button>
      </section>
    );
  return (
    <WorkspaceForm
      key={`${query.data?.id ?? "new"}-${query.data?.version ?? 0}`}
      client={client}
      workspace={query.data}
    />
  );
}
function WorkspaceForm({
  client,
  workspace,
}: {
  client: DesktopClient;
  workspace: Workspace | null;
}) {
  const queries = useQueryClient();
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(WorkspaceFormSchema),
    defaultValues: { name: workspace?.name ?? "" },
  });
  const mutation = useMutation({
    mutationFn: async ({ name }: { name: string }): Promise<WorkspaceResult> => {
      const fingerprint = JSON.stringify({ name, version: workspace?.version });
      if (operation.current?.fingerprint !== fingerprint)
        operation.current = { fingerprint, key: crypto.randomUUID() };
      const common = {
        schemaVersion: 1 as const,
        requestId: crypto.randomUUID(),
        idempotencyKey: operation.current.key,
      };
      return workspace
        ? client.renameWorkspace({
            ...common,
            method: "workspace.rename",
            payload: { name, expectedVersion: workspace.version },
          })
        : client.createWorkspace({ ...common, method: "workspace.create", payload: { name } });
    },
    onSuccess: async (result) => {
      if (result.ok) await queries.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const result = mutation.data;
  const error = result && !result.ok ? result.error : null;
  return (
    <section className="panel max-w-2xl">
      <div className="eyebrow">LOCAL WORKSPACE</div>
      <h1>{workspace ? "工作区设置" : "建立你的第一份工作区"}</h1>
      <p className="description">
        {workspace
          ? `已保存至本机 · 版本 ${workspace.version}`
          : "先为本地资料命名。之后导入商品、建立询盘，逐步形成可追溯的报价。"}
      </p>
      <form
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
        className="space-y-4 mt-6"
      >
        <div>
          <label htmlFor="workspace-name">工作区名称</label>
          <input
            id="workspace-name"
            {...form.register("name")}
            aria-invalid={!!form.formState.errors.name}
            aria-describedby="name-error"
            placeholder="例如：我的外贸业务"
            autoComplete="off"
          />
          <p
            id="name-error"
            className="field-error"
            role={form.formState.errors.name ? "alert" : undefined}
          >
            {form.formState.errors.name?.message}
          </p>
        </div>
        {error && (
          <div role="alert" className="error-box">
            <p>{error.message}</p>
            {error.code === "REVISION_CONFLICT" && (
              <Button
                variant="outline"
                type="button"
                onClick={() => void queries.invalidateQueries({ queryKey: ["workspace"] })}
              >
                重新加载最新版本
              </Button>
            )}
          </div>
        )}
        {mutation.isError && <p role="alert">连接中断，请重试同一操作。</p>}
        <Button type="submit" disabled={mutation.isPending}>
          <FolderPlus size={16} />
          {mutation.isPending ? "正在保存…" : workspace ? "保存工作区" : "创建工作区"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        资料保存在当前设备。未来共享服务将沿用同一业务接口。
      </p>
    </section>
  );
}
