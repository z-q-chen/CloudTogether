const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {snapshotSchema,settingsSchema,emptySnapshot} = require('../shared/desktop-lyrics.cjs')

// A separate renderer receives text only. It has no music service or account bridge.
function createDesktopLyrics({mainWindow,folder,trustedMain}) {
  const entry=path.join(__dirname,'../../dist/lyrics.html'),url=pathToFileURL(entry).href
  const file=path.join(folder,'desktop-lyrics.json')
  let settings={enabled:false,fontSize:28},snapshot={...emptySnapshot},window=null,ready=null,saveTimer,disposed=false,dragOrigin=null
  try {settings=settingsSchema.parse(JSON.parse(fs.readFileSync(file,'utf8')))} catch {}
  const state=()=>({enabled:settings.enabled,fontSize:settings.fontSize})
  const save=()=>{
    clearTimeout(saveTimer)
    try {fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(settings),{mode:0o600});fs.renameSync(file+'.tmp',file)} catch(error) {console.warn('Desktop lyrics settings:',error.message)}
  }
  const publish=()=>{
    if(!mainWindow.isDestroyed())mainWindow.webContents.send('cloud:lyrics-state',state())
    if(window&&!window.isDestroyed())window.webContents.send('lyrics:update',{...state(),snapshot})
  }
  const safeBounds=()=>{
    const saved=settings.bounds
    const display=saved?screen.getDisplayMatching(saved):screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const area=display.workArea,width=Math.min(saved?.width||760,area.width),height=Math.min(saved?.height||192,area.height)
    // Clamp restored coordinates after unplugging a monitor or changing its resolution.
    return {width,height,x:Math.max(area.x,Math.min(saved?.x??Math.round(area.x+(area.width-width)/2),area.x+area.width-width)),y:Math.max(area.y,Math.min(saved?.y??area.y+area.height-height-56,area.y+area.height-height))}
  }
  const trustedOverlay=e=>window&&!window.isDestroyed()&&e.sender===window.webContents&&e.senderFrame===window.webContents.mainFrame&&e.senderFrame.url===url
  async function setEnabled(value) {
    if(disposed)return state()
    settings.enabled=value;save();publish()
    if(!value){dragOrigin=null;window?.hide();return state()}
    if(!window||window.isDestroyed()) {
      const created=new BrowserWindow({...safeBounds(),minWidth:440,minHeight:168,maxWidth:1600,maxHeight:500,show:false,frame:false,transparent:true,resizable:true,alwaysOnTop:true,skipTaskbar:true,title:'云伴 · 桌面歌词',backgroundColor:'#00000000',
        webPreferences:{preload:path.join(__dirname,'lyrics-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:false,partition:'desktop-lyrics'}
      })
      window=created
      created.setMenuBarVisibility(false)
      created.setAlwaysOnTop(true,'floating')
      created.webContents.setWindowOpenHandler(()=>({action:'deny'}))
      created.webContents.on('will-navigate',(e,target)=>{if(target!==url)e.preventDefault()})
      created.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false))
      const remember=()=>{if(!created.isDestroyed()){settings.bounds=created.getBounds();clearTimeout(saveTimer);saveTimer=setTimeout(save,250)}}
      created.on('move',remember);created.on('resize',remember)
      created.on('close',e=>{if(!disposed){e.preventDefault();void setEnabled(false)}})
      ready=created.loadFile(entry)
    }
    try {await ready;if(settings.enabled&&!disposed&&!window.isDestroyed()){publish();window.showInactive();window.setAlwaysOnTop(true,'floating')}}
    catch(error){settings.enabled=false;save();publish();if(!mainWindow.isDestroyed())mainWindow.webContents.send('cloud:lyrics-error','桌面歌词窗口无法打开，请重试');console.warn('Desktop lyrics window:',error.message)}
    return state()
  }
  ipcMain.handle('cloud:lyrics',async(e,enabled)=>{
    if(!trustedMain(e)||!(enabled===undefined||typeof enabled==='boolean'))return {ok:false,message:'操作参数无效'}
    return {ok:true,data:enabled===undefined?state():await setEnabled(enabled)}
  })
  ipcMain.on('cloud:lyrics-snapshot',(e,value)=>{
    if(!trustedMain(e))return
    const parsed=snapshotSchema.safeParse(value)
    if(parsed.success){snapshot=parsed.data;publish()}
  })
  ipcMain.handle('lyrics:get',e=>trustedOverlay(e)?{...state(),snapshot}:null)
  ipcMain.handle('lyrics:drag',(e,phase,point)=>{
    if(!trustedOverlay(e)||!settings.enabled||!['start','move','end'].includes(phase)||!point||Object.keys(point).sort().join(',')!=='x,y'||![point.x,point.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=32768))return false
    if(phase==='start')dragOrigin={...window.getBounds(),pointerX:point.x,pointerY:point.y}
    else if(dragOrigin){
      const x=Math.round(dragOrigin.x+point.x-dragOrigin.pointerX),y=Math.round(dragOrigin.y+point.y-dragOrigin.pointerY)
      const area=screen.getDisplayNearestPoint({x,y}).workArea
      window.setPosition(Math.max(area.x,Math.min(x,area.x+area.width-120)),Math.max(area.y,Math.min(y,area.y+area.height-40)))
      if(phase==='end')dragOrigin=null
    }
    return true
  })
  ipcMain.handle('lyrics:action',async(e,action)=>{
    if(!trustedOverlay(e)||!['close','larger','smaller','reveal'].includes(action))return null
    if(action==='close')return setEnabled(false)
    if(action==='reveal'){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus()}
    else{settings.fontSize=Math.max(20,Math.min(40,settings.fontSize+(action==='larger'?2:-2)));save();publish()}
    return state()
  })
  const clamp=()=>{if(window&&!window.isDestroyed())window.setBounds(safeBounds())}
  screen.on('display-removed',clamp);screen.on('display-metrics-changed',clamp)
  const quitting=()=>{disposed=true;save()}
  app.on('before-quit',quitting)
  mainWindow.on('closed',()=>{disposed=true;save();app.removeListener('before-quit',quitting);screen.removeListener('display-removed',clamp);screen.removeListener('display-metrics-changed',clamp);if(window&&!window.isDestroyed())window.destroy()})
  return {enable:()=>setEnabled(true),restore:()=>settings.enabled?setEnabled(true):Promise.resolve(state())}
}
module.exports = {createDesktopLyrics}
