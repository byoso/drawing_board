<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean
  value: string
  title: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

function onInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:value', String(target?.value || ''))
}
</script>

<template>
  <div v-if="props.isOpen" class="app-modal" role="dialog" aria-modal="true">
    <div class="app-modal-card">
      <header class="app-modal-header">
        <h3>{{ props.title }}</h3>
      </header>
      <section class="app-modal-body">
        <div class="field">
          <label class="label">Text</label>
          <div class="control">
            <textarea
              class="textarea"
              :value="props.value"
              rows="8"
              placeholder="Type your text"
              @input="onInput"
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
