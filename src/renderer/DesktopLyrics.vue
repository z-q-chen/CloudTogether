<script setup>
import {ref,computed,onMounted,onUnmounted} from 'vue'
import Icon from './Icon.vue'
const data=ref({fontSize:28,snapshot:{song:'',artist:'',line:'',translation:'',next:'',playing:false,status:'idle',font:'sans'}})
const s=computed(()=>data.value.snapshot)
const fallback=computed(()=>({idle:'播放一首音乐，让歌词来到桌面',loading:'正在加载歌词…',empty:'暂无歌词，继续欣赏音乐',waiting:'前奏 · 等待第一句歌词',error:'播放暂不可用，请返回播放器查看'}[s.value.status]||''))
let stop
onMounted(async()=>{stop=window.desktopLyrics.subscribe(value=>data.value=value);const initial=await window.desktopLyrics.get();if(initial)data.value=initial})
onUnmounted(()=>stop?.())
const action=value=>window.desktopLyrics.action(value)
let dragging=false
function beginDrag(e){if(e.button!==0||e.target.closest('button'))return;dragging=true;e.currentTarget.setPointerCapture(e.pointerId);window.desktopLyrics.drag('start',{x:e.screenX,y:e.screenY})}
function moveDrag(e){if(dragging)window.desktopLyrics.drag('move',{x:e.screenX,y:e.screenY})}
function endDrag(e){if(!dragging)return;dragging=false;window.desktopLyrics.drag('end',{x:e.screenX,y:e.screenY});if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}
</script>
<template>
  <section class="desktop-lyrics" aria-label="桌面歌词" :data-font="s.font" :style="{'--lyric-size':data.fontSize+'px'}">
    <header class="lyric-toolbar" title="拖动此处移动歌词窗口" @pointerdown="beginDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
      <span class="drag-grip" aria-hidden="true">⠿</span>
      <button class="song-info" aria-label="返回播放器" title="返回播放器" @click="action('reveal')"><span>{{s.song||'云伴 · 桌面歌词'}}</span><small v-if="s.artist">{{s.artist}}</small></button>
      <span v-if="s.song&&!s.playing" class="pause-status">已暂停</span>
      <div class="lyric-tools"><button aria-label="缩小歌词字号" title="缩小字号" :disabled="data.fontSize<=20" @click="action('smaller')">A−</button><button aria-label="放大歌词字号" title="放大字号" :disabled="data.fontSize>=40" @click="action('larger')">A+</button><button class="close" aria-label="关闭桌面歌词" title="关闭桌面歌词" @click="action('close')"><Icon name="close" :size="16" /></button></div>
    </header>
    <div class="lyric-content" aria-live="off"><p class="current-line" :class="{placeholder:s.status!=='ready'}" :title="s.line">{{s.status==='ready'?s.line:fallback}}</p><p v-if="s.translation&&s.status==='ready'" class="translation" :title="s.translation">{{s.translation}}</p><p v-if="s.next&&['ready','waiting'].includes(s.status)" class="next-line" :title="s.next">{{s.next}}</p></div>
    <span class="resize-grip" title="拖动窗口边缘调整大小" aria-hidden="true">⌟</span>
  </section>
</template>
