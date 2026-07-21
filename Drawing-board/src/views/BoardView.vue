<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/board/constants'
import type { BoardElement, RectAngle, RelationType, ToolSetId } from '@/board/types'
import { useDrawingBoardStore } from '@/stores/drawingBoard'
import { useSchemaHistory } from '@/composables/useSchemaHistory'
import { createBoardShortcutsHandler } from '@/composables/useBoardShortcuts'
import { useBoardFramesSlideshow } from '@/views/board/composables/useBoardFramesSlideshow'
import { useBoardIcons } from '@/views/board/composables/useBoardIcons'
import { useBoardClipboard } from '@/views/board/composables/useBoardClipboard'
import { useBoardSchemas } from '@/views/board/composables/useBoardSchemas'
import { useBoardSchemaImageExport } from '@/views/board/composables/useBoardSchemaImageExport'
import { useBoardSelectionProperties } from '@/views/board/composables/useBoardSelectionProperties'
import { useBoardTextTableEditors } from '@/views/board/composables/useBoardTextTableEditors'
import { useBoardCanvasRendering } from '@/views/board/composables/useBoardCanvasRendering'
import { useBoardWindowEvents } from '@/views/board/composables/useBoardWindowEvents'
import { useBoardPointerInteractions, type BoardPointerState } from '@/views/board/composables/useBoardPointerInteractions'
import { useBoardCanvasElementInteractions } from '@/views/board/composables/useBoardCanvasElementInteractions'
import { useBoardUiActions } from '@/views/board/composables/useBoardUiActions'
import { useBoardCanvasHelpers } from '@/views/board/composables/useBoardCanvasHelpers'
import BoardTopBar from '@/components/BoardTopBar.vue'
import CanvasStatusBar from '@/components/CanvasStatusBar.vue'
import ToolsPanel from '@/components/ToolsPanel.vue'
import SchemaSidebar from '@/components/SchemaSidebar.vue'
import IconSetSidebar from '@/components/IconSetSidebar.vue'
import AppDialogModal from '@/components/AppDialogModal.vue'
import IconEditModal from '@/components/IconEditModal.vue'
import TableEditModal from '@/components/TableEditModal.vue'
import TextEditModal from '@/components/TextEditModal.vue'

const board = useDrawingBoardStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedElementIds = ref<string[]>([])
const draftElement = ref<BoardElement | null>(null)
const isDirty = ref(false)
const marqueeRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const copiedElements = ref<BoardElement[]>([])
const isPointerInCanvas = ref(false)
const isSpacePressed = ref(false)
const lastCanvasPointer = ref({ x: 0, y: 0 })
const newRectAngle = ref<RectAngle>(0)
const newRectSquare = ref(false)
const newArrowBreaks = ref(0)
const newArrowOrthogonal = ref(false)
const newArrowLineOnly = ref(false)
const newRelationBreaks = ref(2)
const newRelationOrthogonal = ref(true)
const newRelationType = ref<RelationType>('many-to-one')
const iconImageCache = ref<Record<string, HTMLImageElement>>({})
const pendingIconSetId = ref<string | null>(null)
const iconUploadInputRef = ref<HTMLInputElement | null>(null)
const iconSetImportInputRef = ref<HTMLInputElement | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)
const renamingSchemaId = ref<string | null>(null)
const renameDraft = ref('')
const toast = reactive<{ message: string; type: 'info' | 'warning' | 'error' }>({
  message: '',
  type: 'info',
})
const dialogState = reactive<{
  isOpen: boolean
  mode: 'confirm' | 'prompt'
  title: string
  message: string
  value: string
  placeholder: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
}>({
  isOpen: false,
  mode: 'confirm',
  title: '',
  message: '',
  value: '',
  placeholder: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
})
const iconEditorState = reactive<{
  isOpen: boolean
  iconSetId: string | null
  iconId: string | null
  name: string
  src: string
}>({
  isOpen: false,
  iconSetId: null,
  iconId: null,
  name: '',
  src: '',
})
const tableEditorState = reactive<{
  isOpen: boolean
  tableId: string | null
  title: string
  fieldsText: string
}>({
  isOpen: false,
  tableId: null,
  title: 'Table',
  fieldsText: '',
})
const textEditorState = reactive<{
  isOpen: boolean
  mode: 'create' | 'edit'
  textId: string | null
  x: number
  y: number
  value: string
}>({
  isOpen: false,
  mode: 'create',
  textId: null,
  x: 0,
  y: 0,
  value: 'Text',
})

