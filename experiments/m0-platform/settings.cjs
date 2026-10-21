const {app,BrowserWindow,ipcMain,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {z}=require('zod');
const saveSchema=z.strictObject({key:z.string().max(4096),model:z.string().max(128)});
function secretStore(directory) {
  const file=path.join(directory,'credentials.enc');let key='',model='',mode='memory';
  const available=()=>safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text');
  return {
    async init(){try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(!available())return;key=safeStorage.decryptString(Buffer.from(data.encrypted,'base64'));model=data.model;mode='encrypted';}catch(error){if(error.code!=='ENOENT')throw new Error('CREDENTIAL_UNAVAILABLE');}},
    info(){return {hasKey:Boolean(key),model,storage:mode};},
    key(){if(!key)throw new Error('KEY_REQUIRED');return key;},
    async save(input){const data=saveSchema.parse(input);const nextKey=data.key.trim()||key;const nextModel=data.model.trim();if(!nextKey)throw new Error('KEY_REQUIRED');
      if(available()) {const encrypted=safeStorage.encryptString(nextKey).toString('base64');await fs.mkdir(directory,{recursive:true});await fs.writeFile(`${file}.tmp`,JSON.stringify({encrypted,model:nextModel}),{mode:0o600});await fs.rename(`${file}.tmp`,file);mode='encrypted';}
      else {await fs.rm(file,{force:true});mode='memory';}
      key=nextKey;model=nextModel;return this.info();},
    async clear(){await fs.rm(file,{force:true});key='';model='';mode='memory';return this.info();},
  };
}
exports.secretStore=secretStore;
exports.openSettings=async function({directory=path.join(app.getPath('userData'),'model-settings'),test=false}={}) {
  const store=secretStore(directory);let initError;
  try{await store.init()}catch{initError='CREDENTIAL_UNAVAILABLE'}
  const file=path.join(__dirname,'settings.html'),url=pathToFileURL(file).href;
  const win=new BrowserWindow({show:!test,width:960,height:760,minWidth:760,minHeight:640,title:'TradeQuote · 系统设置',backgroundColor:'#FFFAEB',webPreferences:{preload:path.join(__dirname,'settings-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  let busy=false;
  const handle=(name,fn)=>ipcMain.handle(`m0-settings:${name}`,async(event,...args)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==url)return {ok:false,error:'ACTION_NOT_ALLOWED'};
    if(busy)return {ok:false,error:'REQUEST_BUSY'};
    busy=true;
    try{return {ok:true,value:await fn(...args)}}catch(error){return {ok:false,error:['KEY_REQUIRED','MODEL_REQUIRED','MODEL_AUTH_FAILED','MODEL_RATE_LIMITED','MODEL_TIMEOUT','MODEL_INVALID_OUTPUT','CREDENTIAL_UNAVAILABLE','MODEL_CONNECTION_FAILED'].includes(error.message)?error.message:'SETTINGS_FAILED'}}finally{busy=false}
  });
  const provider=async()=> (await import('./model-provider.mjs')).createProvider({key:store.key()});
  handle('status',()=>({...store.info(),initError}));
  handle('save',input=>store.save(input));
  handle('clear',()=>store.clear());
  handle('models',async()=>{if(test)return ['synthetic-model'];return (await provider()).models();});
  handle('verify',async()=>{
    const model=store.info().model;if(!model)throw new Error('MODEL_REQUIRED');
    if(test)return {model,json:true,synthetic:true};
    const message=await (await provider()).chat(model,[{role:'user',content:'Return only JSON: {"probe":"tradequote","category":"valve"}. This is a synthetic connection test.'}],{json:true});
    let data;try{data=JSON.parse(message.content)}catch{throw new Error('MODEL_INVALID_OUTPUT')}
    if(data.probe!=='tradequote'||data.category!=='valve')throw new Error('MODEL_INVALID_OUTPUT');
    const result={at:new Date().toISOString(),model,json:true,scope:'connection and synthetic JSON only; not full G3'};
    await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'model-validation.json'),JSON.stringify(result,null,2)+'\n');return result;
  });
  win.on('closed',()=>{for(const name of ['status','save','clear','models','verify'])ipcMain.removeHandler(`m0-settings:${name}`);if(!test)app.quit();});
  await win.loadFile(file);return win;
};
