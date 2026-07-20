<script setup lang="ts">
import { ref } from 'vue'

interface SchemaListItem {
  id: string
  name: string
  updatedAt: number
}

interface SchemaFrameItem {
  id: string
  label: string
}

const isCollapsed = ref(false)

defineProps<{
  schemas: SchemaListItem[]
  activeSchemaId: string | null
  renamingSchemaId: string | null
  renameDraft: string
  framesBySchemaId: Record<string, SchemaFrameItem[]>
  selectedElementId: string | null
}>()

const emit = defineEmits<{
  (e: 'select-schema', schemaId: string): void
  (e: 'start-rename', schema: SchemaListItem): void
  (e: 'commit-rename', schemaId: string): void
  (e: 'delete-schema', schemaId: string): void
  (e: 'focus-frame', frameId: string): void
  (e: 'update-rename-draft', value: string): void
}>()

function onRenameDraftInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-rename-draft', String(target?.value || ''))
}
</script>

<template>
  <div>
    <div class="section-header-row collapse-row" role="button" tabindex="0" @click="isCollapsed = !isCollapsed">
      <p class="panel-title">Diagrams</p>
      <span class="collapse-btn" aria-hidden="true">
        <span v-if="isCollapsed">&#9656;</span>
        <span v-else>&#9662;</span>
      </span>
    </div>

    <div v-if="!isCollapsed" class="schema-list">
      <article
        v-for="schema in schemas"
        :key="schema.id"
        class="schema-item"
        :class="{ active: schema.id === activeSchemaId }"
        @click="emit('select-schema', schema.id)"
      >
        <template v-if="renamingSchemaId === schema.id">
          <input
            class="input is-small"
            :value="renameDraft"
            @input="onRenameDraftInput"
            @keydown.enter.stop.prevent="emit('commit-rename', schema.id)"
            @blur="emit('commit-rename', schema.id)"
            @click.stop
          >
        </template>
        <template v-else>
          <div class="schema-row">
            <strong>{{ schema.name }}</strong>
            <span>{{ new Date(schema.updatedAt).toLocaleString('en-GB') }}</span>
          </div>
        </template>
        <div class="schema-actions" @click.stop>
          <button class="button is-small ghost-btn" @click="emit('start-rename', schema)">Rename</button>
          <button class="button is-small danger-btn" @click="emit('delete-schema', schema.id)">Delete</button>
        </div>

        <div v-if="schema.id === activeSchemaId" class="schema-frames" @click.stop>
          <p class="schema-frames-title">Frames</p>
          <div v-if="(framesBySchemaId[schema.id] || []).length" class="schema-frames-list">
            <button
              v-for="frame in framesBySchemaId[schema.id]"
              :key="frame.id"
              class="schema-frame-row"
              :class="{ active: selectedElementId === frame.id }"
              @click.stop="emit('focus-frame', frame.id)"
            >
              <strong>{{ frame.label }}</strong>
            </button>
          </div>
          <p v-else class="schema-frames-empty">No frames yet</p>
        </div>
      </article>
    </div>
  </div>
</template>
