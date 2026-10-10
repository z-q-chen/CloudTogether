import { reactive, computed, watch } from 'vue'
import { RoomCommands } from './room-sync.mjs'
import { track, playlist, program, parseLyrics, invitation, Shuffle, roomMembers, recommendationBatch, togetherTotal, formatTogetherTotal } from './domain.mjs'

export const state = reactive({
  page:'discover',tab:'推荐',profile:null,prefs:{theme:'ink',quality:'exhigh',volume:0.7,font:'sans'},storage:'',
  discover:{playlists:[],charts:[],albums:[],radios:[],programs:[],loading:true,errors:{},pool:[],category:'全部',offset:0,updatedAt:0,notice:''},
  mine:{playlists:[],likes:[],likedTracks:[],loading:false,error:'',loaded:0,more:false,paging:false},
  detail:{title:'',cover:'',description:'',creator:'',tracks:[],id:'',kind:'playlist',total:0,loading:false,error:'',more:false,paging:false},
  search:{query:'',type:1,tracks:[],cards:[],loading:false,error:'',more:false,offset:0,total:0},
  queue:[],current:null,source:{id:'0',title:''},mode:'sequence',playing:false,loading:false,progress:0,duration:0,lyrics:[],lyricLoading:false,error:'',history:[],
  modal:'',toast:'',toastKind:'info',queueOpen:false,login:{key:'',image:'',message:'',busy:false},
  room:{id:'',members:[],creator:'',connected:false,busy:false,error:'',invite:'',seq:0,checked:null},
  togetherStats:{peerId:'',peerName:'',totalSeconds:null,loading:false,error:'',updatedAt:0,attemptedAt:0},
  desktopLyrics:false,desktopLyricsBusy:false,fullscreen:false,sleep:0,previousPage:'discover'
})
let toastTimer, loginTimer, roomTimer, sleepTimer
const discoverVersions=new Map(),portraitRequests=new Set()
let discoverPending=0
let statsEpoch=0,statsBusy=false
let accountEpoch=0, detailEpoch=0, searchEpoch=0, audioEpoch=0, roomEpoch=0, loginEpoch=0
let pendingRoomPause=null, queuePageRequest=null
let pollBusy=false, roomTail=Promise.resolve(), remoteApplying=false, desiredPlaying=false, listenTime=0
let lastTime=0, likeBusy=new Set(), historyStack=[], roomRevision=0
const shuffle=new Shuffle(),roomCommands=new RoomCommands()
export const audio=new Audio()
audio.preload='auto'; audio.volume=state.prefs.volume
export const currentLiked=computed(()=>state.current&&!state.current.program&&state.mine.likes.includes(state.current.id))
export const activeLyric=computed(()=> { let active=-1; for(let i=0;i<state.lyrics.length;i++){if(state.lyrics[i].time<=state.progress+0.05)active=i;else break}return active })
export function toast(message,kind='info') { state.toastKind=kind;state.toast=message; clearTimeout(toastTimer);toastTimer=setTimeout(()=>state.toast='',4200) }
export async function call(method,args={}) {
  if(!window.cloud)throw new Error('请在云伴桌面客户端中打开')
  const result=await window.cloud.call(method,args)
  if(!result.ok){ if(result.code===301&&state.profile){state.profile=null;accountEpoch++;resetAccount();toast('登录已过期，请重新扫码')}throw Object.assign(new Error(result.message),{code:result.code}) }
  return result.data
}
export function guard(fn) { return async(...args)=> {try{return await fn(...args)}catch(e){toast(e.message,'error')}} }
export function navigate(page) { if(state.page!==page){historyStack.push(state.page);state.page=page} state.queueOpen=false }
export function back() { state.page=historyStack.pop()||'discover';state.queueOpen=false }
export function showPlayer() { state.previousPage=state.page; navigate('player') }
export async function setPreference(key,value) {
  const result=await call('preferences',{[key]:value}); Object.assign(state.prefs,result)
  if(key==='volume')audio.volume=value
}
let lyricsInitialized=false
export async function toggleDesktopLyrics() {
  if(state.desktopLyricsBusy)return
  state.desktopLyricsBusy=true
  try {const result=await window.cloud.desktopLyrics(!state.desktopLyrics);if(!result.ok)throw new Error(result.message);state.desktopLyrics=result.data.enabled}
  finally{state.desktopLyricsBusy=false}
}
function initDesktopLyrics() {
  if(lyricsInitialized)return
  lyricsInitialized=true
  window.cloud.onLyricsState(value=>state.desktopLyrics=value.enabled)
  window.cloud.onLyricsError(message=>toast(message,'error'))
  window.cloud.desktopLyrics().then(result=>{if(result.ok)state.desktopLyrics=result.data.enabled}).catch(()=>{})
  const snapshot=computed(()=>{
    const line=state.lyrics[activeLyric.value]
    return {song:(state.current?.name||'').slice(0,300),artist:(state.current?.artists.map(a=>a.name).join(' / ')||'').slice(0,500),
      line:(line?.text||'').slice(0,1200),translation:(line?.translation||'').slice(0,1200),next:(state.lyrics[activeLyric.value+1]?.text||'').slice(0,1200),
      status:!state.current?'idle':state.error?'error':state.lyricLoading?'loading':!state.lyrics.length?'empty':activeLyric.value<0?'waiting':'ready',playing:state.playing,font:state.prefs.font}
  })
  watch(snapshot,value=>window.cloud.lyricsSnapshot(value),{immediate:true})
}
export async function init() {
  initDesktopLyrics()
  try{const session=await call('session');state.profile=session.profile;state.storage=session.credentialStorage;Object.assign(state.prefs,session.preferences);audio.volume=state.prefs.volume}catch(e){toast(e.message)}
  await Promise.allSettled([loadDiscover(),state.profile?loadMine():Promise.resolve()])
  if(state.profile)await restoreRoom().catch(()=>{})
}
async function discoverSection(key,method,args,convert) {
  const version=(discoverVersions.get(key)||0)+1,account=accountEpoch
  discoverVersions.set(key,version);discoverPending++;state.discover.loading=true
  try {
    const r=await call(method,args)
    if(discoverVersions.get(key)!==version||account!==accountEpoch)return false
    convert(r);delete state.discover.errors[key];state.discover.updatedAt=Date.now();return true
  }catch(e){if(discoverVersions.get(key)===version&&account===accountEpoch)state.discover.errors[key]=e.message;return false}
  finally{discoverPending--;state.discover.loading=discoverPending>0}
}
async function recommendations() {
  return discoverSection('playlists',state.profile?'recommend_resource':'personalized',state.profile?{}:{limit:60},r=>{
    state.discover.pool=(r.recommend||r.result||[]).map(p=>playlist(p))
    state.discover.playlists=state.discover.pool.slice(0,12);state.discover.category='全部';state.discover.offset=0
  })
}
export async function loadDiscover() {
  state.discover.notice=''
  await Promise.allSettled([
    recommendations(),
    discoverSection('charts','toplist_detail',{},r=>state.discover.charts=(r.list||[]).slice(0,12).map(p=>({...playlist(p),preview:p.tracks||[]}))),
    discoverSection('albums','album_newest',{},r=>state.discover.albums=(r.albums||[]).slice(0,12).map(p=>({...playlist(p,'album'),creator:p.artist?.name||p.artists?.map(a=>a.name).join(' / ')||''}))),
    discoverSection('radios','dj_recommend',{},r=>state.discover.radios=(r.djRadios||[]).slice(0,12).map(p=>playlist(p,'radio'))),
    discoverSection('programs','program_recommend',{limit:12},r=>state.discover.programs=(r.programs||[]).map(program))
  ])
}
export async function loadCategory(cat,more=false) {
  const offset=more&&cat===state.discover.category?state.discover.offset+12:0
  const before=state.discover.playlists.map(p=>p.id).join(',')
  const ok=await discoverSection('playlists','top_playlist',{cat,limit:12,offset},r=>{
    const rows=(r.playlists||[]).map(p=>playlist(p))
    if(rows.length){state.discover.playlists=rows;state.discover.category=cat;state.discover.offset=offset}
  })
  if(more){state.discover.notice=ok?(before===state.discover.playlists.map(p=>p.id).join(',')?'这个分类暂无更多歌单':'已换一批歌单'):'换一批失败，保留当前歌单';toast(state.discover.notice,ok?'info':'error')}
}
export async function refreshDiscover(tab=state.tab,cat=state.discover.category) {
  if(state.discover.loading)return
  const key=tab==='排行榜'?'charts':tab==='新碟'?'albums':tab==='听书 · 播客'?'radios':'playlists'
  const before=JSON.stringify(state.discover[key])
  if(tab==='歌单'){await loadCategory(cat,true);return}
  if(tab==='推荐') {
    if(state.discover.pool.length>12){state.discover.playlists=recommendationBatch(state.discover.pool,state.discover.playlists);delete state.discover.errors.playlists}
    else await recommendations()
  }else if(tab==='排行榜')await discoverSection('charts','toplist_detail',{},r=>state.discover.charts=(r.list||[]).slice(0,12).map(p=>({...playlist(p),preview:p.tracks||[]})))
  else if(tab==='新碟')await discoverSection('albums','album_newest',{},r=>state.discover.albums=(r.albums||[]).slice(0,12).map(p=>({...playlist(p,'album'),creator:p.artist?.name||p.artists?.map(a=>a.name).join(' / ')||''})))
  else await Promise.all([
    discoverSection('radios','dj_recommend',{},r=>state.discover.radios=(r.djRadios||[]).slice(0,12).map(p=>playlist(p,'radio'))),
    discoverSection('programs','program_recommend',{limit:12},r=>state.discover.programs=(r.programs||[]).map(program))
  ])
  state.discover.notice=state.discover.errors[key]?'更新失败，保留当前内容':before===JSON.stringify(state.discover[key])?(tab==='推荐'?'今日推荐暂无新歌单':'已更新，网易云返回的内容未变化'):(tab==='推荐'?'已换一批推荐歌单':'内容已更新')
  toast(state.discover.notice,state.discover.errors[key]?'error':'info')
}
function resetAccount() {
  state.mine={playlists:[],likes:[],likedTracks:[],loading:false,error:'',loaded:0,more:false,paging:false}
  stopRoom();state.togetherStats={peerId:'',peerName:'',totalSeconds:null,loading:false,error:'',updatedAt:0,attemptedAt:0};if(state.mode==='heart')state.mode='sequence'
}
export async function loadMine() {
  if(!state.profile)return
  const epoch=accountEpoch,uid=String(state.profile.userId)
  state.mine.loading=true;state.mine.error=''
  const results=await Promise.allSettled([call('user_playlist',{uid,limit:1000}),call('likelist',{uid})])
  if(epoch!==accountEpoch)return
  if(results[0].status==='fulfilled'){state.mine.playlists=(results[0].value.playlist||[]).map(p=>playlist(p));state.mine.more=!!results[0].value.more}
  if(results[1].status==='fulfilled')state.mine.likes=(results[1].value.ids||[]).map(String)
  const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason.message)
  state.mine.error=errors.join('；')
  if(state.mine.likes.length) {
    try{const r=await call('song_detail',{ids:state.mine.likes.slice(0,100).join(',')});if(epoch===accountEpoch)state.mine.likedTracks=(r.songs||[]).map(track)}catch(e){if(epoch===accountEpoch)state.mine.error=e.message}
  }else state.mine.likedTracks=[]
  if(epoch===accountEpoch){state.mine.loaded=Date.now();state.mine.loading=false}
}
export async function moreMine() {
  const mine=state.mine
  if(!state.profile||mine.loading||mine.paging||!mine.more)return
  const epoch=accountEpoch,uid=String(state.profile.userId);mine.paging=true
  try {
    const r=await call('user_playlist',{uid,limit:1000,offset:mine.playlists.length})
    if(epoch!==accountEpoch||mine!==state.mine)return
    mine.playlists.push(...(r.playlist||[]).map(p=>playlist(p)));mine.more=!!r.more
  }finally{mine.paging=false}
}
export async function like(t=state.current) {
  if(!state.profile){await login();return}
  if(!t||t.program||likeBusy.has(t.id))return
  const epoch=accountEpoch,liked=state.mine.likes.includes(t.id)
  likeBusy.add(t.id)
  try {
    await call('like',{id:t.id,like:!liked})
    if(epoch!==accountEpoch)return
    state.mine.likes=liked?state.mine.likes.filter(id=>id!==t.id):[t.id,...state.mine.likes]
    state.mine.likedTracks=liked?state.mine.likedTracks.filter(x=>x.id!==t.id):[t,...state.mine.likedTracks.filter(x=>x.id!==t.id)]
    toast(liked?'已从账号的喜欢中移除':'已同步到网易云「我喜欢的音乐」')
  } finally{likeBusy.delete(t.id)}
}
export async function logout() {
  await call('logout');accountEpoch++;state.profile=null;resetAccount();state.modal='';stopLogin();toast('已退出账号');await loadDiscover()
}
function stopLogin(){++loginEpoch;clearTimeout(loginTimer);state.login.key='';state.login.busy=false}
export async function login() {
  state.modal='login';stopLogin();const generation=loginEpoch;state.login={key:'',image:'',message:'正在生成二维码…',busy:true}
  try {
    const qr=await call('qr');if(state.modal!=='login'||generation!==loginEpoch)return
    Object.assign(state.login,{...qr,message:'打开网易云音乐，扫一扫',busy:false})
    const poll=async()=> {
      const key=state.login.key;if(!key||state.modal!=='login')return
      try {
        const r=await call('qrcheck',{key})
        if(key!==state.login.key||state.modal!=='login')return
        if(r.code===803){accountEpoch++;state.profile=r.profile;stopLogin();state.modal='';toast(`欢迎回来，${r.profile.nickname}`);await Promise.allSettled([loadMine(),loadDiscover(),restoreRoom()]);return}
        if(r.code===800){state.login.message='二维码已过期，请刷新';state.login.key='';return}
        state.login.message=r.code===802?'扫描成功，请在手机上确认':'打开网易云音乐，扫一扫'
      } catch(e){if(key===state.login.key)state.login.message=e.message}
      if(key===state.login.key&&state.modal==='login')loginTimer=setTimeout(poll,1800)
    };loginTimer=setTimeout(poll,1600)
  }catch(e){if(generation===loginEpoch){state.login.message=e.message;state.login.busy=false}}
}
export function closeModal(){state.modal='';stopLogin()}
export async function openCard(p) {
  const epoch=++detailEpoch;state.detail.paging=false
  Object.assign(state.detail,{title:p.name,cover:p.cover,description:p.description,creator:p.creator,tracks:[],id:p.id,kind:p.kind,total:p.count||0,loading:true,error:'',more:false})
  navigate('detail')
  try {
    let rows=[]
    if(p.kind==='album'){const r=await call('album',{id:p.id});rows=(r.songs||[]).map(track);if(epoch!==detailEpoch)return;state.detail.description=r.album?.description||p.description}
    else if(p.kind==='radio') {
      const [meta,r]=await Promise.all([call('dj_detail',{rid:p.id}),call('dj_program',{rid:p.id,limit:100})]);if(epoch!==detailEpoch)return
      rows=(r.programs||[]).map(program);state.detail.total=meta.data?.programCount||r.count||rows.length;state.detail.more=!!r.more;state.detail.description=meta.data?.desc||''
    }else {
      const [meta,r]=await Promise.all([call('playlist_detail',{id:p.id}),call('playlist_track_all',{id:p.id,limit:200})]);if(epoch!==detailEpoch)return
      rows=(r.songs||[]).map(track);state.detail.total=meta.playlist?.trackCount||rows.length;state.detail.more=rows.length<state.detail.total;state.detail.description=meta.playlist?.description||p.description
    }
    if(epoch===detailEpoch)state.detail.tracks=rows
  }catch(e){if(epoch===detailEpoch)state.detail.error=e.message}finally{if(epoch===detailEpoch)state.detail.loading=false}
}
export async function moreDetail() {
  const epoch=detailEpoch,d=state.detail,account=accountEpoch
  if(d.loading||d.paging||!d.more)return
  d.paging=true
  try {
    const r=await call(d.kind==='radio'?'dj_program':'playlist_track_all',d.kind==='radio'?{rid:d.id,limit:200,offset:d.tracks.length}:{id:d.id,limit:200,offset:d.tracks.length})
    if(epoch!==detailEpoch||account!==accountEpoch)return
    d.tracks.push(...(d.kind==='radio'?(r.programs||[]).map(program):(r.songs||[]).map(track)))
    d.more=d.kind==='radio'?!!r.more:d.tracks.length<d.total
  }finally{if(epoch===detailEpoch)d.paging=false}
}
export function showLikes() {
  if(!state.profile)return login()
  const liked=state.mine.playlists.find(p=>p.owner===String(state.profile?.userId)&&(/喜欢/.test(p.name))) || state.mine.playlists.find(p=>p.owner===String(state.profile?.userId))
  if(liked)return openCard(liked)
  ++detailEpoch;state.detail.paging=false;Object.assign(state.detail,{title:'我喜欢的音乐',cover:'',description:'同步自网易云账号',creator:state.profile?.nickname||'',tracks:[...state.mine.likedTracks],id:'0',kind:'likes',total:state.mine.likes.length,loading:false,error:state.mine.error,more:state.mine.likedTracks.length<state.mine.likes.length});navigate('detail')
}
export async function moreLikes() {
  const d=state.detail,epoch=accountEpoch,detail=detailEpoch
  if(d.kind!=='likes'||d.loading||d.paging||!d.more)return
  const ids=state.mine.likes.slice(d.tracks.length,d.tracks.length+100)
  if(!ids.length)return
  d.paging=true
  try {
    const r=await call('song_detail',{ids:ids.join(',')})
    if(epoch!==accountEpoch||detail!==detailEpoch)return
    d.tracks.push(...(r.songs||[]).map(track));d.more=d.tracks.length<state.mine.likes.length
  }finally{if(detail===detailEpoch)d.paging=false}
}
export async function search(type=state.search.type,more=false) {
  const keywords=state.search.query.trim();if(!keywords)return
  const epoch=++searchEpoch;state.search.type=type;state.search.loading=true;state.search.error='';navigate('search')
  if(!more){state.search.offset=0;state.search.tracks=[];state.search.cards=[]}
  try {
    const r=await call('cloudsearch',{keywords,type,limit:40,offset:state.search.offset});if(epoch!==searchEpoch)return
    const result=r.result||{};let cards=[]
    if(type===1){state.search.tracks.push(...(result.songs||[]).map(track));state.search.total=result.songCount||0}
    else {
      const raw=type===1000?result.playlists:type===10?result.albums:type===1009?result.djRadios:result.artists
      const kind=type===1000?'playlist':type===10?'album':type===1009?'radio':'artist'
      cards=(raw||[]).map(p=>playlist(p,kind));state.search.cards.push(...cards)
      state.search.total=result.playlistCount||result.albumCount||result.djRadiosCount||result.artistCount||0
    }
    state.search.offset+=40;state.search.more=(type===1?state.search.tracks.length:state.search.cards.length)<state.search.total
  }catch(e){if(epoch===searchEpoch)state.search.error=e.message}finally{if(epoch===searchEpoch)state.search.loading=false}
}
export async function openArtist(p) {
  const epoch=++detailEpoch;state.detail.paging=false;Object.assign(state.detail,{title:p.name,cover:p.cover,tracks:[],kind:'artist',id:p.id,total:0,description:'热门歌曲',creator:'',loading:true,error:'',more:false});navigate('detail')
  try{const r=await call('artists',{id:p.id});if(epoch===detailEpoch){state.detail.tracks=(r.hotSongs||[]).map(track);state.detail.total=state.detail.tracks.length}}
  catch(e){if(epoch===detailEpoch)state.detail.error=e.message}finally{if(epoch===detailEpoch)state.detail.loading=false}
}
export async function daily() {
  if(!state.profile)return login()
  const r=await call('recommend_songs');const rows=(r.data?.dailySongs||r.recommend||[]).map(track)
  if(!rows.length)throw new Error('今天暂时没有推荐歌曲')
  ++detailEpoch;state.detail.paging=false;Object.assign(state.detail,{title:'每日推荐',cover:rows[0].album.cover,tracks:rows,kind:'daily',id:'0',total:rows.length,description:'每天更新，只为你的听歌口味。',creator:state.profile.nickname,loading:false,error:'',more:false});navigate('detail')
}
function scrobble() {
  if(state.profile&&state.current&&!state.current.program&&listenTime>=30)call('scrobble',{id:state.current.id,sourceid:state.source.id,time:Math.floor(listenTime)}).catch(()=>{})
  listenTime=0;lastTime=0
}
async function loadTrack(t,{remote=false,progress=0,playing=true}={}) {
  const epoch=++audioEpoch,roomGeneration=roomEpoch,former=state.current?.id||'-1'
  scrobble();audio.pause();audio.removeAttribute('src');audio.load()
  desiredPlaying=playing;state.current=t;state.progress=progress;state.duration=t.duration;state.lyrics=[];state.error='';state.loading=true;state.playing=false;state.lyricLoading=true
  const lyrics=call('lyric',{id:t.id}).then(r=>{if(epoch===audioEpoch)state.lyrics=parseLyrics(r.lrc?.lyric,r.tlyric?.lyric)}).catch(()=>{}).finally(()=>{if(epoch===audioEpoch)state.lyricLoading=false})
  try {
    const r=await call('song_url_v1',{id:t.id,level:state.prefs.quality})
    if(epoch!==audioEpoch || (remote&&roomGeneration!==roomEpoch))return
    const stream=r.data?.[0]
    if(!stream?.url)throw new Error('这首歌暂不可播放，请检查账号权益或版权状态')
    if(stream.freeTrialInfo && stream.freeTrialInfo!=='null')toast('当前账号只能试听此曲')
    const u=new URL(stream.url);if(!['http:','https:'].includes(u.protocol))throw new Error('音源地址无效')
    audio.src=u.href
    if(progress)audio.addEventListener('loadedmetadata',()=>{if(epoch===audioEpoch)audio.currentTime=Math.min(progress,audio.duration||progress)},{once:true})
    if(desiredPlaying)await audio.play()
    if(epoch!==audioEpoch)return
    state.loading=false
    if(!remote&&state.room.id&&roomGeneration===roomEpoch)await sendCommand('GOTO',{formerSongId:former})
    updateMedia()
  }catch(e){if(epoch===audioEpoch){state.loading=false;state.playing=false;desiredPlaying=false;state.error=e.message;throw e}}
  void lyrics
}
export async function play(t,rows=null,source=null) {
  if(remoteApplying)throw new Error('正在同步听友的播放，请稍候')
  if(state.room.id&&!state.room.connected)throw new Error('一起听正在重连，请稍候')
  if(state.current)state.history.push(state.current)
  if(state.history.length>100)state.history.shift()
  if(t.program&&state.room.id)throw new Error('一起听房间支持歌曲；声音节目请结束房间后播放')
  if(rows){state.queue=[...rows];if(source)state.source={id:source.id||'0',title:source.title||'',kind:source.id===state.detail.id?state.detail.kind:'playlist',total:source.id===state.detail.id?state.detail.total:rows.length};if(state.mode==='heart')state.mode='sequence';if(state.room.id)await syncQueue()}
  if(!state.queue.some(x=>x.id===t.id))state.queue.push(t)
  await loadTrack(t)
}
export async function toggle() {
  if(remoteApplying)throw new Error('正在同步听友的播放，请稍候')
  if(!state.current)return toast('先选一首喜欢的音乐')
  if(state.room.id&&!state.room.connected&&!(state.loading?desiredPlaying:state.playing))throw new Error('一起听正在重连，请稍候')
  desiredPlaying=state.loading?!desiredPlaying:!state.playing
  if(state.loading){if(!desiredPlaying)audio.pause();return}
  if(desiredPlaying){if(state.error)return loadTrack(state.current);await audio.play()}else audio.pause()
  await sendCommand(desiredPlaying?'PLAY':'PAUSE')
  if(state.room.id&&!state.room.connected)toast('已暂停，连接恢复后同步给听友')
}
export async function seek(seconds,remote=false) {
  if(!state.current||state.loading||!Number.isFinite(audio.duration))return
  if(!remote&&state.room.id&&!state.room.connected)throw new Error('一起听正在重连，请稍候')
  audio.currentTime=Math.max(0,Math.min(seconds,audio.duration));state.progress=audio.currentTime;lastTime=audio.currentTime
  if(!remote)await sendCommand('PROGRESS')
}
export async function heart(start=true) {
  if(!state.profile)return login()
  if(state.room.id||state.room.busy)throw new Error('一起听与心动模式不能同时开启，请先结束一起听')
  const p=state.mine.playlists.find(p=>p.owner===String(state.profile.userId)&&/喜欢/.test(p.name)) || state.mine.playlists.find(p=>p.owner===String(state.profile.userId))
  const seed=state.current&&state.mine.likes.includes(state.current.id)?state.current.id:state.mine.likes[0]
  if(!p||!seed)throw new Error('先同步「我的」并喜欢一些音乐，再开启心动模式')
  const epoch=accountEpoch,generation=roomEpoch,r=await call('playmode_intelligence_list',{id:seed,pid:p.id,sid:seed,count:20})
  if(epoch!==accountEpoch||generation!==roomEpoch||state.room.id||state.room.busy)return
  const rows=(r.data||[]).filter(x=>x.songInfo).map(x=>({...track(x.songInfo),recommended:!x.recommended?false:true}))
  if(!rows.length)throw new Error('网易云暂时没有返回心动推荐，请稍后再试')
  state.mode='heart';state.source={id:p.id,title:'心动推荐'};state.queue=rows
  if(start)await loadTrack(rows[0]);toast('心动模式 · 喜欢的歌与新推荐交替相遇')
}
export async function setMode(mode) {
  if(mode==='heart'){await heart();return}
  if(state.room.id&&mode==='shuffle')throw new Error('一起听使用共同队列，随机播放请在单人模式开启')
  state.mode=mode
}
export async function next(ended=false) {
  if(remoteApplying)throw new Error('正在同步听友的播放，请稍候')
  if(state.room.id&&!state.room.connected)throw new Error('一起听正在重连，请稍候')
  if(!state.current)return
  if(ended&&state.mode==='repeat'){audio.currentTime=0;await audio.play();await sendCommand('GOTO');return}
  let target
  if(state.mode==='shuffle'){const id=shuffle.next(state.queue,state.current.id);target=state.queue.find(t=>t.id===id)}
  else {const index=state.queue.findIndex(t=>t.id===state.current.id);target=state.queue[index+1]}
  if(!target&&['playlist','radio'].includes(state.source.kind)&&state.queue.length<state.source.total&&!state.room.id) {
    const epoch=audioEpoch,source=state.source,offset=state.queue.length
    if(queuePageRequest?.source===source&&queuePageRequest.epoch===epoch)return
    const pending={source,epoch};queuePageRequest=pending
    let r
    try {r=await call(source.kind==='radio'?'dj_program':'playlist_track_all',source.kind==='radio'?{rid:source.id,offset,limit:200}:{id:source.id,offset,limit:200})}
    finally{if(queuePageRequest===pending)queuePageRequest=null}
    if(epoch!==audioEpoch||source!==state.source||offset!==state.queue.length)return
    const rows=source.kind==='radio'?(r.programs||[]).map(program):(r.songs||[]).map(track)
    state.queue.push(...rows);target=rows[0]
  }
  if(!target&&state.mode==='heart'){await heart();return}
  if(!target&&state.mode==='sequence'&&state.profile&&!state.current.program&&!state.room.id) {
    const epoch=audioEpoch
    const r=await call('recommend_songs');if(epoch!==audioEpoch)return
    const rows=(r.data?.dailySongs||[]).map(track).filter(t=>t.id!==state.current.id)
    if(rows.length){state.queue.push(...rows.filter(t=>!state.queue.some(x=>x.id===t.id)));target=rows[0]}
  }
  target ||= state.queue[0]
  if(target)await play(target)
}
export async function previous() {
  if(remoteApplying)throw new Error('正在同步听友的播放，请稍候')
  if(state.room.id&&!state.room.connected)throw new Error('一起听正在重连，请稍候')
  if(state.progress>3){await seek(0);return}
  const old=state.history.pop();const index=state.queue.findIndex(t=>t.id===state.current?.id)
  const t=old || state.queue[(index-1+state.queue.length)%state.queue.length]
  if(t)await loadTrack(t)
}
export function removeQueue(id) { if(state.room.id)return toast('共同列表通过选歌替换，避免双方队列分叉');state.queue=state.queue.filter(t=>t.id!==id) }
export function setSleep(minutes) {
  clearTimeout(sleepTimer);state.sleep=minutes
  if(minutes)sleepTimer=setTimeout(()=>{desiredPlaying=false;audio.pause();state.sleep=0;sendCommand('PAUSE').catch(()=>{});toast('定时结束，晚安。')},minutes*60000)
}
function updateMedia() {
  if(!('mediaSession' in navigator)||!state.current)return
  navigator.mediaSession.metadata=new MediaMetadata({title:state.current.name,artist:state.current.artists.map(a=>a.name).join(' / '),album:state.current.album.name,artwork:state.current.album.cover?[{src:state.current.album.cover}]:[]})
}
audio.addEventListener('play',()=>{state.playing=true;desiredPlaying=true;if(navigator.mediaSession)navigator.mediaSession.playbackState='playing'})
audio.addEventListener('pause',()=>{state.playing=false;if(navigator.mediaSession)navigator.mediaSession.playbackState='paused'})
audio.addEventListener('timeupdate',()=> {const delta=audio.currentTime-lastTime;if(delta>0&&delta<3)listenTime+=delta;lastTime=audio.currentTime;state.progress=audio.currentTime;if(Number.isFinite(audio.duration))state.duration=audio.duration})
audio.addEventListener('ended',()=>{guard(next)(true)})
audio.addEventListener('error',()=>{if(audio.getAttribute('src')){state.error='音源加载失败，可点击播放重试';state.loading=false;state.playing=false}})
if('mediaSession' in navigator)for(const [action,handler]of Object.entries({play:()=>{if(!state.playing)guard(toggle)()},pause:()=>{if(state.playing)guard(toggle)()},nexttrack:guard(next),previoustrack:guard(previous),seekto:e=>guard(seek)(e.seekTime)}))try{navigator.mediaSession.setActionHandler(action,handler)}catch{}

