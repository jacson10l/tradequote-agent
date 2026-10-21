import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Execute the single-file prototype's real business logic in a fresh in-memory
// environment. This does not claim DOM, browser storage, or Electron coverage.
function sandbox() {
  const callbacks = new Map();
  const elements = new Map();
  let nextTimer = 1;
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', textContent: '', hidden: true, className: '',
      addEventListener() {}, scrollIntoView() {}, focus() {},
    });
    return elements.get(selector);
  };
  const context = vm.createContext({
    document: { querySelector: element, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    crypto: { randomUUID }, TextEncoder, TextDecoder, console,
    setTimeout(fn) { const id = nextTimer++; callbacks.set(id, fn); return id; },
    clearTimeout(id) { callbacks.delete(id); },
  });
  vm.runInContext(script, context);
  return {
    run: (code) => vm.runInContext(code, context),
    json: (code) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    finish: () => {
      const timer = vm.runInContext('timers.get(state.runs.at(-1).id)', context);
      assert.ok(callbacks.has(timer));
      callbacks.get(timer)();
      callbacks.delete(timer);
    },
  };
}

test('standalone artifact has no remote executable assets or network calls', () => {
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["']https?:/i);
  assert.doesNotMatch(script, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  new vm.Script(script);
});

test('quantity tiers, line rounding, and explicitly unknown fees', () => {
  const s = sandbox();
  assert.equal(s.run('compute(latest()).goods'), '90000');
  assert.equal(s.run('compute(latest()).total'), null);
  s.run("var r=clone(latest()); r.lines[0].quantity='99'");
  assert.equal(s.run('compute(r).goods'), '99000');
  s.run("r.lines[0].quantity='3';r.lines[0].product.tiers=[{min:'1',price:'0.335'}]");
  assert.equal(s.run('compute(r).goods'), '101');
  assert.equal(s.run('compute(r).lines[0].unitPrice'), '0.3350');
  s.run("r.feesConfirmed=true;r.fees='0';saveRevision(current(),r,'rounding fixture',{confirmFees:true});packagingTransition(current(),latest().id,'confirm',{value:r.packaging,reviewer:'合成采购',evidence:'本测试新数量的包装确认',costMode:'included',reference:'合成新价目档',confirmed:true});r=latest()");
  assert.equal(s.run('compute(r).total'), '101');
});

test('missing prices, expired sources and MOQ stay unknown', () => {
  const s = sandbox();
  s.run("var r=clone(latest());r.lines=[{product:clone(PRODUCTS[2]),quantity:'10'}]");
  assert.equal(s.run('compute(r).goods'), null);
  s.run("r.lines[0].product=clone(PRODUCTS[0]);r.lines[0].product.valid='2020-01-01'");
  assert.equal(s.run('compute(r).goods'), null);
  s.run("r.lines[0].product.valid='2027-12-31';r.lines[0].product.tiers=[{min:'100',price:'9'}]");
  assert.equal(s.run('compute(r).goods'), null);
  assert.throws(() => s.run("r.lines[0].quantity='0';compute(r)"));
});

test('cost margin differs from markup and fees add once', () => {
  const s = sandbox();
  s.run("var r=clone(latest());r.mode='cost';r.lines[0].product.cost='10';r.lines[0].quantity='1500';r.margin='20';r.feesConfirmed=true;r.fees='50'");
  assert.equal(s.run('compute(r).goods'), '1875000');
  s.run("saveRevision(current(),r,'cost fixture',{confirmFees:true});packagingTransition(current(),latest().id,'confirm',{value:r.packaging,reviewer:'合成采购',evidence:'本测试成本报价包装确认',costMode:'included',reference:'合成成本价目档',confirmed:true});r=clone(latest())");
  assert.equal(s.run('compute(r).total'), '1880000');
  s.run("r.margin='100'");
  assert.throws(() => s.run('compute(r)'));
});

test('new revisions preserve old facts and frozen market applicability', () => {
  const s = sandbox();
  s.run("var old=JSON.stringify(latest());var next=clone(latest());next.lines[0].quantity='120';saveRevision(current(),next,'quantity');state.scenario.market='法国'");
  assert.equal(s.run('JSON.stringify(current().revisions[0])===old'), true);
  assert.equal(s.run('latest().version'), 2);
  assert.equal(s.run('compute(latest()).goods'), '108000');
  assert.equal(s.run("issues(latest()).some(i=>i.field==='knowledge')"), false);
});

test('withdrawn newest knowledge does not resurrect an older version', () => {
  const s = sandbox();
  s.run("var k=clone(state.knowledge[0]);k.id='k-contract-2';k.version=2;k.status='withdrawn';state.knowledge.push(k)");
  assert.equal(s.run("activeKnowledge('合同条款')"), undefined);
  assert.equal(s.run("issues(latest()).some(i=>i.id.endsWith('contract-source'))"), true);
});

test('approval is scoped to output; regeneration and revision do not inherit it', () => {
  const s = sandbox();
  s.run("var q=current();var a=makeArtifact(q,'en','rfq');q.approvals.push({artifactId:a.id,status:'approved'});var b=makeArtifact(q,'de','email')");
  assert.equal(s.run('!!approval(q,a)'), true);
  assert.equal(s.run('approval(q,b)'), null);
  s.run("var r=clone(latest());r.payment='30%';saveRevision(q,r,'terms')");
  assert.equal(s.run('currentArtifact()'), null);
  assert.equal(s.run('q.artifacts.length'), 2);
});

test('an artifact with superseded source needs review even when rule coverage exists', () => {
  const s = sandbox();
  s.run("var q=current();var r=clone(latest());r.payment='30%预付、70%发货前付清';r.delivery='确认后30天交货';r.feesConfirmed=true;saveRevision(q,r,'confirmed',{confirmFees:true});var a=makeArtifact(q,'en','email')");
  assert.equal(s.run('outputIssues(q,a).length'), 0);
  s.run("var k=clone(state.knowledge[0]);k.id='k-contract-new';k.version=2;state.knowledge.push(k)");
  assert.equal(s.run('issues(latest()).length'), 0);
  assert.equal(s.run('outputIssues(q,a).length'), 1);
});

test('known synthetic clauses have demo translations and unknown clauses stay explicit', () => {
  const s = sandbox();
  assert.equal(s.run("localizedTerm('确认后30天交货','en')"), 'Delivery within 30 days after confirmation');
  assert.match(s.run("localizedTerm('自定义未确认承诺','de')"), /原文待译/);
  s.run("var q=current();var a=makeArtifact(q,'de','email')");
  assert.match(s.run('a.text'), /Angebot Q-DEMO-001/);
  assert.match(s.run('a.text'), /USD 900.00/);
});

test('CSV preview catches headers, duplicate tiers and null price', () => {
  const s = sandbox();
  assert.equal(s.run('parseCsv(SAMPLE_CSV).products.length'), 3);
  assert.equal(s.run('parseCsv(SAMPLE_CSV).products[2].tiers[0].price'), null);
  assert.throws(() => s.run("parseCsv('sku,name\\nA,B')"));
  assert.equal(s.run("parseCsv(SAMPLE_CSV+'\\nDEMO-TEE,定制圆领上衣,服装,piece,USD,100,9,2027-12-31,合成棉质基础款').errors.length"), 1);
});

test('unsupported multi-part instructions do not apply a partial quantity update', () => {
  const s = sandbox();
  assert.throws(() => s.run("parseInstruction('数量改为120件；增加礼盒',latest())"));
  s.run("startRun({kind:'revise',input:'数量改为120件；增加礼盒',quoteId:current().id})");
  s.finish();
  assert.equal(s.run('latest().version'), 1);
  assert.equal(s.run('state.runs.at(-1).status'), 'waiting_input');
});

test('cancel before response saves nothing; explicit retry commits once', () => {
  const s = sandbox();
  s.run("var run=startRun({kind:'revise',input:'数量改为120件',quoteId:current().id});cancelRun(run)");
  assert.equal(s.run('latest().version'), 1);
  assert.equal(s.run('run.status'), 'cancelled');
  s.run('executeRun(run)');
  s.finish();
  assert.equal(s.run('latest().version'), 2);
  s.run('executeRun(run)');
  assert.equal(s.run('latest().version'), 2);
  assert.equal(s.run('run.attempt'), 2);
});

test('timeout leaves state intact and old-base retry cannot overwrite newer work', () => {
  const s = sandbox();
  s.run("state.settings.failure='timeout';var run=startRun({kind:'revise',input:'数量改为120件',quoteId:current().id})");
  s.finish();
  assert.equal(s.run('latest().version'), 1);
  assert.equal(s.run('run.status'), 'failed');
  s.run("var r=clone(latest());r.payment='30%';saveRevision(current(),r,'manual');executeRun(run)");
  s.finish();
  assert.equal(s.run('latest().version'), 2);
  assert.match(s.run('run.message'), /REVISION_CONFLICT/);
});

test('backup restores unfinished run as interrupted and rejects invalid identifiers', () => {
  const s = sandbox();
  s.run("startRun({kind:'revise',input:'数量改为120件',quoteId:current().id});var copy=clone(state);validateBackup(copy)");
  assert.equal(s.run('copy.runs[0].status'), 'interrupted');
  s.run("copy.quotes[0].id='bad\"attribute'");
  assert.throws(() => s.run('validateBackup(copy)'));
});

test('escaped user text cannot become executable output markup', () => {
  const s = sandbox();
  s.run("var q=current();var a=makeArtifact(q,'en','rfq','<script>alert(1)</scr'+'ipt>')");
  const output = s.run('outputHtml(q,a,false)');
  assert.ok(output.includes('&lt;script&gt;'));
  assert.doesNotMatch(output, /<script>/);
});

test('new quotes never invent packaging; only the explicit seed contains it', () => {
  const s = sandbox();
  assert.equal(s.run('latest().packaging'), '标准纸箱（合成资料）');
  s.run("newQuote({lines:[{product:clone(PRODUCTS[1]),quantity:'12.5'}]})");
  assert.equal(s.run('latest().packaging'), '');
  assert.equal(s.run("issues(latest()).some(i=>i.field==='packaging')"), true);
  assert.equal(s.run('compute(latest()).total'), null);
});

test('revisions and history restore inherit the quote scenario after defaults change', () => {
  const s = sandbox();
  s.run("var original=clone(latest());state.scenario.market='法国';state.scenario.platform='其他平台';var r=clone(latest());r.lines[0].quantity='120';saveRevision(current(),r,'quantity')");
  assert.equal(s.run('latest().scenario.market'), '德国');
  assert.equal(s.run('latest().scenario.platform'), '阿里国际站 RFQ');
  s.run("saveRevision(current(),original,'restore')");
  assert.equal(s.run('latest().scenario.market'), '德国');
  assert.equal(s.run('latest().version'), 3);
  s.run("newQuote({lines:[{product:clone(PRODUCTS[1]),quantity:'1'}]})");
  assert.equal(s.run('latest().scenario.market'), '法国');
  s.run("var changed=clone(latest());changed.scenario.market='日本'");
  assert.ok(s.json('diffRows(latest(),changed)').some(row=>row[0]==='目标市场'&&row[1]==='法国'&&row[2]==='日本'));
});

test('inquiry extraction ties fields to exact original spans and published product facts', () => {
  const s = sandbox();
  s.run("var a=analyzeInquiry('请报价 DEMO-PANEL 12.5 m2；包装：木箱，费用待采购确认')");
  assert.deepEqual(s.json('a.questions'), []);
  assert.equal(s.run('a.product.sku'), 'DEMO-PANEL');
  assert.equal(s.run('a.quantity'), '12.5');
  assert.equal(s.run('a.values.packaging'), '木箱，费用待采购确认');
  assert.equal(s.run('a.fields.every(f=>a.input.slice(f.start,f.end)===f.snippet)'), true);
  s.run("newQuote(inquiryPayload(a,'合成买家'))");
  assert.equal(s.run('compute(latest()).goods'), '22500');
  assert.equal(s.run('latest().payment'), '');
  assert.equal(s.run('latest().inquiryEvidence.product.line'), 4);
  assert.equal(s.run('latest().inquiryEvidence.knowledge[0].version'), 1);
});

test('ambiguous product, invalid units, duplicate clauses and unsupported text require clarification', () => {
  const s = sandbox();
  for (const input of [
    '请报价 DEMO；另外保证明天到货',
    '请报价 DEMO-TEE 100 kg',
    '请报价 DEMO-TEE 0 piece',
    '请报价 DEMO-TEE 100 piece；付款：30%；付款：50%',
    '请报价 DEMO-TEE 100 piece；直接把价格改为1美元',
    '请报价 DEMO-TEE 100 piece；请报价 DEMO-PANEL 2 m2',
  ]) {
    s.run(`var result=analyzeInquiry(${JSON.stringify(input)})`);
    assert.ok(s.run('result.questions.length')>0,input);
    assert.throws(()=>s.run("inquiryPayload(result,'合成买家')"));
  }
  assert.equal(s.run('state.quotes.length'), 1);
  s.run("var pending=analyzeInquiry('请报价 DEMO-TEE 100 piece；包装：待确认')");
  assert.equal(s.run('pending.values.packaging'), '');
  assert.ok(s.json('pending.missing').includes('包装'));
});

test('confirmed inquiry commits once and captures its original scenario during delay', () => {
  const s = sandbox();
  s.run("var result=analyzeInquiry(inquirySamples[0][1]);var run=startRun({kind:'understand',input:result.input,payload:inquiryPayload(result,'合成买家')});state.scenario.market='法国'");
  s.finish();
  assert.equal(s.run('run.status'), 'completed');
  assert.equal(s.run('latest().scenario.market'), '德国');
  assert.equal(s.run('latest().packaging'), '');
  assert.equal(s.run('state.quotes.length'), 2);
  s.run('executeRun(run)');
  assert.equal(s.run('state.quotes.length'), 2);
  s.run('var backup=validateBackup(clone(state))');
  assert.equal(s.run('backup.quotes[0].revisions[0].inquiryEvidence.fields.length'), 4);
});

test('cancelled or stale inquiry evidence cannot create a quotation', () => {
  const s = sandbox();
  s.run("var result=analyzeInquiry(inquirySamples[0][1]);var run=startRun({kind:'understand',input:result.input,payload:inquiryPayload(result,'合成买家')});cancelRun(run)");
  assert.equal(s.run('state.quotes.length'), 1);
  s.run("state.knowledge[0].status='withdrawn';executeRun(run)");
  s.finish();
  assert.equal(s.run('run.status'), 'failed');
  assert.match(s.run('run.message'), /知识依据已变化/);
  assert.equal(s.run('state.quotes.length'), 1);
});

test('publishing different text in the same knowledge category never grants a passing check', () => {
  const s = sandbox();
  s.run("var q=current();var r=clone(latest());r.payment='30%预付、70%发货前付清';r.delivery='确认后30天交货';r.feesConfirmed=true;saveRevision(q,r,'confirmed',{confirmFees:true});report(q);var evidence=JSON.stringify(q.reports[0].evidence);var k=clone(state.knowledge[1]);k.id='k-market-2';k.version=2;k.body='无需包装';state.knowledge.push(k)");
  assert.equal(s.run("knowledgeEvidence('目标市场',latest().scenario).status"), 'unbound');
  assert.equal(s.run("issues(latest()).some(i=>i.id.endsWith('market-source'))"), true);
  assert.equal(s.run('JSON.stringify(q.reports[0].evidence)===evidence'), true);
  assert.equal(s.run('q.reports[0].evidence[1].excerpt.includes("明确包装")'), true);
});

test('supported output scenes differ in structure without changing amounts or exposing cost', () => {
  const s = sandbox();
  s.run("var q=current();var r=clone(latest());r.payment='30%预付、70%发货前付清';r.delivery='确认后30天交货';r.fees='50';r.feesConfirmed=true;saveRevision(q,r,'confirmed',{confirmFees:true});var rfq=makeArtifact(q,'en','rfq');var email=makeArtifact(q,'de','email')");
  assert.match(s.run('rfq.text'), /RFQ response/);
  assert.doesNotMatch(s.run('rfq.text'), /1\. Items and pricing|SKU \|/);
  assert.match(s.run('email.text'), /1\. Artikel und Preise/);
  assert.match(s.run('email.text'), /2\. Kostenübersicht/);
  assert.match(s.run('email.text'), /3\. Konditionen/);
  for (const artifact of ['rfq','email']) {
    assert.match(s.run(`${artifact}.text`), artifact==='email'?/USD 950,00/:/USD 950\.00/);
    assert.doesNotMatch(s.run(`${artifact}.text`), /USD 6\.00|margin|毛利|采购成本/);
  }
  assert.equal(s.run('latest().version'), 2);
});

test('unsupported language produces no artifact and unknown platform cannot imply approval readiness', () => {
  const s = sandbox();
  for (const language of ['fr','ja','ar','pt-BR']) {
    assert.throws(()=>s.run(`makeArtifact(current(),${JSON.stringify(language)},'email')`), /暂无离线模板/);
  }
  assert.equal(s.run('current().artifacts.length'), 0);
  s.run("var r=clone(latest());r.scenario.platform='其他业务平台';saveRevision(current(),r,'explicit scenario');var a=makeArtifact(current(),'en','email')");
  assert.equal(s.run('a.profile.supported'), false);
  assert.equal(s.run("outputIssues(current(),a).some(i=>i.field==='output')"), true);
});


test('German display localizes decimals and unknown values without changing quote facts', () => {
  const s=sandbox();
  s.run("var q=newQuote({lines:[{product:clone(PRODUCTS[1]),quantity:'12.5'}]});var before=JSON.stringify(latest());var a=makeArtifact(q,'de','email')");
  assert.match(s.run('a.text'), /12,5 m2/);
  assert.match(s.run('a.text'), /USD 225,00/);
  assert.match(s.run('a.text'), /Zusatzkosten: Noch zu bestätigen/);
  assert.equal(s.run('JSON.stringify(latest())===before'), true);
});


test('packaging proposal and acceptance never masquerade as procurement confirmation', () => {
 const s=sandbox();
 s.run("var q=newQuote({lines:[{product:clone(PRODUCTS[1]),quantity:'12.5'}]});var old=JSON.stringify(latest());packagingTransition(q,latest().id,'suggest')");
 assert.equal(s.run('latest().packaging'), '');
 assert.equal(s.run('packagingInfo(latest()).status'), 'suggested');
 assert.equal(s.run('packagingInfo(latest()).proposal.sku'), 'DEMO-PANEL');
 assert.equal(s.run('packagingReady(latest())'), false);
 s.run("packagingTransition(q,latest().id,'accept')");
 assert.match(s.run('latest().packaging'), /木箱/);
 assert.equal(s.run('packagingInfo(latest()).status'), 'accepted');
 assert.equal(s.run('compute(latest()).packing'), null);
 assert.equal(s.run('JSON.stringify(q.revisions[0])===old'), true);
 assert.ok(s.run("allTasks().some(t=>t.quoteId===q.id&&t.field==='packaging'&&t.owner==='采购')"));
});

test('packaging confirmation adds a decimal fee exactly once and is bound to quantity', () => {
 const s=sandbox();
 s.run("var q=current();var base=clone(latest());base.fees='50';base.feesConfirmed=true;saveRevision(q,base,'freight',{confirmFees:true});var before=JSON.stringify(latest());packagingTransition(q,latest().id,'confirm',{value:'木箱',reviewer:'合成采购',evidence:'合成采购单P1第2行',costMode:'additional',amount:'12.345',confirmed:true})");
 assert.equal(s.run('compute(latest()).packing'), '1235');
 assert.equal(s.run('compute(latest()).fees'), null); // Packaging changed: shipping must be confirmed again.
 s.run("saveRevision(q,{...clone(latest()),feesConfirmed:true},'shipping reconfirmed',{confirmFees:true})");
 assert.equal(s.run('compute(latest()).total'), '96235');
 assert.equal(s.run('JSON.stringify(q.revisions[1])===before'), true);
 assert.match(s.run("makeArtifact(q,'en','email').text"), /Packaging fee: USD 12.35/);
 s.run("var next=clone(latest());next.lines[0].quantity='120';saveRevision(q,next,'qty')");
 assert.equal(s.run('packagingReady(latest())'), false);
 assert.equal(s.run('compute(latest()).total'), null);
 assert.equal(s.run('packagingInfo(latest()).previousConfirmation.by'), '合成采购');
});

test('unknown, included and zero packaging costs require distinct evidence', () => {
 const s=sandbox();
 s.run("var q=current();var data={value:'无需额外包装',reviewer:'合成采购',evidence:'合成交付说明',confirmed:true,notApplicable:true,costMode:'included'}");
 const version=s.run('latest().version');
 assert.throws(()=>s.run("packagingTransition(q,latest().id,'confirm',data)"), /依据/);
 assert.equal(s.run('latest().version'), version);
 s.run("data.costMode='unknown';packagingTransition(q,latest().id,'confirm',data)");
 assert.equal(s.run('packagingReady(latest())'), true);
 assert.equal(s.run('compute(latest()).packing'), null);
 assert.ok(s.run("issues(latest()).some(i=>i.id.endsWith('packaging-cost'))"));
 s.run("data.costMode='none';data.reference='合成采购零费用确认单Z1';packagingTransition(q,latest().id,'confirm',data)");
 assert.equal(s.run('compute(latest()).packing'), '0');
 assert.equal(s.run('packagingInfo(latest()).status'), 'not_applicable');
 s.run("data.costMode='included';data.reference='合成价格版本P2含包装';packagingTransition(q,latest().id,'confirm',data)");
 assert.equal(s.run('compute(latest()).packing'), '0');
});

test('rejecting proposals preserves requested text; unsupported product has no invented suggestion', () => {
 const s=sandbox();
 s.run("var q=newQuote({packaging:'买家要求特定木箱',lines:[{product:clone(PRODUCTS[1]),quantity:'12.5'}]});packagingTransition(q,latest().id,'suggest');packagingTransition(q,latest().id,'reject',{reason:'需买家确认规格'})");
 assert.equal(s.run('latest().packaging'), '买家要求特定木箱');
 assert.equal(s.run('packagingInfo(latest()).status'), 'requested');
 s.run("q=newQuote({lines:[{product:clone(PRODUCTS[2]),quantity:'10'}]})");
 assert.throws(()=>s.run("packagingTransition(q,latest().id,'suggest')"), /未找到/);
 assert.equal(s.run('latest().version'), 1);
});

test('explicit market changes preserve defaults and history, invalidate confirmations and rerun checks', () => {
 const s=sandbox();
 s.run("var q=current();var old=JSON.stringify(latest());var defaults=JSON.stringify(state.scenario);var a=makeArtifact(q,'en','rfq');q.approvals.push({artifactId:a.id,status:'approved'});var baseId=latest().id;changeQuoteScenario(q,baseId,{market:'法国',platform:'其他平台',category:'板材',reason:'合成买家更换目的市场',confirmed:true})");
 assert.equal(s.run('latest().scenario.market'), '法国');
 assert.equal(s.run('JSON.stringify(state.scenario)===defaults'), true);
 assert.equal(s.run('JSON.stringify(q.revisions[0])===old'), true);
 assert.equal(s.run('currentArtifact(q)'), null);
 assert.equal(s.run('approval(q,a).status'), 'approved');
 assert.equal(s.run('packagingReady(latest())'), false);
 assert.equal(s.run('latest().feesConfirmed'), false);
 assert.equal(s.run('q.reports.length'), 1);
 assert.ok(s.run("issues(latest()).some(i=>i.id.endsWith('market-source'))"));
 assert.ok(s.json('diffRows(q.revisions[0],latest())').some(x=>x[0]==='目标市场'&&x[2]==='法国'));
 assert.throws(()=>s.run("changeQuoteScenario(q,baseId,{market:'日本',platform:'x',category:'x',reason:'x',confirmed:true})"), /REVISION_CONFLICT/);
 s.run("restoreQuoteVersion(q,latest().id,q.revisions[0].id)");
 assert.equal(s.run('latest().scenario.market'), '德国');
 assert.equal(s.run('packagingReady(latest())'), false);
 assert.equal(s.run('latest().version'), 3);
});

test('stale packaging confirmation and stale suggestions cannot overwrite newer facts', () => {
 const s=sandbox();
 s.run("var q=current();var oldId=latest().id;packagingTransition(q,oldId,'suggest');var r=clone(latest());r.lines[0].quantity='120';saveRevision(q,r,'qty')");
 assert.throws(()=>s.run("packagingTransition(q,latest().id,'accept')"), /变化/);
 assert.throws(()=>s.run("packagingTransition(q,oldId,'confirm',{value:'箱',reviewer:'采购',evidence:'依据',confirmed:true,costMode:'unknown'})"), /REVISION_CONFLICT/);
 assert.equal(s.run('latest().version'), 3);
});

test('legacy packaging stays unconfirmed and malformed packaging backups are rejected', () => {
 const s=sandbox();
 s.run("var copy=clone(state);delete copy.quotes[0].revisions[0].packagingMeta;var serialized=JSON.stringify(copy);validateBackup(copy)");
 assert.equal(s.run('packagingReady(copy.quotes[0].revisions[0])'), false);
 assert.equal(s.run('JSON.stringify(copy)===serialized'), true);
 s.run("copy=clone(state);delete copy.quotes[0].revisions[0].packagingMeta.confirmedBy");
 assert.throws(()=>s.run('validateBackup(copy)'), /包装确认/);
 s.run("copy=validateBackup(clone(state))");
 assert.equal(s.run('packagingReady(copy.quotes[0].revisions[0])'), true);
});

test('editing packaging text cannot retain an earlier procurement confirmation', () => {
 const s=sandbox();
 s.run("var next=clone(latest());next.packaging='新包装且费用已计入';saveRevision(current(),next,'text')");
 assert.equal(s.run('packagingReady(latest())'), false);
 assert.equal(s.run('compute(latest()).packing'), null);
 assert.equal(s.run('packagingInfo(latest()).status'), 'requested');
});


test('market intent and procurement prerequisites reject without saving any partial revision', () => {
 const s=sandbox();
 s.run('var q=current();var before=JSON.stringify(q);var defaults=clone(state.scenario)');
 for(const data of [{...s.json('defaults'),reason:'',confirmed:true},{...s.json('defaults'),market:'法国',reason:'原因',confirmed:false},{...s.json('defaults'),reason:'无变化',confirmed:true}]){
  s.run(`var input=${JSON.stringify(data)}`);
  assert.throws(()=>s.run('changeQuoteScenario(q,latest().id,input)'));
 }
 assert.throws(()=>s.run("packagingTransition(q,latest().id,'confirm',{value:'木箱',reviewer:'',evidence:'合成证据',costMode:'additional',amount:'10',confirmed:true})"));
 assert.equal(s.run('JSON.stringify(q)===before'), true);
 s.run("packagingTransition(q,latest().id,'confirm',{value:'木箱',reviewer:'内部采购甲',evidence:'内部确认单',costMode:'additional',amount:'10',confirmed:true});var a=makeArtifact(q,'en','email')");
 assert.doesNotMatch(s.run('a.text'), /内部采购甲|内部确认单/);
});

function readyOutput(s) {
 s.run("var q=current();saveRevision(q,{...clone(latest()),payment:'30%预付、70%发货前付清',delivery:'确认后30天交货',fees:'50',feesConfirmed:true},'explicit confirmation',{confirmFees:true});var a=makeArtifact(q,'en','email')");
 assert.equal(s.run('outputIssues(q,a).length'),0);
}

test('fee confirmation expires on quantity, currency, delivery, packaging and fee edits',()=>{
 for(const patch of ["next.lines[0].quantity='120'","next.currency='EUR';next.fx='0.92'","next.delivery='确认后60天交货'","next.packaging='木箱'","next.fees='100'","next.discount='10'","next.mode='cost'"]){
  const s=sandbox();readyOutput(s);
  s.run(`var frozen=JSON.stringify(latest());var next=clone(latest());${patch};saveRevision(q,next,'dependent fact change')`);
  assert.equal(s.run('latest().feesConfirmed'),false,patch);
  assert.equal(s.run('compute(latest()).total'),null,patch);
  assert.equal(s.run('JSON.stringify(q.revisions[1])===frozen'),true);
  assert.ok(s.json('diffRows(q.revisions[1],latest())').some(row=>row[0]==='费用确认'));
 }
 const s=sandbox();readyOutput(s);
 s.run("saveRevision(q,{...clone(latest()),payment:'付款待双方另行核实'},'payment only')");
 assert.equal(s.run('latest().feesConfirmed'),true);
 s.run("saveRevision(q,{...clone(latest()),fees:'80',feesConfirmed:true},'procurement reconfirmed',{confirmFees:true})");
 assert.equal(s.run('compute(latest()).fees'),'8000');
});

test('quantity revision validates units and rejects the entire mixed request',()=>{
 const s=sandbox();
 s.run("var q=newQuote({lines:[{product:clone(PRODUCTS[1]),quantity:'12.5'}]});startRun({kind:'revise',quoteId:q.id,baseId:latest(q).id,input:'付款改为30%；数量改为120件'})");s.finish();
 assert.equal(s.run('state.runs.at(-1).status'),'waiting_input');
 assert.equal(s.run('q.revisions.length'),1);
 assert.equal(s.run('latest(q).payment'),'');
 assert.equal(s.run("parseInstruction('数量改为120 m2',latest(q)).quantity"),'120');
 assert.equal(s.run("parseInstruction('数量改为120 m²',latest(q)).quantity"),'120');
 assert.equal(s.run("parseInstruction('数量改为120',latest(q)).quantity"),'120');
 assert.match(s.run('assistantView(q,latest(q),false)'),/data-text="数量改为120 m2"/);
});

test('untranslated terms block submission and are actionable output tasks',()=>{
 const s=sandbox();readyOutput(s);
 s.run("saveRevision(q,{...clone(latest()),payment:'需要专用信用证条款'},'custom clause');a=makeArtifact(q,'en','email')");
 assert.ok(s.json('outputIssues(q,a)').some(x=>x.title==='正文仍有原文待译条款'));
 assert.ok(s.json('allTasks()').some(x=>x.field==='output'&&x.owner==='业务员'));
 assert.throws(()=>s.run("actions['submit-review']()"),/不可送审/);
 assert.match(s.run('outputsPage()'),/正文仍有原文待译条款/);
 s.run("var old=a;a=makeArtifact(q,'en','email',old.text.replace('[Original term / 原文待译] 需要专用信用证条款','Payment subject to agreed documentary credit terms'))");
 assert.equal(s.run('a.manuallyEdited'),true);
 assert.equal(s.run('outputIssues(q,a).length'),0);
 assert.equal(s.run('approval(q,a)'),null);
 assert.match(s.run('outputsPage()'),/未自动证明事实一致/);
});

test('unconfirmed packaging is explicitly conditional in RFQ and email',()=>{
 const s=sandbox();
 s.run("var q=newQuote({packaging:'买家定制防水木箱',lines:[{product:clone(PRODUCTS[1]),quantity:'12.5'}]})");
 for(const scene of ['rfq','email']){
  const text=s.run(`outputText(q,latest(q),'en','${scene}')`);
  assert.match(text,/Packaging: \[Requested; procurement unconfirmed\]/);
  assert.match(text,/买家定制防水木箱/);
  assert.match(text,/To be confirmed/);
 }
});

test('missing or changed terminology and legacy profiles remain visible blockers',()=>{
 const s=sandbox();readyOutput(s);
 s.run("state.knowledge.find(k=>k.kind==='术语').status='withdrawn'");
 assert.ok(s.json('outputIssues(q,a)').some(x=>x.title.includes('术语依据')));
 assert.ok(s.json('allTasks()').some(x=>x.title.includes('引用的知识')));
 s.run("a=makeArtifact(q,'en','email')");
 assert.ok(s.json('outputIssues(q,a)').some(x=>x.title.includes('术语依据')));
 s.run("delete a.profile");
 assert.ok(s.json('outputIssues(q,a)').some(x=>x.title.includes('通用模板')));
 assert.equal(s.json('status(q)')[0],'产出待复核');
});

test('send confirmation revalidates artifact, version and current evidence',()=>{
 for(const change of ["makeArtifact(q,'de','email')","saveRevision(q,{...clone(latest()),payment:'新付款'},'new version')","state.knowledge[0].status='withdrawn'"]){
  const s=sandbox();readyOutput(s);
  s.run("q.approvals.push({artifactId:a.id,status:'approved',sent:false});var old=JSON.stringify(a)");
  s.run(change);
  assert.throws(()=>s.run('markArtifactSent(q,a)'),/变化/);
  assert.equal(s.run('q.approvals[0].sent'),false);
  assert.equal(s.run('JSON.stringify(a)===old'),true);
 }
 const s=sandbox();readyOutput(s);s.run("q.approvals.push({artifactId:a.id,status:'approved',sent:false});markArtifactSent(q,a)");
 assert.equal(s.run('approval(q,a).sent'),true);
 assert.throws(()=>s.run('markArtifactSent(q,a)'),/不能记录发送/);
});

test('rejection targets only a current submitted artifact and permits resubmission',()=>{
 const s=sandbox();readyOutput(s);
 assert.throws(()=>s.run("rejectArtifact(q,a,'原因')"),/待审核/);
 s.run("a.review='submitted'");
 assert.throws(()=>s.run("rejectArtifact(q,a,'  ')"),/原因/);
 s.run("rejectArtifact(q,a,'请核对条款')");
 assert.equal(s.run('a.review'),'rejected');
 s.run("actions['submit-review']()");
 assert.equal(s.run('a.review'),'submitted');
 s.run("var previous=a;makeArtifact(q,'de','email')");
 assert.throws(()=>s.run("rejectArtifact(q,previous,'迟到的驳回')"),/变化/);
 assert.equal(s.run('q.approvals.length'),1);
});

test('invalidated approvals are historical and cannot enable approved download',()=>{
 const s=sandbox();readyOutput(s);
 s.run("q.approvals.push({artifactId:a.id,status:'approved',reviewer:'合成主管',at:now()});state.knowledge[0].status='withdrawn'");
 assert.match(s.run('outputsPage()'),/曾审核 · 当前需复核/);
 assert.match(s.run('outputsPage()'),/历史批准记录 · 当前不可定稿/);
 assert.throws(()=>s.run("actions['download-approved']()"),/有效性/);
 assert.match(s.run('quoteDetail(q,latest(q),true)'),/风险按当前有效来源重新核验/);
});

test('zero FX cannot turn a quotation into a free offer or enter a backup',()=>{
 const s=sandbox();s.run("var r=clone(latest());r.fx='0'");
 assert.throws(()=>s.run('compute(r)'));
 s.run("var backup=clone(state);backup.quotes[0].revisions[0].fx='0'");
 assert.throws(()=>s.run('validateBackup(backup)'));
});

test('old output history remains reachable before the next revision has an artifact',()=>{
 const s=sandbox();readyOutput(s);
 s.run("q.approvals.push({artifactId:a.id,status:'approved'});saveRevision(q,{...clone(latest()),payment:'新付款'},'revision without output')");
 assert.equal(s.run('currentArtifact(q)'),null);
 assert.match(s.run('outputsPage()'),/data-action="output-history"/);
 assert.equal(s.run('q.artifacts.length'),1);
 assert.equal(s.run('!!approval(q,a)'),true);
});

test('overview distinguishes historical approval and sending from current readiness',()=>{
 const s=sandbox();readyOutput(s);
 s.run("q.approvals.push({artifactId:a.id,status:'approved',reviewer:'合成主管',sent:false});markArtifactSent(q,a)");
 const step=(page,index)=>page.match(new RegExp('<button class="step [^>]*data-step="'+index+'"[^>]*>[\\s\\S]*?<\\/button>'))[0];
 for(const index of [3,4,5]) assert.match(step(s.run('overviewPage()'),index),/class="step done/);
 s.run("var history=JSON.stringify(q.approvals);state.knowledge[0].status='withdrawn'");
 const page=s.run('overviewPage()');
 for(const index of [3,4,5]) assert.doesNotMatch(step(page,index),/class="step done/);
 assert.match(step(page,4),/曾批准 · 当前需复核/);
 assert.match(step(page,5),/曾模拟发送 · 当前需复核/);
 assert.equal(s.run('JSON.stringify(q.approvals)===history'),true);
});
