<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { deepClone, hexToRgba, uid } from '@/board/utils'
import { downloadJsonFile, safeJsonParse } from '@/board/jsonTransfer'
import { FRAME_STYLE, RECT_CORNER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from '@/board/constants'
import {
  drawElement,
  drawResizeHandles,
  getArrowPathPoints,
  getElementBounds,
  getResizeHandles,
  hitResizeHandle,
  hitTestElement,
  type ResizeHandle,
} from '@/board/canvas'
import type { BoardElement, RelationType, ToolSetId } from '@/board/types'
import { useDrawingBoardStore } from '@/stores/drawingBoard'
import { useSchemaHistory } from '@/composables/useSchemaHistory'
import { createBoardShortcutsHandler } from '@/composables/useBoardShortcuts'
import BoardTopBar from '@/components/BoardTopBar.vue'
import CanvasStatusBar from '@/components/CanvasStatusBar.vue'
import ToolsPanel from '@/components/ToolsPanel.vue'
import SchemaSidebar from '@/components/SchemaSidebar.vue'
import IconSetSidebar from '@/components/IconSetSidebar.vue'
import AppDialogModal from '@/components/AppDialogModal.vue'
import IconEditModal from '@/components/IconEditModal.vue'

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
const newArrowBreaks = ref(0)
const newArrowOrthogonal = ref(false)
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
let resolveDialog: ((result: { confirmed: boolean; value: string }) => void) | null = null
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

const viewport = reactive({
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
})

const pointer = reactive<{
  mode: 'idle' | 'draw' | 'drag' | 'resize' | 'pan'
  startX: number
  startY: number
  panStartCanvasX: number
  panStartCanvasY: number
  panStartOffsetX: number
  panStartOffsetY: number
  startElements: Record<string, BoardElement>
  startElement: BoardElement | null
  resizeHandle: ResizeHandle | null
  historyCaptured: boolean
  ctrlPressed: boolean
  initialSelection: string[]
}>({
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getCanvasContext(): CanvasRenderingContext2D | null {
  return canvasRef.value ? canvasRef.value.getContext('2d') : null
}

function getCanvasPosition(event: PointerEvent | WheelEvent) {
  const canvas = canvasRef.value
  if (!canvas) {
    return { x: 0, y: 0 }
  }
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function getPointerPosition(event: PointerEvent | WheelEvent) {
  const p = getCanvasPosition(event)
  return {
    x: clamp(p.x / viewport.zoom + viewport.offsetX, 0, WORLD_WIDTH),
    y: clamp(p.y / viewport.zoom + viewport.offsetY, 0, WORLD_HEIGHT),
  }
}

function isSelected(id: string): boolean {
  return selectedElementIds.value.includes(id)
}

function clearSelection(): void {
  selectedElementIds.value = []
}

function setSingleSelection(id: string): void {
  selectedElementIds.value = id ? [id] : []
}

function getDashArrayFromStyle(style: unknown): number[] {
  return style === 'dashed' ? [10, 7] : []
}

function applyFrameStyle(element: BoardElement): void {
  element.stroke = FRAME_STYLE.stroke
  element.strokeStyle = FRAME_STYLE.strokeStyle
  element.strokeWidth = FRAME_STYLE.strokeWidth
  element.fill = FRAME_STYLE.fill
}

function markDirty(): void {
  isDirty.value = true
  if (board.activeSchema) {
    board.activeSchema.updatedAt = Date.now()
  }
}

function showToast(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
  toast.message = message
  toast.type = type
  setTimeout(() => {
    if (toast.message === message) {
      toast.message = ''
    }
  }, 4000)
}

function openDialog(options: {
  mode: 'confirm' | 'prompt'
  title: string
  message?: string
  value?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<{ confirmed: boolean; value: string }> {
  dialogState.mode = options.mode
  dialogState.title = options.title
  dialogState.message = options.message || ''
  dialogState.value = options.value || ''
  dialogState.placeholder = options.placeholder || ''
  dialogState.confirmLabel = options.confirmLabel || 'Confirm'
  dialogState.cancelLabel = options.cancelLabel || 'Cancel'
  dialogState.danger = Boolean(options.danger)
  dialogState.isOpen = true
  return new Promise((resolve) => {
    resolveDialog = resolve
  })
}

async function openConfirmDialog(options: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  const result = await openDialog({ mode: 'confirm', ...options })
  return result.confirmed
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
  const result = await openDialog({ mode: 'prompt', ...options })
  if (!result.confirmed) {
    return null
  }
  return result.value
}

function closeDialog(result: { confirmed: boolean; value: string }): void {
  dialogState.isOpen = false
  const resolver = resolveDialog
  resolveDialog = null
  if (resolver) {
    resolver(result)
  }
}

function onDialogConfirm(): void {
  closeDialog({ confirmed: true, value: dialogState.value })
}

function onDialogCancel(): void {
  closeDialog({ confirmed: false, value: dialogState.value })
}

function fitSizeWithinLimit(width: number, height: number, limit = 128): { width: number; height: number } {
  const safeWidth = Math.max(1, width || limit)
  const safeHeight = Math.max(1, height || limit)
  const ratio = Math.min(limit / safeWidth, limit / safeHeight, 1)
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  }
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 128, height: image.naturalHeight || 128 })
    image.onerror = () => resolve({ width: 128, height: 128 })
    image.src = src
  })
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

async function resolveIconSourceForStorage(src: string): Promise<string> {
  const trimmed = String(src || '').trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.startsWith('data:') || !/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(trimmed, { mode: 'cors', credentials: 'omit', signal: controller.signal })
    if (!response.ok) {
      throw new Error('Icon fetch failed')
    }
    const blob = await response.blob()
    const dataUrl = await readBlobAsDataUrl(blob)
    return dataUrl || trimmed
  } catch {
    return trimmed
  } finally {
    clearTimeout(timeoutId)
  }
}

async function createIconSet(): Promise<void> {
  const name = await openPromptDialog({
    title: 'Create icon set',
    message: 'Enter a name for the new icon set.',
    placeholder: 'Icon set name',
    confirmLabel: 'Create',
  })
  const trimmedName = String(name || '').trim()
  if (!trimmedName) {
    return
  }
  iconSets.value.push({ id: uid('iconset'), name: trimmedName, collapsed: false, icons: [] })
  board.persist()
}

async function renameIconSet(iconSetId: string): Promise<void> {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  if (!iconSet) {
    return
  }
  const nextName = await openPromptDialog({
    title: 'Rename icon set',
    value: iconSet.name,
    placeholder: 'Icon set name',
    confirmLabel: 'Rename',
  })
  const trimmedName = String(nextName || '').trim()
  if (!trimmedName) {
    return
  }
  iconSet.name = trimmedName
  board.persist()
}

async function deleteIconSet(iconSetId: string): Promise<void> {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  if (!iconSet) {
    return
  }
  const confirmed = await openConfirmDialog({
    title: 'Delete icon set',
    message: `Delete icon set "${iconSet.name}"?`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!confirmed) {
    return
  }
  board.store.iconSets = iconSets.value.filter((item) => item.id !== iconSetId)
  board.persist()
}

async function addIconToSet(iconSetId: string, iconData: { name: string; src: string }): Promise<void> {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  if (!iconSet || !iconData.src) {
    return
  }
  const src = await resolveIconSourceForStorage(iconData.src)
  const dimensions = await loadImageDimensions(src)
  iconSet.icons.push({ id: uid('icon'), name: iconData.name || 'icon', src, width: dimensions.width, height: dimensions.height })
  board.persist()
}

async function addIconUrl(iconSetId: string): Promise<void> {
  const src = await openPromptDialog({
    title: 'Add icon URL',
    placeholder: 'https://example.com/icon.svg',
    confirmLabel: 'Next',
  })
  const trimmedSrc = String(src || '').trim()
  if (!trimmedSrc) {
    return
  }
  const name = await openPromptDialog({
    title: 'Icon name',
    value: 'icon',
    placeholder: 'icon',
    confirmLabel: 'Add',
  })
  const trimmedName = String(name || '').trim() || 'icon'
  await addIconToSet(iconSetId, { name: trimmedName, src: trimmedSrc })
}

function removeIcon(iconSetId: string, iconId: string): boolean {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  if (!iconSet) {
    return false
  }
  const icon = iconSet.icons.find((item) => item.id === iconId)
  if (!icon) {
    return false
  }
  delete iconImageCache.value[String(icon.src || '')]
  iconSet.icons = iconSet.icons.filter((item) => item.id !== iconId)
  board.persist()
  renderCanvas()
  return true
}

async function deleteIcon(iconSetId: string, iconId: string): Promise<void> {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  const icon = iconSet?.icons.find((item) => item.id === iconId)
  if (!iconSet || !icon) {
    return
  }
  const confirmed = await openConfirmDialog({
    title: 'Delete icon',
    message: `Delete icon "${icon.name}"?`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!confirmed) {
    return
  }
  removeIcon(iconSetId, iconId)
}

function openIconEditor(iconSetId: string, iconId: string): void {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  const icon = iconSet?.icons.find((item) => item.id === iconId)
  if (!iconSet || !icon) {
    return
  }
  iconEditorState.isOpen = true
  iconEditorState.iconSetId = iconSetId
  iconEditorState.iconId = iconId
  iconEditorState.name = String(icon.name || 'icon')
  iconEditorState.src = String(icon.src || '')
}

function closeIconEditor(): void {
  iconEditorState.isOpen = false
  iconEditorState.iconSetId = null
  iconEditorState.iconId = null
  iconEditorState.name = ''
  iconEditorState.src = ''
}

async function saveIconEditor(): Promise<void> {
  const iconSetId = iconEditorState.iconSetId
  const iconId = iconEditorState.iconId
  if (!iconSetId || !iconId) {
    return
  }
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  const icon = iconSet?.icons.find((item) => item.id === iconId)
  if (!iconSet || !icon) {
    closeIconEditor()
    return
  }
  const nextName = String(iconEditorState.name || '').trim() || 'icon'
  const nextSrcRaw = String(iconEditorState.src || '').trim()
  if (!nextSrcRaw) {
    showToast('Icon source cannot be empty.', 'error')
    return
  }
  const nextSrc = await resolveIconSourceForStorage(nextSrcRaw)
  const dimensions = await loadImageDimensions(nextSrc)
  const prevSrc = String(icon.src || '')
  icon.name = nextName
  icon.src = nextSrc
  icon.width = dimensions.width
  icon.height = dimensions.height
  if (prevSrc && prevSrc !== nextSrc) {
    delete iconImageCache.value[prevSrc]
  }
  board.persist()
  renderCanvas()
  closeIconEditor()
  showToast('Icon updated.')
}

function deleteIconFromEditor(): void {
  const iconSetId = iconEditorState.iconSetId
  const iconId = iconEditorState.iconId
  if (!iconSetId || !iconId) {
    return
  }
  if (removeIcon(iconSetId, iconId)) {
    closeIconEditor()
    showToast('Icon deleted.')
  }
}

function exportIconSet(iconSetId: string): void {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  if (!iconSet) {
    return
  }
  const payload = {
    iconSetVersion: 1,
    exportedAt: Date.now(),
    name: iconSet.name,
    icons: iconSet.icons,
  }
  downloadJsonFile(payload, iconSet.name, 'icon-set')
}

function openImportIconSetPicker(): void {
  if (iconSetImportInputRef.value) {
    iconSetImportInputRef.value.value = ''
    iconSetImportInputRef.value.click()
  }
}

async function onIconSetImportFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }
  try {
    const content = await file.text()
    const payload = safeJsonParse<{
      iconSetVersion?: number
      name?: string
      icons?: Array<{ id?: string; name?: string; src?: string; width?: number; height?: number }>
    }>(content)
    if (!payload || !Array.isArray(payload.icons)) {
      showToast('Invalid icon set JSON.', 'error')
      return
    }
    const iconSet = {
      id: uid('iconset'),
      name: String(payload.name || `Icon set ${iconSets.value.length + 1}`),
      collapsed: false,
      icons: payload.icons
        .map((icon) => ({
          id: String(icon.id || uid('icon')),
          name: String(icon.name || 'icon'),
          src: String(icon.src || ''),
          width: typeof icon.width === 'number' ? icon.width : 128,
          height: typeof icon.height === 'number' ? icon.height : 128,
        }))
        .filter((icon) => Boolean(icon.src)),
    }
    iconSets.value.push(iconSet)
    board.persist()
    showToast('Icon set imported.')
  } catch {
    showToast('Icon set import failed.', 'error')
  }
}

function openIconUploadPicker(iconSetId: string): void {
  pendingIconSetId.value = iconSetId
  if (iconUploadInputRef.value) {
    iconUploadInputRef.value.value = ''
    iconUploadInputRef.value.click()
  }
}

function toggleIconSetCollapse(iconSetId: string): void {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  if (!iconSet) {
    return
  }
  iconSet.collapsed = !iconSet.collapsed
  board.persist()
}

async function onIconUploadFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  const iconSetId = pendingIconSetId.value
  pendingIconSetId.value = null
  if (!file || !iconSetId) {
    return
  }
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
  if (!dataUrl) {
    showToast('Could not read icon file.', 'error')
    return
  }
  await addIconToSet(iconSetId, { name: file.name.replace(/\.[^.]+$/, '') || 'icon', src: dataUrl })
}

