export const MODES = [{id:'sequence',label:'自动联播'},{id:'repeat',label:'单曲循环'},{id:'shuffle',label:'随机播放'},{id:'heart',label:'心动模式'}]
export function track(raw) {
  const album = raw.al || raw.album || {}
  return { id:String(raw.id), name:raw.name || '未命名歌曲', artists:(raw.ar || raw.artists || []).map(x=>({id:String(x.id),name:x.name})), album:{id:String(album.id || 0),name:album.name || '',cover:cover(album.picUrl || raw.coverUrl)}, duration:Number(raw.dt || raw.duration || 0)/1000, fee:raw.fee||0, program:raw.program||null }
}
export function cover(url) {
  try { const u=new URL(url); if(u.protocol==='http:'&&u.hostname!=='127.0.0.1')u.protocol='https:'; return ['https:','http:'].includes(u.protocol)?u.href:'' }catch { return '' }
}
export function playlist(p,kind='playlist') {
  return { id:String(p.id),name:p.name || '',cover:cover(p.picUrl || p.coverImgUrl),count:p.trackCount ?? p.programCount ?? 0,plays:p.playCount || 0,description:p.description||p.copywriter||'',creator:p.creator?.nickname||p.dj?.nickname||'',owner:String(p.creator?.userId||0),kind,update:p.updateFrequency||'' }
}
export function program(p) {
  return {...track({...p.mainSong,name:p.name,coverUrl:p.coverUrl}),program:{id:String(p.id),radio:String(p.radio?.id || 0)},album:{id:'0',name:p.radio?.name||'声音节目',cover:cover(p.coverUrl)},artists:[{id:String(p.dj?.userId||0),name:p.dj?.nickname||'主播'}]}
}
export function parseLyrics(text='',translation='') {
  const parse=str=>str.split('\n').flatMap(line=> {
    const tags=[...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const words=line.replace(/\[[^\]]+\]/g,'').trim()
    return words?tags.map(m=>({time:Number(m[1])*60+Number(m[2]),text:words})):[]
  }).sort((a,b)=>a.time-b.time)
  const translated=parse(translation)
  return parse(text).map(line=>({...line,translation:translated.find(t=>Math.abs(t.time-line.time)<0.15)?.text||''}))
}
export function formatTime(n) { n=Number.isFinite(n)?Math.max(0,Math.floor(n)):0; return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}` }
export function togetherTotal(data) {
  // totalConnectionTime is the official cumulative pair time, in seconds.
  // Missing data must stay unknown; duration/currentConnectionTime are different metrics.
  const raw=data?.totalConnectionTime
  if(raw===null||raw===undefined||raw===''||typeof raw==='boolean')return null
  const n=Number(raw)
  return Number.isSafeInteger(n)&&n>=0?n:null
}
export function formatTogetherTotal(seconds,compact=false) {
  if(seconds===null)return '累计时长暂不可用'
  const minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60),rest=minutes%60
  return compact?`${hours.toLocaleString('zh-CN')}小时${String(rest).padStart(2,'0')}分`:`${hours.toLocaleString('zh-CN')} 小时 ${rest} 分钟`
}
export function count(n) { return n>=100000000?(n/100000000).toFixed(1)+'亿':n>=10000?(n/10000).toFixed(1)+'万':String(n||0) }
export function invitation(text) {
  const match=String(text).match(/https:\/\/[^\s]+/)
  const url=new URL(match?match[0]:text)
  if(url.protocol!=='https:'||!['st.music.163.com','music.163.com'].includes(url.hostname))throw new Error('请使用网易云音乐的一起听邀请链接')
  const roomId=url.searchParams.get('roomId'),inviterId=url.searchParams.get('inviterId')
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(roomId||'')||!/^\d{1,20}$/.test(inviterId||''))throw new Error('邀请链接缺少房间信息')
  return {roomId,inviterId}
}
export class Shuffle {
  constructor(random=Math.random) { this.random=random; this.bag=[]; this.signature='' }
  next(queue,current) {
    const signature=queue.map(t=>t.id).join(',')
    if(signature!==this.signature||!this.bag.length) {
      this.signature=signature;this.bag=queue.filter(t=>t.id!==current).map(t=>t.id)
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]]}
    }
    return this.bag.pop() || current
  }
}

// Room endpoints may return flat or nested profiles. Keep one normalization path.
export function roomMembers(users=[], profile=null, previous=[]) {
  const members=new Map()
  for(const raw of users) {
    const user=raw.userInfo||raw.user?.profile||raw.user||raw.profile||raw
    const id=String(raw.userId||raw.uid||user.userId||user.uid||'')
    if(!/^\d+$/.test(id))continue
    const old=previous.find(m=>m.id===id),self=String(profile?.userId)===id?profile:null
    members.set(id,{id,name:raw.nickname||user.nickname||self?.nickname||old?.name||'听友',avatar:cover(raw.avatarUrl||user.avatarUrl||self?.avatarUrl||old?.avatar||'')})
  }
  if(profile&& !members.has(String(profile.userId)))members.set(String(profile.userId),{id:String(profile.userId),name:profile.nickname||'你',avatar:cover(profile.avatarUrl)})
  return [...members.values()].sort((a,b)=>Number(b.id===String(profile?.userId))-Number(a.id===String(profile?.userId))).slice(0,2)
}
export function recommendationBatch(pool, current=[], size=12) {
  if(!pool.length)return []
  const last=pool.findIndex(p=>p.id===current.at(-1)?.id)
  const start=last>=0?(last+1)%pool.length:0
  return Array.from({length:Math.min(size,pool.length)},(_,i)=>pool[(start+i)%pool.length])
}
