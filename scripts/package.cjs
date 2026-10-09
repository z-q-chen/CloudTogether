const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module')
const {execFileSync}=require('node:child_process')
const asar=require('@electron/asar'),sharp=require('sharp')
const root=path.resolve(__dirname,'..'),work=path.resolve(root,'../../work/package'),out=path.resolve(root,'..')
const modules=fs.realpathSync(path.join(root,'node_modules')),stage=path.join(work,'app'),runtime=path.join(work,'linux')
const copied=new Set(),licenses=[]
function copyPackage(name,parentFile=path.join(root,'package.json')) {
  const resolver=createRequire(parentFile)
  let entry
  try{entry=resolver.resolve(name+'/package.json')}catch{entry=resolver.resolve(name);while(!fs.existsSync(path.join(path.dirname(entry),'package.json')))entry=path.dirname(entry);entry=path.join(path.dirname(entry),'package.json')}
  const from=path.dirname(fs.realpathSync(entry))
  if(copied.has(from))return
  copied.add(from)
  const relative=path.relative(modules,from)
  if(relative.startsWith('..'))throw new Error('Dependency outside node_modules: '+name)
  const to=path.join(stage,'node_modules',relative)
  fs.mkdirSync(path.dirname(to),{recursive:true})
  fs.cpSync(from,to,{recursive:true,filter:file=>{
    const parts=path.relative(from,file).split(path.sep)
    // The API adapter's website and docs are not used by the desktop client.
    return file===from||(!parts.some(part=>['node_modules','.git','test','tests','example','examples'].includes(part))&&!(name==='@neteasecloudmusicapienhanced/api'&&parts[0]==='public'))
  }})
  const pkg=JSON.parse(fs.readFileSync(entry,'utf8'))
  licenses.push({name:pkg.name,version:pkg.version,license:pkg.license||'See package license'})
  for(const dep of Object.keys(pkg.dependencies||{}))copyPackage(dep,entry)
  for(const dep of Object.keys(pkg.optionalDependencies||{}))try{copyPackage(dep,entry)}catch{}
}
;(async()=>{
  fs.rmSync(work,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true})
  const icon=fs.readFileSync(path.join(root,'assets/icon.svg'),'utf8')
  for(const size of [16,32,48,64,128,256,512]){
    fs.mkdirSync(path.join(root,'assets/icons'),{recursive:true})
    await sharp(Buffer.from(icon)).resize(size).png().toFile(path.join(root,'assets/icons',`cloudtogether-${size}.png`))
  }
  fs.copyFileSync(path.join(root,'assets/icons/cloudtogether-512.png'),path.join(root,'assets/icon.png'))
  for(const name of ['dist','src/main','src/shared'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true})
  fs.mkdirSync(path.join(stage,'assets'),{recursive:true});fs.copyFileSync(path.join(root,'assets/icon.png'),path.join(stage,'assets/icon.png'))
  fs.copyFileSync(path.join(root,'assets/FONT-LICENSE.txt'),path.join(stage,'assets/FONT-LICENSE.txt'))
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
  fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({...pkg,devDependencies:undefined,scripts:undefined},null,2))
  // Vue is bundled into dist. Only main-process dependencies are copied.
  for(const dep of ['@neteasecloudmusicapienhanced/api','zod','qrcode'])copyPackage(dep)
  fs.writeFileSync(path.join(out,'第三方依赖清单.json'),JSON.stringify(licenses.sort((a,b)=>a.name.localeCompare(b.name)),null,2))
  for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])if(fs.existsSync(path.join(root,name)))fs.copyFileSync(path.join(root,name),path.join(stage,name))
  fs.cpSync(path.join(modules,'electron/dist'),runtime,{recursive:true})
  // The app UI is Chinese; keep Chinese resources and English fallbacks.
  for(const locale of fs.readdirSync(path.join(runtime,'locales'))){
    if(!['zh-CN.pak','zh-TW.pak','en-US.pak','en-GB.pak'].includes(locale))fs.unlinkSync(path.join(runtime,'locales',locale))
  }
  fs.renameSync(path.join(runtime,'electron'),path.join(runtime,'cloudtogether'))
  fs.unlinkSync(path.join(runtime,'resources/default_app.asar'))
  await asar.createPackage(stage,path.join(runtime,'resources/app.asar'))
  fs.writeFileSync(path.join(runtime,'云伴.desktop'),'[Desktop Entry]\nType=Application\nName=云伴\nComment=网易云音乐独立桌面客户端\nExec=cloudtogether %U\nIcon=cloudtogether\nCategories=Audio;Music;Player;\nTerminal=false\n')
  fs.copyFileSync(path.join(root,'assets/icon.png'),path.join(runtime,'cloudtogether.png'))
  const builder=path.join(modules,'app-builder-bin/linux/x64/app-builder')
  const image=path.join(out,`CloudTogether-${pkg.version}.AppImage`)
  const imageStage=path.join(work,'appimage');fs.mkdirSync(imageStage,{recursive:true})
  execFileSync(builder,['appimage','--stage',imageStage,'--arch','x64','--output',image,'--compression','xz','--app',runtime,'--configuration',JSON.stringify({productName:'云伴',productFilename:'cloudtogether',executableName:'cloudtogether',desktopEntry:'[Desktop Entry]\nType=Application\nName=云伴\nComment='+pkg.description+'\nExec=AppRun %U\nIcon=cloudtogether\nCategories=Audio;Music;Player;\nTerminal=false\n',icons:[{file:path.join(root,'assets/icon.png'),size:512}],fileAssociations:[]})],{stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_CACHE:process.env.ELECTRON_BUILDER_CACHE||path.resolve(root,'../../work/electron-builder-cache')}})
  fs.chmodSync(image,0o755)
  console.log('Packaged',image,'runtime dependencies',copied.size)
})().catch(e=>{console.error(e);process.exitCode=1})