function stopRoom() { pendingRoomPause=null;++statsEpoch;statsBusy=false;state.togetherStats.loading=false;const interrupted=state.loading;++roomEpoch;++audioEpoch;state.loading=false;if(interrupted){desiredPlaying=false;audio.pause();state.error='播放已中断，点击播放继续这首歌'}clearTimeout(roomTimer);pollBusy=false;state.room={id:'',members:[],creator:'',connected:false,busy:false,error:'',invite:'',seq:0,checked:null};roomCommands.reset();remoteApplying=false;portraitRequests.clear();++roomRevision }
export const roomParticipants=computed(()=>state.room.id?roomMembers(state.room.members.map(m=>({userId:m.id,nickname:m.name,avatarUrl:m.avatar})),state.profile,state.room.members):state.profile?[{id:String(state.profile.userId),name:state.profile.nickname,avatar:state.profile.avatarUrl}]:[])
export const roomStatus=computed(()=>!state.room.id?'单人播放':!state.room.connected?state.room.error||'正在重连':roomParticipants.value.length<2?'等待听友加入':'双人同听中')
export const togetherTotalLabel=computed(()=>formatTogetherTotal(state.togetherStats.totalSeconds))
export const togetherTotalCompact=computed(()=>formatTogetherTotal(state.togetherStats.totalSeconds,true))
export async function refreshTogetherStats(force=false) {
  if(!state.profile||statsBusy)return
  const peer=state.room.id?roomParticipants.value.find(m=>m.id!==String(state.profile.userId)):state.togetherStats.peerId?{id:state.togetherStats.peerId,name:state.togetherStats.peerName}:null
  if(!peer)return
  if(peer.id!==state.togetherStats.peerId){++statsEpoch;state.togetherStats={peerId:peer.id,peerName:peer.name,totalSeconds:null,loading:false,error:'',updatedAt:0,attemptedAt:0}}
  if(!force&&Date.now()-state.togetherStats.attemptedAt<30000)return
  const generation=statsEpoch,account=accountEpoch,room=state.room.id
  statsBusy=true;state.togetherStats.loading=true;state.togetherStats.attemptedAt=Date.now()
  try {
    const r=await call('listentogether_statistics',{...(room?{roomId:room}:{}),userId:peer.id})
    if(generation!==statsEpoch||account!==accountEpoch||room!==state.room.id||(room&&roomParticipants.value.find(m=>m.id!==String(state.profile?.userId))?.id!==peer.id))return
    const total=togetherTotal(r.data)
    if(total===null)throw new Error('网易云暂未返回累计时长')
    state.togetherStats.totalSeconds=total;state.togetherStats.peerName=peer.name;state.togetherStats.error='';state.togetherStats.updatedAt=Date.now()
  }catch(e){if(generation===statsEpoch&&account===accountEpoch)state.togetherStats.error=e.message}
  finally{if(generation===statsEpoch){statsBusy=false;state.togetherStats.loading=false}}
}
function updateRoomMembers(users=[]) {
  state.room.members=roomMembers(users,state.profile,state.room.members)
  const peer=state.room.members.find(m=>m.id!==String(state.profile?.userId))
  if(peer&&peer.id!==state.togetherStats.peerId){++statsEpoch;statsBusy=false;state.togetherStats={peerId:peer.id,peerName:peer.name,totalSeconds:null,loading:false,error:'',updatedAt:0,attemptedAt:0}}
  void refreshTogetherStats()
  const generation=roomEpoch,account=accountEpoch
  for(const m of state.room.members.filter(m=>!m.avatar)) {
    const key=generation+':'+m.id
    if(portraitRequests.has(key))continue
    portraitRequests.add(key)
    call('user_detail',{uid:m.id}).then(r=>{
      if(generation!==roomEpoch||account!==accountEpoch||!state.room.id)return
      const member=state.room.members.find(x=>x.id===m.id)
      if(member&&r.profile)Object.assign(member,roomMembers([{userId:m.id,userInfo:r.profile}],null,[member])[0])
    }).catch(()=>{})
  }
}
function setRoom(info) {
  if(!info?.roomId)throw new Error('房间信息不完整，请重试')
  state.room.id=String(info.roomId);state.room.creator=String(info.creatorId||info.inviterId||0)
  updateRoomMembers(info.roomUsers)
  state.room.connected=true;state.room.error='';state.mode='sequence';state.queue=state.queue.map(t=>({...t,recommended:false}));roomCommands.reset()
}
export async function restoreRoom() {
  const generation=roomEpoch,r=await call('listentogether_status')
  if(generation!==roomEpoch)return
  if(r.data?.inRoom&&r.data.roomInfo){setRoom(r.data.roomInfo);startPolling()}
}
export async function checkInvite() {
  const parsed=invitation(state.room.invite),r=await call('listentogether_room_check',{roomId:parsed.roomId})
  state.room.checked={...parsed,valid:r.data?.roomExist !== false,info:r.data}
  if(!state.room.checked.valid)throw new Error('这个房间已结束，请重新邀请')
}
export async function connectRoom(create=false) {
  if(!state.profile)return login()
  if(state.room.id)throw new Error('你已经在一起听房间中')
  if(create&&state.current?.program)throw new Error('先选择一首歌曲，再创建一起听房间')
  state.room.busy=true
  const generation=roomEpoch
  try {
    const r=await call('listentogether_status');if(generation!==roomEpoch)return
    if(r.data?.inRoom){setRoom(r.data.roomInfo);startPolling();state.modal='';toast('已恢复手机上的一起听房间');return}
    const args=create?{}:invitation(state.room.invite)
    const result=await call(create?'listentogether_room_create':'listentogether_accept',args)
    if(generation!==roomEpoch)return
    let info=result.data?.roomInfo
    if(!info){const status=await call('listentogether_status');if(generation!==roomEpoch)return;info=status.data?.roomInfo}
    if(!create&&info?.roomId!==args.roomId)throw new Error('加入结果尚未确认，请恢复房间状态')
    setRoom(info);if(!create)state.room.creator=args.inviterId
    if(create&&state.queue.length){await syncQueue();if(state.current)await sendCommand('GOTO')}
    startPolling();state.modal='';showPlayer();toast(create?'房间已创建，可复制邀请链接':'已加入一起听')
  }finally{state.room.busy=false}
}
export async function endRoom() {
  if(!state.room.id)return
  const id=state.room.id;state.room.busy=true
  try{await roomWrite(()=>call('listentogether_end',{roomId:id}));stopRoom();void refreshTogetherStats(true);state.modal='';toast('已结束一起听，回到单人播放')}
  finally{state.room.busy=false}
}
export async function copyInvite() {
  await call('copyinvite',{roomId:state.room.id,songId:state.current?.id||'0'});toast('邀请链接已复制，可发给听友')
}
function roomWrite(fn) { const generation=roomEpoch;const run=()=>generation===roomEpoch?fn():undefined;const promise=roomTail.then(run,run);roomTail=promise.catch(()=>{});return promise }
async function syncQueue() {
  if(!state.room.id||!state.queue.length)return
  ++roomRevision
  const args={roomId:state.room.id,commandType:'REPLACE',version:++state.room.seq,randomList:state.queue.map(t=>t.id).join(','),displayList:state.queue.map(t=>t.id).join(',')}
  await roomWrite(()=>call('listentogether_sync_list_command',args))
}
async function sendCommand(commandType,extra={}) {
  if(!state.room.id||remoteApplying||!state.current)return
  ++roomRevision
  const args={roomId:state.room.id,commandType,playStatus:desiredPlaying?'PLAY':'PAUSE',targetSongId:state.current.id,formerSongId:state.current.id,progress:Math.round(state.progress*1000),clientSeq:++state.room.seq,...extra}
  const local=roomCommands.begin(args,state.profile?.userId)
  if(!state.room.connected&&commandType==='PAUSE'){pendingRoomPause={args,local};++roomRevision;return}
  try {await roomWrite(()=>call('listentogether_play_command',args));roomCommands.finish(local)}
  catch(error){roomCommands.fail(local);throw error}
  finally{++roomRevision}
}
function startPolling() {clearTimeout(roomTimer);roomTimer=setTimeout(pollRoom,100)}
async function pollRoom() {
  if(!state.room.id||pollBusy)return
  const generation=roomEpoch,id=state.room.id,revision=roomRevision;pollBusy=true
  try {
    const [status,r]=await Promise.all([call('listentogether_status'),call('listentogether_sync_playlist_get',{roomId:id})]);if(generation!==roomEpoch)return
    if(!status.data?.inRoom||String(status.data.roomInfo?.roomId)!==id){stopRoom();toast('一起听房间已结束');return}
    const info=status.data.roomInfo;updateRoomMembers(info.roomUsers);state.room.connected=true;state.room.error=''
    if(pendingRoomPause){
      const pending=pendingRoomPause
      await roomWrite(()=>call('listentogether_play_command',pending.args))
      if(generation===roomEpoch&&pendingRoomPause===pending){roomCommands.finish(pending.local);pendingRoomPause=null;++roomRevision}
      return
    }
    if(revision!==roomRevision)return
    const data=r.data||{},command=data.playCommand,rawQueue=data.playlist?.displayList
    const queue=Array.isArray(rawQueue)?rawQueue:Array.isArray(rawQueue?.result)?rawQueue.result:[]
    const ids=queue.map(x=>String(typeof x==='object'?x.songId||x.id:x)).filter(x=>/^\d+$/.test(x))
    if(ids.length&&ids.join(',')!==state.queue.map(t=>t.id).join(',')) {
      const details=await call('song_detail',{ids:ids.join(',')});if(generation!==roomEpoch||revision!==roomRevision)return
      const mapped=(details.songs||[]).map(track);state.queue=ids.map(id=>mapped.find(t=>t.id===id)).filter(Boolean);state.source={id:'0',title:'共同列表'}
    }
    if(command?.targetSongId&&/^\d+$/.test(String(command.targetSongId))) {
      const clientSeq=Number(command.clientSeq)
      if(Number.isSafeInteger(clientSeq)&&clientSeq>=0&&clientSeq<Number.MAX_SAFE_INTEGER)state.room.seq=Math.max(state.room.seq,clientSeq)
      const progress=Number(command.progress||0)/1000,playing=command.playStatus==='PLAY'
      if(roomCommands.accept(command)) {
        remoteApplying=true
        try {
          if(state.current?.id!==String(command.targetSongId)) {
            let t=state.queue.find(t=>t.id===String(command.targetSongId))
            if(!t){const detail=await call('song_detail',{ids:String(command.targetSongId)});if(generation!==roomEpoch||revision!==roomRevision)return;t=track(detail.songs[0])}
            await loadTrack(t,{remote:true,progress,playing})
          } else if(!state.loading) {
            if(Math.abs(audio.currentTime-progress)>2.5)await seek(progress,true)
            desiredPlaying=playing;if(playing&&!state.playing)await audio.play();if(!playing&&state.playing)audio.pause()
          }
        }finally{remoteApplying=false}
      }
    }
    if(state.current&&Date.now()-(state.room.heartbeat||0)>8000) {
      state.room.heartbeat=Date.now();await call('listentogether_heatbeat',{roomId:id,songId:state.current.id,playStatus:state.playing?'PLAY':'PAUSE',progress:Math.round(state.progress*1000)})
    }
  }catch(e){if(generation===roomEpoch){state.room.connected=false;state.room.error='连接中断，正在重连'}}
  finally{if(generation===roomEpoch){pollBusy=false;roomTimer=setTimeout(pollRoom,state.room.connected?2000:4500)}}
}