const viewport = reactive({
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
})

const pointer = reactive<BoardPointerState>({
  mode: 'idle',
  startX: 0,
  startY: 0,
  panStartCanvasX: 0,
  panStartCanvasY: 0,
  panStartOffsetX: 0,
  panStartOffsetY: 0,
  startElements: {},
  startElement: null,
  resizeHandle: null,
  historyCaptured: false,
  ctrlPressed: false,
  initialSelection: [],
})

const zoomPercent = computed(() => Math.round(viewport.zoom * 100))
const viewportOriginX = computed(() => Math.round(viewport.offsetX))
const viewportOriginY = computed(() => Math.round(viewport.offsetY))
const iconSets = computed(() => board.store.iconSets)
const selectedElementId = computed<string | null>(() => {
  if (selectedElementIds.value.length !== 1) {
    return null
  }
  return selectedElementIds.value[0] || null
})
const framesBySchemaId = computed<Record<string, Array<{ id: string; label: string }>>>(() => {
  const bySchema: Record<string, Array<{ id: string; label: string }>> = {}
  for (const schema of board.store.schemas) {
    bySchema[schema.id] = schema.elements
      .filter((element) => element.type === 'frame')
      .sort((a, b) => Number(a.frameIndex || 0) - Number(b.frameIndex || 0))
      .map((frame) => ({ id: frame.id, label: board.getFrameDisplayName(frame) }))
  }
  return bySchema
})
const canvasCursor = computed(() => {
  if (pointer.mode === 'pan') {
    return 'grabbing'
  }
  if (isSpacePressed.value) {
    return 'grab'
  }
  return 'default'
})
const effectiveActiveColor = computed<string>(() => {
  if (selectedElementIds.value.length !== 1) {
    return board.activeColor
  }
  return getSelectedColor() || board.activeColor
})
const effectiveLineStyle = computed<'solid' | 'dashed'>(() => {
  if (selectedElementIds.value.length !== 1) {
    return board.lineStyle
  }
  return getSelectedLineStyle() || board.lineStyle
})
const effectiveDrawSize = computed<'small' | 'medium' | 'big'>(() => {
  if (selectedElementIds.value.length !== 1) {
    return board.drawSize
  }
  return getSelectedSize() || board.drawSize
})

let renderCanvasImpl: (() => void) | null = null
let getCachedIconImageImpl: ((src: string) => HTMLImageElement | null) | null = null
let applyFrameStyleImpl: ((element: BoardElement) => void) | null = null
let markDirtyImpl: (() => void) | null = null
let showToastImpl: ((message: string, type?: 'info' | 'warning' | 'error') => void) | null = null
let openConfirmDialogImpl: ((options: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}) => Promise<boolean>) | null = null
let openPromptDialogImpl: ((options: {
  title: string
  message?: string
  value?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}) => Promise<string | null>) | null = null
let onDialogConfirmImpl: (() => void) | null = null
let onDialogCancelImpl: (() => void) | null = null
let computeElementsBoundsImpl: ((elements: BoardElement[]) => { x: number; y: number; w: number; h: number } | null) | null = null

function renderCanvas(): void {
  renderCanvasImpl?.()
}

function getIconImageForCanvas(src: string): HTMLImageElement | null {
  return getCachedIconImageImpl ? getCachedIconImageImpl(src) : null
}

function applyFrameStyle(element: BoardElement): void {
  applyFrameStyleImpl?.(element)
}

function markDirty(): void {
  markDirtyImpl?.()
}

function showToast(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
  showToastImpl?.(message, type)
}

async function openConfirmDialog(options: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return openConfirmDialogImpl ? openConfirmDialogImpl(options) : false
}

