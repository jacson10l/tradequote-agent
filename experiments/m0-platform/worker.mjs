import { storageProbe, openStore } from './storage.mjs';
const [phase,dir]=process.argv.slice(2);
try {
  let result;
  if(phase==='initial'||phase==='reopen') result=await storageProbe(dir,phase);
  else if(phase==='crash') {
    const {db}=openStore(`${dir}/业务.sqlite`);
    db.exec('BEGIN IMMEDIATE'); db.prepare('INSERT INTO revision VALUES (?,?,?,?,?)').run('uncommitted','synthetic-quote',2,'99','{}');
    process.parentPort.postMessage({readyToKill:true}); setInterval(()=>{},1000);
  } else if(phase==='parsers') result=await (await import('./parsers.mjs')).parserProbe(dir);
  else if(phase==='react-pdf') {await (await import('./pdf-probe.mjs')).reactPdfFixture(dir); result={rendered:true};}
  else if(phase==='pdf-inspect') {
    const {pdfSpans}=await import('./parsers.mjs');
    result={}; for(const name of ['electron','react-pdf','image-only']) result[name]=await pdfSpans(`${dir}/${name}.pdf`);
  } else if(phase==='executor') result=await (await import('./executor-probe.mjs')).executorProbe(dir);
  else if(phase==='harness') result=await (await import('./harness-desktop.mjs')).harnessProbe(dir);
  else throw new Error('UNKNOWN_PHASE');
  if(phase!=='crash') {process.parentPort.postMessage({ok:true,result,node:process.version,modules:process.versions.modules}); process.exit(0);}
} catch(error) {process.parentPort.postMessage({ok:false,error:String(error).replaceAll(dir,'<probe-data>')});process.exit(1);}
