const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { validate } = require('../shared/contracts.cjs')

function cleanCookie(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/;;|;(?=\s*[\w-]+=)/)
  return list.map(x => x.trim().split(';')[0]).filter(x => /^[\w-]+=/.test(x) && !/^(Path|Domain|Expires|Max-Age|SameSite)=/i.test(x)).join('; ')
}
function stripSecrets(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return value.replace(/(MUSIC_U|MUSIC_A|__csrf|NMTID)=[^;\s]+/gi,'$1=[redacted]')
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  if (depth > 40) return '[Truncated]'
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map(item => stripSecrets(item,seen,depth+1))
    if (value instanceof Error) return {name:value.name,message:stripSecrets(value.message,seen,depth+1)}
    return Object.fromEntries(Object.entries(value).filter(([k]) => !/cookie|token|password|authorization/i.test(k)).map(([k,v]) => [k,stripSecrets(v,seen,depth+1)]))
  } finally { seen.delete(value) }
}
const privateMethods = new Set(['like','likelist','user_playlist','recommend_resource','recommend_songs','playmode_intelligence_list','scrobble'])
class Service {
  constructor({ folder, safeStorage, transport, mock = false, clipboard }) {
    this.folder = folder; this.safeStorage = safeStorage; this.transport = transport; this.mock = mock
    this.cookie = ''; this.profile = null; this.epoch = 0; this.qrKey = ''; this.clipboard=clipboard
    this.preferences = { theme:'ink', quality:'exhigh', volume:0.7, font:'sans' }
    fs.mkdirSync(folder, { recursive:true, mode:0o700 })
    try {
      const stored = JSON.parse(fs.readFileSync(path.join(folder,'account.json'),'utf8'))
      this.cookie = stored.encrypted ? safeStorage.decryptString(Buffer.from(stored.value,'base64')) : stored.value
    } catch {}
    try { Object.assign(this.preferences, validate('preferences',JSON.parse(fs.readFileSync(path.join(folder,'preferences.json'),'utf8')))) } catch {}
  }
  secure() { return this.safeStorage?.isEncryptionAvailable() && this.safeStorage.getSelectedStorageBackend?.() !== 'basic_text' }
  write(name, value) {
    const file = path.join(this.folder,name); const temp = file+'.tmp'
    fs.writeFileSync(temp,JSON.stringify(value),{ mode:0o600 }); fs.chmodSync(temp,0o600); fs.renameSync(temp,file)
  }
  saveCookie(cookie) {
    this.cookie = cleanCookie(cookie)
    this.write('account.json',this.secure() ? { encrypted:true, value:this.safeStorage.encryptString(this.cookie).toString('base64') } : { encrypted:false, value:this.cookie })
  }
  async request(method,args={},cookie=this.cookie) {
    const call = this.transport ? this.transport(method,{...args,cookie}) : this.native(method,{...args,cookie})
    let timer
    try { return await Promise.race([call,new Promise((_,reject) => { timer=setTimeout(()=>reject(Object.assign(new Error('连接超时，请稍后重试'),{code:504})),18000) })]) }
    catch(error){
      const code=Number(error.code||error.status||error.body?.code||500)
      const raw=String(error.body?.message||error.body?.msg||error.message||'服务暂时不可用')
      const message=/ENOTFOUND|EAI_AGAIN|ECONN|Network|fetch failed|timeout/i.test(raw)?'网络连接失败，请检查网络后重试':code===301?'登录已过期，请重新扫码':raw.slice(0,200)
      throw Object.assign(new Error(message),{code})
    }
    finally { clearTimeout(timer) }
  }
  async native(method,args) {
    const root = path.dirname(require.resolve('@neteasecloudmusicapienhanced/api/package.json'))
    const token = path.join(os.tmpdir(),'anonymous_token')
    if (!fs.existsSync(token)) fs.writeFileSync(token,'',{mode:0o600})
    const request = require(path.join(root,'util/request.js'))
    const { cookieToJson } = require(path.join(root,'util/index.js'))
    if(method==='listentogether_statistics') {
      // Official Android 9.6.05: relation statistics v2, connection times in seconds.
      const data={roomId:args.roomId||''}
      if(args.userId&&/^\d{1,20}$/.test(String(this.profile?.userId)))data.roomUserIds=`[${args.userId},${this.profile.userId}]`
      const res=await request('/api/listen/together/relation/statistics/get/v2',data,{crypto:'',cookie:cookieToJson(args.cookie||'')})
      return res.body
    }
    const module = require(path.join(root,'module',method+'.js'))
    const res = await module({...args, cookie:cookieToJson(args.cookie || ''), timestamp:Date.now()},request)
    return res.body
  }
  async session() {
    const epoch = this.epoch
    if (this.cookie) {
      const response = await this.request('login_status')
      const data = response.data || response
      if (epoch !== this.epoch) return { profile:this.profile, preferences:this.preferences }
      if (!data.profile) {
        this.cookie=''; this.profile=null
        try { fs.unlinkSync(path.join(this.folder,'account.json')) } catch {}
      } else this.profile = data.profile
    }
    return { profile: stripSecrets(this.profile), preferences:this.preferences, credentialStorage:this.secure()?'系统密钥环':'仅当前用户可读文件' }
  }
  async call(method,raw) {
    const args = validate(method,raw)
    const epoch = this.epoch
    if (method === 'session') return this.session()
    if (method === 'preferences') {
      Object.assign(this.preferences,args); this.write('preferences.json',this.preferences); return this.preferences
    }
    if (method === 'logout') {
      this.epoch++; this.qrKey=''; this.cookie=''; this.profile=null
      try { fs.unlinkSync(path.join(this.folder,'account.json')) } catch {}
      return { code:200 }
    }
    if(method==='copyinvite') {
      if(!this.cookie||!this.profile)throw new Error('请先登录网易云音乐')
      const url=`https://st.music.163.com/listen-together/share/?roomId=${encodeURIComponent(args.roomId)}&inviterId=${this.profile.userId}&songId=${args.songId}`
      this.clipboard.writeText(url);return {code:200}
    }
    if (method === 'qr') {
      const result = await this.request('login_qr_key',{},'')
      const key = result.data?.unikey
      if (!key) throw new Error('暂时无法生成二维码，请重试')
      this.qrKey=key
      const qrurl = `https://music.163.com/login?codekey=${encodeURIComponent(key)}`
      const qr = await require('qrcode').toDataURL(qrurl,{width:260,margin:1,color:{dark:'#202523',light:'#ffffff'}})
      return { key, image:qr }
    }
    if (method === 'qrcheck') {
      if (args.key !== this.qrKey) throw new Error('二维码已失效')
      const result = await this.request('login_qr_check',args,'')
      if (epoch !== this.epoch || args.key !== this.qrKey) return { code:800 }
      if (result.code === 803) {
        const candidate = cleanCookie(result.cookie)
        if (!candidate) throw new Error('登录未返回有效凭据，请重新扫码')
        const status = await this.request('login_status',{},candidate)
        if (epoch !== this.epoch || args.key !== this.qrKey) return { code:800 }
        const profile = status.data?.profile || status.profile
        if (!profile) throw new Error('账号登录尚未就绪，请重新扫码')
        this.profile=profile; this.saveCookie(candidate); this.qrKey=''
        return { code:803, profile:stripSecrets(profile) }
      }
      return { code:result.code, message:result.message || '' }
    }
    if ((privateMethods.has(method) || method.startsWith('listentogether_')) && !this.cookie) throw Object.assign(new Error('请先登录网易云音乐'),{code:301})
    if (method === 'listentogether_sync_list_command') args.userId=this.profile?.userId
    const result = await this.request(method,args)
    if (epoch !== this.epoch && (privateMethods.has(method)||method.startsWith('listentogether_'))) throw Object.assign(new Error('账号已切换，请重试'),{code:409})
    if (Number(result.code) === 301) throw Object.assign(new Error('登录已过期，请重新扫码'),{code:301})
    if (result.code && ![200,201].includes(Number(result.code))) throw Object.assign(new Error(String(result.message || result.msg || '网易云暂时未能完成此操作').slice(0,200)),{code:result.code})
    if(method.startsWith('listentogether_')&&result.data?.success===false)throw new Error(String(result.data.message||'网易云未确认房间操作，请重试'))
    if(method==='listentogether_end'&&result.data?.success!==true)throw new Error('网易云尚未确认房间结束，请刷新状态')
    return stripSecrets(result)
  }
}
module.exports = { Service, cleanCookie, stripSecrets }
