<script setup>
defineProps({name:String,size:{type:Number,default:20}})
const paths={
  plus:'M12 5v14M5 12h14',
  warning:'M12 3 2 21h20L12 3Zm0 6v5m0 3h.01',
  calendar:'M4 5h16v16H4V5ZM8 2v6m8-6v6M4 10h16',palette:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10h-4ZM7 9h.01M10 6h.01M15 6h.01M6 14h.01',
  play:'M9 5l11 7-11 7V5Z',pause:'M8 5v14M16 5v14',next:'M5 5l10 7-10 7V5Zm14 0v14',previous:'M19 5L9 12l10 7V5ZM5 5v14',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',up:'m5 15 7-7 7 7',down:'m5 9 7 7 7-7',left:'m15 5-7 7 7 7',right:'m9 5 7 7-7 7',
  queue:'M4 6h16M4 12h11M4 18h9m5-8 4 3-4 3v-6Z',volume:'M11 4 6 8H2v8h4l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  shuffle:'M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 5-6m3-6c1-1 2-2 4-2h3m-4-4 4 4-4 4',
  repeat:'m17 1 4 4-4 4M3 11V8a3 3 0 0 1 3-3h15M7 23l-4-4 4-4m14-2v3a3 3 0 0 1-3 3H3M10 10l2-1v6m-2 0h4',
  sequence:'M3 6h16m-4-4 4 4-4 4M3 12h10M3 18h16m-4-4 4 4-4 4',
  user:'M20 21v-2a7 7 0 0 0-14 0v2M17 6a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-6 2 3 3 .5 3-.5 2 3-2 2v4l2 2-2 3-3-.5-3 .5-2 3-2-3-3-.5-3 .5-2-3 2-2v-4L2 8l2-3 3 .5L10 5l2-3Z',
  close:'m6 6 12 12M6 18 18 6',refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6',fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3v-8Zm14 0h4v8h-4v-8Z',check:'m4 12 5 5L20 6',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  music:'M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3Zm12-2a3 3 0 1 1-3-3c2 0 3 1 3 3Z',sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',copy:'M8 8h13v13H8V8ZM16 3H3v13',arrow:'M4 12h16m-6-6 6 6-6 6'
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.music" /></svg></template>
