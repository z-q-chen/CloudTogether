<script setup>
import {computed,ref,watch} from 'vue'
import Icon from './Icon.vue'
import {cover} from './domain.mjs'
const props=defineProps({src:String,name:String,size:{type:Number,default:30}})
const broken=ref(false)
const url=computed(()=>{const value=cover(props.src);try{const u=new URL(value);if(u.hostname.endsWith('.music.126.net'))u.searchParams.set('param','128y128');return u.href}catch{return ''}})
watch(url,()=>broken.value=false)
</script>
<template><span class="avatar" :style="{width:size+'px',height:size+'px'}" :title="name"><img v-if="url&&!broken" :src="url" :alt="name||'账号头像'" referrerpolicy="no-referrer" @error="broken=true"><span v-else class="avatar-fallback" :aria-label="(name||'听友')+'的头像占位'"><span v-if="name">{{name.trim().slice(0,1)}}</span><Icon v-else name="user" :size="Math.round(size*.55)" /></span></span></template>
