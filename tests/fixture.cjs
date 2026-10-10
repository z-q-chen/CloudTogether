const http=require('node:http')
const sharp=require('sharp')
async function fixture() {
  const names=['风经过的时候','一封没有寄出的信','月亮落在窗台','沿海公路','慢慢走，别着急','雨后，去见你']
  const authors=['北岸电台','林间来信','暮色合唱','清晨乐队','河流与山','晚安邮局']
  const palette=[['#394d43','#a9b395','#e4d2b3'],['#756156','#dbb29e','#f2e5cc'],['#21343e','#88a0a0','#d9ac7d'],['#cf896e','#324a54','#eee0b7'],['#5d667b','#aeb5c2','#f0d1b1'],['#68795b','#c5bd93','#e7e3d1']]
  const images=[]
  for(let i=0;i<palette.length;i++) {
    const [a,b,c]=palette[i]
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="${a}"/><circle cx="${140+i*25}" cy="${130+i*15}" r="80" fill="${c}"/><path d="M0 360 Q150 ${140+i*12} 300 345T530 210V500H0" fill="${b}"/><path d="M0 430Q170 300 350 410T550 300V500H0" fill="${c}" opacity=".5"/><path d="M60 60h60M60 60v60M440 440h-60M440 440v-60" fill="none" stroke="${c}" opacity=".6" stroke-width="1"/><text x="45" y="460" font-family="serif" font-size="13" letter-spacing="4" fill="${c}">CLOUDTOGETHER / QA ${i+1}</text></svg>`
    images.push(await sharp(Buffer.from(svg)).png().toBuffer())
  }
  const wave=Buffer.alloc(44+24000*2*120)
  wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(24000,24);wave.writeUInt32LE(48000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(wave.length-44,40)
  for(let i=0;i<24000*120;i++)wave.writeInt16LE(Math.floor(Math.sin(i/24000*2*Math.PI*220)*500),44+i*2)
  const writes=[];let inRoom=false,liked=[101,102],failLike=false,roomOffline=false,delayTrack='',roomState={userId:8,serverSeq:1,targetSongId:'101',formerSongId:'0',commandType:'PLAY',playStatus:'PLAY',progress:0,clientSeq:1,timestamp:Date.now()},roomQueue=['101','102','103']
  let roomShape='nested',failDiscover=false,heartDelay=0,stalePauseMs=0,staleUntil=0,staleCommand=null,commandDelay=0,stripStaleMetadata=false
  const lyricOverrides=new Map(),lyricDelays=new Map()
  let totalConnectionTime=1234*3600+56*60,statsDelay=0,statsFailure=false
  let port
  const image=i=>`http://127.0.0.1:${port}/image/${i%6}`
  const song=id=>({id:Number(id),name:names[(Number(id)-101+60)%6]||'延迟歌曲',dt:120000,ar:[{id:1,name:authors[(Number(id)-101+60)%6]||'测试歌手'}],al:{id:Number(id)+2000,name:'听觉日记 · QA',picUrl:image((Number(id)-101+60)%6)}})
  const playlists=(total=12)=>Array.from({length:total},(_,i)=>({id:700+i,name:['给午后的耳朵，一杯温柔','把夜晚听成一首诗','山与海之间的来信','开窗，听见好天气','在城市里，慢慢散步','轻轻翻开这一页'][i%6],picUrl:image(i),trackCount:6,playCount:170000*(i+1),creator:{userId:7,nickname:'QA 测试账号'}}))
  const room=()=>({roomId:'room-qa',creatorId:7,roomUsers:(roomShape==='one'?[{userId:7,nickname:'QA 桌面账号',avatarUrl:image(0)}]:roomShape==='missing'?[{userId:7},{userId:8}]:roomShape==='flat'?[{userId:7,nickname:'QA 桌面账号',avatarUrl:image(0)},{userId:8,nickname:'QA 手机账号',avatarUrl:image(1)}]:[{userId:7,userInfo:{nickname:'QA 桌面账号',avatarUrl:image(0)}},{userId:8,userInfo:{nickname:'QA 手机账号',avatarUrl:roomShape==='broken'?image(1)+'/broken':image(1)}}])})
  const server=http.createServer(async(req,res)=>{
    const u=new URL(req.url,'http://localhost')
    if(u.pathname.endsWith('/broken')){res.statusCode=404;res.end();return}
    if(u.pathname.startsWith('/image/')){res.setHeader('Content-Type','image/png');res.end(images[Number(u.pathname.split('/').at(-1))%6]);return}
    if(u.pathname==='/audio.wav'){
      res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes')
      const match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if(match){const start=Number(match[1]),end=Math.min(Number(match[2])||wave.length-1,wave.length-1);if(start>wave.length-1){res.statusCode=416;res.end();return}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${wave.length}`);res.end(wave.subarray(start,end+1))}else res.end(wave)
      return
    }
    let raw='';for await(const chunk of req)raw+=chunk
    const a=JSON.parse(raw||'{}'),m=u.pathname.slice(1);writes.push({method:m,args:a});let r={code:200}
    if(m.startsWith('listentogether_')&&roomOffline)r={code:502,message:'模拟网络中断'}
    else if(m==='login_qr_key')r={code:200,data:{unikey:'qa-key'}}
    else if(m==='login_qr_check')r={code:803,cookie:'MUSIC_U=qa-only'}
    else if(m==='login_status')r={data:{code:200,profile:{userId:7,nickname:'QA 测试账号',avatarUrl:image(0)}}}
    else if(failDiscover&&['personalized','recommend_resource','top_playlist'].includes(m))r={code:503,message:'模拟推荐服务暂不可用'}
    else if(m==='personalized')r={code:200,result:playlists(36)}
    else if(m==='recommend_resource')r={code:200,recommend:playlists(36)}
    else if(m==='top_playlist')r={code:200,playlists:playlists(60).slice(a.offset||0,(a.offset||0)+(a.limit||12)).map(p=>({...p,name:(a.cat||'全部')+' · '+p.name}))}
    else if(m==='toplist_detail')r={code:200,list:playlists().slice(0,6).map((p,i)=>({...p,name:['云音乐飙升榜','云音乐新歌榜','云音乐热歌榜','原创音乐榜','民谣榜','电子榜'][i],updateFrequency:'每天更新',tracks:names.slice(i,i+3).map((n,j)=>({first:n,second:authors[j]}))}))}
    else if(m==='album_newest')r={code:200,albums:playlists().map((p,i)=>({...p,name:names[i%6],artist:{name:authors[i%6]}}))}
    else if(m==='user_detail')r={code:200,profile:{userId:Number(a.uid),nickname:Number(a.uid)===7?'QA 桌面账号':'QA 手机账号',avatarUrl:image(Number(a.uid)===7?0:1)}}
    else if(m==='user_playlist')r={code:200,playlist:[{...playlists()[0],name:'QA 测试账号喜欢的音乐'},...playlists().slice(1,6),{...playlists()[6],creator:{userId:8,nickname:'QA 收藏歌单'}}],more:false}
    else if(m==='likelist')r={code:200,ids:liked}
    else if(m==='like'){if(failLike)r={code:500,message:'模拟账号写入失败'};else liked=a.like?[...new Set([...liked,Number(a.id)])]:liked.filter(x=>x!==Number(a.id))}
    else if(m==='song_detail')r={code:200,songs:String(a.ids).split(',').map(song)}
    else if(m==='playlist_detail')r={code:200,playlist:{trackCount:6,description:'模拟服务数据：用于桌面功能与布局验收，非真实账号内容。'}}
    else if(m==='playlist_track_all'||m==='album'||m==='artists')r={code:200,songs:[101,102,103,104,105,106].map(song),hotSongs:[101,102,103].map(song),album:{description:'QA 专辑'}}
    else if(m==='song_url_v1'){if(a.id===delayTrack)await new Promise(r=>setTimeout(r,1800));r={code:200,data:[{id:Number(a.id),url:`http://127.0.0.1:${port}/audio.wav?id=${a.id}`,freeTrialInfo:null}]}}
    else if(m==='lyric'){r={code:200,lrc:{lyric:lyricOverrides.has(String(a.id))?lyricOverrides.get(String(a.id)):'[00:00.00]风经过的时候\n[00:05.00]把远方放在心里\n[00:10.00]生活慢下来\n[00:20.00]等一场温柔的雨\n[00:40.00]你和我，听见同一刻\n[01:10.00]故事，留在这首歌里'},tlyric:{lyric:'[00:00.00]When the wind passes by\n[00:05.00]Keep the distance in your heart'}};if(lyricDelays.get(String(a.id)))await new Promise(resolve=>setTimeout(resolve,lyricDelays.get(String(a.id))))}
    else if(m==='recommend_songs')r={code:200,data:{dailySongs:[101,102,103,104,105,106].map(song)}}
    else if(m==='playmode_intelligence_list'){if(heartDelay)await new Promise(r=>setTimeout(r,heartDelay));r={code:200,data:[103,104,105].map((id,i)=>({songInfo:song(id),recommended:i!==1}))}}
    else if(m==='cloudsearch')r={code:200,result:{songs:[101,102,103].map(song),songCount:3,playlists:playlists(),playlistCount:12,albums:playlists(),albumCount:12,artists:[{id:1,name:'QA 歌手',picUrl:image(0)}],artistCount:1,djRadios:playlists(),djRadiosCount:12}}
    else if(m==='dj_recommend'||m==='dj_recommend_type')r={code:200,djRadios:playlists().slice(0,6).map((p,i)=>({...p,name:['夜读：给失眠的你','散步时听的故事','一百种生活的可能','声音里的小世界','听一本书，去很远的地方','日常不寻常'][i],programCount:20}))}
    else if(m==='program_recommend'||m==='dj_program')r={code:200,programs:[101,102,103].map((id,i)=>({id:id+500,name:'QA 节目 · '+names[i],mainSong:song(id),coverUrl:image(i),radio:{id:700,name:'QA 声音电台'},dj:{userId:1,nickname:'QA 主播'}})),count:3,more:false}
    else if(m==='dj_detail')r={code:200,data:{programCount:3,desc:'QA 电台数据'}}
    else if(m==='listentogether_statistics'){const value=totalConnectionTime;if(statsDelay)await new Promise(resolve=>setTimeout(resolve,statsDelay));r=statsFailure?{code:502,message:'模拟统计读取失败'}:{code:200,data:{totalConnectionTime:value,currentConnectionTime:120,duration:6000,listenCount:32}}}
    else if(m==='listentogether_status')r={code:200,data:{inRoom,roomInfo:inRoom?room():null}}
    else if(m==='listentogether_room_check')r={code:200,data:{roomExist:true,roomInfo:room()}}
    else if(m==='listentogether_room_create'||m==='listentogether_accept'){inRoom=true;r={code:200,data:{roomInfo:room()}}}
    else if(m==='listentogether_end'){inRoom=false;r={code:200,data:{success:true}}}
    else if(m==='listentogether_sync_playlist_get') {
      let command=Date.now()<staleUntil?{...staleCommand,timestamp:Date.now(),progress:Number(staleCommand.progress||0)+500}:roomState
      if(Date.now()<staleUntil&&stripStaleMetadata){command={...command};delete command.clientSeq;delete command.serverSeq;delete command.timestamp;delete command.userId}
      r={code:200,data:{playlist:{displayList:{result:roomQueue}},playCommand:command}}
    }
    else if(m==='listentogether_sync_list_command')roomQueue=a.displayList.split(',')
    else if(m==='listentogether_play_command') {
      if(a.commandType==='PAUSE'&&stalePauseMs){staleCommand={...roomState};staleUntil=Date.now()+stalePauseMs}
      if(commandDelay)await new Promise(resolve=>setTimeout(resolve,commandDelay))
      roomState={...a,userId:7,outerId:'qa-desktop',serverSeq:(roomState.serverSeq||0)+1,timestamp:Date.now()}
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(r))
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port
  return {url:`http://127.0.0.1:${port}/`,writes,server,setStalePause:(ms,strip=false)=>{stalePauseMs=ms;stripStaleMetadata=strip},setCommandDelay:ms=>commandDelay=ms,setStats:v=>totalConnectionTime=v,setStatsDelay:v=>statsDelay=v,setStatsFailure:v=>statsFailure=v,setLyrics:(id,text)=>lyricOverrides.set(String(id),text),setLyricDelay:(id,ms)=>lyricDelays.set(String(id),ms),setRoomShape:v=>roomShape=v,setDiscoverFailure:v=>failDiscover=v,setHeartDelay:v=>heartDelay=v,setFailLike:v=>failLike=v,setRoomOffline:v=>roomOffline=v,setDelay:v=>delayTrack=String(v),remote:command=>{staleUntil=0;roomState={...roomState,userId:8,outerId:'qa-peer',...command,serverSeq:(roomState.serverSeq||0)+1,clientSeq:roomState.clientSeq+1,timestamp:Date.now()}},endRemote:()=>inRoom=false,getLiked:()=>liked}
}
module.exports={fixture}
