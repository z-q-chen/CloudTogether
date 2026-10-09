const { _electron:electron }=require('playwright')
const { expect }=require('@playwright/test')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {fixture}=require('./fixture.cjs')
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../验收截图')
const results=[],errors=[]
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS',name)}
;(async()=>{
  fs.mkdirSync(out,{recursive:true});const fixtureApi=await fixture(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-desktop-'))
  let app
  try {
    const args=process.env.CLOUD_PACKAGED?[process.env.CLOUD_PACKAGED,'--qa','--no-sandbox']:['.','--qa','--no-sandbox']
    app=await electron.launch({executablePath:process.env.CLOUD_PACKAGED||undefined,args:process.env.CLOUD_PACKAGED?args.slice(1):args,cwd:root,env:{...process.env,CLOUD_QA_API:fixtureApi.url,CLOUD_QA_PROFILE:profile},timeout:30000})
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{const A=window.Audio;window.Audio=class extends A{constructor(...args){super(...args);window.__qaAudio=this}}})
    await page.reload();await expect(page.getByRole('heading',{name:'发现音乐'})).toBeVisible();await expect(page.locator('.cover-card')).toHaveCount(12)
    await check('独立首页、无侧栏、真实内容入口与底部播放器',async()=>{
      await expect(page.getByRole('navigation',{name:'发现分类'}).getByRole('button')).toHaveCount(6)
      await expect(page.getByRole('contentinfo',{name:'底部播放器'})).toBeVisible();await expect(page.locator('aside')).toHaveCount(0)
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false)
      await page.screenshot({path:path.join(out,'01-发现-QA.png')})
      await page.locator('.cover-card').first().hover();await page.locator('.card-play').first().click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();await expect(page.locator('.detail')).toBeVisible();await page.getByRole('button',{name:'云伴首页'}).click()
    })
    await check('标题移入顶部、推荐换批、分类翻页与更新反馈',async()=>{
      await expect(page.locator('.app-header h1')).toHaveText('发现音乐');await expect(page.locator('.top-link')).toHaveCount(0);await expect(page.locator('.discover-heading')).toHaveCount(0)
      const ids=()=>page.locator('.cover-card').evaluateAll(els=>els.map(el=>el.dataset.cardId))
      const first=await ids()
      await page.getByRole('button',{name:'换一批歌单',exact:true}).click();await expect(page.locator('.toast')).toContainText('已换一批推荐歌单');expect(await ids()).not.toEqual(first)
      await page.getByRole('button',{name:'歌单',exact:true}).click();await page.getByRole('button',{name:'爵士',exact:true}).click();await expect.poll(()=>fixtureApi.writes.filter(x=>x.method==='top_playlist').at(-1)?.args.cat).toBe('爵士');await expect(page.locator('.cover-card')).toHaveCount(12)
      await page.getByRole('button',{name:'换一批歌单',exact:true}).click();await expect.poll(()=>fixtureApi.writes.filter(x=>x.method==='top_playlist').at(-1)?.args.offset).toBe(12);await expect(page.locator('.section-heading h2').first()).toContainText('爵士')
      fixtureApi.setDiscoverFailure(true);await page.getByRole('button',{name:'换一批歌单',exact:true}).click();await expect(page.locator('.inline-error')).toContainText('当前内容已保留');await expect(page.locator('.cover-card')).toHaveCount(12);fixtureApi.setDiscoverFailure(false)
      await page.getByRole('button',{name:'排行榜',exact:true}).click();await page.getByRole('button',{name:'更新内容',exact:true}).click();await expect(page.locator('.toast')).toContainText('内容未变化')
      await page.getByRole('button',{name:'推荐',exact:true}).click()
    })
    await check('扫码账号登录与歌单、喜欢列表同步',async()=>{
      await page.getByRole('button',{name:'登录网易云',exact:true}).click();await expect(page.getByAltText('网易云登录二维码')).toBeVisible();await expect(page.getByRole('dialog')).not.toBeVisible({timeout:12000})
      await page.getByRole('button',{name:'我的',exact:true}).click();await expect(page.getByRole('heading',{name:'QA 测试账号',exact:true})).toBeVisible();await expect(page.locator('.mine .cover-card')).toHaveCount(6)
      await expect(page.locator('.liked-shortcut')).toContainText('2 首');await page.screenshot({path:path.join(out,'02-我的-QA.png')})
    })
    await check('红心写到账号；失败写入不伪造本地成功',async()=>{
      await page.locator('.mine .cover-card').first().click();await expect(page.getByRole('button',{name:'播放 风经过的时候',exact:true})).toBeVisible()
      await page.getByRole('button',{name:'取消喜欢 风经过的时候',exact:true}).click();await expect.poll(()=>fixtureApi.getLiked()).toEqual([102]);await expect(page.getByRole('button',{name:'喜欢 风经过的时候',exact:true})).toBeVisible()
      fixtureApi.setFailLike(true);await page.getByRole('button',{name:'喜欢 风经过的时候',exact:true}).click();await expect(page.getByRole('status')).toContainText('模拟账号写入失败');await expect(page.getByRole('button',{name:'喜欢 风经过的时候',exact:true})).toBeVisible()
      fixtureApi.setFailLike(false);await page.getByRole('button',{name:'喜欢 风经过的时候',exact:true}).click();await expect.poll(()=>fixtureApi.getLiked().includes(101)).toBe(true)
    })
    await check('音源播放、底部进度与完整播放页共用状态',async()=>{
      await page.getByRole('button',{name:'播放 风经过的时候',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();await expect.poll(()=>page.evaluate(()=>!!window.__qaAudio&&!window.__qaAudio.paused)).toBe(true)
      await page.getByRole('button',{name:'展开完整播放页'}).click();await expect(page.getByRole('region',{name:'完整播放页'})).toBeVisible();await expect(page.locator('.app-header')).toHaveCount(0);await expect(page.getByRole('contentinfo',{name:'底部播放器'})).toHaveCount(0)
      const box=await page.locator('.full-player').boundingBox(),view=page.viewportSize()||await page.evaluate(()=>({width:innerWidth,height:innerHeight}));expect(box.width).toBe(view.width)
      await page.getByLabel('播放进度',{exact:true}).evaluate(el=>{el.value='40';el.dispatchEvent(new Event('change',{bubbles:true}))});await expect(page.locator('.lyric-line.active')).toContainText('你和我，听见同一刻')
      await page.screenshot({path:path.join(out,'03-完整播放页-QA.png')})
      await page.getByRole('button',{name:'打开播放列表',exact:true}).click();const queue=await page.locator('.queue-sheet').boundingBox(),bottom=await page.locator('.player-bottom').boundingBox();expect(queue.y+queue.height).toBeLessThanOrEqual(bottom.y);await page.keyboard.press('Escape')
    })
    await check('播放模式可切换、单曲循环与真实心动接口',async()=>{
      await page.locator('.mode-caption').click();await page.getByRole('dialog').getByRole('button',{name:/^单曲循环/}).click();await expect(page.locator('.mode-caption')).toContainText('单曲循环')
      const before=fixtureApi.writes.filter(x=>x.method==='song_url_v1').length
      await page.evaluate(()=>window.__qaAudio.dispatchEvent(new Event('ended')));await expect(page.getByRole('heading',{name:'风经过的时候',exact:true})).toBeVisible();expect(fixtureApi.writes.filter(x=>x.method==='song_url_v1').length).toBe(before)
      await page.locator('.mode-caption').click();await page.getByRole('dialog').getByRole('button',{name:/^随机播放/}).click();await expect(page.locator('.mode-caption')).toContainText('随机播放')
      await page.getByRole('button',{name:'下一首',exact:true}).click();await expect.poll(()=>page.locator('.player-title h1').textContent()).not.toBe('风经过的时候')
      await page.locator('.mode-caption').click();await page.getByRole('dialog').getByRole('button',{name:/^心动模式/}).click();await expect(page.locator('.mode-caption')).toContainText('心动模式');await expect.poll(()=>fixtureApi.writes.some(x=>x.method==='playmode_intelligence_list')).toBe(true)
      await page.getByRole('button',{name:'打开播放列表',exact:true}).click();await expect(page.getByRole('dialog',{name:'播放列表',exact:true})).toBeVisible();await expect(page.locator('.queue-row')).toHaveCount(3);await expect(page.locator('.queue-row .recommend-label')).toHaveCount(2)
      await page.screenshot({path:path.join(out,'04-心动队列-QA.png')});await page.keyboard.press('Escape')
    })
    await check('六款皮肤、统一字体与持久化偏好',async()=>{
      await page.getByRole('button',{name:'更换皮肤',exact:true}).click();await expect(page.locator('.theme-grid>button')).toHaveCount(6)
      for(const [id,name]of [['ink','夜航'],['forest','苔原'],['rose','玫瑰灰'],['blue','海盐'],['amber','琥珀']]) {await page.getByRole('button',{name:name+'皮肤',exact:true}).click();await expect(page.locator('.app')).toHaveAttribute('data-theme',id)}
      await expect(page.locator('.setting-row select')).toHaveCount(0);await expect(page.locator('.app')).toHaveAttribute('data-font','sans');await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,'05-琥珀播放页-QA.png')})
      const prefs=JSON.parse(fs.readFileSync(path.join(profile,'preferences.json'),'utf8'));expect(prefs.theme).toBe('amber');expect(prefs.font).toBe('sans')
      await page.getByRole('button',{name:'更换皮肤',exact:true}).click();await page.getByRole('button',{name:'唱片纸皮肤',exact:true}).click();await page.keyboard.press('Escape')
    })
    await check('搜索、榜单、新碟与听书节目入口能播放',async()=>{
      await page.getByRole('button',{name:'收起播放页',exact:true}).click();await page.getByLabel('搜索音乐',{exact:true}).fill('风');await page.getByLabel('搜索音乐',{exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'“风”的搜索结果'})).toBeVisible();await expect(page.locator('.track-row')).toHaveCount(3)
      await page.getByRole('button',{name:'云伴首页'}).click();await page.getByRole('button',{name:'排行榜',exact:true}).click();await expect(page.locator('.cover-card')).toHaveCount(6)
      await page.getByRole('button',{name:'新碟',exact:true}).click();await expect(page.locator('.cover-card')).toHaveCount(12)
      await page.getByRole('button',{name:'听书 · 播客',exact:true}).click();await expect(page.locator('.cover-card')).toHaveCount(6);await expect(page.locator('.track-row')).toHaveCount(3);await page.locator('.track-title').first().click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeEnabled()
      await page.screenshot({path:path.join(out,'06-声音内容-QA.png')})
    })
    await check('快速切歌：晚返回的旧音源不覆盖新歌曲',async()=>{
      await page.getByRole('button',{name:'云伴首页'}).click();await page.getByRole('button',{name:'推荐',exact:true}).click();await page.locator('.cover-card').first().click();await expect(page.locator('.track-row')).toHaveCount(6)
      fixtureApi.setDelay(103);await page.getByRole('button',{name:'播放 月亮落在窗台',exact:true}).click();await page.getByRole('button',{name:'播放 沿海公路',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();await page.waitForTimeout(2200)
      expect(await page.evaluate(()=>new URL(window.__qaAudio.src).searchParams.get('id'))).toBe('104');await expect(page.locator('.mini-track strong')).toHaveText('沿海公路');fixtureApi.setDelay('')
    })
    await check('一起听加入、共同列表、远端切歌暂停且不回声',async()=>{
      await page.locator('.room-chip').click();await page.getByLabel('一起听邀请链接',{exact:true}).fill('https://st.music.163.com/listen-together/share/?roomId=room-qa&inviterId=8');await page.getByRole('button',{name:'检查邀请',exact:true}).click();await expect(page.locator('.modal')).toContainText('邀请可用');await page.getByRole('button',{name:'加入房间',exact:true}).click();await expect(page.locator('.player-room')).toContainText('双人同听中')
      await expect(page.getByRole('heading',{name:'风经过的时候',exact:true})).toBeVisible({timeout:15000})
      await expect(page.locator('.player-room .avatar img')).toHaveCount(2);await expect.poll(()=>page.locator('.player-room .avatar img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true)
      await expect(page.locator('.room-total-full')).toContainText('1,234 小时 56 分钟');
      fixtureApi.setRoomShape('flat');await expect(page.locator('.player-room')).toContainText('QA 手机账号')
      await page.locator('.mode-caption').click();await expect(page.getByRole('dialog').getByRole('button',{name:/^心动模式/})).toBeDisabled();await page.keyboard.press('Escape')
      await page.getByRole('button',{name:'收起播放页',exact:true}).click();await page.getByRole('button',{name:'云伴首页'}).click();await expect(page.locator('.heart-feature')).toBeDisabled();await expect(page.locator('.mini-room .avatar img')).toHaveCount(2);await expect(page.locator('.room-total-compact')).toHaveText('1,234小时56分');await page.screenshot({path:path.join(out,'09-双人底栏-QA.png')});await page.getByRole('button',{name:'展开完整播放页'}).click()
      fixtureApi.setRoomShape('broken');await expect(page.locator('.player-room .avatar-fallback')).toHaveCount(1,{timeout:15000});await expect(page.locator('.player-room .avatar-fallback')).toContainText('Q');fixtureApi.setRoomShape('nested');await expect(page.locator('.player-room .avatar img')).toHaveCount(2,{timeout:15000})

      const before=fixtureApi.writes.filter(x=>x.method==='listentogether_play_command').length
      fixtureApi.remote({targetSongId:'102',formerSongId:'101',commandType:'GOTO',playStatus:'PLAY',progress:6000});await expect(page.getByRole('heading',{name:'一封没有寄出的信',exact:true})).toBeVisible({timeout:15000})
      fixtureApi.remote({commandType:'PAUSE',playStatus:'PAUSE',progress:14000});await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible({timeout:15000});expect(fixtureApi.writes.filter(x=>x.method==='listentogether_play_command').length).toBe(before)
      await page.getByRole('button',{name:'播放',exact:true}).click();await expect.poll(()=>fixtureApi.writes.filter(x=>x.method==='listentogether_play_command').length).toBe(before+1)
      await page.getByLabel('播放进度',{exact:true}).evaluate(el=>{el.value='40';el.dispatchEvent(new Event('change',{bubbles:true}))});await expect.poll(()=>fixtureApi.writes.filter(x=>x.method==='listentogether_play_command').at(-1)?.args.commandType).toBe('PROGRESS')
      await page.getByRole('button',{name:'打开播放列表',exact:true}).click();await expect(page.locator('.queue-row')).toHaveCount(3);await page.screenshot({path:path.join(out,'07-一起听队列-QA.png')});await page.keyboard.press('Escape')
    })
    await check('官方累计时长按总小时显示、刷新与失败保留，结束后不清零',async()=>{
      await page.locator('.player-room').click();await expect(page.locator('.together-total strong')).toHaveText('1,234 小时 56 分钟')
      fixtureApi.setStats(3456*3600+12*60);await page.getByRole('button',{name:'刷新累计时长',exact:true}).click();await expect(page.locator('.together-total strong')).toHaveText('3,456 小时 12 分钟')
      fixtureApi.setStatsFailure(true);await page.getByRole('button',{name:'刷新累计时长',exact:true}).click();await expect(page.locator('.together-total small')).toContainText('已保留上次结果');await expect(page.locator('.together-total strong')).toHaveText('3,456 小时 12 分钟');fixtureApi.setStatsFailure(false)
      await page.keyboard.press('Escape')
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,700));await page.getByRole('button',{name:'收起播放页'}).click();await expect(page.locator('.room-total-compact')).toHaveText('3,456小时12分');expect(await page.locator('.room-total-compact').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
      const boxes=await page.locator('.mini-left,.mini-center,.mini-right').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right}}));for(let i=1;i<boxes.length;i++)expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i-1].right-1);expect(boxes.at(-1).right).toBeLessThanOrEqual(900)
      await page.screenshot({path:path.join(out,'11-双人累计时长小窗口-QA.png')});await page.getByRole('button',{name:'展开完整播放页'}).click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1360,920))
    })
    await check('结束房间时晚返回的远端音源不会恢复同步',async()=>{
      const before=fixtureApi.writes.filter(x=>x.method==='song_url_v1'&&x.args.id==='103').length
      fixtureApi.setDelay(103);fixtureApi.remote({targetSongId:'103',commandType:'GOTO',playStatus:'PLAY',progress:0});await expect.poll(()=>fixtureApi.writes.filter(x=>x.method==='song_url_v1'&&x.args.id==='103').length,{intervals:[100,200,500],timeout:15000}).toBeGreaterThan(before)
      await page.locator('.player-room').click();await page.getByRole('button',{name:'结束一起听',exact:true}).click();await page.getByRole('button',{name:'确认结束',exact:true}).click();await expect(page.locator('.player-room')).toContainText('与手机网易云同步');await page.waitForTimeout(2300);await expect(page.locator('.player-room')).not.toContainText('双人同听中');await expect(page.locator('.player-room .avatar')).toHaveCount(1);await expect(page.locator('.player-room')).toContainText('单人播放')
      expect(await page.evaluate(()=>window.__qaAudio.paused)).toBe(true);fixtureApi.setDelay('');await page.locator('.player-room').click();await expect(page.locator('.together-total strong')).toHaveText('3,456 小时 12 分钟');await page.keyboard.press('Escape')
      await page.getByRole('button',{name:'播放',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!window.__qaAudio.src&&!window.__qaAudio.paused)).toBe(true)
    })
    await check('新建房间、短暂断线自动恢复且不发出离线指令',async()=>{
      fixtureApi.setHeartDelay(2000);await page.locator('.mode-caption').click();await page.getByRole('dialog').getByRole('button',{name:/^心动模式/}).click();await page.locator('.player-room').click();await page.getByRole('button',{name:'创建房间，邀请听友',exact:true}).click();await expect(page.locator('.player-room')).toContainText('双人同听中');await page.waitForTimeout(2200);await expect(page.locator('.mode-caption')).toContainText('自动联播');fixtureApi.setHeartDelay(0)
      fixtureApi.setRoomShape('one');await expect(page.locator('.player-room')).toContainText('等待听友加入',{timeout:15000});await expect(page.locator('.player-room .avatar')).toHaveCount(1);await expect(page.locator('.player-room .avatar-invite')).toBeVisible();await page.screenshot({path:path.join(out,'10-等待听友-QA.png')});fixtureApi.setRoomShape('missing');await expect(page.locator('.player-room')).toContainText('双人同听中',{timeout:15000});await expect(page.locator('.player-room .avatar img')).toHaveCount(2,{timeout:15000});fixtureApi.setRoomShape('nested')
      await page.locator('.player-room').click();await page.getByRole('button',{name:'复制邀请链接',exact:true}).click();const copied=await app.evaluate(({clipboard})=>clipboard.readText());expect(copied).toContain('roomId=room-qa&inviterId=7');await page.keyboard.press('Escape')
      fixtureApi.setRoomOffline(true);await expect(page.locator('.player-room')).toContainText('连接中断',{timeout:15000})
      const before=fixtureApi.writes.filter(x=>x.method==='listentogether_play_command').length
      await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.locator('.toast')).toContainText('正在重连');expect(fixtureApi.writes.filter(x=>x.method==='listentogether_play_command').length).toBe(before)
      fixtureApi.setRoomOffline(false);await expect(page.locator('.player-room')).toContainText('双人同听中',{timeout:15000})
      await page.locator('.player-room').click();await page.getByRole('button',{name:'结束一起听',exact:true}).click();await page.getByRole('button',{name:'确认结束',exact:true}).click()
    })
    await check('IPC边界、凭据不暴露与桌面最小窗口布局',async()=>{
      const response=await page.evaluate(async()=>({session:await window.cloud.call('session'),malicious:await window.cloud.call('song_url_v1',{id:'101',level:'exhigh',unblock:'true',cookie:'injected'}),arbitrary:await window.cloud.call('readFile',{path:'/etc/passwd'})}))
      expect(JSON.stringify(response.session)).not.toContain('qa-only');expect(response.malicious.ok).toBe(false);expect(response.arbitrary.ok).toBe(false)
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,700));await page.waitForTimeout(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
      await page.getByRole('button',{name:'收起播放页',exact:true}).click();await page.getByRole('button',{name:'云伴首页'}).click();await expect(page.locator('.skin-button')).toBeVisible();await expect(page.locator('.mini-like')).toBeVisible();await expect(page.getByLabel('音量',{exact:true})).toBeVisible()
      const boxes=await page.locator('.mini-track,.mini-like,.mini-center,.mini-right').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right}}));for(let i=1;i<boxes.length;i++)expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i-1].right-1)
      const centered=await page.getByRole('button',{name:'暂停',exact:true}).boundingBox();const width=await page.evaluate(()=>innerWidth);expect(Math.abs(centered.x+centered.width/2-width/2)).toBeLessThan(1)
      await expect(page.locator('.mini-room .avatar')).toHaveCount(1);await page.screenshot({path:path.join(out,'08-小窗口-QA.png')})
      expect(errors).toEqual([])
    })
    await check('退出清除凭据，重新启动不泄漏旧账号',async()=>{
      await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.locator('.profile-button')).toHaveAttribute('aria-label','登录网易云');expect(fs.existsSync(path.join(profile,'account.json'))).toBe(false)
      await app.close();app=await electron.launch({executablePath:process.env.CLOUD_PACKAGED||undefined,args:process.env.CLOUD_PACKAGED?args.slice(1):args,cwd:root,env:{...process.env,CLOUD_QA_API:fixtureApi.url,CLOUD_QA_PROFILE:profile},timeout:30000})
      const again=await app.firstWindow();await expect(again.locator('.profile-button')).toHaveAttribute('aria-label','登录网易云');expect((await again.evaluate(()=>window.cloud.call('session'))).data.profile).toBe(null)
    })
  } catch(error){results.push({name:'desktop integration',status:'failed',error:error.stack});throw error}
  finally{if(app)await app.close();fixtureApi.server.close();fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.resolve(root,'../桌面验收.json'),JSON.stringify({date:new Date().toISOString(),mode:process.env.CLOUD_PACKAGED?'packaged mock':'development mock',results,errors},null,2))}
})().catch(e=>{console.error(e);process.exitCode=1})
