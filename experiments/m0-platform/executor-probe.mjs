import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import { openStore } from './storage.mjs';
import { createProvider } from './model-provider.mjs';
import { execute } from './executor.mjs';
export async function executorProbe(dir) {
  const store=openStore(`${dir}/executor.sqlite`),checks=[];
  const calls=[['search_catalog',{query:'valve'}],['calculate_quote',{sku:'VALVE-01',quantity:'3'}],['create_quote_revision',{expectedVersion:0}]];
  const schemas={search_catalog:z.strictObject({query:z.string()}),calculate_quote:z.strictObject({sku:z.literal('VALVE-01'),quantity:z.literal('3')}),create_quote_revision:z.strictObject({expectedVersion:z.int().nonnegative()})};
  const tools=calls.map(([name])=>({type:'function',function:{name,description:'Synthetic M0 tool',parameters:z.toJSONSchema(schemas[name])}}));
  let mode='flow';
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if(mode==='timeout')return;
    if(mode==='auth'||mode==='rate'){res.writeHead(mode==='auth'?401:429);res.end('{}');return;}
    if(req.url==='/models'){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'synthetic-model'}]}));return;}
    const body=JSON.parse(Buffer.concat(chunks));
    assert.deepEqual(body.tools?.map(t=>t.function.name).sort(),calls.map(c=>c[0]).sort());
    const step=body.messages.filter(m=>m.role==='tool').length;
    const tool=mode==='forged'?['create_quote_revision',{expectedVersion:0,actor:'forged'}]:mode==='shell'?['bash',{command:'ignored'}]:calls[step];
    const message=mode==='empty'?{role:'assistant',content:''}:tool?{role:'assistant',content:null,tool_calls:[{id:`call-${step}`,type:'function',function:{name:tool[0],arguments:JSON.stringify(tool[1])}}]}:{role:'assistant',content:'{"revisionId":"synthetic-revision-1"}'};
    res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message}]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const provider=createProvider({key:'synthetic-fixture',baseURL:`http://127.0.0.1:${server.address().port}`,timeoutMs:250});
  const handlers={search_catalog:args=>{schemas.search_catalog.parse(args);return {sku:'VALVE-01'};},calculate_quote:args=>{schemas.calculate_quote.parse(args);return {total:'0.30'};},create_quote_revision:(args,ctx)=>{schemas.create_quote_revision.parse(args);return store.revise({quantity:'3',expectedVersion:args.expectedVersion},ctx.operationId);}};
  const run=signal=>execute({provider,model:'synthetic-model',messages:[{role:'user',content:'Synthetic flow'}],tools,handlers,operationId:'stable-host-operation',signal});
  try {
    assert.deepEqual(await provider.models(),['synthetic-model']);checks.push('model-discovery');
    assert.deepEqual((await run()).calls,calls.map(c=>c[0]));checks.push('three-tools-real-sqlite-commit');
    await run();assert.equal(store.db.prepare('SELECT count(*) n FROM revision').get().n,1);checks.push('repeat-run-no-duplicate-revision');
    mode='shell';await assert.rejects(run,/TOOL_NOT_ALLOWED/);checks.push('unregistered-tool-rejected');
    mode='forged';await assert.rejects(run);checks.push('forged-tool-argument-rejected');
    mode='auth';await assert.rejects(run,/MODEL_AUTH_FAILED/);mode='rate';await assert.rejects(run,/MODEL_RATE_LIMITED/);checks.push('auth-and-rate-errors');
    mode='empty';await assert.rejects(run,/MODEL_INVALID_OUTPUT/);checks.push('empty-response-is-failure');
    mode='timeout';await assert.rejects(run,/MODEL_TIMEOUT/);checks.push('bounded-timeout');
    const abort=new AbortController();const pending=run(abort.signal);setTimeout(()=>abort.abort(),20);await assert.rejects(pending,/CANCELLED/);checks.push('cancel-aborts-in-flight-request');
    mode='flow';await run();assert.equal(store.db.prepare('SELECT count(*) n FROM revision').get().n,1);checks.push('retry-after-cancel-retains-commit');
    return {checks,realModel:false,streaming:false};
  }finally {store.db.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
