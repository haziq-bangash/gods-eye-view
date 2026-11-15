<script setup>
// Nadelöhr's interface (src/nadeloehr): an Apple Maps-style shell over the
// globe. Upstream's views stay mounted underneath, hidden, because their
// controllers look up their elements; the shell drives them.
import Shell from '../../nadeloehr/Shell.vue';
</script>

<template>
  <Shell />
</template>
