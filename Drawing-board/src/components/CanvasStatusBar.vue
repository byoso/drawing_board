<script setup lang="ts">
defineProps<{
  activeSchemaName: string
  isDirty: boolean
  zoomPercent: number
  viewportX: number
  viewportY: number
  canStartSlideshow: boolean
}>()

const emit = defineEmits<{
  (e: 'reset-zoom'): void
  (e: 'start-slideshow'): void
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
      <button
        class="button slideshow-launch-btn"
        aria-label="Start slideshow"
        :disabled="!canStartSlideshow"
        @click="emit('start-slideshow')"
      >
        &#9654;
      </button>
      <p class="zoom-state">Zoom: {{ zoomPercent }}% | X: {{ viewportX }} | Y: {{ viewportY }}</p>
      <button class="button zoom-reset-btn" aria-label="Reset zoom to 100%" @click="emit('reset-zoom')">
        &#128269;
      </button>
    </div>
  </div>
</template>
