<script setup lang="ts">
import type { ToolDef, ToolId } from '@/board/types'

defineProps<{
  tools: ToolDef[]
  activeTool: ToolId
}>()

const emit = defineEmits<{
  (e: 'select-tool', toolId: ToolId): void
}>()
</script>

<template>
  <aside class="tool-panel">
    <p class="panel-title">Tools</p>
    <button
      v-for="tool in tools"
      :key="tool.id"
      class="tool-btn"
      :class="{ active: activeTool === tool.id }"
      @click="emit('select-tool', tool.id)"
    >
      <span>{{ tool.shortcut }}</span>
      <strong>{{ tool.label }}</strong>
    </button>
  </aside>
</template>
