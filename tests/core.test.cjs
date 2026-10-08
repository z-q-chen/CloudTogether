const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {Service,cleanCookie,stripSecrets}=require('../src/main/service.cjs')
const {validate}=require('../src/shared/contracts.cjs')
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cloud-core-'))
const safeStorage={isEncryptionAvailable:()=>false}

test('IPC allowlist blocks credentials, injection and arbitrary methods',()=>{
  for(const [method,args]of [['constructor',{}],['song_url_v1',{id:'1',level:'exhigh',cookie:'SECRET'}],['song_url_v1',{id:'1',level:'exhigh',unblock:true}],['song_detail',{ids:'1);process.exit()'}],['preferences',{theme:'unexpected'}],['listentogether_accept',{roomId:'../secrets',inviterId:'2'}]])assert.throws(()=>validate(method,args))
  assert.equal(validate('song_detail',{ids:'1,2,300'}).ids,'1,2,300')
  for(const type of [1,10,100,1000,1009])assert.equal(validate('cloudsearch',{keywords:'音乐',type,limit:40,offset:0}).type,type)
})
test('cookies preserve equals signs and remove attributes; recursive responses hide secrets',()=>{
  assert.equal(cleanCookie(['MUSIC_U=abc==; Path=/; HttpOnly','__csrf=xyz; Domain=.163.com']),'MUSIC_U=abc==; __csrf=xyz')
  assert.deepEqual(stripSecrets({cookie:'secret',data:{token:'secret',name:'normal'},items:[{password:'secret',id:1}]}),{data:{name:'normal'},items:[{id:1}]})
})
test('login commits only after QR confirmation and verified profile; renderer never sees cookie',async()=>{
  const folder=temp();const writes=[]
  const service=new Service({folder,safeStorage,transport:async(m,a)=>{writes.push({m,a});if(m==='login_qr_key')return{data:{unikey:'key'}};if(m==='login_qr_check')return{code:803,cookie:'MUSIC_U=secret;'};if(m==='login_status')return{data:{profile:{userId:7,nickname:'测试'}}};return{code:200}}})
  try {
    const qr=await service.call('qr',{});assert.ok(qr.image.startsWith('data:image/png'))
    const r=await service.call('qrcheck',{key:qr.key});assert.equal(r.profile.userId,7);assert.ok(!JSON.stringify(r).includes('secret'))
    await service.call('like',{id:'42',like:true});assert.equal(writes.at(-1).a.cookie,'MUSIC_U=secret')
    assert.equal(fs.statSync(path.join(folder,'account.json')).mode&0o777,0o600)
    await service.call('logout',{});assert.ok(!fs.existsSync(path.join(folder,'account.json')));await assert.rejects(service.call('like',{id:'42',like:true}),/请先登录/)
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
})
test('logout while a QR response is in flight cannot resurrect a session',async()=>{
  const folder=temp();let finish
  const service=new Service({folder,safeStorage,transport:async m=>m==='login_qr_key'?{data:{unikey:'key'}}:new Promise(r=>finish=r)})
  try{await service.call('qr',{});const pending=service.call('qrcheck',{key:'key'});await service.call('logout',{});finish({code:803,cookie:'MUSIC_U=secret'});assert.equal((await pending).code,800);assert.equal(service.cookie,'');assert.ok(!fs.existsSync(path.join(folder,'account.json')))}finally{fs.rmSync(folder,{recursive:true,force:true})}
})
test('failed account mutation does not become local success; server credential fields are redacted',async()=>{
  const folder=temp(),service=new Service({folder,safeStorage,transport:async()=>({code:500,message:'写入失败',cookie:'hidden'})});service.cookie='MUSIC_U=test'
  try{await assert.rejects(service.call('like',{id:'1',like:true}),/写入失败/)}finally{fs.rmSync(folder,{recursive:true,force:true})}
})
test('late private data after logout is discarded',async()=>{
  const folder=temp();let finish
  const service=new Service({folder,safeStorage,transport:async()=>new Promise(r=>finish=r)});service.cookie='MUSIC_U=test'
  try{const pending=service.call('likelist',{uid:'7'});await service.call('logout',{});finish({code:200,ids:[42]});await assert.rejects(pending,/账号已切换/)}finally{fs.rmSync(folder,{recursive:true,force:true})}
})
test('lyrics handle multiple timestamps, translation alignment and non-lyric metadata',async()=>{
  const {parseLyrics}=await import('../src/renderer/domain.mjs')
  const lines=parseLyrics('[ar:Artist]\n[00:01.10][00:03.20]你好\n[01:00]末尾','[00:01.10]Hello')
  assert.deepEqual(lines,[{time:1.1,text:'你好',translation:'Hello'},{time:3.2,text:'你好',translation:''},{time:60,text:'末尾',translation:''}])
})
test('shuffle traverses without immediate repeats and invalidates when queue changes',async()=>{
  const {Shuffle}=await import('../src/renderer/domain.mjs'),shuffle=new Shuffle(()=>0.3),queue=[{id:'1'},{id:'2'},{id:'3'},{id:'4'}]
  const results=[shuffle.next(queue,'1'),shuffle.next(queue,'1'),shuffle.next(queue,'1')]
  assert.equal(new Set(results).size,3);assert.ok(!results.includes('1'));assert.equal(shuffle.next([{id:'7'},{id:'8'}],'7'),'8')
})
test('invite links reject foreign hosts and invalid room IDs',async()=>{
  const {invitation}=await import('../src/renderer/domain.mjs')
  assert.deepEqual(invitation('邀请你一起听 https://st.music.163.com/listen-together/share/?roomId=abc-123&inviterId=42'),{roomId:'abc-123',inviterId:'42'})
  assert.throws(()=>invitation('https://evil.example/?roomId=abc&inviterId=42'));assert.throws(()=>invitation('https://music.163.com/?roomId=../../&inviterId=42'))
})

test('circular network diagnostics cannot crash log redaction or expose credentials',()=>{
  const request={headers:{Authorization:'private',cookie:'private'},message:'MUSIC_U=private; disconnected'};request.socket={request};request.items=[request]
  const cleaned=stripSecrets(request);assert.equal(cleaned.socket.request,'[Circular]');assert.equal(cleaned.items[0],'[Circular]');assert.deepEqual(cleaned.headers,{});assert.equal(cleaned.message,'MUSIC_U=[redacted]; disconnected')
  assert.equal(stripSecrets(new Error('MUSIC_A=private failure')).message,'MUSIC_A=[redacted] failure')
})

test('room avatars normalize nested profiles and HTTP URLs, keep self first, and retain known portraits',async()=>{
  const {roomMembers}=await import('../src/renderer/domain.mjs')
  const profile={userId:7,nickname:'自己',avatarUrl:'http://p1.music.126.net/self.jpg'}
  const nested=[{userId:8,userInfo:{nickname:'听友',avatarUrl:'http://p2.music.126.net/peer.jpg'}},{userId:7}]
  const members=roomMembers(nested,profile)
  assert.deepEqual(members,[{id:'7',name:'自己',avatar:'https://p1.music.126.net/self.jpg'},{id:'8',name:'听友',avatar:'https://p2.music.126.net/peer.jpg'}])
  assert.deepEqual(roomMembers([{userId:8}],profile,members),members)
  assert.equal(roomMembers([],profile).length,1)
  assert.equal(roomMembers([{userId:8,user:{profile:{nickname:'用户',avatarUrl:'https://example.com/8.jpg'}}}],profile)[1].name,'用户')
})
test('recommendation batches use different IDs, wrap without duplicates, and never invent cards',async()=>{
  const {recommendationBatch}=await import('../src/renderer/domain.mjs')
  const pool=Array.from({length:30},(_,i)=>({id:String(i)})),first=pool.slice(0,12),next=recommendationBatch(pool,first)
  assert.deepEqual(next,pool.slice(12,24));assert.equal(new Set(recommendationBatch(pool,next).map(p=>p.id)).size,12)
  assert.deepEqual(recommendationBatch([],first),[]);assert.equal(recommendationBatch(pool.slice(0,5),[]).length,5)
})

test('desktop lyric snapshots are bounded text-only data, never account bridges',()=>{
  const {snapshotSchema,settingsSchema,emptySnapshot}=require('../src/shared/desktop-lyrics.cjs')
  assert.deepEqual(snapshotSchema.parse({...emptySnapshot,line:'<img src=x onerror=alert(1)>'}).line,'<img src=x onerror=alert(1)>')
  for(const value of [{...emptySnapshot,cookie:'secret'},{...emptySnapshot,line:'x'.repeat(1201)},{...emptySnapshot,playing:'yes'}])assert.throws(()=>snapshotSchema.parse(value))
  assert.throws(()=>settingsSchema.parse({enabled:true,fontSize:100}))
})
test('official cumulative pair duration uses seconds and preserves thousands of hours',async()=>{
  const {togetherTotal,formatTogetherTotal}=await import('../src/renderer/domain.mjs')
  assert.equal(togetherTotal({totalConnectionTime:1234*3600+56*60}),4445760)
  assert.equal(formatTogetherTotal(4445760),'1,234 小时 56 分钟')
  assert.equal(formatTogetherTotal(0),'0 小时 0 分钟')
  assert.equal(togetherTotal({duration:4445760,currentConnectionTime:120}),null)
  for(const v of [null,'',false,-1,Infinity,1.5])assert.equal(togetherTotal({totalConnectionTime:v}),null)
  assert.throws(()=>validate('listentogether_statistics',{}))
  assert.throws(()=>validate('listentogether_statistics',{roomId:'room',cookie:'secret'}))
  assert.equal(validate('listentogether_statistics',{userId:'8'}).userId,'8')
})
