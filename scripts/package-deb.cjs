const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
const runtime=path.resolve(process.argv[2]||path.join(root,'../../work/package/linux'));
const stage=path.resolve(root,'../../work/deb-'+pkg.version),out=path.resolve(root,'..',`cloudtogether_${pkg.version}_amd64.deb`);
if(!fs.existsSync(path.join(runtime,'resources/app.asar')))throw Error('Build the Linux runtime first: npm run package');
fs.rmSync(stage,{recursive:true,force:true});
fs.mkdirSync(path.join(stage,'opt'),{recursive:true});fs.cpSync(runtime,path.join(stage,'opt/cloudtogether'),{recursive:true});
for(const name of ['云伴.desktop','cloudtogether.png'])fs.rmSync(path.join(stage,'opt/cloudtogether',name),{force:true});
fs.chmodSync(path.join(stage,'opt/cloudtogether/chrome-sandbox'),0o4755);
function write(file,body,mode=0o644){const p=path.join(stage,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body,{mode});}
write('usr/bin/cloudtogether','#!/bin/sh\nexec /opt/cloudtogether/cloudtogether "$@"\n',0o755);
write('usr/share/applications/cloudtogether.desktop','[Desktop Entry]\nType=Application\nName=云伴\nName[en]=CloudTogether\nComment=网易云音乐桌面客户端\nExec=cloudtogether\nIcon=cloudtogether\nStartupWMClass=云伴\nCategories=AudioVideo;Audio;Music;Player;\nTerminal=false\nStartupNotify=true\n');
for(const size of [16,32,48,64,128,256,512]){const to=path.join(stage,`usr/share/icons/hicolor/${size}x${size}/apps`);fs.mkdirSync(to,{recursive:true});fs.copyFileSync(path.join(root,`assets/icons/cloudtogether-${size}.png`),path.join(to,'cloudtogether.png'));}
write('usr/share/doc/cloudtogether/copyright',fs.readFileSync(path.join(root,'LICENSE'),'utf8')+'\n'+fs.readFileSync(path.join(root,'THIRD_PARTY_NOTICES.md'),'utf8'));
const deps=['libc6 (>= 2.31)','libnss3','libnspr4','libatk1.0-0t64 | libatk1.0-0','libatk-bridge2.0-0t64 | libatk-bridge2.0-0','libatspi2.0-0t64 | libatspi2.0-0','libglib2.0-0t64 | libglib2.0-0','libgtk-3-0t64 | libgtk-3-0','libcups2t64 | libcups2','libasound2t64 | libasound2','libcairo2','libpango-1.0-0','libdrm2','libgbm1','libx11-6','libxcb1','libxcomposite1','libxdamage1','libxext6','libxfixes3','libxrandr2','libxkbcommon0','libexpat1','libudev1','libatomic1'];
const files=[];function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile())files.push(f);}}walk(stage);
const installed=Math.ceil(files.reduce((n,p)=>n+Math.ceil(fs.statSync(p).size/1024)*1024,0)/1024);
const maintainer=process.env.CLOUD_MAINTAINER||pkg.author;
write('DEBIAN/control',`Package: cloudtogether\nVersion: ${pkg.version}\nSection: sound\nPriority: optional\nArchitecture: amd64\nMaintainer: ${maintainer}\nInstalled-Size: ${installed}\nDepends: ${deps.join(', ')}\nHomepage: https://z-q-chen.github.io/cloudtogether/\nDescription: NetEase music on your Linux desktop\n Account playlists, shared listening, desktop lyrics and personal themes.\n`);
const caches='if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "${DPKG_ROOT:-}/usr/share/applications" >/dev/null 2>&1 || true; fi\nif command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t "${DPKG_ROOT:-}/usr/share/icons/hicolor" >/dev/null 2>&1 || true; fi\n';
write('DEBIAN/postinst','#!/bin/sh\nset -e\nif [ "$1" = configure ]; then\n'+caches+'fi\nexit 0\n',0o755);
write('DEBIAN/postrm','#!/bin/sh\nset -e\ncase "$1" in remove|purge)\n'+caches+';;\nesac\nexit 0\n',0o755);
const crypto=require('node:crypto');
write('DEBIAN/md5sums',files.map(f=>crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')+'  '+path.relative(stage,f)).join('\n')+'\n');
execFileSync('dpkg-deb',['--build','--root-owner-group','-Zxz','-z9','--threads-max=2',stage,out],{stdio:'inherit'});
console.log(out,fs.statSync(out).size,'bytes');
