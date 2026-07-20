<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean
  title: string
  fields: string[]
}>()

const emit = defineEmits<{
  (e: 'update:title', value: string): void
  (e: 'update:field', payload: { index: number; value: string }): void
  (e: 'add-field'): void
  (e: 'remove-field', index: number): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

function onTitleInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:title', String(target?.value || ''))
}

function onFieldInput(index: number, event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:field', { index, value: String(target?.value || '') })
}
</script>

<template>
  <div v-if="props.isOpen" class="app-modal" role="dialog" aria-modal="true">
    <div class="app-modal-card">
      <header class="app-modal-header">
        <h3>Edit table</h3>
      </header>
      <section class="app-modal-body">
        <div class="field">
          <label class="label">Title</label>
          <div class="control">
            <input class="input" :value="props.title" placeholder="Table" @input="onTitleInput" />
          </div>
        </div>

        <div class="field">
          <div class="table-fields-header">
            <label class="label">Fields</label>
            <button class="button mini-btn" @click="emit('add-field')">Add field</button>
          </div>
          <div class="table-fields-list">
            <div v-for="(field, index) in props.fields" :key="index" class="table-field-row">
              <input class="input" :value="field" placeholder="field" @input="onFieldInput(index, $event)" />
              <button class="button danger-btn mini-btn" @click="emit('remove-field', index)">Remove</button>
            </div>
            <p v-if="props.fields.length === 0" class="table-fields-empty">No fields yet.</p>
          </div>
        </div>
      </section>
      <footer class="app-modal-footer">
        <button class="button ghost-btn" @click="emit('cancel')">Cancel</button>
        <button class="button save-btn" @click="emit('save')">Save</button>
      </footer>
    </div>
  </div>
</template>
