const fs = require('node:fs')

// The adapter reads this protocol key from its documented temporary cache.
// Fetch it before the first audio request, including on a fresh installation.
function createAudioInitializer({ file, fetchKey, timeout = 12000 }) {
  let ready = false, pending
  return async function initialize() {
    if (ready) return
    if (!pending) pending = (async () => {
      let previous = {}, timer
      try { previous = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
      try {
        const key = await Promise.race([
          fetchKey(previous),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('音乐服务连接超时，请稍后重试')), timeout) })
        ])
        if (!key?.publicKey || !key.sk || !key.version) throw new Error('音乐服务初始化失败，请稍后重试')
        const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600)
        try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify(key)) } finally { fs.closeSync(fd) }
        ready = true
      } finally { clearTimeout(timer) }
    })().finally(() => { pending = null })
    return pending
  }
}
module.exports = { createAudioInitializer }
