const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('modelSettings',{
  status:()=>ipcRenderer.invoke('m0-settings:status'),
  save:value=>ipcRenderer.invoke('m0-settings:save',value),
  clear:()=>ipcRenderer.invoke('m0-settings:clear'),
  models:()=>ipcRenderer.invoke('m0-settings:models'),
  verify:()=>ipcRenderer.invoke('m0-settings:verify'),
});
