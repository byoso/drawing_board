<script setup lang="ts">
import type { RelationType, ToolDef, ToolId, ToolSetId } from '@/board/types'

defineProps<{
  toolSetOptions: Array<{ id: ToolSetId; label: string }>
  activeToolSet: ToolSetId
  tools: ToolDef[]
  activeTool: ToolId
  colorPalette: string[]
  activeColor: string
  lineStyle: 'solid' | 'dashed'
  drawSize: 'small' | 'medium' | 'big'
  showDrawOptions: boolean
  showProperties: boolean
  selectedCount: number
  selectedIsFrame: boolean
  selectedIsArrowLike: boolean
  selectedIsRelation: boolean
  selectedColor: string | null
  selectedLineStyle: 'solid' | 'dashed' | null
  selectedSize: 'small' | 'medium' | 'big' | null
  selectedArrowBreaks: number
  selectedArrowOrthogonal: boolean
  selectedRelationType: RelationType
  canIncrementArrowBreaks: boolean
  canDecrementArrowBreaks: boolean
  hasColorProperty: boolean
  hasLineStyleProperty: boolean
  hasSizeProperty: boolean
  selectedFrameName: string
  selectedFrameIndex: number
  selectedFrameMaxIndex: number
  canShiftFrameIndexDown: boolean
  canShiftFrameIndexUp: boolean
}>()

const emit = defineEmits<{
  (e: 'select-tool-set', toolSet: ToolSetId): void
  (e: 'select-tool', toolId: ToolId): void
  (e: 'set-active-color', color: string): void
  (e: 'set-line-style', style: 'solid' | 'dashed'): void
  (e: 'set-draw-size', size: 'small' | 'medium' | 'big'): void
  (e: 'apply-color', color: string): void
  (e: 'apply-line-style', style: 'solid' | 'dashed'): void
  (e: 'apply-size', size: 'small' | 'medium' | 'big'): void
  (e: 'arrow-breaks-delta', delta: number): void
  (e: 'arrow-orthogonal-change', value: boolean): void
  (e: 'relation-type-change', value: RelationType): void
  (e: 'frame-name-change', value: string): void
  (e: 'frame-index-change', value: number): void
  (e: 'frame-index-shift', delta: number): void
}>()

function onToolSetChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const value = String(target?.value || 'tools') as ToolSetId
  emit('select-tool-set', value)
}

function onFrameNameChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('frame-name-change', String(target?.value || ''))
}

function onFrameIndexChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  const parsed = Number.parseInt(String(target?.value || ''), 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    emit('frame-index-change', parsed)
  }
}

function onArrowOrthogonalChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('arrow-orthogonal-change', Boolean(target?.checked))
}

function onRelationTypeChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  const value = String(target?.value || 'many-to-one') as RelationType
  emit('relation-type-change', value)
}
</script>

