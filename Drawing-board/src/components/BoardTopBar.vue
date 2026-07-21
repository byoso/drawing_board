<script setup lang="ts">
defineProps({})

const emit = defineEmits<{
  (e: 'save-svg'): void
  (e: 'save-png'): void
  (e: 'export-json'): void
  (e: 'import-json'): void
  (e: 'save-schema'): void
  (e: 'new-schema'): void
}>()
</script>

<template>
  <header class="top-bar">
    <div class="brand">
      <h1>Drawing Board</h1>
      <p>Simple and fast diagrams, stored locally</p>
    </div>
    <div class="top-actions">
      <button class="button is-small svg-save-btn" @click="emit('save-svg')">Save SVG</button>
      <button class="button is-small png-save-btn" @click="emit('save-png')">Save PNG</button>
      <button class="button is-small ghost-btn" @click="emit('export-json')">Export JSON</button>
      <button class="button is-small ghost-btn" @click="emit('import-json')">Import JSON</button>
      <button class="button is-small save-btn" @click="emit('save-schema')">Save</button>
      <button class="button is-small ghost-btn" @click="emit('new-schema')">New</button>
    </div>
  </header>
</template>