function getCachedIconImage(src: string): HTMLImageElement | null {
  if (!src) {
    return null
  }
  if (!iconImageCache.value[src]) {
    const image = new Image()
    image.onload = () => renderCanvas()
    image.onerror = () => renderCanvas()
    image.src = src
    iconImageCache.value[src] = image
  }
  return iconImageCache.value[src]
}

function onIconDragStart(iconSetId: string, iconId: string, event: DragEvent): void {
  const iconSet = iconSets.value.find((item) => item.id === iconSetId)
  const icon = iconSet?.icons.find((item) => item.id === iconId)
  if (!icon || !event.dataTransfer) {
    return
  }
  event.dataTransfer.effectAllowed = 'copy'
  const payload = JSON.stringify({ kind: 'icon', iconSetId, iconId })
  try {
    event.dataTransfer.setData('application/json', payload)
  } catch {
    // Firefox and some contexts can reject custom MIME types.
  }
  event.dataTransfer.setData('text/plain', payload)
}

async function onCanvasDrop(event: DragEvent): Promise<void> {
  if (!board.activeSchema || !event.dataTransfer) {
    return
  }
  const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain')
  if (!raw) {
    return
  }
  let payload: { kind?: string; iconSetId?: string; iconId?: string } | null = null
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }
  if (!payload || payload.kind !== 'icon' || !payload.iconSetId || !payload.iconId) {
    return
  }
  const iconSet = iconSets.value.find((item) => item.id === payload.iconSetId)
  const icon = iconSet?.icons.find((item) => item.id === payload.iconId)
  if (!icon) {
    return
  }
  const pos = getPointerPosition(event as unknown as PointerEvent)
  const fit = fitSizeWithinLimit(icon.width, icon.height, 128)
  const element: BoardElement = {
    id: uid('el'),
    type: 'icon',
    x: pos.x - fit.width / 2,
    y: pos.y - fit.height / 2,
    w: fit.width,
    h: fit.height,
    src: icon.src,
    name: icon.name,
    strokeWidth: board.getCurrentStrokeWidth(),
    strokeStyle: board.lineStyle,
  }
  pushHistoryCheckpoint()
  board.activeSchema.elements.push(element)
  setSingleSelection(element.id)
  markDirty()
  renderCanvas()
}

function deleteSelectedElement(): void {
  if (!board.activeSchema || selectedElementIds.value.length === 0) {
    return
  }
  const before = board.activeSchema.elements.length
  pushHistoryCheckpoint()
  board.activeSchema.elements = board.activeSchema.elements.filter((element) => !selectedElementIds.value.includes(element.id))
  if (board.activeSchema.elements.length !== before) {
    clearSelection()
    markDirty()
    renderCanvas()
  }
}

function copySelectionToClipboard(): boolean {
  if (!board.activeSchema || selectedElementIds.value.length === 0) {
    return false
  }
  copiedElements.value = board.activeSchema.elements
    .filter((element) => selectedElementIds.value.includes(element.id))
    .map((element) => deepClone(element))
  return copiedElements.value.length > 0
}

function computeElementsBounds(elements: BoardElement[]): { x: number; y: number; w: number; h: number } | null {
  const ctx = getCanvasContext()
  if (!elements.length) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    const b = getElementBounds(element, ctx)
    if (!b) {
      continue
    }
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

function triggerBlobDownload(blob: Blob, fallbackName = 'diagram.png'): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const schemaName = board.activeSchema?.name ? board.activeSchema.name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase() : ''
  const extMatch = String(fallbackName).match(/(\.[a-z0-9]+)$/i)
  const extension = extMatch ? extMatch[1] : '.png'
  const fallbackBase = String(fallbackName).replace(/(\.[a-z0-9]+)$/i, '')
  const hasCustomBase = Boolean(fallbackBase) && fallbackBase.toLowerCase() !== 'diagram'
  const downloadBase = hasCustomBase ? fallbackBase : schemaName
  anchor.href = url
  anchor.download = downloadBase ? `${downloadBase}${extension}` : fallbackName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

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

function getSelectedFrameExportBounds(): { x: number; y: number; w: number; h: number } | null {
  const frame = getSelectedFrame()
  if (!frame) {
    showToast('Select a frame first.', 'error')
    return null
  }
  const bounds = getElementBounds(frame, getCanvasContext())
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
    showToast('Frame has invalid dimensions.', 'error')
    return null
  }
  return bounds
}

function getSelectedFrameExportFileBase(): string {
  const frame = getSelectedFrame()
  if (!frame) {
    return 'frame'
  }
  const raw = board.getFrameDisplayName(frame).replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
  return raw || `frame_${Number(frame.frameIndex || 1)}`
}

function getSelectedElements(): BoardElement[] {
  if (!board.activeSchema || selectedElementIds.value.length === 0) {
    return []
  }
  const idSet = new Set(selectedElementIds.value)
  return board.activeSchema.elements.filter((element) => idSet.has(element.id))
}

function getSizeKeyFromElement(element: BoardElement | null): 'small' | 'medium' | 'big' | null {
  if (!element) {
    return null
  }
  const presets = board.sizePresets
  if (element.type === 'text') {
    const fontSize = Number(element.fontSize || presets.small.fontSize)
    if (fontSize === presets.small.fontSize) {
      return 'small'
    }
    if (fontSize === presets.medium.fontSize) {
      return 'medium'
    }
    if (fontSize === presets.big.fontSize) {
      return 'big'
    }
    return null
  }
  const strokeWidth = Number(element.strokeWidth || presets.small.strokeWidth)
  if (strokeWidth === presets.small.strokeWidth) {
    return 'small'
  }
  if (strokeWidth === presets.medium.strokeWidth) {
    return 'medium'
  }
  if (strokeWidth === presets.big.strokeWidth) {
    return 'big'
  }
  return null
}

