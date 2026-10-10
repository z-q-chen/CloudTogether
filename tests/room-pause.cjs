const {_electron}=require('playwright'),{expect}=require('@playwright/test')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {fixture}=require('./fixture.cjs')
;(async()=>{const api=await fixture(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-pause-'));let app
try {
 const executable=process.env.CLOUD_PACKAGED
 app=await _electron.launch({executablePath:executable,args:executable?['--qa','--no-sandbox']:['.','--qa','--no-sandbox'],cwd:path.resolve(__dirname,'..'),env:{...process.env,CLOUD_QA_API:api.url,CLOUD_QA_PROFILE:profile}})
 const page=await app.firstWindow();await page.addInitScript(()=>{const A=window.Audio;window.Audio=class extends A{constructor(...args){super(...args);window.__qaAudio=this}}});await page.reload()
 await page.getByRole('button',{name:'登录网易云',exact:true}).click();await expect(page.getByRole('button',{name:'我的',exact:true})).toBeVisible({timeout:15000})
 await page.getByRole('button',{name:'云伴首页'}).click();await page.locator('.cover-card').first().hover();await page.locator('.card-play').first().click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible()
 await page.locator('.room-chip').click();await page.getByLabel('一起听邀请链接',{exact:true}).fill('https://st.music.163.com/listen-together/share/?roomId=room-qa&inviterId=8');await page.getByRole('button',{name:'加入房间',exact:true}).click();await expect(page.locator('.player-room')).toContainText('双人同听中')
 await expect.poll(()=>api.writes.filter(x=>x.method==='listentogether_sync_playlist_get').length).toBeGreaterThan(0)
 await page.waitForTimeout(400)
 for(const strip of [false,true]) {
  api.setStalePause(6500,strip)
  await page.getByRole('button',{name:'暂停',exact:true}).click()
  await expect.poll(()=>api.writes.filter(x=>x.method==='listentogether_play_command').at(-1)?.args.commandType).toBe('PAUSE')
  expect(api.writes.filter(x=>x.method==='listentogether_play_command').at(-1).args.playStatus).toBe('PAUSE')
  for(let i=0;i<7;i++){await page.waitForTimeout(1000);expect(await page.evaluate(()=>window.__qaAudio.paused)).toBe(true)}
  console.log('PASS pause survives stale PLAY snapshots',strip?'without metadata':'with refreshed timestamps')
  const writes=api.writes.filter(x=>x.method==='listentogether_play_command').length
  api.remote({commandType:'PLAY',playStatus:'PLAY',progress:0});await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible({timeout:12000});expect(api.writes.filter(x=>x.method==='listentogether_play_command').length).toBe(writes)
  console.log('PASS new peer PLAY still applies without echo')
 }
 api.setStalePause(0);api.setCommandDelay(4000)
 await page.getByRole('button',{name:'暂停',exact:true}).click()
 for(let i=0;i<5;i++){await page.waitForTimeout(1000);expect(await page.evaluate(()=>window.__qaAudio.paused)).toBe(true)}
 console.log('PASS pause survives delayed write acknowledgement')
 api.setCommandDelay(0);api.remote({commandType:'PLAY',playStatus:'PLAY',progress:0});await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible({timeout:12000})
 api.setRoomOffline(true);await expect(page.locator('.player-room')).toContainText('连接中断',{timeout:15000})
 const before=api.writes.filter(x=>x.method==='listentogether_play_command').length
 await page.getByRole('button',{name:'暂停',exact:true}).click();expect(await page.evaluate(()=>window.__qaAudio.paused)).toBe(true)
 await page.getByRole('button',{name:'上一首',exact:true}).click();await expect(page.locator('.toast')).toContainText('正在重连');expect(await page.evaluate(()=>window.__qaAudio.paused)).toBe(true)
 expect(api.writes.filter(x=>x.method==='listentogether_play_command').length).toBe(before)
 api.setRoomOffline(false);await expect.poll(()=>api.writes.filter(x=>x.method==='listentogether_play_command').length,{timeout:15000}).toBe(before+1)
 expect(api.writes.filter(x=>x.method==='listentogether_play_command').at(-1).args.playStatus).toBe('PAUSE')
 for(let i=0;i<5;i++){await page.waitForTimeout(1000);expect(await page.evaluate(()=>window.__qaAudio.paused)).toBe(true)}
 api.remote({commandType:'PLAY',playStatus:'PLAY',progress:0});await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible({timeout:12000})
 console.log('PASS offline pause persists on reconnect; previous cannot bypass the offline guard; new peer command remains live')
}finally{if(app)await app.close();await new Promise(resolve=>api.server.close(resolve));fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1})
