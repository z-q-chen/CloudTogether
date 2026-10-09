const { app, BrowserWindow, ipcMain, safeStorage, shell, clipboard } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createDesktopLyrics } = require('./desktop-lyrics.cjs')
const { Service, stripSecrets } = require('./service.cjs')
// Linux window identity must match the installed desktop entry.
if (process.platform === 'linux') {
  app.setName('cloudtogether')
  app.setDesktopName('cloudtogether.desktop')
}
for(const level of ['log','info','warn','error']){const original=console[level].bind(console);console[level]=(...values)=>original(...values.map(value=>typeof value==='string'?value.replace(/(MUSIC_U|MUSIC_A|__csrf|NMTID)=[^;\s]+/gi,'$1=[redacted]'):stripSecrets(value)))}
let win
const qa = process.argv.includes('--qa')
const qaFolder = process.env.CLOUD_QA_PROFILE
if (qa && qaFolder && path.isAbsolute(qaFolder)) app.setPath('userData',qaFolder)
else app.setPath('userData',path.join(app.getPath('appData'),'CloudTogether-Independent'))
const primary = qa || app.requestSingleInstanceLock()
if (!primary) app.quit()
app.on('second-instance',()=> { if (win) { if(win.isMinimized()) win.restore(); win.show(); win.focus() } })
if(primary) app.whenReady().then(async()=> {
  let transport
  if (qa && process.env.CLOUD_QA_API) {
    const mock = new URL(process.env.CLOUD_QA_API)
    if (mock.hostname !== '127.0.0.1' || mock.protocol !== 'http:') throw new Error('Invalid QA service')
    transport = async(method,args)=> {
      const response = await fetch(new URL(method,mock),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(16000)})
      return response.json()
    }
  }
  const service = new Service({ folder:app.getPath('userData'),safeStorage,transport,mock:!!transport,clipboard })
  const entry = path.join(__dirname,'../../dist/index.html')
  const entryUrl = pathToFileURL(entry).href
  win = new BrowserWindow({ width:1360,height:920,minWidth:880,minHeight:650,show:false,title:'云伴 · CloudTogether',backgroundColor:'#111216',icon:path.join(__dirname,'../../assets/icon.png'),
    webPreferences:{ preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:false }
  })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(({url})=> {
    try { const u=new URL(url); if(u.protocol==='https:'&&['github.com','music.163.com'].includes(u.hostname)) shell.openExternal(url) } catch {}
    return {action:'deny'}
  })
  win.webContents.on('will-navigate',(e,url)=> { if(url.split('#')[0]!==entryUrl) e.preventDefault() })
  win.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false))
  const trusted=e=>e.sender===win.webContents && e.senderFrame===win.webContents.mainFrame && e.senderFrame.url.split('#')[0]===entryUrl
  const desktopLyrics=createDesktopLyrics({mainWindow:win,folder:app.getPath('userData'),trustedMain:trusted})
  ipcMain.handle('cloud:call',async(e,method,args)=> {
    if(!trusted(e)) return { ok:false,code:403,message:'访问被拒绝' }
    try { return {ok:true,data:await service.call(method,args)} }
    catch(error) { return {ok:false,code:Number(error.code||error.status||500),message:error.name==='ZodError'?'操作参数无效':String(error.body?.message || error.message || '服务暂不可用').slice(0,200)} }
  })
  ipcMain.handle('cloud:window',(e,action)=> {
    if(!trusted(e)) return
    if(action==='fullscreen') { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen() }
  })
  win.once('ready-to-show',()=>win.show())
  await win.loadFile(entry)
  await desktopLyrics.restore()
  if(process.argv.includes('--desktop-lyrics'))await desktopLyrics.enable()
  if(qa && process.env.CLOUD_QA_DEVTOOLS==='1') win.webContents.openDevTools({mode:'detach'})
})
app.on('window-all-closed',()=>app.quit())