function getSelectedColor(): string | null {
  if (selectedElementIds.value.length !== 1) {
    return null
  }
  const selected = getSelectedElements()[0]
  if (!selected) {
    return null
  }
  if (selected.type === 'text') {
    return String(selected.color || '') || null
  }
  if (selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'arrow' || selected.type === 'relation') {
    return String(selected.stroke || '') || null
  }
  return null
}

function getSelectedLineStyle(): 'solid' | 'dashed' | null {
  if (selectedElementIds.value.length !== 1) {
    return null
  }
  const selected = getSelectedElements()[0]
  if (!selected) {
    return null
  }
  if (selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'arrow' || selected.type === 'relation') {
    return selected.strokeStyle === 'dashed' ? 'dashed' : 'solid'
  }
  return null
}

function getSelectedSize(): 'small' | 'medium' | 'big' | null {
  if (selectedElementIds.value.length !== 1) {
    return null
  }
  return getSizeKeyFromElement(getSelectedElements()[0] || null)
}

function isConnectorElement(element: BoardElement | null | undefined): boolean {
  return Boolean(element && (element.type === 'arrow' || element.type === 'relation'))
}

function getSelectedConnector(): BoardElement | null {
  if (selectedElementIds.value.length !== 1) {
    return null
  }
  const selected = getSelectedElements()[0] || null
  if (!isConnectorElement(selected)) {
    return null
  }
  return selected
}

function getSelectedArrow(): BoardElement | null {
  const selected = getSelectedConnector()
  if (!selected || selected.type !== 'arrow') {
    return null
  }
  return selected
}

function getSelectedRelation(): BoardElement | null {
  const selected = getSelectedConnector()
  if (!selected || selected.type !== 'relation') {
    return null
  }
  return selected
}

function getSelectedArrowBreaks(): number {
  const connector = getSelectedConnector()
  if (connector) {
    return Math.max(0, Math.min(8, Math.round(Number(connector.breaks || 0))))
  }
  if (board.activeTool === 'arrow') {
    return Math.max(0, Math.min(8, Math.round(Number(newArrowBreaks.value || 0))))
  }
  if (board.activeTool === 'relation') {
    return Math.max(0, Math.min(8, Math.round(Number(newRelationBreaks.value || 0))))
  }
  return 0
}

function getSelectedArrowOrthogonal(): boolean {
  const connector = getSelectedConnector()
  if (connector) {
    return Boolean(connector.orthogonal)
  }
  if (board.activeTool === 'arrow') {
    return Boolean(newArrowOrthogonal.value)
  }
  if (board.activeTool === 'relation') {
    return Boolean(newRelationOrthogonal.value)
  }
  return false
}

function getSelectedRelationType(): RelationType {
  const relation = getSelectedRelation()
  if (relation) {
    return getSelectedRelationTypeFromElement(relation)
  }
  if (board.activeTool === 'relation') {
    return newRelationType.value
  }
  return 'many-to-one'
}

function getSelectedRelationTypeFromElement(element: BoardElement): RelationType {
  const value = String(element.relationType || 'many-to-one')
  if (value === 'one-to-one' || value === 'many-to-many') {
    return value
  }
  return 'many-to-one'
}

function ensureArrowBreakPoints(arrow: BoardElement, breakCount: number): Array<{ x: number; y: number }> {
  const normalizedCount = Math.max(0, Math.min(8, Math.round(Number(breakCount || 0))))
  const source = Array.isArray(arrow.breakPoints) ? arrow.breakPoints : []
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < normalizedCount; i += 1) {
    const raw = source[i]
    if (raw && typeof raw === 'object') {
      points.push({ x: Number(raw.x || 0), y: Number(raw.y || 0) })
      continue
    }
    const path = getArrowPathPoints({ ...arrow, breakPoints: points, breaks: normalizedCount })
    const start = path[0]!
    const end = path[path.length - 1]!
    points.push({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 })
  }
  return points
}

function getEvenlySpacedArrowBreakPoints(arrow: BoardElement, breakCount: number): Array<{ x: number; y: number }> {
  const normalizedCount = Math.max(0, Math.min(8, Math.round(Number(breakCount || 0))))
  if (normalizedCount <= 0) {
    return []
  }
  const startX = Number(arrow.x1 || 0)
  const startY = Number(arrow.y1 || 0)
  const endX = Number(arrow.x2 || 0)
  const endY = Number(arrow.y2 || 0)
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < normalizedCount; i += 1) {
    const t = (i + 1) / (normalizedCount + 1)
    points.push({
      x: startX + (endX - startX) * t,
      y: startY + (endY - startY) * t,
    })
  }
  return points
}

function getDefaultNewArrowBreakPoint(arrow: BoardElement): { x: number; y: number } {
  const path = getArrowPathPoints(arrow)
  let bestFrom = path[0]!
  let bestTo = path[path.length - 1]!
  let bestLength = -1
  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i]!
    const to = path[i + 1]!
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length > bestLength) {
      bestLength = length
      bestFrom = from
      bestTo = to
    }
  }
  return {
    x: (bestFrom.x + bestTo.x) / 2,
    y: (bestFrom.y + bestTo.y) / 2,
  }
}

function shiftSelectedArrowBreaks(delta: number): void {
  const connector = getSelectedConnector()
  if (!connector) {
    if (board.activeTool !== 'arrow' && board.activeTool !== 'relation') {
      return
    }
    const current = board.activeTool === 'relation' ? newRelationBreaks.value : newArrowBreaks.value
    const next = Math.max(0, Math.min(8, current + delta))
    if (next === current) {
      return
    }
    if (board.activeTool === 'relation') {
      newRelationBreaks.value = next
    } else {
      newArrowBreaks.value = next
    }
    if (pointer.mode === 'draw' && draftElement.value && isConnectorElement(draftElement.value)) {
      draftElement.value.breaks = next
      draftElement.value.breakPoints = getEvenlySpacedArrowBreakPoints(draftElement.value, next)
      renderCanvas()
    }
    return
  }
  const current = getSelectedArrowBreaks()
  const next = Math.max(0, Math.min(8, current + delta))
  if (next === current) {
    return
  }
  pushHistoryCheckpoint()
  if (next > current) {
    const points = ensureArrowBreakPoints(connector, current)
    points.push(getDefaultNewArrowBreakPoint({ ...connector, breakPoints: points, breaks: current }))
    connector.breakPoints = points.slice(0, next)
  } else {
    const points = ensureArrowBreakPoints(connector, current)
    connector.breakPoints = points.slice(0, next)
  }
  connector.breaks = next
  markDirty()
  renderCanvas()
}

function setSelectedArrowOrthogonal(value: boolean): void {
  const connector = getSelectedConnector()
  if (!connector) {
    if (board.activeTool !== 'arrow' && board.activeTool !== 'relation') {
      return
    }
    const current = board.activeTool === 'relation' ? newRelationOrthogonal.value : newArrowOrthogonal.value
    if (current === value) {
      return
    }
    if (board.activeTool === 'relation') {
      newRelationOrthogonal.value = value
    } else {
      newArrowOrthogonal.value = value
    }
    if (pointer.mode === 'draw' && draftElement.value && isConnectorElement(draftElement.value)) {
      draftElement.value.orthogonal = value
      renderCanvas()
    }
    return
  }
  if (Boolean(connector.orthogonal) === value) {
    return
  }
  pushHistoryCheckpoint()
  connector.orthogonal = value
  markDirty()
  renderCanvas()
}

function setSelectedRelationType(value: RelationType): void {
  const relation = getSelectedRelation()
  if (!relation) {
    if (board.activeTool !== 'relation' || newRelationType.value === value) {
      return
    }
    newRelationType.value = value
    if (pointer.mode === 'draw' && draftElement.value?.type === 'relation') {
      draftElement.value.relationType = value
      renderCanvas()
    }
    return
  }
  if (relation.relationType === value) {
    return
  }
  pushHistoryCheckpoint()
  relation.relationType = value
  markDirty()
  renderCanvas()
}

function getApplicablePropertiesForSelection(): { hasColor: boolean; hasLineStyle: boolean; hasSize: boolean } {
  const elements = getSelectedElements()
  const hasColor = elements.some((element) => element.type === 'text' || element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation')
  const hasLineStyle = elements.some((element) => element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation')
  const hasSize = elements.some((element) => element.type === 'text' || element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation')
  return { hasColor, hasLineStyle, hasSize }
}

function applyColorToSelection(color: string): void {
  if (!board.activeSchema || selectedElementIds.value.length === 0) {
    return
  }
  pushHistoryCheckpoint()
  const idSet = new Set(selectedElementIds.value)
  for (const element of board.activeSchema.elements) {
    if (!idSet.has(element.id)) {
      continue
    }
    if (element.type === 'text') {
      element.color = color
      continue
    }
    if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation') {
      element.stroke = color
      if (element.type === 'rect' || element.type === 'ellipse') {
        element.fill = hexToRgba(color, 0.22)
      }
    }
  }
  markDirty()
  renderCanvas()
}

function applyLineStyle(style: 'solid' | 'dashed'): void {
  if (!board.activeSchema || selectedElementIds.value.length === 0) {
    return
  }
  pushHistoryCheckpoint()
  const idSet = new Set(selectedElementIds.value)
  for (const element of board.activeSchema.elements) {
    if (!idSet.has(element.id)) {
      continue
    }
    if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation') {
      element.strokeStyle = style
    }
  }
  markDirty()
  renderCanvas()
}

function applySize(size: 'small' | 'medium' | 'big'): void {
  if (!board.activeSchema || selectedElementIds.value.length === 0) {
    return
  }
  const preset = board.sizePresets[size]
  pushHistoryCheckpoint()
  const idSet = new Set(selectedElementIds.value)
  for (const element of board.activeSchema.elements) {
    if (!idSet.has(element.id)) {
      continue
    }
    if (element.type === 'text') {
      element.fontSize = preset.fontSize
      continue
    }
    if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation') {
      element.strokeWidth = preset.strokeWidth
    }
  }
  markDirty()
  renderCanvas()
}

