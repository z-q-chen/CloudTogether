const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url')
async function renderer(transport) {
  class AudioStub extends EventTarget {
    constructor(){super();this.paused=true;this.currentTime=0;this.duration=120;this.src=''}
    pause(){this.paused=true;this.dispatchEvent(new Event('pause'))}
    async play(){this.paused=false;this.dispatchEvent(new Event('play'))}
    load(){}
    removeAttribute(){this.src=''}
    getAttribute(){return this.src}
  }
  global.Audio=AudioStub;global.window={cloud:{call:async(method,args)=>({ok:true,data:await transport(method,args)})}}
  let source=fs.readFileSync(path.join(__dirname,'../src/renderer/state.js'),'utf8')
  source=source.replace("import { reactive, computed, watch } from 'vue'",`import Vue from '${pathToFileURL(require.resolve('vue')).href}';const {reactive,computed,watch}=Vue`)
  source=source.replaceAll("'./domain.mjs'",JSON.stringify(pathToFileURL(path.join(__dirname,'../src/renderer/domain.mjs')).href)).replaceAll("'./room-sync.mjs'",JSON.stringify(pathToFileURL(path.join(__dirname,'../src/renderer/room-sync.mjs')).href))
  return import('data:text/javascript;base64,'+Buffer.from(source+`\n// ${Math.random()}`).toString('base64'))
}
const song=id=>({id,name:'Song '+id,dt:120000,ar:[],al:{}})
test('overlapping playlist pagination requests fetch one page without duplicated songs',async()=>{
  let finish,calls=0
  const r=await renderer(async()=>{calls++;return new Promise(resolve=>finish=resolve)})
  Object.assign(r.state.detail,{id:'700',kind:'playlist',total:400,tracks:Array.from({length:200},(_,i)=>({id:String(i+1)})),more:true})
  const first=r.moreDetail(),second=r.moreDetail();assert.equal(calls,1);assert.equal(r.state.detail.paging,true)
  finish({songs:Array.from({length:200},(_,i)=>song(i+201))});await Promise.all([first,second])
  assert.equal(r.state.detail.tracks.length,400);assert.equal(new Set(r.state.detail.tracks.map(t=>t.id)).size,400);assert.equal(r.state.detail.more,false);assert.equal(r.state.detail.paging,false)
})
test('late likes page cannot append to a reopened likes view',async()=>{
  let finish
  const r=await renderer(async()=>new Promise(resolve=>finish=resolve))
  r.state.profile={userId:7};r.state.mine.likes=Array.from({length:200},(_,i)=>String(i+1));r.state.mine.likedTracks=Array.from({length:100},(_,i)=>({id:String(i+1)}))
  r.showLikes();const pending=r.moreLikes();r.showLikes()
  finish({songs:Array.from({length:100},(_,i)=>song(i+101))});await pending
  assert.equal(r.state.detail.tracks.length,100);assert.equal(r.state.detail.paging,false)
})
test('closed login response cannot replace the QR code of a new login',async()=>{
  const pending=[]
  const r=await renderer(async()=>new Promise(resolve=>pending.push(resolve)))
  const old=r.login();r.closeModal();const fresh=r.login()
  pending[1]({key:'new-key',image:'new-image'});await fresh
  pending[0]({key:'old-key',image:'old-image'});await old
  assert.equal(r.state.login.key,'new-key');assert.equal(r.state.login.image,'new-image');r.closeModal()
})
test('rapid next at the end of a page requests one new page and plays its first song',async()=>{
  let finish,pages=0
  const r=await renderer(async method=>{
    if(method==='playlist_track_all'){pages++;return new Promise(resolve=>finish=resolve)}
    if(method==='song_url_v1')return {data:[{url:'https://example.test/audio.wav'}]}
    return {}
  })
  r.state.current={id:'100',artists:[],album:{}};r.state.queue=[r.state.current];r.state.source={id:'700',kind:'playlist',total:3}
  const first=r.next(),second=r.next();assert.equal(pages,1)
  finish({songs:[song(101),song(102)]});await Promise.all([first,second])
  assert.deepEqual(r.state.queue.map(t=>t.id),['100','101','102']);assert.equal(r.state.current.id,'101')
})
