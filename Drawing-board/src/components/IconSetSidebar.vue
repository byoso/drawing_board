<script setup lang="ts">
interface IconItem {
  id: string
  name?: string
  src: string
}

interface IconSetItem {
  id: string
  name: string
  collapsed?: boolean
  icons: IconItem[]
}

defineProps<{
  iconSets: IconSetItem[]
}>()

const emit = defineEmits<{
  (e: 'create-set'): void
  (e: 'import-set'): void
  (e: 'toggle-collapse', iconSetId: string): void
  (e: 'add-url-icon', iconSetId: string): void
  (e: 'upload-icon', iconSetId: string): void
  (e: 'rename-set', iconSetId: string): void
  (e: 'export-set', iconSetId: string): void
  (e: 'delete-set', iconSetId: string): void
  (e: 'delete-icon', iconSetId: string, iconId: string): void
  (e: 'icon-drag-start', iconSetId: string, iconId: string, event: DragEvent): void
}>()

function getSortedIcons(iconSet: IconSetItem): IconItem[] {
  if (!iconSet || !Array.isArray(iconSet.icons)) {
    return []
  }
  return [...iconSet.icons].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
}
</script>

<template>
  <div>
    <p class="panel-title icon-sets-title">Icon sets</p>
    <div class="icon-set-list">
      <div class="icon-set-actions">
        <button class="button is-small ghost-btn" @click="emit('create-set')">New set</button>
        <button class="button is-small ghost-btn" @click="emit('import-set')">Import JSON</button>
      </div>

      <article v-for="iconSet in iconSets" :key="iconSet.id" class="icon-set-item">
        <div class="icon-set-row collapse-row" role="button" tabindex="0" @click="emit('toggle-collapse', iconSet.id)">
          <strong>{{ iconSet.name }}</strong>
          <div class="icon-set-row-meta">
            <span>{{ iconSet.icons.length }} icons</span>
            <span class="collapse-btn" aria-hidden="true">
              <span v-if="iconSet.collapsed">&#9656;</span>
              <span v-else>&#9662;</span>
            </span>
          </div>
        </div>

        <div class="icon-set-actions" v-if="!iconSet.collapsed">
          <button class="button is-small ghost-btn" @click="emit('add-url-icon', iconSet.id)">Add URL icon</button>
          <button class="button is-small ghost-btn" @click="emit('upload-icon', iconSet.id)">Upload icon</button>
          <button class="button is-small ghost-btn" @click="emit('rename-set', iconSet.id)">Rename</button>
          <button class="button is-small ghost-btn" @click="emit('export-set', iconSet.id)">Export JSON</button>
          <button class="button is-small danger-btn" @click="emit('delete-set', iconSet.id)">Delete set</button>
        </div>

        <div class="icon-list" v-if="!iconSet.collapsed && iconSet.icons.length">
          <div
            v-for="icon in getSortedIcons(iconSet)"
            :key="icon.id"
            class="icon-thumb"
            draggable="true"
            @dragstart="emit('icon-drag-start', iconSet.id, icon.id, $event)"
          >
            <img :src="icon.src" :alt="icon.name || 'icon'" :title="icon.name || 'icon'" />
            <div class="icon-thumb-meta">
              <button class="button is-small ghost-btn mini-btn" @click.stop="emit('delete-icon', iconSet.id, icon.id)">Delete</button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
