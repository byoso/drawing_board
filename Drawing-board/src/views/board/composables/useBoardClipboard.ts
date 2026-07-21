import type { Ref } from 'vue'
import type { BoardElement } from '@/board/types'
import { deepClone, uid } from '@/board/utils'

type UseBoardClipboardOptions = {
  selectedElementIds: Ref<string[]>
  copiedElements: Ref<BoardElement[]>
  isPointerInCanvas: Ref<boolean>
  lastCanvasPointer: Ref<{ x: number; y: number }>
  getActiveSchema: () => { elements: BoardElement[] } | null
  getNextFrameIndex: () => number
  getDefaultFrameName: (index: number) => string
  applyFrameStyle: (element: BoardElement) => void
  computeElementsBounds: (elements: BoardElement[]) => { x: number; y: number; w: number; h: number } | null
  pushHistoryCheckpoint: () => void
  setSingleSelection: (id: string) => void
  clearSelection: () => void
  markDirty: () => void
  renderCanvas: () => void
}

export function useBoardClipboard(options: UseBoardClipboardOptions) {
  function deleteSelectedElement(): void {
    const schema = options.getActiveSchema()
    if (!schema || options.selectedElementIds.value.length === 0) {
      return
    }
    const before = schema.elements.length
    options.pushHistoryCheckpoint()
    schema.elements = schema.elements.filter((element) => !options.selectedElementIds.value.includes(element.id))
    if (schema.elements.length !== before) {
      options.clearSelection()
      options.markDirty()
      options.renderCanvas()
    }
  }

  function copySelectionToClipboard(): boolean {
    const schema = options.getActiveSchema()
    if (!schema || options.selectedElementIds.value.length === 0) {
      return false
    }
    options.copiedElements.value = schema.elements
      .filter((element) => options.selectedElementIds.value.includes(element.id))
      .map((element) => deepClone(element))
    return options.copiedElements.value.length > 0
  }

  function pasteClipboardSelection(): boolean {
    const schema = options.getActiveSchema()
    if (!schema || options.copiedElements.value.length === 0 || !options.isPointerInCanvas.value) {
      return false
    }
    const clones = options.copiedElements.value.map((element) => ({ ...deepClone(element), id: uid('el') }))
    const sourceBounds = options.computeElementsBounds(options.copiedElements.value)
    if (sourceBounds) {
      const dx = options.lastCanvasPointer.value.x - (sourceBounds.x + sourceBounds.w / 2)
      const dy = options.lastCanvasPointer.value.y - (sourceBounds.y + sourceBounds.h / 2)
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

    let nextFrameIndex = options.getNextFrameIndex()
    clones.forEach((element) => {
      if (element.type === 'frame') {
        element.frameIndex = nextFrameIndex
        element.name = String(element.name || '').trim() || options.getDefaultFrameName(nextFrameIndex)
        options.applyFrameStyle(element)
        nextFrameIndex += 1
      }
    })

    options.pushHistoryCheckpoint()
    schema.elements.push(...clones)
    options.selectedElementIds.value = clones.map((element) => element.id)
    options.markDirty()
    options.renderCanvas()
    return true
  }

  return {
    deleteSelectedElement,
    copySelectionToClipboard,
    pasteClipboardSelection,
  }
}
