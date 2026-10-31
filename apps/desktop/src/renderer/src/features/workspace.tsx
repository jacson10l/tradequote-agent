import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DesktopClient,
  type Workspace,
  WorkspaceFormSchema,
  type WorkspaceResult,
} from "@tradequote/contracts";
import { FolderPlus } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../shared/button";
import { useMessage } from "../shared/message";
import { Notification } from "../shared/notification";

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
        <Notification
          title="工作区读取失败"
          description={query.error.message}
          action={{
            label: "重新加载",
            onClick: () => void query.refetch(),
            pending: query.isFetching,
          }}
        />
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
  const message = useMessage();
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
      if (result.ok) {
        message.success("工作区已保存至本机");
        await queries.invalidateQueries({ queryKey: ["workspace"] });
      } else if (result.error.code !== "REVISION_CONFLICT") {
        message.error(result.error.message);
      }
    },
    onError: () => message.error("连接中断，请重试同一操作。"),
  });
  const result = mutation.data;
  const error = result && !result.ok ? result.error : null;
  return (
    <section className="panel max-w-2xl">
      <h1 className="sr-only">{workspace ? "工作区设置" : "创建工作区"}</h1>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
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
        {error?.code === "REVISION_CONFLICT" && (
          <Notification
            title="工作区版本已更新"
            description={error.message}
            action={{
              label: "重新加载最新版本",
              onClick: () => void queries.invalidateQueries({ queryKey: ["workspace"] }),
              pending: queries.isFetching({ queryKey: ["workspace"] }) > 0,
            }}
          />
        )}
        {workspace && (
          <p className="text-sm text-muted-foreground">已保存至本机 · 版本 {workspace.version}</p>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          <FolderPlus size={16} />
          {mutation.isPending ? "正在保存…" : workspace ? "保存工作区" : "创建工作区"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">资料保存在当前设备。</p>
    </section>
  );
}
