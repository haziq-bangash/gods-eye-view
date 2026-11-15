<script setup>
// A German Autobahn number sign: white on Autobahn blue with a white rim.
defineProps({
  road: { type: String, required: true },
});
</script>

<template>
  <span
    class="inline-flex h-[20px] shrink-0 items-center rounded-[5px] border-[1.5px] border-white bg-[#0050a0] px-1.5 text-caption leading-none font-bold text-white shadow-[0_0_0_1px_#0050a0,0_1px_3px_rgb(0_0_0/0.25)]"
    translate="no"
    >{{ road }}</span
  >
</template>
