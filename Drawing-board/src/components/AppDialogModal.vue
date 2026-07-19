<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    isOpen: boolean
    title: string
    message?: string
    mode?: 'confirm' | 'prompt'
    modelValue?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }>(),
  {
    message: '',
    mode: 'confirm',
    modelValue: '',
    placeholder: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:modelValue', String(target?.value || ''))
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    emit('cancel')
  }
}
</script>

<template>
  <div v-if="props.isOpen" class="app-modal" role="dialog" aria-modal="true" @click="onBackdropClick">
    <div class="app-modal-card">
      <header class="app-modal-header">
        <h3>{{ props.title }}</h3>
      </header>
      <section class="app-modal-body">
        <p v-if="props.message" class="app-modal-message">{{ props.message }}</p>
        <input
          v-if="props.mode === 'prompt'"
          class="input"
          :value="props.modelValue"
          :placeholder="props.placeholder"
          @input="onInput"
          @keydown.enter.prevent="emit('confirm')"
          autofocus
        >
      </section>
      <footer class="app-modal-footer">
        <button class="button ghost-btn" @click="emit('cancel')">{{ props.cancelLabel }}</button>
        <button class="button" :class="props.danger ? 'danger-btn' : 'save-btn'" @click="emit('confirm')">
          {{ props.confirmLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>
