import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const checks=[];
function run(command,args,label) {
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:10*1024*1024,shell:process.platform==='win32',env:{...process.env,M0_OUTPUT_DIR:path.join(root,'evidence')}});
  const stdout=(result.stdout||'').replaceAll(root,'<probe-root>');
  const stderr=(result.stderr||'').replaceAll(root,'<probe-root>');
  const check={command:label||[command,...args].join(' '),exitCode:result.status,signal:result.signal,error:result.error?.code,stdout:stdout.slice(-6000),stderr:stderr.slice(-2000)};
  checks.push(check);console.log(`${check.exitCode===0?'PASS':'FAIL'} ${check.command}`);return check.exitCode===0;
}
run('pnpm',['install','--frozen-lockfile','--ignore-scripts']);
run('pnpm',['typecheck']);run('pnpm',['test:contracts']);
for(const file of fs.readdirSync(root).filter(x=>/\.(?:mjs|cjs|js)$/.test(x)))run(process.execPath,['--check',file],`node --check ${file}`);
run('pnpm',['probe']);
if(process.argv.includes('--package')) {
  if(process.platform==='darwin'&&run('pnpm',['package:mac'])) run(path.join(root,'dist/mac-arm64/TradeQuote M0 Probe.app/Contents/MacOS/TradeQuote M0 Probe'),[],'macOS packaged app probe');
  else if(process.platform!=='darwin')checks.push({command:'platform packaging',exitCode:null,reason:'This collector implements macOS arm64 only; no Windows acceptance claimed'});
}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=Object.fromEntries(fs.readdirSync(root).filter(x=>/\.(?:mjs|cjs|js|ts|json|css|html|yaml)$/.test(x)).sort().map(x=>[x,hash(path.join(root,x))]));
const reports=Object.fromEntries(['desktop.json','packaged.json','initial-desktop.json','package-initial.json'].filter(x=>fs.existsSync(path.join(root,'evidence',x))).map(x=>[x,hash(path.join(root,'evidence',x))]));
const record={at:new Date().toISOString(),status:checks.every(c=>c.exitCode===0)?'passed':'partial',scope:'Selected M0 macOS probe route only; rejected Harness and deferred acceptance are separate',environment:{node:process.version,platform:process.platform,arch:process.arch},checks,sources,reports,notCompleted:['Real DeepSeek credentials/model evaluation','Windows and signed installer/upgrade acceptance (user deferred)','Exact RTL text roundtrip and language expert review','Full production contracts and durable streamed AgentRun recovery','Three developer contract sign-off']};
fs.writeFileSync('evidence/validation.json',JSON.stringify(record,null,2)+'\n');
process.exitCode=record.status==='passed'?0:1;
