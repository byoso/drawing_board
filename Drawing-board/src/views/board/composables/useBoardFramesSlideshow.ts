import { computed, nextTick, ref, type Ref } from 'vue'
import { getElementBounds } from '@/board/canvas'
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/board/constants'
import type { BoardElement } from '@/board/types'

type ViewportState = {
  zoom: number
  offsetX: number
  offsetY: number
}

type Bounds = { x: number; y: number; w: number; h: number }

type UseBoardFramesSlideshowOptions = {
  getActiveSchema: () => { elements: BoardElement[] } | null
  getFrameDisplayName: (frame: BoardElement) => string
  getDefaultFrameName: (index: number) => string
  getSelectedFrame: () => BoardElement | null
  setSingleSelection: (id: string) => void
  clearSelection: () => void
  renderCanvas: () => void
  markDirty: () => void
  canvasRef: Ref<HTMLCanvasElement | null>
  getCanvasContext: () => CanvasRenderingContext2D | null
  viewport: ViewportState
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function useBoardFramesSlideshow(options: UseBoardFramesSlideshowOptions) {
  const isSlideshowMode = ref(false)
  const slideshowFrameIndex = ref(0)

  const activeFrames = computed<BoardElement[]>(() => {
    const schema = options.getActiveSchema()
    if (!schema) {
      return []
    }
    return schema.elements
      .filter((element) => element.type === 'frame')
      .sort((a, b) => Number(a.frameIndex || 0) - Number(b.frameIndex || 0))
  })

  const canStartSlideshow = computed(() => activeFrames.value.length > 0)
  const canGoPreviousSlide = computed(() => isSlideshowMode.value && slideshowFrameIndex.value > 0)
  const canGoNextSlide = computed(() => isSlideshowMode.value && slideshowFrameIndex.value < activeFrames.value.length - 1)

  function getFramesForActiveSchema(): BoardElement[] {
    return activeFrames.value
  }

  function getSelectedFrameName(): string {
    const frame = options.getSelectedFrame()
    return frame ? options.getFrameDisplayName(frame) : ''
  }

  function onSelectedFrameNameChange(value: string): void {
    const frame = options.getSelectedFrame()
    if (!frame) {
      return
    }
    const next = String(value || '').trim()
    const fallback = options.getDefaultFrameName(Number(frame.frameIndex || 1))
    frame.name = next || fallback
    options.markDirty()
    options.renderCanvas()
  }

  function canShiftSelectedFrameIndex(delta: number): boolean {
    const frame = options.getSelectedFrame()
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
    const frame = options.getSelectedFrame()
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
    options.markDirty()
    options.renderCanvas()
  }

  function shiftSelectedFrameIndex(delta: number): void {
    const frame = options.getSelectedFrame()
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

  function focusViewportOnBounds(bounds: Bounds): void {
    const canvas = options.canvasRef.value
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
    options.viewport.zoom = targetZoom

    const centerX = bounds.x + bounds.w / 2
    const centerY = bounds.y + bounds.h / 2
    options.viewport.offsetX = clamp(centerX - canvasWidth / (2 * targetZoom), 0, WORLD_WIDTH)
    options.viewport.offsetY = clamp(centerY - canvasHeight / (2 * targetZoom), 0, WORLD_HEIGHT)
  }

  function focusFrameElement(frame: BoardElement, keepSelection = true): void {
    const bounds = getElementBounds(frame, options.getCanvasContext())
    if (bounds) {
      focusViewportOnBounds(bounds)
    }
    if (keepSelection) {
      options.setSingleSelection(frame.id)
    } else {
      options.clearSelection()
    }
    options.renderCanvas()
  }

  function focusFrame(frameId: string): void {
    const schema = options.getActiveSchema()
    if (!schema) {
      return
    }
    const frame = schema.elements.find((element) => element.id === frameId && element.type === 'frame')
    if (!frame) {
      return
    }
    focusFrameElement(frame, true)
  }

  function focusFrameByIndex(index: number, keepSelection = false): void {
    const frames = activeFrames.value
    if (frames.length === 0) {
      return
    }
    const safeIndex = clamp(index, 0, frames.length - 1)
    slideshowFrameIndex.value = safeIndex
    const frame = frames[safeIndex]
    if (!frame) {
      return
    }
    focusFrameElement(frame, keepSelection)
  }

  async function startSlideshow(): Promise<void> {
    const frames = activeFrames.value
    if (frames.length === 0) {
      return
    }
    const selectedFrame = options.getSelectedFrame()
    const selectedIndex = selectedFrame ? frames.findIndex((frame) => frame.id === selectedFrame.id) : -1
    slideshowFrameIndex.value = selectedIndex >= 0 ? selectedIndex : 0
    isSlideshowMode.value = true
    await nextTick()
    focusFrameByIndex(slideshowFrameIndex.value, false)
  }

  function stopSlideshow(): void {
    if (!isSlideshowMode.value) {
      return
    }
    isSlideshowMode.value = false
    options.renderCanvas()
  }

  function goToPreviousSlide(): void {
    if (!canGoPreviousSlide.value) {
      return
    }
    focusFrameByIndex(slideshowFrameIndex.value - 1, false)
  }

  function goToNextSlide(): void {
    if (!canGoNextSlide.value) {
      return
    }
    focusFrameByIndex(slideshowFrameIndex.value + 1, false)
  }

  return {
    activeFrames,
    canStartSlideshow,
    canGoPreviousSlide,
    canGoNextSlide,
    isSlideshowMode,
    getFramesForActiveSchema,
    getSelectedFrameName,
    onSelectedFrameNameChange,
    canShiftSelectedFrameIndex,
    setSelectedFrameIndex,
    shiftSelectedFrameIndex,
    onSelectedFrameIndexInputChange,
    focusFrame,
    startSlideshow,
    stopSlideshow,
    goToPreviousSlide,
    goToNextSlide,
  }
}
