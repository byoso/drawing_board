import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { SCHEMA_VERSION } from '@/board/constants'
import { loadBoardStore, persistBoardStore } from '@/board/storage'
import type { BoardStoreData, Schema, ToolDef, ToolId, ToolSetId } from '@/board/types'
import { uid } from '@/board/utils'

const SELECT_TOOL: ToolDef = { id: 'select', label: 'Select', shortcut: 'S' }

const TOOL_SETS: Record<ToolSetId, ToolDef[]> = {
  tools: [
    SELECT_TOOL,
    { id: 'rect', label: 'Rectangle', shortcut: 'R' },
    { id: 'ellipse', label: 'Ellipse', shortcut: 'E' },
    { id: 'arrow', label: 'Arrow', shortcut: 'A' },
    { id: 'frame', label: 'Frame', shortcut: 'F' },
    { id: 'text', label: 'Text', shortcut: 'T' },
  ],
  database: [
    SELECT_TOOL,
    { id: 'relation', label: 'Relation', shortcut: 'R' },
  ],
}

function ensureToolSetContainsSelect(toolSet: ToolDef[]): ToolDef[] {
  if (toolSet.some((tool) => tool.id === 'select')) {
    return toolSet
  }
  return [SELECT_TOOL, ...toolSet]
}

function makeEmptySchema(name: string): Schema {
  const now = Date.now()
  return {
    id: uid('schema'),
    name,
    createdAt: now,
    updatedAt: now,
    elements: [],
  }
}

export const useDrawingBoardStore = defineStore('drawing-board', () => {
  const toolSets = ref<Record<ToolSetId, ToolDef[]>>({
    tools: ensureToolSetContainsSelect(TOOL_SETS.tools),
    database: ensureToolSetContainsSelect(TOOL_SETS.database),
  })
  const activeToolSet = ref<ToolSetId>('tools')
  const tools = computed<ToolDef[]>(() => toolSets.value[activeToolSet.value] || toolSets.value.tools)
  const toolSetOptions = ref<Array<{ id: ToolSetId; label: string }>>([
    { id: 'tools', label: 'Tools' },
    { id: 'database', label: 'Database' },
  ])
  const colorPalette = ref(['#6B8EEA', '#4FA8A6', '#6DAE6B', '#D0A15A', '#E08960', '#C481B9', '#8E91C8', '#7E8AA2'])
  const activeColor = ref('#6B8EEA')
  const lineStyle = ref<'solid' | 'dashed'>('solid')
  const drawSize = ref<'small' | 'medium' | 'big'>('small')
  const sizePresets = ref({
    small: { strokeWidth: 2, fontSize: 18 },
    medium: { strokeWidth: 4, fontSize: 24 },
    big: { strokeWidth: 6, fontSize: 30 },
  })
  const activeTool = ref<ToolId>('select')

  const store = ref<BoardStoreData>({
    version: SCHEMA_VERSION,
    activeSchemaId: null,
    schemas: [],
    iconSets: [],
  })

  const hasInvalidJson = ref(false)

  const activeSchema = computed(() => store.value.schemas.find((schema) => schema.id === store.value.activeSchemaId) || null)
  const sortedSchemas = computed(() => [...store.value.schemas].sort((a, b) => b.updatedAt - a.updatedAt))

  function init(): void {
    const loaded = loadBoardStore()
    hasInvalidJson.value = loaded.hasInvalidJson
    store.value = loaded.store
    if (store.value.schemas.length === 0) {
      const first = makeEmptySchema('First diagram')
      store.value.schemas.push(first)
      store.value.activeSchemaId = first.id
      persist()
    }
  }

  function persist(): void {
    persistBoardStore(store.value)
  }

  function setActiveToolSet(toolSet: ToolSetId): void {
    if (!(toolSet in toolSets.value)) {
      return
    }
    activeToolSet.value = toolSet
    activeTool.value = 'select'
  }

  function activateSchema(schemaId: string): void {
    if (!store.value.schemas.some((schema) => schema.id === schemaId)) {
      return
    }
    store.value.activeSchemaId = schemaId
    persist()
  }

  function createSchema(): void {
    const schema = makeEmptySchema(`Diagram ${store.value.schemas.length + 1}`)
    store.value.schemas.unshift(schema)
    store.value.activeSchemaId = schema.id
    persist()
  }

  function saveCurrentSchema(): void {
    if (!activeSchema.value) {
      return
    }
    activeSchema.value.updatedAt = Date.now()
    persist()
  }

  function getCurrentStrokeWidth(): number {
    return sizePresets.value[drawSize.value].strokeWidth
  }

  function getCurrentFontSize(): number {
    return sizePresets.value[drawSize.value].fontSize
  }

  function getDefaultFrameName(index: number): string {
    return `Frame ${index}`
  }

  function getFrameDisplayName(frame: { name?: unknown; frameIndex?: unknown }): string {
    const parsed = Number.parseInt(String(frame.frameIndex || ''), 10)
    const index = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    const name = String(frame.name || '').trim()
    return name || getDefaultFrameName(index)
  }

  function getNextFrameIndex(): number {
    if (!activeSchema.value) {
      return 1
    }
    const frameIndexes = activeSchema.value.elements
      .filter((element) => element.type === 'frame')
      .map((element) => Number.parseInt(String(element.frameIndex || ''), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (frameIndexes.length === 0) {
      return 1
    }
    return Math.max(...frameIndexes) + 1
  }

  return {
    tools,
    toolSets,
    toolSetOptions,
    activeToolSet,
    colorPalette,
    activeColor,
    lineStyle,
    drawSize,
    sizePresets,
    activeTool,
    store,
    hasInvalidJson,
    activeSchema,
    sortedSchemas,
    init,
    persist,
    setActiveToolSet,
    activateSchema,
    createSchema,
    saveCurrentSchema,
    getCurrentStrokeWidth,
    getCurrentFontSize,
    getDefaultFrameName,
    getFrameDisplayName,
    getNextFrameIndex,
  }
})
