import type { Ref } from 'vue'
import { drawElement, drawResizeHandles, getResizeHandles } from '@/board/canvas'
import type { BoardElement } from '@/board/types'

type ViewportState = {
  zoom: number
  offsetX: number
  offsetY: number
}

type MarqueeRect = { x: number; y: number; w: number; h: number } | null

type UseBoardCanvasRenderingArgs = {
  canvasRef: Ref<HTMLCanvasElement | null>
  viewport: ViewportState
  worldWidth: number
  worldHeight: number
  selectedElementIds: Ref<string[]>
  draftElement: Ref<BoardElement | null>
  marqueeRect: Ref<MarqueeRect>
  getElements: () => BoardElement[]
  isSelected: (id: string) => boolean
  getFrameDisplayName: (element: { name?: unknown; frameIndex?: unknown }) => string
  getIconImage: (src: string) => HTMLImageElement | null
}

export function useBoardCanvasRendering(args: UseBoardCanvasRenderingArgs) {
  const {
    canvasRef,
    viewport,
    worldWidth,
    worldHeight,
    selectedElementIds,
    draftElement,
    marqueeRect,
    getElements,
    isSelected,
    getFrameDisplayName,
    getIconImage,
  } = args

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
  }

  function getCanvasContext(): CanvasRenderingContext2D | null {
    return canvasRef.value ? canvasRef.value.getContext('2d') : null
  }

  function getCanvasPosition(event: PointerEvent | WheelEvent | MouseEvent) {
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

  function getPointerPosition(event: PointerEvent | WheelEvent | MouseEvent) {
    const p = getCanvasPosition(event)
    return {
      x: clamp(p.x / viewport.zoom + viewport.offsetX, 0, worldWidth),
      y: clamp(p.y / viewport.zoom + viewport.offsetY, 0, worldHeight),
    }
  }

  function getDashArrayFromStyle(style: unknown): number[] {
    return style === 'dashed' ? [10, 7] : []
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
    const worldScreenW = worldWidth * viewport.zoom
    const worldScreenH = worldHeight * viewport.zoom
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

    const elements = getElements()
    for (const element of elements) {
      ctx.setLineDash(getDashArrayFromStyle(element.strokeStyle))
      drawElement(ctx, element, {
        selected: isSelected(element.id),
        getFrameName: getFrameDisplayName,
        getIconImage,
      })

      if (selectedElementIds.value.length === 1 && isSelected(element.id) && element.type !== 'text') {
        drawResizeHandles(ctx, getResizeHandles(element, ctx))
      }
    }

    if (draftElement.value) {
      ctx.setLineDash(getDashArrayFromStyle(draftElement.value.strokeStyle))
      drawElement(ctx, draftElement.value, {
        selected: false,
        getFrameName: getFrameDisplayName,
        getIconImage,
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
    viewport.offsetX = clamp(worldXBefore - canvasPos.x / nextZoom, 0, worldWidth)
    viewport.offsetY = clamp(worldYBefore - canvasPos.y / nextZoom, 0, worldHeight)
    renderCanvas()
  }

  function resetZoomView(): void {
    viewport.zoom = 1
    viewport.offsetX = 0
    viewport.offsetY = 0
    renderCanvas()
  }

  return {
    clamp,
    getCanvasContext,
    getCanvasPosition,
    getPointerPosition,
    getDashArrayFromStyle,
    renderCanvas,
    onCanvasWheel,
    resetZoomView,
  }
}
