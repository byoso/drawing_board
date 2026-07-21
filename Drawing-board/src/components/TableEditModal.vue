<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean
  title: string
  fieldsText: string
}>()

const emit = defineEmits<{
  (e: 'update:title', value: string): void
  (e: 'update:fields-text', value: string): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

function onTitleInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:title', String(target?.value || ''))
}

function onFieldsTextInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:fields-text', String(target?.value || ''))
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
          <label class="label">Fields (one per line)</label>
          <div class="control">
            <textarea
              class="textarea"
              rows="8"
              :value="props.fieldsText"
              placeholder="id\nname\ncreated_at"
              @input="onFieldsTextInput"
            ></textarea>
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