function getFramesForActiveSchema(): BoardElement[] {
  if (!board.activeSchema) {
    return []
  }
  return board.activeSchema.elements
    .filter((element) => element.type === 'frame')
    .sort((a, b) => Number(a.frameIndex || 0) - Number(b.frameIndex || 0))
}

function getSelectedFrameName(): string {
  const frame = getSelectedFrame()
  return frame ? board.getFrameDisplayName(frame) : ''
}

function onSelectedFrameNameChange(value: string): void {
  const frame = getSelectedFrame()
  if (!frame) {
    return
  }
  const next = String(value || '').trim()
  const fallback = board.getDefaultFrameName(Number(frame.frameIndex || 1))
  frame.name = next || fallback
  markDirty()
  renderCanvas()
}

function canShiftSelectedFrameIndex(delta: number): boolean {
  const frame = getSelectedFrame()
  if (!frame) {
    return false
  }
  const frames = getFramesForActiveSchema()
  const max = frames.length
  const current = Number(frame.frameIndex || 1)
  const target = current + delta
  return target >= 1 && target <= max
}

function setSelectedFrameIndex(nextIndex: number): void {
  const frame = getSelectedFrame()
  if (!frame) {
    return
  }
  const frames = getFramesForActiveSchema()
  const max = frames.length
  const current = Number(frame.frameIndex || 1)
  const target = clamp(Math.round(nextIndex), 1, max)
  if (target === current) {
    return
  }
  const swap = frames.find((item) => item.id !== frame.id && Number(item.frameIndex || 1) === target)
  if (swap) {
    swap.frameIndex = current
  }
  frame.frameIndex = target
  markDirty()
  renderCanvas()
}

function shiftSelectedFrameIndex(delta: number): void {
  const frame = getSelectedFrame()
  if (!frame) {
    return
  }
  setSelectedFrameIndex(Number(frame.frameIndex || 1) + delta)
}

function onSelectedFrameIndexInputChange(value: number): void {
  if (!Number.isFinite(value)) {
    return
  }
  setSelectedFrameIndex(value)
}

function focusViewportOnBounds(bounds: { x: number; y: number; w: number; h: number }): void {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }
  const canvasRect = canvas.getBoundingClientRect()
  const canvasWidth = Math.max(1, canvasRect.width)
  const canvasHeight = Math.max(1, canvasRect.height)
  const padding = 20
  const availableWidth = Math.max(1, canvasWidth - padding * 2)
  const availableHeight = Math.max(1, canvasHeight - padding * 2)

  const fitZoom = Math.min(availableWidth / Math.max(1, bounds.w), availableHeight / Math.max(1, bounds.h))
  const targetZoom = clamp(Math.min(1, fitZoom), 0.1, 4)
  viewport.zoom = targetZoom

  const centerX = bounds.x + bounds.w / 2
  const centerY = bounds.y + bounds.h / 2
  viewport.offsetX = clamp(centerX - canvasWidth / (2 * targetZoom), 0, WORLD_WIDTH)
  viewport.offsetY = clamp(centerY - canvasHeight / (2 * targetZoom), 0, WORLD_HEIGHT)
}

function focusFrame(frameId: string): void {
  if (!board.activeSchema) {
    return
  }
  const frame = board.activeSchema.elements.find((element) => element.id === frameId && element.type === 'frame')
  if (!frame) {
    return
  }
  const bounds = getElementBounds(frame, getCanvasContext())
  if (bounds) {
    focusViewportOnBounds(bounds)
  }
  setSingleSelection(frameId)
  renderCanvas()
}

async function buildSchemaPngBlob(exportBounds: { x: number; y: number; w: number; h: number } | null = null): Promise<Blob | null> {
  if (!board.activeSchema || board.activeSchema.elements.length === 0) {
    showToast('Nothing to export: diagram is empty.', 'error')
    return null
  }

  let bounds = exportBounds
  let exportWidth = 0
  let exportHeight = 0
  let offsetX = 0
  let offsetY = 0

  if (bounds) {
    exportWidth = Math.ceil(bounds.w)
    exportHeight = Math.ceil(bounds.h)
    offsetX = -bounds.x
    offsetY = -bounds.y
  } else {
    const computedBounds = computeElementsBounds(board.activeSchema.elements)
    if (!computedBounds) {
      showToast('Could not compute diagram bounds.', 'error')
      return null
    }
    bounds = computedBounds
    const margin = 5
    exportWidth = Math.ceil(bounds.w + margin * 2)
    exportHeight = Math.ceil(bounds.h + margin * 2)
    offsetX = margin - bounds.x
    offsetY = margin - bounds.y
  }

  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
  const outCanvas = document.createElement('canvas')
  outCanvas.width = Math.max(1, Math.floor(exportWidth * dpr))
  outCanvas.height = Math.max(1, Math.floor(exportHeight * dpr))
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) {
    showToast('Canvas export context unavailable.', 'error')
    return null
  }

  outCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  outCtx.clearRect(0, 0, exportWidth, exportHeight)
  outCtx.fillStyle = '#ffffff'
  outCtx.fillRect(0, 0, exportWidth, exportHeight)
  outCtx.save()
  outCtx.translate(offsetX, offsetY)
  for (const element of board.activeSchema.elements) {
    outCtx.setLineDash(getDashArrayFromStyle(element.strokeStyle))
    drawElement(outCtx, element, {
      selected: false,
      getFrameName: board.getFrameDisplayName,
      getIconImage: getCachedIconImage,
    })
  }
  outCtx.restore()

  return await new Promise((resolve) => outCanvas.toBlob((result) => resolve(result), 'image/png'))
}

function escapeXml(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toSvgNumber(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return 0
  }
  return Math.round(num * 100) / 100
}

type Segment2D = { x1: number; y1: number; x2: number; y2: number }

function getRelationEndpointKind(type: RelationType, atStart: boolean): 'one' | 'many' {
  if (type === 'one-to-one') {
    return 'one'
  }
  if (type === 'many-to-many') {
    return 'many'
  }
  return atStart ? 'many' : 'one'
}

function buildRelationEndpointSegments(
  tip: { x: number; y: number },
  inner: { x: number; y: number },
  kind: 'one' | 'many',
): Segment2D[] {
  const dx = tip.x - inner.x
  const dy = tip.y - inner.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux

  if (kind === 'one') {
    const centerX = tip.x - ux * 4
    const centerY = tip.y - uy * 4
    const half = 5
    return [
      {
        x1: centerX - px * half,
        y1: centerY - py * half,
        x2: centerX + px * half,
        y2: centerY + py * half,
      },
    ]
  }

  const baseX = tip.x - ux * 10
  const baseY = tip.y - uy * 10
  const centerTipX = tip.x - ux * 1
  const centerTipY = tip.y - uy * 1
  const spread = 6
  return [
    { x1: baseX, y1: baseY, x2: centerTipX, y2: centerTipY },
    { x1: baseX, y1: baseY, x2: centerTipX + px * spread, y2: centerTipY + py * spread },
    { x1: baseX, y1: baseY, x2: centerTipX - px * spread, y2: centerTipY - py * spread },
  ]
}

