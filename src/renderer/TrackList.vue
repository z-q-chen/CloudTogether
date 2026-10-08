<script setup>
import Icon from './Icon.vue'
import Art from './Art.vue'
import {state as s,play,like,guard} from './state.js'
import {formatTime} from './domain.mjs'
defineProps({tracks:Array,source:Object})
</script>
<template><div class="track-table" role="table" aria-label="歌曲列表"><div class="table-head" role="row"><span>#</span><span>歌曲</span><span>专辑 / 节目</span><span></span><span>时长</span></div>
  <div v-for="(t,i) in tracks" :key="t.id+'-'+i" class="track-row" :class="{current:s.current?.id===t.id}" role="row">
    <span class="track-number"><span v-if="s.current?.id===t.id&&s.playing" class="equalizer"><i></i><i></i><i></i></span><span v-else>{{String(i+1).padStart(2,'0')}}</span></span>
    <button class="track-title" :aria-label="'播放 '+t.name" @click="guard(play)(t,tracks,source)"><Art :src="t.album.cover" :name="t.name" /><span><strong>{{t.name}} <small v-if="t.fee===1" class="vip">VIP</small><small v-if="t.recommended" class="recommend-label">心动推荐</small></strong><em>{{t.artists.map(a=>a.name).join(' / ')}}</em></span></button>
    <span class="track-album">{{t.album.name}}</span>
    <button v-if="!t.program" class="icon-button like" :class="{liked:s.mine.likes.includes(t.id)}" :aria-label="s.mine.likes.includes(t.id)?'取消喜欢 '+t.name:'喜欢 '+t.name" @click="guard(like)(t)"><Icon name="heart" :size="18" /></button><span v-else></span>
    <span class="track-duration">{{formatTime(t.duration)}}</span>
  </div>
</div></template>
