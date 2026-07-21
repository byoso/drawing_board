import type { Ref } from 'vue'
import { hitTestElement } from '@/board/canvas'
import type { BoardElement } from '@/board/types'
import { uid } from '@/board/utils'

type IconItem = {
  id: string
  src: string
  name: string
  width: number
  height: number
}

type IconSet = {
  id: string
  icons: IconItem[]
}

type UseBoardCanvasElementInteractionsArgs = {
  isSlideshowMode: { readonly value: boolean }
  iconSets: Ref<IconSet[]>
  getActiveSchema: () => { elements: BoardElement[] } | null
  getActiveTool: () => string
  getFrameDisplayName: (frame: BoardElement) => string
  getDefaultFrameName: (index: number) => string
  getCurrentStrokeWidth: () => number
  getLineStyle: () => string | undefined
  getPointerPosition: (event: PointerEvent | WheelEvent | MouseEvent) => { x: number; y: number }
  getCanvasContext: () => CanvasRenderingContext2D | null
  fitSizeWithinLimit: (width: number, height: number, limit: number) => { width: number; height: number }
  isSelected: (id: string) => boolean
  setSingleSelection: (id: string) => void
  pushHistoryCheckpoint: () => void
  markDirty: () => void
  renderCanvas: () => void
  openPromptDialog: (options: {
    title: string
    message?: string
    value?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }) => Promise<string | null>
  openTextEditEditor: (element: BoardElement) => void
  openTableEditor: (element: BoardElement) => void
}

export function useBoardCanvasElementInteractions(args: UseBoardCanvasElementInteractionsArgs) {
  const {
    isSlideshowMode,
    iconSets,
    getActiveSchema,
    getActiveTool,
    getFrameDisplayName,
    getDefaultFrameName,
    getCurrentStrokeWidth,
    getLineStyle,
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
  } = args

  async function onCanvasDrop(event: DragEvent): Promise<void> {
    if (isSlideshowMode.value) {
      return
    }
    const schema = getActiveSchema()
    if (!schema || !event.dataTransfer) {
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
      strokeWidth: getCurrentStrokeWidth(),
      strokeStyle: getLineStyle(),
    }
    pushHistoryCheckpoint()
    schema.elements.push(element)
    setSingleSelection(element.id)
    markDirty()
    renderCanvas()
  }

  async function onCanvasDoubleClick(event: MouseEvent): Promise<void> {
    if (isSlideshowMode.value) {
      return
    }
    const schema = getActiveSchema()
    if (!schema) {
      return
    }
    const pos = getPointerPosition(event)
    const hit = hitTestElement(pos.x, pos.y, schema.elements, getCanvasContext())
    if (!hit) {
      return
    }
    if (getActiveTool() !== 'select' && !isSelected(hit.id)) {
      return
    }

    if (hit.type === 'frame') {
      if (!isSelected(hit.id)) {
        setSingleSelection(hit.id)
      }
      const currentName = String(hit.name || '').trim() || getFrameDisplayName(hit)
      const nextName = await openPromptDialog({
        title: 'Rename frame',
        value: currentName,
        placeholder: 'Frame name',
        confirmLabel: 'Save',
      })
      if (nextName == null) {
        return
      }
      const trimmed = String(nextName || '').trim()
      const fallback = getDefaultFrameName(Number(hit.frameIndex || 1))
      const finalName = trimmed || fallback
      if (String(hit.name || '') === finalName) {
        return
      }
      pushHistoryCheckpoint()
      hit.name = finalName
      markDirty()
      renderCanvas()
      return
    }

    if (hit.type === 'text') {
      if (!isSelected(hit.id)) {
        setSingleSelection(hit.id)
      }
      openTextEditEditor(hit)
      return
    }

    if (hit.type !== 'table') {
      return
    }
    if (!isSelected(hit.id)) {
      setSingleSelection(hit.id)
    }
    openTableEditor(hit)
  }

  return {
    onCanvasDrop,
    onCanvasDoubleClick,
  }
}
