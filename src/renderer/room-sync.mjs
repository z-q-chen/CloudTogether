function sequence(value) {
  if(typeof value==='number'&&!Number.isSafeInteger(value))return null
  const text=String(value??'')
  return /^\d{1,30}$/.test(text)?BigInt(text):null
}
function identity(command) {
  // Playback progress and refreshed timestamps are not new play/pause actions.
  const position=['GOTO','PROGRESS'].includes(command.commandType)?command.progress:''
  return [command.userId||'',command.outerId||'',command.targetSongId,command.commandType,sequence(command.clientSeq),command.playStatus,position].join(':')
}
function matches(command,local) {
  return String(command.targetSongId)===String(local.targetSongId)&&command.playStatus===local.playStatus&&command.commandType===local.commandType&&
    (!['GOTO','PROGRESS'].includes(command.commandType)||Number(command.progress)===Number(local.progress))
}
export class RoomCommands {
  constructor(){this.reset()}
  reset(){this.serverSeq=null;this.lastIdentity='';this.local=null;this.ownOuterId=''}
  begin(args,userId){const local={...args,userId:String(userId||''),outerId:this.ownOuterId,pending:true,confirmed:false};this.local=local;return local}
  finish(local){if(this.local===local)local.pending=false}
  fail(local){if(this.local===local)this.local=null}
  accept(command) {
    if(!command||!/^\d{1,20}$/.test(String(command.targetSongId))||!['PLAY','PAUSE'].includes(command.playStatus)||!Number.isFinite(Number(command.progress||0))||Number(command.progress||0)<0||Number(command.progress||0)>=86400000)return false
    const server=sequence(command.serverSeq),client=sequence(command.clientSeq),key=identity(command)
    if(server!==null&&this.serverSeq!==null&&server<=this.serverSeq)return false
    if(server===null&&key===this.lastIdentity)return false
    const remember=()=>{if(server!==null)this.serverSeq=server;this.lastIdentity=key}
    const local=this.local
    if(local) {
      const localSeq=sequence(local.clientSeq),sender=String(command.userId||'')
      const sameClient=(!sender||sender===local.userId)&&(!local.outerId||!command.outerId||command.outerId===local.outerId)
      if(sameClient&&client!==null&&localSeq!==null&&client<=localSeq&&(server===null||!local.confirmed)) {
        if(client===localSeq&&matches(command,local)) {
          local.confirmed=true
          if(sender===local.userId&&command.outerId)this.ownOuterId=command.outerId
        }
        remember();return false
      }
      if(!local.confirmed&&matches(command,local)&&!sender&&client===null) {local.confirmed=true;remember();return false}
      if(!local.confirmed&&((local.pending&&!matches(command,local))||(!sender&&client===null&&!matches(command,local))))return false
      // A genuinely new command from another device supersedes the local action.
      this.local=null
    }
    remember();return true
  }
}
