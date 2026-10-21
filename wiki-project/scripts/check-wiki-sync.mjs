import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectRoot, safePath, sensitiveName} from './wiki-lib.mjs';
const workflowPage='wiki-project/wiki/Wiki 工作流与任务记录.md';
export const body = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').replace(/\s+/g,' ').trim();
export function codeFile(file) {
  if(file.startsWith('wiki-project/')) return file.startsWith('wiki-project/scripts/');
  if(file.split('/').some(part=>['.git','node_modules','.runtime','.scratch','.cache','dist','build','out','coverage'].includes(part)||sensitiveName(part)))return false;
  return /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|sql|rs|py|sh|css|html|svg)$/.test(file)||/(?:^|\/)(?:Dockerfile|Makefile|\.gitignore|\.node-version)$/.test(file);
}
export function assess({changed,currentCoverage,baseCoverage,readCurrent,readBase}) {
  const code=changed.filter(codeFile),errors=[];
  if(!code.length)return {status:'passed',codeFiles:0,errors};
  const written=new Set(changed.filter(p=>p.startsWith('wiki-project/wiki/')&&p.endsWith('.md')&&readCurrent(p)!==null&&body(readCurrent(p))!==body(readBase(p)||'')));
  const tasks=[...written].filter(p=>p.startsWith('wiki-project/wiki/tasks/'));
  if(!tasks.length)errors.push('TASK_UPDATE_REQUIRED');
  const log='wiki-project/log.md',before=readBase(log)||'',after=readCurrent(log)||'';
  if(!changed.includes(log)||!after.startsWith(before)||!after.slice(before.length).trim())errors.push('APPEND_ONLY_LOG_REQUIRED');
  for(const file of code) {
    const entries=[currentCoverage[file],baseCoverage[file]].filter(Boolean);
    const pages=file.startsWith('wiki-project/scripts/')?[workflowPage]:entries.flatMap(x=>x.pages.map(p=>`wiki-project/${p}`));
    if(!pages.length)errors.push(`${file}: COVERAGE_MAPPING_REQUIRED`);
    else if(!pages.some(p=>written.has(p)&&!p.startsWith('wiki-project/wiki/tasks/')))errors.push(`${file}: RELATED_WIKI_BODY_UPDATE_REQUIRED`);
  }
  return {status:errors.length?'failed':'passed',codeFiles:code.length,knowledgePages:written.size,tasks:tasks.length,errors};
}
export function check(root,base) {
  const git=(args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
  const sha=git(['rev-parse','--verify',`${base}^{commit}`]).trim();
  const changed=[...new Set([...git(['diff','--name-only','--no-renames','-z',sha,'--']).split('\0'),...git(['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean))].sort();
  const readBase=file=>{try{return git(['show',`${sha}:${file}`])}catch{return null}};
  const readCurrent=file=>{const absolute=safePath(root,file);return fs.existsSync(absolute)?fs.readFileSync(absolute,'utf8'):null};
  const currentCoverage=JSON.parse(readCurrent('wiki-project/scripts/wiki-config.json')).coverage;
  const baseCoverage=JSON.parse(readBase('wiki-project/scripts/wiki-config.json')||'{"coverage":{}}').coverage;
  return {base:sha,...assess({changed,currentCoverage,baseCoverage,readCurrent,readBase})};
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==5||process.argv[3]!=='--base')throw new Error('USAGE: node check-wiki-sync.mjs <project-root> --base <commit-or-ref>');
    const result=check(projectRoot(process.argv[2]),process.argv[4]);
    console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='passed'?0:1;
  }catch(error){console.error(error.message.startsWith('USAGE:')?error.message:'WIKI_SYNC_CHECK_ERROR: verify Git baseline, paths and configuration');process.exitCode=1;}
}
