const { z } = require('zod')
const snapshotSchema = z.object({
  song: z.string().max(300), artist: z.string().max(500),
  line: z.string().max(1200), translation: z.string().max(1200), next: z.string().max(1200),
  status: z.enum(['idle','loading','empty','waiting','ready','error']),
  playing: z.boolean(), font: z.enum(['sans','serif'])
}).strict()
const settingsSchema = z.object({
  enabled: z.boolean(), fontSize: z.number().int().min(20).max(40),
  bounds: z.object({x:z.number().int(),y:z.number().int(),width:z.number().int().min(440).max(1600),height:z.number().int().min(168).max(500)}).strict().optional()
}).strict()
const emptySnapshot = {song:'',artist:'',line:'',translation:'',next:'',status:'idle',playing:false,font:'sans'}
module.exports = {snapshotSchema,settingsSchema,emptySnapshot}
