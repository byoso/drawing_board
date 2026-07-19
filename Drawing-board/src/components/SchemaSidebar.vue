<script setup lang="ts">
interface SchemaListItem {
  id: string
  name: string
  updatedAt: number
}

defineProps<{
  schemas: SchemaListItem[]
  activeSchemaId: string | null
  renamingSchemaId: string | null
  renameDraft: string
}>()

const emit = defineEmits<{
  (e: 'select-schema', schemaId: string): void
  (e: 'start-rename', schema: SchemaListItem): void
  (e: 'commit-rename', schemaId: string): void
  (e: 'delete-schema', schemaId: string): void
  (e: 'update-rename-draft', value: string): void
}>()

function onRenameDraftInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-rename-draft', String(target?.value || ''))
}
</script>

<template>
  <div>
    <p class="panel-title">Diagrams</p>
    <div class="schema-list">
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
      </article>
    </div>
  </div>
</template>
