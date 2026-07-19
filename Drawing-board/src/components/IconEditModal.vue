<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean
  name: string
  src: string
}>()

const emit = defineEmits<{
  (e: 'update:name', value: string): void
  (e: 'update:src', value: string): void
  (e: 'save'): void
  (e: 'delete'): void
  (e: 'cancel'): void
}>()

function onBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    emit('cancel')
  }
}

function onNameInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:name', String(target?.value || ''))
}

function onSrcInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:src', String(target?.value || ''))
}
</script>

<template>
  <div v-if="props.isOpen" class="app-modal" role="dialog" aria-modal="true" @click="onBackdropClick">
    <div class="app-modal-card">
      <header class="app-modal-header">
        <h3>Edit icon</h3>
      </header>
      <section class="app-modal-body">
        <div class="field">
          <label class="label">Name</label>
          <div class="control">
            <input class="input" :value="props.name" placeholder="icon" @input="onNameInput" />
          </div>
        </div>
        <div class="field">
          <label class="label">Path or URL</label>
          <div class="control">
            <input class="input" :value="props.src" placeholder="https://example.com/icon.svg or data/path" @input="onSrcInput" />
          </div>
        </div>
      </section>
      <footer class="app-modal-footer icon-edit-footer">
        <button class="button ghost-btn" @click="emit('cancel')">Cancel</button>
        <button class="button danger-btn" @click="emit('delete')">Delete</button>
        <button class="button save-btn" @click="emit('save')">Save</button>
      </footer>
    </div>
  </div>
</template>
