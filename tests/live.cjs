const {_electron:electron}=require('playwright')
const {expect}=require('@playwright/test')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'..')
;(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-live-')),checks=[],errors=[]
  const executable=process.env.CLOUD_PACKAGED
  const app=await electron.launch({executablePath:executable||undefined,args:executable?['--qa','--no-sandbox']:['.','--qa','--no-sandbox'],cwd:root,env:{...process.env,CLOUD_QA_API:'',CLOUD_QA_PROFILE:profile},timeout:30000})
  try {
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{const A=window.Audio;window.Audio=class extends A{constructor(...args){super(...args);window.__qaAudio=this}}});await page.reload()
    await expect(page.locator('.discover .cover-card').first()).toBeVisible({timeout:25000});await expect(page.locator('.discover .cover-card')).toHaveCount(12,{timeout:25000})
    await expect.poll(()=>page.locator('.cover-card img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth>0).length),{timeout:20000}).toBeGreaterThanOrEqual(6)
    const loaded=await page.locator('.cover-card img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth>0).length)
    const session=await page.evaluate(()=>window.cloud.call('session'))
    checks.push({name:'原生桌面与真实推荐歌单',passed:true,cards:await page.locator('.cover-card').count(),coversLoaded:loaded,anonymous:!session.data.profile})
    await page.waitForTimeout(1200);await page.screenshot({path:path.join(out,'云伴-真实发现.png')})
    const first=await page.locator('.cover-card').evaluateAll(els=>els.map(el=>el.dataset.cardId));await expect(page.getByRole('button',{name:'换一批歌单',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('button',{name:'换一批歌单',exact:true}).click();await expect(page.locator('.toast')).toBeVisible()
    const after=await page.locator('.cover-card').evaluateAll(els=>els.map(el=>el.dataset.cardId)),changed=first.join(',')!==after.join(',');const feedback=await page.locator('.toast').textContent();expect(changed||feedback.includes('暂无新')).toBe(true);checks.push({name:'真实推荐换批与未更新反馈',passed:true,changed,first,after,feedback})

    await page.locator('.main-scroll').evaluate(el=>el.scrollTop=240);await page.screenshot({path:path.join(out,'云伴-真实歌单.png')})
    for(const name of ['排行榜','新碟','听书 · 播客']) {
      await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.cover-card').first()).toBeVisible({timeout:20000});checks.push({name:'真实'+name,passed:true,count:await page.locator('.cover-card').count()})
    }
    await page.getByLabel('搜索音乐',{exact:true}).fill('晴天');await page.getByLabel('搜索音乐',{exact:true}).press('Enter');await expect(page.locator('.track-row').first()).toBeVisible({timeout:25000})
    checks.push({name:'真实搜索与曲目元数据',passed:true,rows:await page.locator('.track-row').count()})
    let played=false,attempts=[]
    // Audition only anonymous official sources. No account mutation or alternate source.
    for(let i=0;i<Math.min(5,await page.locator('.track-title').count());i++) {
      const button=page.locator('.track-title').nth(i),title=(await button.textContent()).trim().slice(0,100)
      await button.click()
      try{await expect.poll(()=>page.evaluate(()=>!!window.__qaAudio?.src&&!window.__qaAudio.paused&&window.__qaAudio.currentTime>0.2),{timeout:22000}).toBe(true);played=true;attempts.push({title,played:true});break}catch{attempts.push({title,played:false,error:await page.locator('.mini-error').textContent().catch(()=>'没有可用音源')})}
    }
    checks.push({name:'真实官方音源解码与播放',passed:played,attempts})
    if(played){await page.getByRole('button',{name:'展开完整播放页'}).click();await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'云伴-真实播放页.png')});await page.getByRole('button',{name:'暂停',exact:true}).click()
      const opened=app.waitForEvent('window');await page.getByRole('button',{name:'开启桌面歌词',exact:true}).click();const lyrics=await opened;lyrics.on('pageerror',e=>errors.push(e.message))
      await expect(page.locator('.lyric-line.active>span')).toBeVisible({timeout:15000});const line=(await page.locator('.lyric-line.active>span').textContent()).trim();await expect(lyrics.locator('.current-line')).toHaveText(line);await lyrics.screenshot({path:path.join(out,'桌面歌词-真实音乐.png')});checks.push({name:'真实歌曲桌面歌词与完整播放页同步',passed:true,line});await page.getByRole('button',{name:'关闭桌面歌词',exact:true}).click()
    }
    // QR generation is read-only; do not scan or change accounts.
    if(played)await page.getByRole('button',{name:'收起播放页',exact:true}).click()
    await page.getByRole('button',{name:'登录网易云',exact:true}).click();await expect(page.getByAltText('网易云登录二维码')).toBeVisible({timeout:22000});checks.push({name:'真实登录二维码生成',passed:true});await page.keyboard.press('Escape')
    expect(errors).toEqual([])
  }catch(e){checks.push({name:'live smoke',passed:false,error:e.message});throw e}
  finally{fs.writeFileSync(path.join(out,'真实接口验收.json'),JSON.stringify({date:new Date().toISOString(),runtime:executable?'packaged':'development',checks,errors},null,2));await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1})