function buildSchemaSvgString(exportBounds: { x: number; y: number; w: number; h: number } | null = null): string | null {
  if (!board.activeSchema || board.activeSchema.elements.length === 0) {
    showToast('Nothing to export: diagram is empty.', 'error')
    return null
  }

  const bounds = exportBounds || computeElementsBounds(board.activeSchema.elements)
  if (!bounds) {
    showToast('Could not compute diagram bounds.', 'error')
    return null
  }

  const margin = exportBounds ? 0 : 5
  const width = Math.ceil(bounds.w + margin * 2)
  const height = Math.ceil(bounds.h + margin * 2)
  const translateX = margin - bounds.x
  const translateY = margin - bounds.y

  const shapes: string[] = []
  for (const element of board.activeSchema.elements) {
    if (element.type === 'frame') {
      const x = toSvgNumber(Number(element.x || 0) + translateX)
      const y = toSvgNumber(Number(element.y || 0) + translateY)
      const w = toSvgNumber(Math.abs(Number(element.w || 0)))
      const h = toSvgNumber(Math.abs(Number(element.h || 0)))
      shapes.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${FRAME_STYLE.stroke}" stroke-width="${FRAME_STYLE.strokeWidth}" stroke-dasharray="${FRAME_STYLE.dashArray.join(',')}" />`,
      )
      const labelX = toSvgNumber(x + FRAME_STYLE.title.xOffset)
      const labelY = toSvgNumber(y + FRAME_STYLE.title.yOffset)
      shapes.push(
        `<text x="${labelX}" y="${labelY}" fill="${FRAME_STYLE.stroke}" font-size="${FRAME_STYLE.title.fontSize}" font-family="${FRAME_STYLE.title.fontFamily}" font-weight="${FRAME_STYLE.title.fontWeight}">${escapeXml(board.getFrameDisplayName(element))}</text>`,
      )
      continue
    }

    if (element.type === 'rect') {
      const x = toSvgNumber(Number(element.x || 0) + translateX)
      const y = toSvgNumber(Number(element.y || 0) + translateY)
      const w = toSvgNumber(Math.abs(Number(element.w || 0)))
      const h = toSvgNumber(Math.abs(Number(element.h || 0)))
      const dash = getDashArrayFromStyle(element.strokeStyle)
      shapes.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RECT_CORNER_RADIUS}" ry="${RECT_CORNER_RADIUS}" fill="${escapeXml(element.fill || 'none')}" stroke="${escapeXml(element.stroke || '#1f2d54')}" stroke-width="${toSvgNumber(element.strokeWidth || 2)}" ${dash.length ? `stroke-dasharray="${dash.join(',')}"` : ''} />`,
      )
      continue
    }

    if (element.type === 'ellipse') {
      const x = Number(element.x || 0) + translateX
      const y = Number(element.y || 0) + translateY
      const w = Math.abs(Number(element.w || 0))
      const h = Math.abs(Number(element.h || 0))
      const dash = getDashArrayFromStyle(element.strokeStyle)
      shapes.push(
        `<ellipse cx="${toSvgNumber(x + w / 2)}" cy="${toSvgNumber(y + h / 2)}" rx="${toSvgNumber(w / 2)}" ry="${toSvgNumber(h / 2)}" fill="${escapeXml(element.fill || 'none')}" stroke="${escapeXml(element.stroke || '#1f2d54')}" stroke-width="${toSvgNumber(element.strokeWidth || 2)}" ${dash.length ? `stroke-dasharray="${dash.join(',')}"` : ''} />`,
      )
      continue
    }

    if (element.type === 'arrow') {
      const points = getArrowPathPoints(element).map((point) => ({
        x: Number(point.x) + translateX,
        y: Number(point.y) + translateY,
      }))
      if (points.length < 2) {
        continue
      }
      const stroke = escapeXml(element.stroke || '#1f2d54')
      const widthValue = toSvgNumber(element.strokeWidth || 2)
      const dash = getDashArrayFromStyle(element.strokeStyle)
      const pointsAttr = points.map((point) => `${toSvgNumber(point.x)},${toSvgNumber(point.y)}`).join(' ')
      shapes.push(
        `<polyline points="${pointsAttr}" fill="none" stroke="${stroke}" stroke-width="${widthValue}" stroke-linejoin="round" stroke-linecap="round" ${dash.length ? `stroke-dasharray="${dash.join(',')}"` : ''} />`,
      )

      const end = points[points.length - 1]!
      const prev = points[points.length - 2]!
      const angle = Math.atan2(end.y - prev.y, end.x - prev.x)
      const headSize = 12
      const hx1 = end.x - headSize * Math.cos(angle - Math.PI / 6)
      const hy1 = end.y - headSize * Math.sin(angle - Math.PI / 6)
      const hx2 = end.x - headSize * Math.cos(angle + Math.PI / 6)
      const hy2 = end.y - headSize * Math.sin(angle + Math.PI / 6)
      shapes.push(
        `<polygon points="${toSvgNumber(end.x)},${toSvgNumber(end.y)} ${toSvgNumber(hx1)},${toSvgNumber(hy1)} ${toSvgNumber(hx2)},${toSvgNumber(hy2)}" fill="${stroke}" />`,
      )
      continue
    }

    if (element.type === 'relation') {
      const points = getArrowPathPoints(element).map((point) => ({
        x: Number(point.x) + translateX,
        y: Number(point.y) + translateY,
      }))
      if (points.length < 2) {
        continue
      }
      const stroke = escapeXml(element.stroke || '#1f2d54')
      const widthValue = toSvgNumber(element.strokeWidth || 2)
      const dash = getDashArrayFromStyle(element.strokeStyle)
      const pointsAttr = points.map((point) => `${toSvgNumber(point.x)},${toSvgNumber(point.y)}`).join(' ')
      shapes.push(
        `<polyline points="${pointsAttr}" fill="none" stroke="${stroke}" stroke-width="${widthValue}" stroke-linejoin="round" stroke-linecap="round" ${dash.length ? `stroke-dasharray="${dash.join(',')}"` : ''} />`,
      )

      const relationType = getSelectedRelationTypeFromElement(element)
      const start = points[0]!
      const next = points[1]!
      const prev = points[points.length - 2]!
      const end = points[points.length - 1]!
      const startSegments = buildRelationEndpointSegments(start, next, getRelationEndpointKind(relationType, true))
      const endSegments = buildRelationEndpointSegments(end, prev, getRelationEndpointKind(relationType, false))
      for (const segment of [...startSegments, ...endSegments]) {
        shapes.push(
          `<line x1="${toSvgNumber(segment.x1)}" y1="${toSvgNumber(segment.y1)}" x2="${toSvgNumber(segment.x2)}" y2="${toSvgNumber(segment.y2)}" stroke="${stroke}" stroke-width="${widthValue}" stroke-linecap="round" />`,
        )
      }
      continue
    }

    if (element.type === 'text') {
      const x = toSvgNumber(Number(element.x || 0) + translateX)
      const y = toSvgNumber(Number(element.y || 0) + translateY)
      const fontSize = toSvgNumber(element.fontSize || 18)
      const text = String(element.text || '')
      const lines = text.split('\n')
      lines.forEach((line, index) => {
        shapes.push(
          `<text x="${x}" y="${toSvgNumber(y + index * fontSize * 1.2)}" fill="${escapeXml(element.color || '#17233f')}" font-size="${fontSize}" font-family="Space Grotesk">${escapeXml(line)}</text>`,
        )
      })
      continue
    }

    if (element.type === 'icon') {
      const x = toSvgNumber(Number(element.x || 0) + translateX)
      const y = toSvgNumber(Number(element.y || 0) + translateY)
      const w = toSvgNumber(Math.abs(Number(element.w || 0)))
      const h = toSvgNumber(Math.abs(Number(element.h || 0)))
      const href = escapeXml(element.src || '')
      shapes.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${href}" />`)
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
    ...shapes,
    '</svg>',
  ].join('\n')
}

async function saveCurrentSchemaAsPng(): Promise<void> {
  const blob = await buildSchemaPngBlob()
  if (!blob) {
    return
  }
  triggerBlobDownload(blob, 'diagram.png')
  showToast('PNG export completed.')
}

function saveCurrentSchemaAsSvg(): void {
  const markup = buildSchemaSvgString()
  if (!markup) {
    return
  }
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  triggerBlobDownload(blob, 'diagram.svg')
  showToast('SVG export completed.')
}

async function saveSelectedFrameAsPng(): Promise<void> {
  const bounds = getSelectedFrameExportBounds()
  if (!bounds) {
    return
  }
  const blob = await buildSchemaPngBlob(bounds)
  if (!blob) {
    return
  }
  triggerBlobDownload(blob, `${getSelectedFrameExportFileBase()}.png`)
  showToast('Frame PNG downloaded.')
}

function saveSelectedFrameAsSvg(): void {
  const bounds = getSelectedFrameExportBounds()
  if (!bounds) {
    return
  }
  const markup = buildSchemaSvgString(bounds)
  if (!markup) {
    return
  }
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  triggerBlobDownload(blob, `${getSelectedFrameExportFileBase()}.svg`)
  showToast('Frame SVG downloaded.')
}

function pasteClipboardSelection(): boolean {
  if (!board.activeSchema || copiedElements.value.length === 0 || !isPointerInCanvas.value) {
    return false
  }
  const clones = copiedElements.value.map((element) => ({ ...deepClone(element), id: uid('el') }))
  const sourceBounds = computeElementsBounds(copiedElements.value)
  if (sourceBounds) {
    const dx = lastCanvasPointer.value.x - (sourceBounds.x + sourceBounds.w / 2)
    const dy = lastCanvasPointer.value.y - (sourceBounds.y + sourceBounds.h / 2)
    clones.forEach((element) => {
      if (element.type === 'arrow' || element.type === 'relation') {
        element.x1 = Number(element.x1 || 0) + dx
        element.y1 = Number(element.y1 || 0) + dy
        element.x2 = Number(element.x2 || 0) + dx
        element.y2 = Number(element.y2 || 0) + dy
        if (Array.isArray(element.breakPoints)) {
          element.breakPoints = element.breakPoints.map((point) => ({
            x: Number(point?.x || 0) + dx,
            y: Number(point?.y || 0) + dy,
          }))
        }
      } else {
        element.x = Number(element.x || 0) + dx
        element.y = Number(element.y || 0) + dy
      }
    })
  }

  let nextFrameIndex = board.getNextFrameIndex()
  clones.forEach((element) => {
    if (element.type === 'frame') {
      element.frameIndex = nextFrameIndex
      element.name = String(element.name || '').trim() || board.getDefaultFrameName(nextFrameIndex)
      applyFrameStyle(element)
      nextFrameIndex += 1
    }
  })

  pushHistoryCheckpoint()
  board.activeSchema.elements.push(...clones)
  selectedElementIds.value = clones.map((element) => element.id)
  markDirty()
  renderCanvas()
  return true
}

