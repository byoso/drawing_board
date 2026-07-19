<script setup lang="ts">
defineProps<{
  activeSchemaName: string
  isDirty: boolean
  zoomPercent: number
}>()

const emit = defineEmits<{
  (e: 'reset-zoom'): void
}>()
</script>

<template>
  <div class="canvas-toolbar">
    <p>
      Active diagram:
      <strong>{{ activeSchemaName }}</strong>
    </p>
    <p class="save-state" :class="{ dirty: isDirty }">{{ isDirty ? 'Unsaved changes' : 'Saved' }}</p>
    <div class="zoom-tools">
      <p class="zoom-state">Zoom: {{ zoomPercent }}%</p>
      <button class="button zoom-reset-btn" aria-label="Reset zoom to 100%" @click="emit('reset-zoom')">
        &#128269;
      </button>
    </div>
  </div>
</template>
