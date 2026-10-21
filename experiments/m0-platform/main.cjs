const {app,BrowserWindow,utilityProcess,session}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
app.setName('TradeQuote M0 Probe');
app.on('window-all-closed',()=>{});
function worker(phase,dir) {
  return new Promise((resolve,reject)=>{
    const child=utilityProcess.fork(path.join(__dirname,'worker.mjs'),[phase,dir],{serviceName:`M0 ${phase}`,stdio:'pipe'});
    let result,err=''; child.stderr?.on('data',d=>{err+=d.toString().slice(0,1000)});
    const timer=setTimeout(()=>{child.kill();reject(new Error(`WORKER_TIMEOUT:${phase}`))},90000);
    child.on('message',message=>{if(message.readyToKill) {result={ok:true,result:['forced-utility-process-crash']};child.kill();} else result=message;});
    child.on('exit',code=>{clearTimeout(timer);if(result?.ok) resolve(result);else reject(new Error(`${phase}: ${result?.error||`EXIT_${code} ${err}`}`));});
  });
}
(async()=>{
  await app.whenReady();
  if(process.argv.includes('--settings')) {await require('./settings.cjs').openSettings();return;}
  const output=path.resolve(process.env.M0_OUTPUT_DIR||path.join(process.cwd(),'evidence'));
  await fs.mkdir(output,{recursive:true});
  const artifacts=path.resolve(process.cwd(),'.runtime/artifacts');await fs.mkdir(artifacts,{recursive:true});
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tradequote-合成-'));
  const report={at:new Date().toISOString(),packaged:app.isPackaged,platform:process.platform,arch:process.arch,os:os.release(),versions:process.versions,checks:[],failures:[],realModel:false};
  const run=async(name,action)=>{try{const data=await action();report.checks.push({name,status:'passed',data});return data;}catch(e){report.failures.push({name,error:String(e).replaceAll(dir,'<probe-data>').replaceAll(__dirname,'<probe-app>')});return null;}};
  try {
    await run('sqlite-initial',()=>worker('initial',dir));
    await run('sqlite-crash',()=>worker('crash',dir));
    await run('sqlite-reopen',()=>worker('reopen',dir));
    await run('four-input-formats',()=>worker('parsers',dir));
    await run('react-pdf-candidate',()=>worker('react-pdf',dir));
    await run('electron-print-to-pdf',async()=>{
      const {htmlFixture}=await import(pathToFileURL(path.join(__dirname,'pdf-probe.mjs')).href);
      const html=path.join(dir,'quote.html'); await fs.writeFile(html,await htmlFixture());
      const ses=session.fromPartition(`m0-pdf-${Date.now()}`);let blocked=0;
      ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>{blocked++;cb({cancel:true})});
      const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,session:ses}});
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      try {
        await win.loadFile(html);
        // did-finish-load and Chromium print pipeline load embedded fonts; no page script execution.
        await fs.writeFile(path.join(dir,'electron.pdf'),await win.webContents.printToPDF({printBackground:true,pageSize:'A4',margins:{top:0.5,bottom:0.5,left:0.5,right:0.5},generateTaggedPDF:true}));
        await win.loadURL('data:text/html,<html><body><svg width="100" height="100"><rect width="100" height="100" fill="orange"/></svg></body></html>');
        await fs.writeFile(path.join(dir,'image-only.pdf'),await win.webContents.printToPDF({pageSize:'A4'}));
        return {scriptsDisabled:true,networkBlocked:true,blockedRequests:blocked,embeddedFontPackages:['noto-sans','noto-sans-sc','noto-sans-arabic']};
      } finally {win.destroy();}
    });
    await run('pdf-content-and-source-locations',async()=>{
      const data=(await worker('pdf-inspect',dir)).result;
      for(const name of ['electron','react-pdf']) {
        const pdf=data[name],text=pdf.spans.map(s=>s.text).join('\n');
        if(name==='electron') for(let page=1;page<=pdf.pages;page++) {const spans=pdf.spans.filter(s=>s.location.page===page);if(spans.some(s=>s.text.includes('ROW-'))) assert.ok(spans.some(s=>s.text.includes('SYNTHETIC QUOTE')),'missing repeated table header on a table page');}
        assert.ok(pdf.pages>1); for(const marker of ['合成报价','Größe','END-OF-QUOTE',...Array.from({length:120},(_,i)=>`ROW-${String(i+1).padStart(3,'0')}`)]) assert.ok(text.includes(marker),`${name}:missing ${marker}`);
      }
      assert.equal(data['image-only'].status,'needs_ocr');
      return Object.fromEntries(Object.entries(data).map(([name,pdf])=>[name,{pages:pdf.pages,spans:pdf.spans.length,status:pdf.status,arabicRoundtrip:pdf.spans.map(s=>s.text).join('').includes('مرحبا بالعالم'),arabicSpans:pdf.spans.filter(s=>/[\u0600-\u06ff\uFB50-\uFEFF]/.test(s.text)),firstLocation:pdf.spans[0]?.location}]));
    });
    await run('settings-page-and-secret-store',async()=>{
      const {secretStore,openSettings}=require('./settings.cjs');
      const secretDir=path.join(dir,'settings-test'); const store=secretStore(secretDir);
      await store.init(); assert.equal(store.info().hasKey,false);
      const saved=await store.save({key:'synthetic-settings-fixture',model:'synthetic-model'});
      assert.equal(Object.hasOwn(saved,'key'),false);
      const reopened=secretStore(secretDir);await reopened.init();
      if(saved.storage==='encrypted') {
        assert.equal(reopened.key(),'synthetic-settings-fixture');
        assert.ok(!(await fs.readFile(path.join(secretDir,'credentials.enc'),'utf8')).includes('synthetic-settings-fixture'));
      }
      const win=await openSettings({directory:secretDir,test:true});
      try {
        await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(!document.querySelector('button').disabled){clearInterval(t);resolve(true)}else if(++n>200){clearInterval(t);reject(new Error('UI_INIT_TIMEOUT'))}},10)})`);
        const state=await win.webContents.executeJavaScript(`Promise.all([window.modelSettings.status(),window.modelSettings.models()]).then(([s,m])=>({status:s,models:m,node:typeof require,passwordType:document.getElementById('key').type,keyField:document.getElementById('key').value}))`);
        assert.equal(state.node,'undefined');assert.equal(state.passwordType,'password');assert.equal(state.keyField,'');assert.equal(state.status.ok,true);assert.deepEqual(state.models.value,['synthetic-model']);
        const rejected=await win.webContents.executeJavaScript(`window.modelSettings.save({key:'synthetic-settings-fixture',model:'synthetic-model',actor:'forged'})`);
        assert.equal(rejected.ok,false);
        await fs.writeFile(path.join(artifacts,'settings.png'),(await win.webContents.capturePage()).toPNG());
        return {storage:saved.storage,encryptedRestart:saved.storage==='encrypted',rendererHasNode:false,secretNotReturned:true,strictIpc:true,realModel:false};
      } finally {win.destroy();await store.clear();}
    });
    await run('minimal-executor-in-electron',()=>worker('executor',dir));
    if(process.argv.includes('--harness-candidate')) await run('harness-in-electron',()=>worker('harness',dir));
    else report.notRun=['Harness candidate rejected on Electron 44.9.2; see initial-desktop.json','Real DeepSeek','Windows installation','Signed installer'];
    report.artifacts=[];
    for(const name of ['electron.pdf','react-pdf.pdf','image-only.pdf']) {try {const data=await fs.readFile(path.join(dir,name));const dest=path.join(artifacts,name);await fs.writeFile(dest,data);report.artifacts.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}catch{}}
    report.limits=['RTL visual sample reviewed separately; exact Arabic text extraction is not passed','Synthetic fixtures only; no complete product workflows','Unsigned macOS app directory is not installer/upgrade/Windows acceptance'];
    report.status=report.failures.length?'partial':'passed';
    await fs.writeFile(path.join(output,app.isPackaged?'packaged.json':'desktop.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,packaged:app.isPackaged,checks:report.checks.map(c=>c.name),failures:report.failures}));
  } finally {await fs.rm(dir,{recursive:true,force:true});app.exit(report.failures.length?1:0);}
})().catch(error=>{console.error(String(error));app.exit(1)});