function renderCanvas(): void {
  const canvas = canvasRef.value
  const ctx = getCanvasContext()
  if (!canvas || !ctx) {
    return
  }

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(300, Math.floor(rect.width))
  const height = Math.max(250, Math.floor(rect.height))
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#fde8ef'
  ctx.fillRect(0, 0, width, height)

  const worldScreenX = -viewport.offsetX * viewport.zoom
  const worldScreenY = -viewport.offsetY * viewport.zoom
  const worldScreenW = WORLD_WIDTH * viewport.zoom
  const worldScreenH = WORLD_HEIGHT * viewport.zoom
  const visibleWorldX = Math.max(0, worldScreenX)
  const visibleWorldY = Math.max(0, worldScreenY)
  const visibleWorldW = Math.min(width, worldScreenX + worldScreenW) - visibleWorldX
  const visibleWorldH = Math.min(height, worldScreenY + worldScreenH) - visibleWorldY

  if (visibleWorldW > 0 && visibleWorldH > 0) {
    ctx.fillStyle = '#f8fbff'
    ctx.fillRect(visibleWorldX, visibleWorldY, visibleWorldW, visibleWorldH)

    ctx.save()
    ctx.beginPath()
    ctx.rect(visibleWorldX, visibleWorldY, visibleWorldW, visibleWorldH)
    ctx.clip()

    ctx.strokeStyle = '#e9eef8'
    ctx.lineWidth = 1
    const grid = 20
    const scaledGrid = grid * viewport.zoom
    const startX = -((((viewport.offsetX * viewport.zoom) % scaledGrid) + scaledGrid) % scaledGrid)
    const startY = -((((viewport.offsetY * viewport.zoom) % scaledGrid) + scaledGrid) % scaledGrid)

    for (let x = startX; x < width; x += scaledGrid) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = startY; y < height; y += scaledGrid) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.save()
  ctx.scale(viewport.zoom, viewport.zoom)
  ctx.translate(-viewport.offsetX, -viewport.offsetY)

  const elements = board.activeSchema ? board.activeSchema.elements : []
  for (const element of elements) {
    ctx.setLineDash(getDashArrayFromStyle(element.strokeStyle))
    drawElement(ctx, element, {
      selected: isSelected(element.id),
      getFrameName: board.getFrameDisplayName,
      getIconImage: getCachedIconImage,
    })

    if (selectedElementIds.value.length === 1 && isSelected(element.id) && element.type !== 'text') {
      drawResizeHandles(ctx, getResizeHandlesForElement(element))
    }
  }

  if (draftElement.value) {
    ctx.setLineDash(getDashArrayFromStyle(draftElement.value.strokeStyle))
    drawElement(ctx, draftElement.value, {
      selected: false,
      getFrameName: board.getFrameDisplayName,
      getIconImage: getCachedIconImage,
    })
  }

  if (marqueeRect.value) {
    const m = marqueeRect.value
    ctx.save()
    ctx.fillStyle = '#2c79f226'
    ctx.strokeStyle = '#2c79f2'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    ctx.fillRect(m.x, m.y, m.w, m.h)
    ctx.strokeRect(m.x, m.y, m.w, m.h)
    ctx.restore()
  }

  ctx.restore()
}

function getResizeHandlesForElement(element: BoardElement) {
  return getResizeHandles(element, getCanvasContext())
}

function findSelectedElement(): BoardElement | null {
  if (!board.activeSchema || selectedElementIds.value.length !== 1) {
    return null
  }
  return board.activeSchema.elements.find((element) => element.id === selectedElementIds.value[0]) || null
}

function applyResize(element: BoardElement, start: BoardElement, handle: ResizeHandle, x: number, y: number): void {
  if (element.type === 'arrow' || element.type === 'relation') {
    const currentBreaks = Math.max(0, Math.min(8, Math.round(Number(element.breaks || 0))))
    let currentBreakPoints = ensureArrowBreakPoints(start, currentBreaks)
    if (handle === 'start') {
      element.x1 = x
      element.y1 = y
    } else if (handle === 'end') {
      element.x2 = x
      element.y2 = y
    } else if (String(handle).startsWith('break_')) {
      const index = Number.parseInt(String(handle).replace('break_', ''), 10)
      if (Number.isFinite(index) && index >= 0 && index < currentBreakPoints.length) {
        const legacyForceSquare = (start as { forceSquarePath?: unknown }).forceSquarePath
        const isOrthogonal = Boolean(start.orthogonal ?? legacyForceSquare)

        if (!isOrthogonal) {
          currentBreakPoints[index] = { x, y }
        } else {
          const points = getArrowPathPoints(start)
          const pathBreaks = points.slice(1, -1).map((point) => ({ x: point.x, y: point.y }))

          if (index < pathBreaks.length) {
            pathBreaks[index] = { x, y }

            const isHorizontalSegment = (from: { x: number; y: number }, to: { x: number; y: number }): boolean => {
              return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
            }

            const pathIndex = index + 1
            const previousPathPoint = points[pathIndex - 1]!
            const currentPathPoint = points[pathIndex]!
            const nextPathPoint = points[pathIndex + 1]!

            const incomingIsHorizontal = isHorizontalSegment(previousPathPoint, currentPathPoint)
            const outgoingIsHorizontal = isHorizontalSegment(currentPathPoint, nextPathPoint)

            if (index - 1 >= 0) {
              if (incomingIsHorizontal) {
                pathBreaks[index - 1]!.y = y
              } else {
                pathBreaks[index - 1]!.x = x
              }
            }

            if (index + 1 < pathBreaks.length) {
              if (outgoingIsHorizontal) {
                pathBreaks[index + 1]!.y = y
              } else {
                pathBreaks[index + 1]!.x = x
              }
            }

            currentBreakPoints = pathBreaks
          }
        }
      }
    }
    element.breaks = currentBreaks
    element.breakPoints = currentBreakPoints
    return
  }

  const startBounds = getElementBounds(start, getCanvasContext())
  if (!startBounds) {
    return
  }

  let left = startBounds.x
  let right = startBounds.x + startBounds.w
  let top = startBounds.y
  let bottom = startBounds.y + startBounds.h

  if (handle.includes('w')) {
    left = x
  }
  if (handle.includes('e')) {
    right = x
  }
  if (handle.includes('n')) {
    top = y
  }
  if (handle.includes('s')) {
    bottom = y
  }

  const minSize = 6
  if (right - left < minSize) {
    if (handle.includes('w')) {
      left = right - minSize
    } else {
      right = left + minSize
    }
  }
  if (bottom - top < minSize) {
    if (handle.includes('n')) {
      top = bottom - minSize
    } else {
      bottom = top + minSize
    }
  }

  element.x = Math.min(left, right)
  element.y = Math.min(top, bottom)
  element.w = Math.abs(right - left)
  element.h = Math.abs(bottom - top)
}

function isBoundsInsideMarquee(
  bounds: { x: number; y: number; w: number; h: number } | null,
  marquee: { x: number; y: number; w: number; h: number } | null,
): boolean {
  if (!bounds || !marquee) {
    return false
  }
  const right = bounds.x + bounds.w
  const bottom = bounds.y + bounds.h
  const marqueeRight = marquee.x + marquee.w
  const marqueeBottom = marquee.y + marquee.h
  return bounds.x >= marquee.x && bounds.y >= marquee.y && right <= marqueeRight && bottom <= marqueeBottom
}

function updateSelectionFromMarquee(): void {
  if (!board.activeSchema || !marqueeRect.value) {
    return
  }
  const ctx = getCanvasContext()
  const ids = board.activeSchema.elements
    .filter((element) => {
      const bounds = getElementBounds(element, ctx)
      return isBoundsInsideMarquee(bounds, marqueeRect.value)
    })
    .map((element) => element.id)

  if (pointer.ctrlPressed) {
    selectedElementIds.value = [...new Set([...pointer.initialSelection, ...ids])]
  } else {
    selectedElementIds.value = ids
  }
}

function createDraftForTool(pos: { x: number; y: number }): BoardElement | null {
  if (board.activeTool === 'text') {
    return {
      id: uid('el'),
      type: 'text',
      x: pos.x,
      y: pos.y,
      text: 'Text',
      color: board.activeColor,
      fontSize: board.getCurrentFontSize(),
    }
  }

  const base = {
    id: uid('el'),
    stroke: board.activeColor,
    fill: hexToRgba(board.activeColor, 0.22),
    strokeWidth: board.getCurrentStrokeWidth(),
    strokeStyle: board.lineStyle,
  } satisfies Omit<BoardElement, 'type'>

  if (board.activeTool === 'rect' || board.activeTool === 'ellipse' || board.activeTool === 'frame') {
    const draft: BoardElement = {
      ...base,
      type: board.activeTool,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
    }
    if (board.activeTool === 'frame') {
      draft.frameIndex = board.getNextFrameIndex()
      draft.name = board.getDefaultFrameName(Number(draft.frameIndex))
      applyFrameStyle(draft)
    }
    return draft
  }

  if (board.activeTool === 'arrow') {
    const breaks = Math.max(0, Math.min(8, Math.round(Number(newArrowBreaks.value || 0))))
    const draft: BoardElement = {
      ...base,
      type: 'arrow',
      x1: pos.x,
      y1: pos.y,
      x2: pos.x,
      y2: pos.y,
      breaks,
      orthogonal: Boolean(newArrowOrthogonal.value),
      breakPoints: [],
    }
    draft.breakPoints = getEvenlySpacedArrowBreakPoints(draft, breaks)
    return draft
  }

  if (board.activeTool === 'relation') {
    const breaks = Math.max(0, Math.min(8, Math.round(Number(newRelationBreaks.value || 0))))
    const draft: BoardElement = {
      ...base,
      type: 'relation',
      x1: pos.x,
      y1: pos.y,
      x2: pos.x,
      y2: pos.y,
      breaks,
      orthogonal: Boolean(newRelationOrthogonal.value),
      relationType: newRelationType.value,
      breakPoints: [],
    }
    draft.breakPoints = getEvenlySpacedArrowBreakPoints(draft, breaks)
    return draft
  }

  return null
}

