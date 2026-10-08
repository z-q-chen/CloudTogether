<script setup>
import Icon from './Icon.vue'
import { state as s, toggle, next, previous, guard } from './state.js'
defineProps({large:Boolean})
</script>
<template>
  <div class="transport" :class="{large}">
    <button class="icon-button" aria-label="上一首" :disabled="!s.current" @click="guard(previous)()"><Icon name="previous" :size="large?27:21" /></button>
    <button class="play-button" :class="{loading:s.loading}" :aria-label="s.playing?'暂停':'播放'" :disabled="!s.current" @click="guard(toggle)()"><Icon :name="s.playing?'pause':'play'" :size="large?30:24" /></button>
    <button class="icon-button" aria-label="下一首" :disabled="!s.current" @click="guard(next)()"><Icon name="next" :size="large?27:21" /></button>

  </div>
</template>
