import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assess,body,check,codeFile} from './check-wiki-sync.mjs';
test('runtime version pin is a mandatory Wiki-synchronized configuration change',()=>{
 assert.equal(codeFile('.node-version'),true);
 const r=assess({changed:['.node-version'],currentCoverage:{'.node-version':{pages:['wiki/module.md']}},baseCoverage:{},readCurrent:()=>'',readBase:()=>''});
 assert.equal(r.status,'failed');
 assert.ok(r.errors.includes('.node-version: RELATED_WIKI_BODY_UPDATE_REQUIRED'));
});
const page='wiki-project/wiki/module.md',task='wiki-project/wiki/tasks/change.md',log='wiki-project/log.md';
function fixture(overrides={}) {
 const before={[page]:'---\nupdated: 2026-10-20\n---\nOld behavior',[task]:'Old task',[log]:'History\n'};
 const after={[page]:'New behavior',[task]:'Actual change and verification',[log]:'History\nChange and result\n'};
 return {changed:['src/app.ts',page,task,log],currentCoverage:{'src/app.ts':{pages:['wiki/module.md']}},baseCoverage:{},readCurrent:p=>after[p]??null,readBase:p=>before[p]??null,...overrides};
}
test('code with related knowledge, task and appended log passes',()=>assert.equal(assess(fixture()).status,'passed'));
test('generated snapshots alone cannot satisfy knowledge/task/log changes',()=>{
 const r=assess(fixture({changed:['src/app.ts','wiki-project/raw/generated/inventory.json']}));
 for(const error of ['TASK_UPDATE_REQUIRED','APPEND_ONLY_LOG_REQUIRED','src/app.ts: RELATED_WIKI_BODY_UPDATE_REQUIRED'])assert.ok(r.errors.includes(error));
});
test('metadata-only or whitespace-only edits cannot satisfy semantic update',()=>{
 assert.equal(body('---\nupdated: today\n---\n A  B '),'A B');
 const f=fixture();const read=f.readCurrent;
 const r=assess({...f,readCurrent:p=>p===page?'---\nupdated: 2026-10-21\n---\nOld behavior':read(p)});
 assert.ok(r.errors.some(e=>e.includes('RELATED_WIKI')));
});
test('each source needs its own mapped knowledge, unrelated pages do not suffice',()=>{
 const f=fixture();f.changed.push('src/data.ts');f.currentCoverage['src/data.ts']={pages:['wiki/storage.md']};
 assert.ok(assess(f).errors.includes('src/data.ts: RELATED_WIKI_BODY_UPDATE_REQUIRED'));
});
test('deleted source uses baseline mapping; unknown source fails',()=>{
 const f=fixture({currentCoverage:{},baseCoverage:{'src/app.ts':{pages:['wiki/module.md']}}});assert.equal(assess(f).status,'passed');
 assert.ok(assess({...f,baseCoverage:{}}).errors.includes('src/app.ts: COVERAGE_MAPPING_REQUIRED'));
});
test('history rewrite and removed task do not pass',()=>{
 const f=fixture(),read=f.readCurrent;const r=assess({...f,readCurrent:p=>p===log?'Changed history\n':p===task?null:read(p)});
 assert.ok(r.errors.includes('APPEND_ONLY_LOG_REQUIRED'));assert.ok(r.errors.includes('TASK_UPDATE_REQUIRED'));
});
test('Wiki maintenance code requires workflow knowledge, not generated data',()=>{
 const f=fixture({changed:['wiki-project/scripts/wiki-lib.mjs',page,task,log]});
 assert.ok(assess(f).errors.some(e=>e.includes('RELATED_WIKI')));
});
test('ordinary documentation-only edits do not trigger code delivery check',()=>assert.equal(assess(fixture({changed:['README.md']})).codeFiles,0));
test('real Git baseline includes committed, unstaged and untracked sources',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wiki-sync-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'pipe',encoding:'utf8'});
 const write=(p,s)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s)};
 git('init','-q');write('wiki-project/scripts/wiki-config.json',JSON.stringify({coverage:{'src/app.ts':{pages:['wiki/module.md']},'src/next.ts':{pages:['wiki/module.md']}}}));
 write('src/app.ts','old');write(page,'Old behavior');write(task,'Old task');write(log,'History\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','baseline');
 const base=git('rev-parse','HEAD').trim();write('src/app.ts','committed');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','code');
 write('src/app.ts','unstaged');write('src/next.ts','untracked');assert.equal(check(root,base).status,'failed');
 write(page,'New behavior');write(task,'Actual validation');write(log,'History\nNew entry\n');const result=check(root,base);assert.equal(result.status,'passed');assert.equal(result.codeFiles,2);
});