function onPointerDown(event: PointerEvent): void {
  if (!board.activeSchema) {
    return
  }

  // Pan with middle click or Space + left click to match legacy behavior.
  if (event.button === 1 || (event.button === 0 && isSpacePressed.value)) {
    const canvasPos = getCanvasPosition(event)
    pointer.mode = 'pan'
    pointer.panStartCanvasX = canvasPos.x
    pointer.panStartCanvasY = canvasPos.y
    pointer.panStartOffsetX = viewport.offsetX
    pointer.panStartOffsetY = viewport.offsetY
    marqueeRect.value = null
    event.preventDefault()
    return
  }

  const pos = getPointerPosition(event)
  lastCanvasPointer.value = pos
  pointer.startX = pos.x
  pointer.startY = pos.y
  pointer.historyCaptured = false

  if (board.activeTool === 'select') {
    const selected = findSelectedElement()
    if (selected && !(event.ctrlKey || event.metaKey)) {
      const resizeHit = hitResizeHandle(pos.x, pos.y, selected, getCanvasContext())
      if (resizeHit) {
        pointer.mode = 'resize'
        pointer.startElement = deepClone(selected)
        pointer.resizeHandle = resizeHit.handle
        pointer.startElements = {}
        pointer.ctrlPressed = false
        pointer.initialSelection = []
        renderCanvas()
        return
      }
    }

    const hit = hitTestElement(pos.x, pos.y, board.activeSchema.elements, getCanvasContext())
    if (hit) {
      if (event.ctrlKey || event.metaKey) {
        if (isSelected(hit.id)) {
          selectedElementIds.value = selectedElementIds.value.filter((id) => id !== hit.id)
        } else {
          selectedElementIds.value = [...selectedElementIds.value, hit.id]
        }
        pointer.mode = 'idle'
        pointer.startElements = {}
        pointer.startElement = null
        pointer.resizeHandle = null
        pointer.ctrlPressed = false
        pointer.initialSelection = []
        marqueeRect.value = null
        renderCanvas()
        return
      }

      if (!isSelected(hit.id)) {
        setSingleSelection(hit.id)
      }
      pointer.mode = 'drag'
      pointer.ctrlPressed = false
      pointer.initialSelection = []
      pointer.startElements = board.activeSchema.elements
        .filter((element) => isSelected(element.id))
        .reduce<Record<string, BoardElement>>((acc, element) => {
          acc[element.id] = deepClone(element)
          return acc
        }, {})
      pointer.startElement = null
      pointer.resizeHandle = null
    } else {
      pointer.mode = 'drag'
      pointer.ctrlPressed = event.ctrlKey || event.metaKey
      pointer.initialSelection = selectedElementIds.value.slice()
      if (!pointer.ctrlPressed) {
        clearSelection()
      }
      marqueeRect.value = { x: pos.x, y: pos.y, w: 0, h: 0 }
      pointer.startElements = {}
      pointer.startElement = null
      pointer.resizeHandle = null
    }
    renderCanvas()
    return
  }

  const draft = createDraftForTool(pos)
  if (!draft) {
    return
  }

  if (board.activeTool === 'text') {
    board.activeSchema.elements.push(draft)
    setSingleSelection(draft.id)
    markDirty()
    renderCanvas()
    return
  }

  draftElement.value = draft
  pointer.mode = 'draw'
  renderCanvas()
}

function onPointerMove(event: PointerEvent): void {
  if (!board.activeSchema) {
    return
  }

  if (pointer.mode === 'pan') {
    const canvasPos = getCanvasPosition(event)
    const dx = (canvasPos.x - pointer.panStartCanvasX) / viewport.zoom
    const dy = (canvasPos.y - pointer.panStartCanvasY) / viewport.zoom
    viewport.offsetX = clamp(pointer.panStartOffsetX - dx, 0, WORLD_WIDTH)
    viewport.offsetY = clamp(pointer.panStartOffsetY - dy, 0, WORLD_HEIGHT)
    renderCanvas()
    return
  }

  const pos = getPointerPosition(event)
  lastCanvasPointer.value = pos

  if (pointer.mode === 'draw' && draftElement.value) {
    if (draftElement.value.type === 'arrow' || draftElement.value.type === 'relation') {
      draftElement.value.x2 = pos.x
      draftElement.value.y2 = pos.y
      const breaks = Math.max(0, Math.min(8, Math.round(Number(draftElement.value.breaks || 0))))
      draftElement.value.breakPoints = getEvenlySpacedArrowBreakPoints(draftElement.value, breaks)
    } else {
      draftElement.value.w = pos.x - pointer.startX
      draftElement.value.h = pos.y - pointer.startY
    }
    renderCanvas()
    return
  }

  if (pointer.mode === 'drag' && marqueeRect.value) {
    const left = Math.min(pointer.startX, pos.x)
    const top = Math.min(pointer.startY, pos.y)
    const width = Math.abs(pos.x - pointer.startX)
    const height = Math.abs(pos.y - pointer.startY)
    marqueeRect.value = { x: left, y: top, w: width, h: height }
    updateSelectionFromMarquee()
    renderCanvas()
    return
  }

  if (pointer.mode === 'drag' && selectedElementIds.value.length > 0 && Object.keys(pointer.startElements).length > 0) {
    if (!pointer.historyCaptured) {
      pushHistoryCheckpoint()
      pointer.historyCaptured = true
    }
    const dx = pos.x - pointer.startX
    const dy = pos.y - pointer.startY
    for (const elementId of selectedElementIds.value) {
      const target = board.activeSchema.elements.find((element) => element.id === elementId)
      const start = pointer.startElements[elementId]
      if (!target || !start) {
        continue
      }
      if (target.type === 'arrow' || target.type === 'relation') {
        target.x1 = Number(start.x1 || 0) + dx
        target.y1 = Number(start.y1 || 0) + dy
        target.x2 = Number(start.x2 || 0) + dx
        target.y2 = Number(start.y2 || 0) + dy
        if (Array.isArray(start.breakPoints)) {
          target.breakPoints = start.breakPoints.map((point) => ({
            x: Number(point?.x || 0) + dx,
            y: Number(point?.y || 0) + dy,
          }))
        }
      } else {
        target.x = Number(start.x || 0) + dx
        target.y = Number(start.y || 0) + dy
      }
    }
    markDirty()
    renderCanvas()
    return
  }

  if (pointer.mode === 'resize' && board.activeSchema && pointer.startElement && pointer.resizeHandle) {
    const selected = findSelectedElement()
    if (!selected) {
      return
    }
    if (!pointer.historyCaptured) {
      pushHistoryCheckpoint()
      pointer.historyCaptured = true
    }
    applyResize(selected, pointer.startElement, pointer.resizeHandle, pos.x, pos.y)
    markDirty()
    renderCanvas()
  }
}

function onPointerUp(): void {
  if (!board.activeSchema) {
    pointer.mode = 'idle'
    return
  }

  if (pointer.mode === 'draw' && draftElement.value) {
    let shouldAdd = true
    if (draftElement.value.type === 'arrow' || draftElement.value.type === 'relation') {
      const dx = Number(draftElement.value.x2 || 0) - Number(draftElement.value.x1 || 0)
      const dy = Number(draftElement.value.y2 || 0) - Number(draftElement.value.y1 || 0)
      shouldAdd = Math.hypot(dx, dy) > 5
    } else {
      const w = Math.abs(Number(draftElement.value.w || 0))
      const h = Math.abs(Number(draftElement.value.h || 0))
      shouldAdd = w > 6 && h > 6
    }
    if (shouldAdd) {
      pushHistoryCheckpoint()
      board.activeSchema.elements.push(draftElement.value)
      setSingleSelection(draftElement.value.id)
      markDirty()
    }
    draftElement.value = null
  }

  pointer.mode = 'idle'
  pointer.startElements = {}
  pointer.startElement = null
  pointer.resizeHandle = null
  pointer.panStartCanvasX = 0
  pointer.panStartCanvasY = 0
  pointer.panStartOffsetX = 0
  pointer.panStartOffsetY = 0
  pointer.historyCaptured = false
  pointer.ctrlPressed = false
  pointer.initialSelection = []
  marqueeRect.value = null
  renderCanvas()
}