async function openPromptDialog(options: {
  title: string
  message?: string
  value?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<string | null> {
  return openPromptDialogImpl ? openPromptDialogImpl(options) : null
}

function onDialogConfirm(): void {
  onDialogConfirmImpl?.()
}

function onDialogCancel(): void {
  onDialogCancelImpl?.()
}

function computeElementsBounds(elements: BoardElement[]): { x: number; y: number; w: number; h: number } | null {
  return computeElementsBoundsImpl ? computeElementsBoundsImpl(elements) : null
}

const { seedSchemaHistory, clearSchemaHistory, pushHistoryCheckpoint, undo, redo } = useSchemaHistory({
  getActiveSchema: () => board.activeSchema,
  applyElements: (elements) => {
    if (!board.activeSchema) {
      return
    }
    board.activeSchema.elements = elements
  },
  onAfterTimeTravel: () => {
    clearSelection()
    markDirty()
    renderCanvas()
  },
})

const {
  isSelected,
  clearSelection,
  setSingleSelection,
  getSelectedElements,
  getSelectedColor,
  getSelectedLineStyle,
  getSelectedSize,
  getSelectedRect,
  getSelectedRectAngle,
  getSelectedRectSquare,
  getSelectedConnector,
  getSelectedArrow,
  getSelectedRelation,
  getSelectedArrowBreaks,
  getSelectedArrowOrthogonal,
  getSelectedArrowLineOnly,
  getSelectedRelationType,
  getSelectedRelationTypeFromElement,
  getEvenlySpacedArrowBreakPoints,
  shiftSelectedArrowBreaks,
  setSelectedArrowOrthogonal,
  setSelectedArrowLineOnly,
  setSelectedRelationType,
  setSelectedRectAngle,
  setSelectedRectSquare,
  getApplicablePropertiesForSelection,
  applyColorToSelection,
  applyLineStyle,
  applySize,
} = useBoardSelectionProperties({
  selectedElementIds,
  draftElement,
  getPointerMode: () => pointer.mode,
  getActiveSchema: () => board.activeSchema,
  getActiveTool: () => board.activeTool,
  getSizePresets: () => board.sizePresets,
  newRectAngle,
  newRectSquare,
  newArrowBreaks,
  newArrowOrthogonal,
  newArrowLineOnly,
  newRelationBreaks,
  newRelationOrthogonal,
  newRelationType,
  pushHistoryCheckpoint,
  markDirty,
  renderCanvas,
})

const {
  clamp,
  getCanvasContext,
  getCanvasPosition,
  getPointerPosition,
  getDashArrayFromStyle,
  renderCanvas: renderCanvasFromCanvas,
  onCanvasWheel,
  resetZoomView,
} = useBoardCanvasRendering({
  canvasRef,
  viewport,
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  selectedElementIds,
  draftElement,
  marqueeRect,
  getElements: () => (board.activeSchema ? board.activeSchema.elements : []),
  isSelected,
  getFrameDisplayName: (frame) => board.getFrameDisplayName(frame),
  getIconImage: getIconImageForCanvas,
})
renderCanvasImpl = renderCanvasFromCanvas

const uiActions = useBoardUiActions({
  isDirty,
  dialogState,
  toast,
  getActiveSchema: () => board.activeSchema,
})
applyFrameStyleImpl = uiActions.applyFrameStyle
markDirtyImpl = uiActions.markDirty
showToastImpl = uiActions.showToast
openConfirmDialogImpl = uiActions.openConfirmDialog
openPromptDialogImpl = uiActions.openPromptDialog
onDialogConfirmImpl = uiActions.onDialogConfirm
onDialogCancelImpl = uiActions.onDialogCancel

const canvasHelpers = useBoardCanvasHelpers({
  getCanvasContext,
  getActiveSchemaName: () => board.activeSchema?.name || null,
})
computeElementsBoundsImpl = canvasHelpers.computeElementsBounds

const {
  fitSizeWithinLimit,
  createIconSet,
  renameIconSet,
  deleteIconSet,
  addIconUrl,
  openIconEditor,
  closeIconEditor,
  saveIconEditor,
  deleteIconFromEditor,
  exportIconSet,
  openImportIconSetPicker,
  onIconSetImportFileChange,
  openIconUploadPicker,
  toggleIconSetCollapse,
  onIconUploadFileChange,
  getCachedIconImage,
  onIconDragStart,
} = useBoardIcons({
  iconSets,
  iconImageCache,
  iconEditorState,
  pendingIconSetId,
  iconUploadInputRef,
  iconSetImportInputRef,
  persist: () => board.persist(),
  renderCanvas,
  openPromptDialog,
  openConfirmDialog,
  showToast,
})
getCachedIconImageImpl = getCachedIconImage

const {
  openTableEditor,
  closeTableEditor,
  onTableEditorTitleChange,
  onTableEditorFieldsTextChange,
  saveTableEditor,
  openTextCreateEditor,
  openTextEditEditor,
  closeTextEditor,
  saveTextEditor,
} = useBoardTextTableEditors({
  tableEditorState,
  textEditorState,
  getActiveSchema: () => board.activeSchema,
  getActiveColor: () => board.activeColor,
  getCurrentFontSize: () => board.getCurrentFontSize(),
  pushHistoryCheckpoint,
  setSingleSelection,
  markDirty,
  renderCanvas,
})

function getSelectedFrame(): BoardElement | null {
  if (!board.activeSchema || selectedElementIds.value.length !== 1) {
    return null
  }
  const element = board.activeSchema.elements.find((item) => item.id === selectedElementIds.value[0]) || null
  if (!element || element.type !== 'frame') {
    return null
  }
  return element
}

const {
  canStartSlideshow,
  canGoPreviousSlide,
  canGoNextSlide,
  isSlideshowMode,
  getFramesForActiveSchema,
  getSelectedFrameName,
  onSelectedFrameNameChange,
  canShiftSelectedFrameIndex,
  shiftSelectedFrameIndex,
  onSelectedFrameIndexInputChange,
  focusFrame,
  startSlideshow,
  stopSlideshow,
  goToPreviousSlide,
  goToNextSlide,
} = useBoardFramesSlideshow({
  getActiveSchema: () => board.activeSchema,
  getFrameDisplayName: (frame) => board.getFrameDisplayName(frame),
  getDefaultFrameName: (index) => board.getDefaultFrameName(index),
  getSelectedFrame,
  setSingleSelection,
  clearSelection,
  renderCanvas,
  markDirty,
  canvasRef,
  getCanvasContext,
  viewport,
})

const {
  saveCurrentSchemaAsPng,
  saveCurrentSchemaAsSvg,
  saveSelectedFrameAsPng,
  copySelectedFramePngToClipboard,
  saveSelectedFrameAsSvg,
} = useBoardSchemaImageExport({
  getActiveSchema: () => board.activeSchema,
  getFrameDisplayName: (frame) => board.getFrameDisplayName(frame),
  getSelectedFrame,
  getSelectedRelationTypeFromElement,
  getCanvasContext,
  getDashArrayFromStyle,
  getCachedIconImage,
  computeElementsBounds,
  showToast,
})

const { deleteSelectedElement, copySelectionToClipboard, pasteClipboardSelection } = useBoardClipboard({
  selectedElementIds,
  copiedElements,
  isPointerInCanvas,
  lastCanvasPointer,
  getActiveSchema: () => board.activeSchema,
  getNextFrameIndex: () => board.getNextFrameIndex(),
  getDefaultFrameName: (index) => board.getDefaultFrameName(index),
  applyFrameStyle,
  computeElementsBounds,
  pushHistoryCheckpoint,
  setSingleSelection,
  clearSelection,
  markDirty,
  renderCanvas,
})

const { onPointerDown, onPointerMove, onPointerUp } = useBoardPointerInteractions({
  selectedElementIds,
  draftElement,
  marqueeRect,
  lastCanvasPointer,
  isSpacePressed,
  isSlideshowMode,
  newRectAngle,
  newRectSquare,
  newArrowBreaks,
  newArrowOrthogonal,
  newArrowLineOnly,
  newRelationBreaks,
  newRelationOrthogonal,
  newRelationType,
  viewport,
  pointer,
  getActiveSchema: () => board.activeSchema,
  getActiveTool: () => board.activeTool,
  getActiveColor: () => board.activeColor,
  getCurrentStrokeWidth: () => board.getCurrentStrokeWidth(),
  getCurrentFontSize: () => board.getCurrentFontSize(),
  getLineStyle: () => board.lineStyle,
  getNextFrameIndex: () => board.getNextFrameIndex(),
  getDefaultFrameName: (index) => board.getDefaultFrameName(index),
  getCanvasContext,
  getCanvasPosition,
  getPointerPosition,
  clamp,
  getEvenlySpacedArrowBreakPoints,
  applyFrameStyle,
  isSelected,
  setSingleSelection,
  clearSelection,
  pushHistoryCheckpoint,
  markDirty,
  renderCanvas,
  openTextCreateEditor,
})

const { onCanvasDrop, onCanvasDoubleClick } = useBoardCanvasElementInteractions({
  isSlideshowMode,
  iconSets,
  getActiveSchema: () => board.activeSchema,
  getActiveTool: () => board.activeTool,
  getFrameDisplayName: (frame) => board.getFrameDisplayName(frame),
  getDefaultFrameName: (index) => board.getDefaultFrameName(index),
  getCurrentStrokeWidth: () => board.getCurrentStrokeWidth(),
  getLineStyle: () => board.lineStyle,
  getPointerPosition,
  getCanvasContext,
  fitSizeWithinLimit,
  isSelected,
  setSingleSelection,
  pushHistoryCheckpoint,
  markDirty,
  renderCanvas,
  openPromptDialog,
  openTextEditEditor,
  openTableEditor,
})

function saveCurrentSchema(): void {
  board.saveCurrentSchema()
  isDirty.value = false
}

const {
  activateSchema,
  createSchema,
  startRename,
  commitRename,
  deleteSchema,
  exportCurrentSchema,
  openImportPicker,
  onImportFileChange,
} = useBoardSchemas({
  getIsDirty: () => isDirty.value,
  setIsDirty: (value) => {
    isDirty.value = value
  },
  getActiveSchema: () => board.activeSchema,
  getStoreSchemas: () => board.store.schemas,
  setStoreSchemas: (schemas) => {
    board.store.schemas = schemas
  },
  getActiveSchemaId: () => board.store.activeSchemaId,
  setActiveSchemaId: (schemaId) => {
    board.store.activeSchemaId = schemaId
  },
  activateSchemaInStore: (schemaId) => {
    board.activateSchema(schemaId)
  },
  createSchemaInStore: () => {
    board.createSchema()
  },
  persist: () => board.persist(),
  seedSchemaHistory,
  clearSchemaHistory,
  clearSelection,
  renderCanvas,
  showToast,
  openConfirmDialog,
  importInputRef,
  renamingSchemaId,
  renameDraft,
})

function onCanvasPointerEnter(event: PointerEvent): void {
  isPointerInCanvas.value = true
  lastCanvasPointer.value = getPointerPosition(event)
}

function onCanvasPointerLeave(): void {
  isPointerInCanvas.value = false
  onPointerUp()
}

const shortcutsHandler = createBoardShortcutsHandler({
  getActiveTool: () => board.activeTool,
  getActiveToolSet: () => board.activeToolSet,
  setActiveToolSet: (toolSet) => {
    board.setActiveToolSet(toolSet)
  },
  setActiveTool: (tool) => {
    board.activeTool = tool
  },
  undo,
  redo,
  save: saveCurrentSchema,
  copySelection: copySelectionToClipboard,
  pasteSelection: pasteClipboardSelection,
  deleteSelection: deleteSelectedElement,
})

const { onGlobalKeyDown, onGlobalKeyUp, onWindowBlur, onResize, onBeforeUnload } = useBoardWindowEvents({
  isSlideshowMode,
  isSpacePressed,
  isDirty,
  dialogState,
  iconEditorState,
  tableEditorState,
  textEditorState,
  stopSlideshow,
  goToPreviousSlide,
  goToNextSlide,
  onDialogCancel,
  closeIconEditor,
  closeTableEditor,
  closeTextEditor,
  renderCanvas,
  shortcutsHandler,
})

function onToolSetChange(toolSet: ToolSetId): void {
  board.setActiveToolSet(toolSet)
}

function onColorAction(color: string): void {
  if (selectedElementIds.value.length > 0 && getApplicablePropertiesForSelection().hasColor) {
    applyColorToSelection(color)
    return
  }
  board.activeColor = color
}

function onLineStyleAction(style: 'solid' | 'dashed'): void {
  if (selectedElementIds.value.length > 0 && getApplicablePropertiesForSelection().hasLineStyle) {
    applyLineStyle(style)
    return
  }
  board.lineStyle = style
}

function onDrawSizeAction(size: 'small' | 'medium' | 'big'): void {
  if (selectedElementIds.value.length > 0 && getApplicablePropertiesForSelection().hasSize) {
    applySize(size)
    return
  }
  board.drawSize = size
}

onMounted(() => {
  board.init()
  board.store.schemas.forEach((schema) => seedSchemaHistory(schema.id, schema.elements))
  renderCanvas()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onGlobalKeyDown)
  window.addEventListener('keyup', onGlobalKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onGlobalKeyDown)
  window.removeEventListener('keyup', onGlobalKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="container" id="drawing-board-app" :class="{ 'slideshow-mode': isSlideshowMode }">
    <section class="board-shell" :class="{ 'slideshow-mode': isSlideshowMode }">
      <BoardTopBar
        v-if="!isSlideshowMode"
        @save-svg="saveCurrentSchemaAsSvg"
        @save-png="saveCurrentSchemaAsPng"
        @export-json="exportCurrentSchema"
        @import-json="openImportPicker"
        @save-schema="saveCurrentSchema"
        @new-schema="createSchema"
      />

      <div class="main-grid" :class="{ 'slideshow-mode': isSlideshowMode }">
        <ToolsPanel
          v-if="!isSlideshowMode"
          :tool-set-options="board.toolSetOptions"
          :active-tool-set="board.activeToolSet"
          :tools="board.tools"
          :active-tool="board.activeTool"
          :color-palette="board.colorPalette"
          :active-color="effectiveActiveColor"
          :line-style="effectiveLineStyle"
          :draw-size="effectiveDrawSize"
          :show-line-style-draw-option="board.activeTool !== 'text'"
          :show-draw-options="board.activeTool !== 'frame' && !(board.activeTool === 'select' && selectedElementIds.length > 0)"
          :show-properties="board.activeTool === 'select' && selectedElementIds.length > 0"
          :selected-count="selectedElementIds.length"
          :selected-is-frame="Boolean(getSelectedFrame())"
          :selected-is-arrow-like="Boolean(getSelectedConnector())"
          :selected-is-relation="Boolean(getSelectedRelation())"
          :selected-is-rect="Boolean(getSelectedRect())"
          :selected-color="getSelectedColor()"
          :selected-line-style="getSelectedLineStyle()"
          :selected-size="getSelectedSize()"
          :selected-rect-angle="getSelectedRectAngle()"
          :selected-rect-square="getSelectedRectSquare()"
          :selected-arrow-breaks="getSelectedArrowBreaks()"
          :selected-arrow-orthogonal="getSelectedArrowOrthogonal()"
          :selected-arrow-line-only="getSelectedArrowLineOnly()"
          :selected-relation-type="getSelectedRelationType()"
          :can-increment-arrow-breaks="getSelectedArrowBreaks() < 8"
          :can-decrement-arrow-breaks="getSelectedArrowBreaks() > 0"
          :has-color-property="getApplicablePropertiesForSelection().hasColor"
          :has-line-style-property="getApplicablePropertiesForSelection().hasLineStyle"
          :has-size-property="getApplicablePropertiesForSelection().hasSize"
          :selected-frame-name="getSelectedFrameName()"
          :selected-frame-index="Number(getSelectedFrame()?.frameIndex || 1)"
          :selected-frame-max-index="Math.max(1, getFramesForActiveSchema().length)"
          :can-shift-frame-index-down="canShiftSelectedFrameIndex(-1)"
          :can-shift-frame-index-up="canShiftSelectedFrameIndex(1)"
          @select-tool-set="onToolSetChange"
          @select-tool="board.activeTool = $event"
          @set-active-color="onColorAction"
          @set-line-style="onLineStyleAction"
          @set-draw-size="onDrawSizeAction"
          @apply-color="applyColorToSelection"
          @apply-line-style="applyLineStyle"
          @apply-size="applySize"
          @rect-angle-change="setSelectedRectAngle"
          @rect-square-change="setSelectedRectSquare"
          @arrow-breaks-delta="shiftSelectedArrowBreaks"
          @arrow-orthogonal-change="setSelectedArrowOrthogonal"
          @arrow-line-only-change="setSelectedArrowLineOnly"
          @relation-type-change="setSelectedRelationType"
          @frame-name-change="onSelectedFrameNameChange"
          @frame-index-change="onSelectedFrameIndexInputChange"
          @frame-index-shift="shiftSelectedFrameIndex"
          @save-frame-png="saveSelectedFrameAsPng"
          @copy-frame-png-clipboard="copySelectedFramePngToClipboard"
          @save-frame-svg="saveSelectedFrameAsSvg"
        />

        <main class="canvas-wrap" :class="{ 'slideshow-mode': isSlideshowMode }">
          <CanvasStatusBar
            v-if="!isSlideshowMode"
            :active-schema-name="board.activeSchema ? board.activeSchema.name : 'None'"
            :is-dirty="isDirty"
            :zoom-percent="zoomPercent"
            :viewport-x="viewportOriginX"
            :viewport-y="viewportOriginY"
            :can-start-slideshow="canStartSlideshow"
            @reset-zoom="resetZoomView"
            @start-slideshow="startSlideshow"
          />
          <div class="canvas-zone" :class="{ 'slideshow-mode': isSlideshowMode }">
            <canvas
              ref="canvasRef"
              class="drawing-canvas"
              :class="{ 'slideshow-mode': isSlideshowMode }"
              :style="{ cursor: canvasCursor }"
              tabindex="0"
              @pointerdown="onPointerDown"
              @pointerenter="onCanvasPointerEnter"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointerleave="onCanvasPointerLeave"
              @dblclick="onCanvasDoubleClick"
              @dragover.prevent
              @drop.prevent="onCanvasDrop"
              @wheel.prevent="onCanvasWheel"
            ></canvas>
          </div>
          <div v-if="isSlideshowMode" class="slideshow-nav">
            <button class="button slideshow-nav-btn" :disabled="!canGoPreviousSlide" @click="goToPreviousSlide">&lt;</button>
            <button class="button slideshow-nav-btn" :disabled="!canGoNextSlide" @click="goToNextSlide">&gt;</button>
            <button class="button slideshow-nav-btn slideshow-close-btn" @click="stopSlideshow">X</button>
          </div>
        </main>

        <aside v-if="!isSlideshowMode" class="schema-panel">
          <SchemaSidebar
            :schemas="board.sortedSchemas"
            :active-schema-id="board.store.activeSchemaId"
            :renaming-schema-id="renamingSchemaId"
            :rename-draft="renameDraft"
            :frames-by-schema-id="framesBySchemaId"
            :selected-element-id="selectedElementId"
            @select-schema="activateSchema"
            @start-rename="startRename"
            @commit-rename="commitRename"
            @delete-schema="deleteSchema"
            @focus-frame="focusFrame"
            @update-rename-draft="renameDraft = $event"
          />

          <IconSetSidebar
            :icon-sets="iconSets"
            @create-set="createIconSet"
            @import-set="openImportIconSetPicker"
            @toggle-collapse="toggleIconSetCollapse"
            @add-url-icon="addIconUrl"
            @upload-icon="openIconUploadPicker"
            @rename-set="renameIconSet"
            @export-set="exportIconSet"
            @delete-set="deleteIconSet"
            @edit-icon="openIconEditor"
            @icon-drag-start="onIconDragStart"
          />
        </aside>
      </div>
    </section>

    <input
      ref="importInputRef"
      type="file"
      class="is-hidden"
      accept="application/json,.json"
      @change="onImportFileChange"
    >

    <input
      ref="iconUploadInputRef"
      type="file"
      class="is-hidden"
      accept="image/*,.svg"
      @change="onIconUploadFileChange"
    >

    <input
      ref="iconSetImportInputRef"
      type="file"
      class="is-hidden"
      accept="application/json,.json"
      @change="onIconSetImportFileChange"
    >

    <div v-if="toast.message" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>

    <AppDialogModal
      :is-open="dialogState.isOpen"
      :mode="dialogState.mode"
      :title="dialogState.title"
      :message="dialogState.message"
      :model-value="dialogState.value"
      :placeholder="dialogState.placeholder"
      :confirm-label="dialogState.confirmLabel"
      :cancel-label="dialogState.cancelLabel"
      :danger="dialogState.danger"
      @update:model-value="dialogState.value = $event"
      @confirm="onDialogConfirm"
      @cancel="onDialogCancel"
    />

    <IconEditModal
      :is-open="iconEditorState.isOpen"
      :name="iconEditorState.name"
      :src="iconEditorState.src"
      @update:name="iconEditorState.name = $event"
      @update:src="iconEditorState.src = $event"
      @save="saveIconEditor"
      @delete="deleteIconFromEditor"
      @cancel="closeIconEditor"
    />

    <TableEditModal
      :is-open="tableEditorState.isOpen"
      :title="tableEditorState.title"
      :fields-text="tableEditorState.fieldsText"
      @update:title="onTableEditorTitleChange"
      @update:fields-text="onTableEditorFieldsTextChange"
      @save="saveTableEditor"
      @cancel="closeTableEditor"
    />

    <TextEditModal
      :is-open="textEditorState.isOpen"
      :title="textEditorState.mode === 'create' ? 'Create text' : 'Edit text'"
      :value="textEditorState.value"
      @update:value="textEditorState.value = $event"
      @save="saveTextEditor"
      @cancel="closeTextEditor"
    />
  </div>
</template>
