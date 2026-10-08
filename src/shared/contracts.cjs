const { z } = require('zod')
const id = z.coerce.string().regex(/^\d{1,20}$/)
const ids = z.string().regex(/^\d{1,20}(,\d{1,20}){0,999}$/)
const roomId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const page = { limit: z.number().int().min(1).max(1000).optional(), offset: z.number().int().min(0).max(100000).optional() }
const empty = z.object({}).strict()
const specs = {
  session: empty, logout: empty, qr: empty,
  qrcheck: z.object({ key: z.string().min(1).max(256) }).strict(),
  personalized: z.object({ limit: page.limit }).strict(),
  top_playlist: z.object({ cat: z.string().max(80).optional(), ...page }).strict(),
  toplist_detail: empty, album_newest: empty, recommend_resource: empty, recommend_songs: empty,
  dj_recommend: empty,
  dj_recommend_type: z.object({ type: id }).strict(),
  program_recommend: z.object({ type: id.optional(), ...page }).strict(),
  dj_program: z.object({ rid: id, ...page }).strict(),
  dj_detail: z.object({ rid: id }).strict(),
  dj_program_detail: z.object({ id }).strict(),
  user_detail: z.object({ uid: id }).strict(),
  user_playlist: z.object({ uid: id, ...page }).strict(),
  likelist: z.object({ uid: id }).strict(),
  like: z.object({ id, like: z.boolean() }).strict(),
  playlist_detail: z.object({ id }).strict(),
  playlist_track_all: z.object({ id, ...page }).strict(),
  song_detail: z.object({ ids }).strict(),
  song_url_v1: z.object({ id, level: z.enum(['standard', 'exhigh', 'lossless', 'hires']) }).strict(),
  lyric: z.object({ id }).strict(),
  cloudsearch: z.object({ keywords: z.string().min(1).max(200), type: z.union([1,10,100,1000,1009].map(value=>z.literal(value))), ...page }).strict(),
  album: z.object({ id }).strict(),
  artists: z.object({ id }).strict(),
  playmode_intelligence_list: z.object({ id, pid: id, sid: id.optional(), count: z.number().int().min(1).max(50) }).strict(),
  scrobble: z.object({ id, sourceid: id, time: z.number().int().min(0).max(86400) }).strict(),
  listentogether_status: empty,
  listentogether_statistics: z.object({roomId:roomId.optional(),userId:id.optional()}).strict().refine(value=>!!value.roomId||!!value.userId),
  listentogether_room_create: empty,
  listentogether_room_check: z.object({ roomId }).strict(),
  listentogether_accept: z.object({ roomId, inviterId: id }).strict(),
  listentogether_end: z.object({ roomId }).strict(),
  listentogether_sync_playlist_get: z.object({ roomId }).strict(),
  copyinvite: z.object({ roomId, songId:id }).strict(),
  listentogether_heatbeat: z.object({ roomId, songId: id, playStatus: z.enum(['PLAY', 'PAUSE']), progress: z.number().int().min(0).max(86400000) }).strict(),
  listentogether_play_command: z.object({ roomId, commandType: z.enum(['PLAY','PAUSE','GOTO','PROGRESS']), playStatus: z.enum(['PLAY','PAUSE']), targetSongId: id, formerSongId: z.string().regex(/^-?\d{1,20}$/), progress: z.number().int().min(0).max(86400000), clientSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(),
  listentogether_sync_list_command: z.object({ roomId, commandType: z.literal('REPLACE'), version: z.number().int().min(1), randomList: ids, displayList: ids }).strict(),
  preferences: z.object({ theme: z.enum(['paper','ink','forest','rose','blue','amber']).optional(), quality: z.enum(['standard','exhigh','lossless','hires']).optional(), volume: z.number().min(0).max(1).optional(), font: z.enum(['sans','serif']).optional() }).strict()
}
function validate(method, args) {
  if (!Object.hasOwn(specs, method)) throw new Error('不支持的操作')
  return specs[method].parse(args)
}
module.exports = { specs, validate }