<template>
  <aside class="tool-panel">
    <select class="input is-small toolset-select" :value="activeToolSet" @change="onToolSetChange">
      <option v-for="option in toolSetOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
    </select>

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

    <div v-if="showDrawOptions" class="color-palette" aria-label="Drawing color palette">
      <p class="palette-title">Color</p>
      <div class="palette-grid">
        <button
          v-for="color in colorPalette"
          :key="color"
          class="color-swatch"
          :class="{ active: activeColor === color }"
          :style="{ backgroundColor: color }"
          @click="emit('set-active-color', color)"
          :title="color"
          aria-label="Select color"
        ></button>
      </div>
    </div>

    <div v-if="showDrawOptions" class="draw-options" aria-label="Drawing options">
      <p class="palette-title">Line style</p>
      <div class="options-row">
        <button class="option-chip" :class="{ active: lineStyle === 'solid' }" @click="emit('set-line-style', 'solid')">Solid</button>
        <button class="option-chip" :class="{ active: lineStyle === 'dashed' }" @click="emit('set-line-style', 'dashed')">Dashed</button>
      </div>

      <p class="palette-title">Size</p>
      <div class="options-row">
        <button
          v-for="size in ['small', 'medium', 'big']"
          :key="size"
          class="option-chip"
          :class="{ active: drawSize === size }"
          @click="emit('set-draw-size', size as 'small' | 'medium' | 'big')"
        >
          {{ size }}
        </button>
      </div>
    </div>

    <div v-if="showProperties" class="element-properties" aria-label="Element properties">
      <p class="palette-title">Properties</p>

      <div v-if="selectedIsFrame" class="frame-index-controls">
        <p class="palette-title">Frame name</p>
        <div class="field">
          <div class="control">
            <input
              class="input is-small"
              type="text"
              maxlength="120"
              :value="selectedFrameName"
              @change="onFrameNameChange"
            >
          </div>
        </div>

        <p class="palette-title">Frame index</p>
        <div class="frame-index-row">
          <button class="option-chip" :disabled="!canShiftFrameIndexDown" @click="emit('frame-index-shift', -1)">-</button>
          <input
            class="input is-small layer-input frame-index-input"
            type="number"
            min="1"
            :max="selectedFrameMaxIndex"
            :value="selectedFrameIndex"
            @change="onFrameIndexChange"
          >
          <span class="frame-index-total">/ {{ selectedFrameMaxIndex }}</span>
          <button class="option-chip" :disabled="!canShiftFrameIndexUp" @click="emit('frame-index-shift', 1)">+</button>
        </div>
      </div>

      <div v-if="!selectedIsFrame && hasColorProperty" class="color-palette">
        <p class="palette-title">Color</p>
        <div class="palette-grid">
          <button
            v-for="color in colorPalette"
            :key="color"
            class="color-swatch"
            :class="{ active: selectedCount === 1 && selectedColor === color }"
            :style="{ backgroundColor: color }"
            @click="emit('apply-color', color)"
            :title="color"
            aria-label="Select color"
          ></button>
        </div>
      </div>

      <div v-if="!selectedIsFrame && hasLineStyleProperty" class="options-row">
        <p class="palette-title">Line style</p>
        <div class="options-row">
          <button class="option-chip" :class="{ active: selectedCount === 1 && selectedLineStyle === 'solid' }" @click="emit('apply-line-style', 'solid')">Solid</button>
          <button class="option-chip" :class="{ active: selectedCount === 1 && selectedLineStyle === 'dashed' }" @click="emit('apply-line-style', 'dashed')">Dashed</button>
        </div>
      </div>

      <div v-if="!selectedIsFrame && hasSizeProperty" class="options-row">
        <p class="palette-title">Size</p>
        <div class="options-row">
          <button
            v-for="size in ['small', 'medium', 'big']"
            :key="size"
            class="option-chip"
            :class="{ active: selectedCount === 1 && selectedSize === size }"
            @click="emit('apply-size', size as 'small' | 'medium' | 'big')"
          >
            {{ size }}
          </button>
        </div>
      </div>

      <div v-if="selectedIsArrowLike" class="options-row">
        <p class="palette-title">Breaks</p>
        <div class="frame-index-row">
          <button class="option-chip" :disabled="!canDecrementArrowBreaks" @click="emit('arrow-breaks-delta', -1)">-</button>
          <span class="layer-info">{{ selectedArrowBreaks }}</span>
          <button class="option-chip" :disabled="!canIncrementArrowBreaks" @click="emit('arrow-breaks-delta', 1)">+</button>
        </div>
      </div>

      <div v-if="selectedIsArrowLike" class="options-row">
        <label class="checkbox">
          <input
            type="checkbox"
            :checked="selectedArrowOrthogonal"
            @change="onArrowOrthogonalChange"
          >
          Orthogonal
        </label>
      </div>

      <div v-if="selectedIsRelation" class="options-row">
        <p class="palette-title">Relation type</p>
        <label class="option-chip" :class="{ active: selectedRelationType === 'one-to-one' }">
          <input
            type="radio"
            name="relation-type-selected"
            value="one-to-one"
            :checked="selectedRelationType === 'one-to-one'"
            @change="onRelationTypeChange"
          >
          One to one
        </label>
        <label class="option-chip" :class="{ active: selectedRelationType === 'many-to-one' }">
          <input
            type="radio"
            name="relation-type-selected"
            value="many-to-one"
            :checked="selectedRelationType === 'many-to-one'"
            @change="onRelationTypeChange"
          >
          Many to one
        </label>
        <label class="option-chip" :class="{ active: selectedRelationType === 'one-to-many' }">
          <input
            type="radio"
            name="relation-type-selected"
            value="one-to-many"
            :checked="selectedRelationType === 'one-to-many'"
            @change="onRelationTypeChange"
          >
          One to many
        </label>
        <label class="option-chip" :class="{ active: selectedRelationType === 'many-to-many' }">
          <input
            type="radio"
            name="relation-type-selected"
            value="many-to-many"
            :checked="selectedRelationType === 'many-to-many'"
            @change="onRelationTypeChange"
          >
          Many to many
        </label>
      </div>
    </div>

    <div v-if="(activeTool === 'arrow' || activeTool === 'relation') && !showProperties" class="element-properties" aria-label="Arrow properties">
      <p class="palette-title">{{ activeTool === 'relation' ? 'Relation' : 'Arrow' }}</p>

      <div class="options-row">
        <p class="palette-title">Breaks</p>
        <div class="frame-index-row">
          <button class="option-chip" :disabled="!canDecrementArrowBreaks" @click="emit('arrow-breaks-delta', -1)">-</button>
          <span class="layer-info">{{ selectedArrowBreaks }}</span>
          <button class="option-chip" :disabled="!canIncrementArrowBreaks" @click="emit('arrow-breaks-delta', 1)">+</button>
        </div>
      </div>

      <div class="options-row">
        <label class="checkbox">
          <input
            type="checkbox"
            :checked="selectedArrowOrthogonal"
            @change="onArrowOrthogonalChange"
          >
          Orthogonal
        </label>
      </div>

      <div v-if="activeTool === 'relation'" class="options-row">
        <p class="palette-title">Relation type</p>
        <label class="option-chip" :class="{ active: selectedRelationType === 'one-to-one' }">
          <input
            type="radio"
            name="relation-type-creation"
            value="one-to-one"
            :checked="selectedRelationType === 'one-to-one'"
            @change="onRelationTypeChange"
          >
          One to one
        </label>
        <label class="option-chip" :class="{ active: selectedRelationType === 'many-to-one' }">
          <input
            type="radio"
            name="relation-type-creation"
            value="many-to-one"
            :checked="selectedRelationType === 'many-to-one'"
            @change="onRelationTypeChange"
          >
          Many to one
        </label>
        <label class="option-chip" :class="{ active: selectedRelationType === 'one-to-many' }">
          <input
            type="radio"
            name="relation-type-creation"
            value="one-to-many"
            :checked="selectedRelationType === 'one-to-many'"
            @change="onRelationTypeChange"
          >
          One to many
        </label>
        <label class="option-chip" :class="{ active: selectedRelationType === 'many-to-many' }">
          <input
            type="radio"
            name="relation-type-creation"
            value="many-to-many"
            :checked="selectedRelationType === 'many-to-many'"
            @change="onRelationTypeChange"
          >
          Many to many
        </label>
      </div>
    </div>
  </aside>
</template>
