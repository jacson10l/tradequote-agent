import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DesktopClient,
  type Scenario,
  type ScenarioInput,
  ScenarioInputSchema,
} from "@tradequote/contracts";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../shared/button";
import { useMessage } from "../shared/message";
import { Notification } from "../shared/notification";

/** Workspace defaults reuse the existing scenario service and frozen version contract. */
export function BusinessSettings({ client }: { client: DesktopClient }) {
  const queries = useQueryClient();
  const message = useMessage();
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const query = useQuery({
    queryKey: ["trade"],
    queryFn: async () => {
      const result = await client.getTrade();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
  const mutation = useMutation({
    mutationFn: async (scenario: ScenarioInput) => {
      const expectedVersion = query.data?.scenario?.version ?? 0;
      const fingerprint = JSON.stringify({ scenario, expectedVersion });
      if (operation.current?.fingerprint !== fingerprint)
        operation.current = { fingerprint, key: crypto.randomUUID() };
      return client.saveScenario({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: operation.current.key,
        method: "scenario.save",
        payload: { scenario, expectedVersion },
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        message.error(result.error.message);
        return;
      }
      queries.setQueryData(["trade"], result.data);
      message.success("业务配置已保存");
      await queries.invalidateQueries({ queryKey: ["trade"] });
    },
    onError: () => message.error("连接中断，结果未知。请重试同一操作或重新加载。"),
  });
  if (query.isPending) return <p role="status">正在读取业务配置…</p>;
  if (query.isError)
    return (
      <Notification
        title="业务配置读取失败"
        description={query.error.message}
        action={{
          label: "重新加载业务配置",
          onClick: () => void query.refetch(),
          pending: query.isFetching,
        }}
      />
    );
  return (
    <ScenarioForm
      key={query.data.scenario?.id ?? "new"}
      scenario={query.data.scenario}
      busy={mutation.isPending}
      reloading={query.isFetching}
      onReload={() => void query.refetch()}
      onSave={(scenario) => mutation.mutate(scenario)}
    />
  );
}
function ScenarioForm({
  scenario,
  busy,
  reloading,
  onReload,
  onSave,
}: {
  scenario: Scenario | null;
  busy: boolean;
  reloading: boolean;
  onReload: () => void;
  onSave: (input: ScenarioInput) => void;
}) {
  const form = useForm<ScenarioInput>({
    resolver: zodResolver(ScenarioInputSchema),
    defaultValues: scenario
      ? {
          name: scenario.name,
          targetUser: scenario.targetUser,
          platform: scenario.platform,
          market: scenario.market,
          category: scenario.category,
          locales: scenario.locales,
          sourceStatus: scenario.sourceStatus,
        }
      : {
          name: "",
          targetUser: "",
          platform: "",
          market: "",
          category: "",
          locales: [],
          sourceStatus: "user_provided",
        },
  });
  // Stored metadata is deliberately not submitted as editable scenario input.
  const submit = form.handleSubmit((data) => onSave(data));
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>业务默认配置</h2>
        <Button variant="outline" disabled={busy || reloading} onClick={onReload}>
          重新加载业务配置
        </Button>
      </div>
      <p className="description">
        设置常用的平台、市场、品类和语言。本次询盘的具体要求在单据工作台确认。
      </p>
      <form onSubmit={submit} className="space-y-4 mt-4">
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", "场景名称"],
              ["targetUser", "目标用户与岗位"],
              ["platform", "目标平台 / 场景"],
              ["market", "目标市场"],
              ["category", "商品品类"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`scenario-${key}`}>{label}</label>
              <input id={`scenario-${key}`} {...form.register(key)} />
              <p className="field-error">{form.formState.errors[key]?.message}</p>
            </div>
          ))}
          <div>
            <label htmlFor="scenario-locales">目标语言（逗号分隔 BCP 47）</label>
            <input
              id="scenario-locales"
              value={form.watch("locales").join(", ")}
              onChange={(event) =>
                form.setValue(
                  "locales",
                  event.target.value.split(",").map((v) => v.trim()),
                  { shouldValidate: true },
                )
              }
            />
            <p className="field-error">{form.formState.errors.locales?.message}</p>
          </div>
          <div>
            <label htmlFor="scenario-source">场景来源</label>
            <select id="scenario-source" {...form.register("sourceStatus")}>
              <option value="synthetic">未核实配置（不可用于交易）</option>
              <option value="user_provided">用户提供（规则仍待验证）</option>
            </select>
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          保存业务场景
        </Button>
        {scenario && <span className="status-badge ml-3">场景版本 {scenario.version}</span>}
      </form>
    </section>
  );
}
