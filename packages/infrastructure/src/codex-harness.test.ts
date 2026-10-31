import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { z } from "zod";
import { CodexHarness } from "./codex-harness";
import { defineBusinessTool } from "./read-tool-runtime";

const fakeServer =
  (mode: "write" | "fail" | "hang" | "late" = "write") =>
  () =>
    spawn(
      process.execPath,
      [
        "-e",
        `
    const rl=require('node:readline').createInterface({input:process.stdin});
    const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');
    rl.on('line',l=>{const m=JSON.parse(l);
      if(m.method==='initialize')send({id:m.id,result:{userAgent:'fixture'}});
      if(m.method==='mcpServerStatus/list')send({id:m.id,result:{data:[],nextCursor:null}});
      if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'thread-fixture'},model:'synthetic-model'}});
      if(m.method==='turn/start'){
        send({id:m.id,result:{turn:{id:'turn-fixture'}}});
        ${mode === "fail" ? "send({method:'turn/completed',params:{threadId:'thread-fixture',turn:{id:'turn-fixture',status:'failed'}}});" : mode === "hang" ? "" : `setTimeout(()=>send({id:99,method:'item/tool/call',params:{threadId:'thread-fixture',turnId:'turn-fixture',callId:'call-fixture',tool:'tradequote_create_draft',arguments:{candidateId:'candidate'}}}),${mode === "late" ? 150 : 0});`}
      }
    });
  `,
      ],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"] },
    );

it("native Codex tool requests invoke the existing business tool and stop after commit", async () => {
  let writes = 0;
  const tool = defineBusinessTool({
    name: "create_draft",
    description: "fixture write",
    inputSchema: z.strictObject({ candidateId: z.literal("candidate") }),
    outputSchema: z.object({ committedRevisionId: z.literal("saved") }),
    execute: async () => {
      writes++;
      return { committedRevisionId: "saved" as const };
    },
  });
  const result = await new CodexHarness({ launch: fakeServer() }).run({
    instruction: "synthetic task",
    context: {},
    tools: [tool],
    availableTools: () => ["create_draft"],
    cancellation: new AbortController().signal,
  });
  expect(result).toEqual({ outcome: "committed", toolCalls: 1 });
  expect(writes).toBe(1);
});

it("cancellation rejects a late tool request without writing", async () => {
  let writes = 0;
  const controller = new AbortController();
  const result = new CodexHarness({ launch: fakeServer("late") }).run({
    instruction: "synthetic cancel",
    context: {},
    tools: [
      {
        name: "create_draft",
        description: "fixture",
        inputSchema: z.object({}),
        invoke: async () => {
          writes++;
          return {};
        },
      },
    ],
    availableTools: () => ["create_draft"],
    cancellation: controller.signal,
  });
  setTimeout(() => controller.abort(), 40);
  await expect(result).rejects.toMatchObject({ code: "CANCELLED" });
  expect(writes).toBe(0);
});

it("a failed native turn cannot claim success", async () => {
  await expect(
    new CodexHarness({ launch: fakeServer("fail") }).run({
      instruction: "synthetic failure",
      context: {},
      tools: [],
      availableTools: () => [],
      cancellation: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
});

it("deadline terminates an unresponsive app-server", async () => {
  await expect(
    new CodexHarness({ launch: fakeServer("hang"), timeoutMs: 60 }).run({
      instruction: "synthetic timeout",
      context: {},
      tools: [],
      availableTools: () => [],
      cancellation: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
});

it("signal-terminated app-server releases the pending task", async () => {
  await expect(
    new CodexHarness({
      launch: () =>
        spawn(process.execPath, ["-e", "setTimeout(()=>process.kill(process.pid,'SIGTERM'),30)"], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        }),
    }).run({
      instruction: "synthetic crash",
      context: {},
      tools: [],
      availableTools: () => [],
      cancellation: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
}, 2000);

it("uses saved DeepSeek credentials through native Responses without putting the key in arguments", async () => {
  let observedArgs: string[] = [];
  let observedEnv: NodeJS.ProcessEnv = {};
  const credentials = { key: "synthetic-deepseek-only", model: "deepseek-flash" };
  await new CodexHarness({
    launch: (cwd, args, env) => {
      observedArgs = args;
      observedEnv = env;
      void cwd;
      return fakeServer("fail")();
    },
  })
    .run({
      credentials,
      instruction: "synthetic task",
      context: {},
      tools: [],
      availableTools: () => [],
      cancellation: new AbortController().signal,
    })
    .catch(() => {});
  expect(observedArgs).toContain('model_provider="tradequote_deepseek"');
  expect(observedArgs).toContain(
    'model_providers.tradequote_deepseek.base_url="https://api.deepseek.com"',
  );
  expect(observedArgs).toContain('model_providers.tradequote_deepseek.wire_api="responses"');
  expect(observedArgs.join(" ")).not.toContain(credentials.key);
  expect(observedEnv.TRADEQUOTE_CODEX_DEEPSEEK_KEY).toBe(credentials.key);
});

it("returns a stage error to Codex without executing an early write, then accepts the corrected sequence", async () => {
  let read = false,
    writes = 0;
  const launch = () =>
    spawn(
      process.execPath,
      [
        "-e",
        `
    const rl=require('node:readline').createInterface({input:process.stdin});const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');
    const call=(id,tool)=>send({id,method:'item/tool/call',params:{threadId:'t',turnId:'u',callId:String(id),namespace:null,tool,arguments:{}}});
    rl.on('line',l=>{const m=JSON.parse(l);
      if(m.method==='initialize')send({id:m.id,result:{}});
      if(m.method==='mcpServerStatus/list')send({id:m.id,result:{data:[],nextCursor:null}});
      if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'},model:'synthetic'}});
      if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'u'}}});call(90,'tradequote_create_draft');}
      if(m.id===90&&m.result){if(m.result.success!==false)process.exit(7);call(91,'tradequote_get_quote');}
      if(m.id===91&&m.result)call(92,'tradequote_create_draft');
    });
  `,
      ],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"] },
    );
  const result = await new CodexHarness({ launch }).run({
    instruction: "synthetic",
    context: {},
    cancellation: new AbortController().signal,
    availableTools: () => (read ? ["get_quote", "create_draft"] : ["get_quote"]),
    tools: [
      {
        name: "get_quote",
        description: "read",
        inputSchema: z.strictObject({}),
        invoke: async () => {
          read = true;
          return { ok: true };
        },
      },
      {
        name: "create_draft",
        description: "write",
        inputSchema: z.strictObject({}),
        invoke: async () => {
          expect(read).toBe(true);
          writes++;
          return { ok: true };
        },
      },
    ],
  });
  expect(result).toEqual({ outcome: "committed", toolCalls: 3 });
  expect(writes).toBe(1);
});
