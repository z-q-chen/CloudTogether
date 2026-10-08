<script setup>
import { ref, watch, computed } from 'vue'
import Icon from './Icon.vue'
const props=defineProps({src:String,name:String})
const broken=ref(false)
const imageSrc=computed(()=>{try{const u=new URL(props.src);if(u.hostname.endsWith('.music.126.net'))u.searchParams.set('param','600y600');return u.href}catch{return props.src}})
watch(()=>props.src,()=>broken.value=false)
</script>
<template><span class="artwork"><img v-if="src&&!broken" :src="imageSrc" :alt="name||''" loading="lazy" @error="broken=true" referrerpolicy="no-referrer"><span v-else class="art-fallback"><span class="groove"></span><Icon name="music" :size="28" /></span></span></template>