function onCanvasWheel(event: WheelEvent): void {
  const oldZoom = viewport.zoom
  const currentPercent = Math.round(oldZoom * 100)
  const direction = event.deltaY < 0 ? 1 : -1
  const nextPercent = Math.min(400, Math.max(10, currentPercent + direction * 10))
  const nextZoom = nextPercent / 100
  if (nextZoom === oldZoom) {
    return
  }

  const canvasPos = getCanvasPosition(event)
  const worldXBefore = canvasPos.x / oldZoom + viewport.offsetX
  const worldYBefore = canvasPos.y / oldZoom + viewport.offsetY

  viewport.zoom = nextZoom
  viewport.offsetX = clamp(worldXBefore - canvasPos.x / nextZoom, 0, WORLD_WIDTH)
  viewport.offsetY = clamp(worldYBefore - canvasPos.y / nextZoom, 0, WORLD_HEIGHT)
  renderCanvas()
}

function resetZoomView(): void {
  viewport.zoom = 1
  viewport.offsetX = 0
  viewport.offsetY = 0
  renderCanvas()
}

function saveCurrentSchema(): void {
  board.saveCurrentSchema()
  isDirty.value = false
}

async function confirmDiscardUnsaved(actionLabel = 'continue'): Promise<boolean> {
  if (!isDirty.value) {
    return true
  }
  return await openConfirmDialog({
    title: 'Unsaved changes',
    message: `You have unsaved changes. Discard them and ${actionLabel}?`,
    confirmLabel: 'Discard changes',
    danger: true,
  })
}

async function activateSchema(schemaId: string): Promise<void> {
  if (schemaId === board.store.activeSchemaId) {
    return
  }
  if (!(await confirmDiscardUnsaved('switch diagrams'))) {
    return
  }
  board.activateSchema(schemaId)
  clearSelection()
  isDirty.value = false
  renderCanvas()
}

async function createSchema(): Promise<void> {
  if (!(await confirmDiscardUnsaved('create a new diagram'))) {
    return
  }
  board.createSchema()
  if (board.activeSchema) {
    seedSchemaHistory(board.activeSchema.id, board.activeSchema.elements)
  }
  clearSelection()
  isDirty.value = false
  renderCanvas()
}

function startRename(schema: { id: string; name: string }): void {
  renamingSchemaId.value = schema.id
  renameDraft.value = schema.name
}

function commitRename(schemaId: string): void {
  const schema = board.store.schemas.find((item) => item.id === schemaId)
  if (!schema) {
    renamingSchemaId.value = null
    return
  }
  const nextName = renameDraft.value.trim()
  if (nextName) {
    schema.name = nextName
    schema.updatedAt = Date.now()
    board.persist()
    renderCanvas()
  }
  renamingSchemaId.value = null
}

async function deleteSchema(schemaId: string): Promise<void> {
  const schema = board.store.schemas.find((item) => item.id === schemaId)
  if (!schema) {
    return
  }
  const confirmedDelete = await openConfirmDialog({
    title: 'Delete diagram',
    message: `Delete "${schema.name}"?`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!confirmedDelete) {
    return
  }
  if (schemaId === board.store.activeSchemaId && !(await confirmDiscardUnsaved('delete the current diagram'))) {
    return
  }
  board.store.schemas = board.store.schemas.filter((item) => item.id !== schemaId)
  clearSchemaHistory(schemaId)
  if (board.store.schemas.length === 0) {
    await createSchema()
    return
  }
  if (board.store.activeSchemaId === schemaId) {
    board.store.activeSchemaId = board.store.schemas[0]?.id || null
    clearSelection()
  }
  isDirty.value = false
  board.persist()
  renderCanvas()
}

function exportCurrentSchema(): void {
  if (!board.activeSchema) {
    return
  }
  const payload = {
    schemaVersion: 1,
    exportedAt: Date.now(),
    name: board.activeSchema.name,
    elements: board.activeSchema.elements,
  }
  downloadJsonFile(payload, board.activeSchema.name, 'schema')
  showToast('JSON export completed.')
}

async function openImportPicker(): Promise<void> {
  if (!(await confirmDiscardUnsaved('import a diagram'))) {
    return
  }
  if (importInputRef.value) {
    importInputRef.value.value = ''
    importInputRef.value.click()
  }
}

function importSchemaObject(payload: { schemaVersion?: number; name?: string; elements?: BoardElement[] }): void {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.elements)) {
    showToast('Invalid JSON format or unsupported version.', 'error')
    return
  }
  const now = Date.now()
  const schema = {
    id: uid('schema'),
    name: payload.name || `Imported ${board.store.schemas.length + 1}`,
    createdAt: now,
    updatedAt: now,
    elements: payload.elements,
  }
  board.store.schemas.push(schema)
  board.store.activeSchemaId = schema.id
  seedSchemaHistory(schema.id, schema.elements)
  clearSelection()
  isDirty.value = false
  board.persist()
  renderCanvas()
  showToast('Diagram imported.')
}

async function onImportFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }
  try {
    const content = await file.text()
    const imported = safeJsonParse<{ schemaVersion?: number; name?: string; elements?: BoardElement[] }>(content)
    if (!imported) {
      showToast('JSON import failed.', 'error')
      return
    }
    importSchemaObject(imported)
  } catch {
    showToast('JSON import failed.', 'error')
  }
}

function onCanvasPointerEnter(event: PointerEvent): void {
  isPointerInCanvas.value = true
  lastCanvasPointer.value = getPointerPosition(event)
}

function onCanvasPointerLeave(): void {
  isPointerInCanvas.value = false
  onPointerUp()
}

function isEditableTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  const tag = node?.tagName?.toLowerCase() || ''
  return tag === 'input' || tag === 'textarea' || Boolean(node?.isContentEditable)
}

const shortcutsHandler = createBoardShortcutsHandler({
  getActiveTool: () => board.activeTool,
  getActiveToolSet: () => board.activeToolSet,
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

function onGlobalKeyDown(event: KeyboardEvent): void {
  if (event.code === 'Space' && !isEditableTarget(event.target)) {
    isSpacePressed.value = true
    event.preventDefault()
  }
  shortcutsHandler(event)
}

function onGlobalKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') {
    isSpacePressed.value = false
  }
}

function onWindowBlur(): void {
  isSpacePressed.value = false
  if (dialogState.isOpen) {
    onDialogCancel()
  }
  if (iconEditorState.isOpen) {
    closeIconEditor()
  }
}

function onResize(): void {
  renderCanvas()
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!isDirty.value) {
    return
  }
  event.preventDefault()
  event.returnValue = ''
}

function onToolSetChange(toolSet: ToolSetId): void {
  board.setActiveToolSet(toolSet)
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
  <div class="container" id="drawing-board-app">
    <section class="board-shell">
      <BoardTopBar
        :show-frame-actions="Boolean(getSelectedFrame())"
        @save-svg="saveCurrentSchemaAsSvg"
        @save-png="saveCurrentSchemaAsPng"
        @export-json="exportCurrentSchema"
        @import-json="openImportPicker"
        @save-frame-png="saveSelectedFrameAsPng"
        @save-frame-svg="saveSelectedFrameAsSvg"
        @save-schema="saveCurrentSchema"
        @new-schema="createSchema"
      />

      <div class="main-grid">
        <ToolsPanel
          :tool-set-options="board.toolSetOptions"
          :active-tool-set="board.activeToolSet"
          :tools="board.tools"
          :active-tool="board.activeTool"
          :color-palette="board.colorPalette"
          :active-color="board.activeColor"
          :line-style="board.lineStyle"
          :draw-size="board.drawSize"
          :show-draw-options="board.activeTool !== 'frame' && !(board.activeTool === 'select' && selectedElementIds.length > 0)"
          :show-properties="board.activeTool === 'select' && selectedElementIds.length > 0"
          :selected-count="selectedElementIds.length"
          :selected-is-frame="Boolean(getSelectedFrame())"
          :selected-is-arrow-like="Boolean(getSelectedConnector())"
          :selected-is-relation="Boolean(getSelectedRelation())"
          :selected-color="getSelectedColor()"
          :selected-line-style="getSelectedLineStyle()"
          :selected-size="getSelectedSize()"
          :selected-arrow-breaks="getSelectedArrowBreaks()"
          :selected-arrow-orthogonal="getSelectedArrowOrthogonal()"
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
          @set-active-color="board.activeColor = $event"
          @set-line-style="board.lineStyle = $event"
          @set-draw-size="board.drawSize = $event"
          @apply-color="applyColorToSelection"
          @apply-line-style="applyLineStyle"
          @apply-size="applySize"
          @arrow-breaks-delta="shiftSelectedArrowBreaks"
          @arrow-orthogonal-change="setSelectedArrowOrthogonal"
          @relation-type-change="setSelectedRelationType"
          @frame-name-change="onSelectedFrameNameChange"
          @frame-index-change="onSelectedFrameIndexInputChange"
          @frame-index-shift="shiftSelectedFrameIndex"
        />

        <main class="canvas-wrap">
          <CanvasStatusBar
            :active-schema-name="board.activeSchema ? board.activeSchema.name : 'None'"
            :is-dirty="isDirty"
            :zoom-percent="zoomPercent"
            @reset-zoom="resetZoomView"
          />
          <div class="canvas-zone">
            <canvas
              ref="canvasRef"
              class="drawing-canvas"
              :style="{ cursor: canvasCursor }"
              tabindex="0"
              @pointerdown="onPointerDown"
              @pointerenter="onCanvasPointerEnter"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointerleave="onCanvasPointerLeave"
              @dragover.prevent
              @drop.prevent="onCanvasDrop"
              @wheel.prevent="onCanvasWheel"
            ></canvas>
          </div>
        </main>

        <aside class="schema-panel">
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
  </div>
</template>
