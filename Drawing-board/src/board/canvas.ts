import { FRAME_STYLE, RECT_CORNER_RADIUS } from '@/board/constants'
import type { BoardElement } from '@/board/types'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'

export interface ResizeHandlePoint {
  handle: ResizeHandle
  x: number
  y: number
}

export function normalizeRect(el: { x?: number; y?: number; w?: number; h?: number }) {
  const x = Number(el.x || 0)
  const y = Number(el.y || 0)
  const w = Number(el.w || 0)
  const h = Number(el.h || 0)
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h),
  }
}

export function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = RECT_CORNER_RADIUS,
): void {
  const safeRadius = Math.max(0, Math.min(radius, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + w - safeRadius, y)
  ctx.arcTo(x + w, y, x + w, y + safeRadius, safeRadius)
  ctx.lineTo(x + w, y + h - safeRadius)
  ctx.arcTo(x + w, y + h, x + w - safeRadius, y + h, safeRadius)
  ctx.lineTo(x + safeRadius, y + h)
  ctx.arcTo(x, y + h, x, y + h - safeRadius, safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius)
  ctx.closePath()
}

export function getElementBounds(element: BoardElement, ctx: CanvasRenderingContext2D | null) {
  if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'icon' || element.type === 'frame') {
    return normalizeRect(element)
  }
  if (element.type === 'arrow') {
    const x1 = Number(element.x1 || 0)
    const y1 = Number(element.y1 || 0)
    const x2 = Number(element.x2 || 0)
    const y2 = Number(element.y2 || 0)
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    }
  }
  if (element.type === 'text' && ctx) {
    const fontSize = Number(element.fontSize || 18)
    const text = String(element.text || '')
    const lines = text.split('\n')
    ctx.save()
    ctx.font = `${fontSize}px Space Grotesk`
    let maxWidth = 0
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, ctx.measureText(line).width)
    }
    ctx.restore()
    return {
      x: Number(element.x || 0),
      y: Number(element.y || 0) - fontSize,
      w: Math.max(maxWidth, 1),
      h: Math.max(lines.length * fontSize * 1.2, fontSize),
    }
  }
  return null
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  options: {
    selected: boolean
    getFrameName: (element: { name?: unknown; frameIndex?: unknown }) => string
    getIconImage?: (src: string) => HTMLImageElement | null
  },
): void {
  ctx.save()
  ctx.strokeStyle = String(element.stroke || '#1f2d54')
  ctx.fillStyle = String(element.fill || '#8ea9ff22')
  ctx.lineWidth = Number(element.strokeWidth || 2)

  if (element.type === 'frame') {
    const r = normalizeRect(element)
    ctx.strokeStyle = FRAME_STYLE.stroke
    ctx.lineWidth = FRAME_STYLE.strokeWidth
    ctx.setLineDash(FRAME_STYLE.dashArray)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.setLineDash([])
    ctx.fillStyle = FRAME_STYLE.stroke
    ctx.font = `${FRAME_STYLE.title.fontWeight} ${FRAME_STYLE.title.fontSize}px ${FRAME_STYLE.title.fontFamily}`
    ctx.textBaseline = 'bottom'
    ctx.fillText(options.getFrameName(element), r.x + FRAME_STYLE.title.xOffset, r.y + FRAME_STYLE.title.yOffset)
  }

  if (element.type === 'rect') {
    const r = normalizeRect(element)
    drawRoundedRectPath(ctx, r.x, r.y, r.w, r.h)
    ctx.fill()
    ctx.stroke()
  }

  if (element.type === 'ellipse') {
    const r = normalizeRect(element)
    ctx.beginPath()
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  if (element.type === 'icon') {
    const r = normalizeRect(element)
    const src = String(element.src || '')
    const image = options.getIconImage ? options.getIconImage(src) : null
    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, r.x, r.y, r.w, r.h)
    } else {
      ctx.fillStyle = '#eef3fb'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = '#c6d4eb'
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.fillStyle = '#6b7ea6'
      ctx.font = '12px Space Grotesk'
      ctx.fillText('Loading icon...', r.x + 8, r.y + 20)
    }
  }

  if (element.type === 'arrow') {
    const x1 = Number(element.x1 || 0)
    const y1 = Number(element.y1 || 0)
    const x2 = Number(element.x2 || 0)
    const y2 = Number(element.y2 || 0)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    const angle = Math.atan2(y2 - y1, x2 - x1)
    const size = 12
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fillStyle = String(element.stroke || '#1f2d54')
    ctx.fill()
  }

  if (element.type === 'text') {
    const fontSize = Number(element.fontSize || 18)
    ctx.font = `${fontSize}px Space Grotesk`
    ctx.fillStyle = String(element.color || '#17233f')
    ctx.textBaseline = 'alphabetic'
    const lines = String(element.text || '').split('\n')
    const lineHeight = fontSize * 1.2
    lines.forEach((line, idx) => {
      ctx.fillText(line, Number(element.x || 0), Number(element.y || 0) + idx * lineHeight)
    })
  }

  if (options.selected) {
    const b = getElementBounds(element, ctx)
    if (b) {
      ctx.save()
      ctx.strokeStyle = '#ff5f2a'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8)
      ctx.restore()
    }
  }

  ctx.restore()
}

export function hitTestElement(
  x: number,
  y: number,
  elements: BoardElement[],
  ctx: CanvasRenderingContext2D | null,
): BoardElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i]
    if (!element) {
      continue
    }
    const b = getElementBounds(element, ctx)
    if (!b) {
      continue
    }
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return element
    }
  }
  return null
}

export function getResizeHandles(element: BoardElement, ctx: CanvasRenderingContext2D | null): ResizeHandlePoint[] {
  if (element.type === 'arrow') {
    return [
      { handle: 'start', x: Number(element.x1 || 0), y: Number(element.y1 || 0) },
      { handle: 'end', x: Number(element.x2 || 0), y: Number(element.y2 || 0) },
    ]
  }

  if (element.type === 'text') {
    return []
  }

  const b = getElementBounds(element, ctx)
  if (!b) {
    return []
  }

  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return [
    { handle: 'nw', x: b.x, y: b.y },
    { handle: 'n', x: cx, y: b.y },
    { handle: 'ne', x: b.x + b.w, y: b.y },
    { handle: 'e', x: b.x + b.w, y: cy },
    { handle: 'se', x: b.x + b.w, y: b.y + b.h },
    { handle: 's', x: cx, y: b.y + b.h },
    { handle: 'sw', x: b.x, y: b.y + b.h },
    { handle: 'w', x: b.x, y: cy },
  ]
}

export function drawResizeHandles(ctx: CanvasRenderingContext2D, handles: ResizeHandlePoint[]): void {
  if (handles.length === 0) {
    return
  }
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#ff5f2a'
  ctx.lineWidth = 1.5
  for (const point of handles) {
    ctx.beginPath()
    ctx.rect(point.x - 4, point.y - 4, 8, 8)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

export function hitResizeHandle(
  x: number,
  y: number,
  element: BoardElement,
  ctx: CanvasRenderingContext2D | null,
): ResizeHandlePoint | null {
  const handles = getResizeHandles(element, ctx)
  for (const handle of handles) {
    if (Math.abs(x - handle.x) <= 6 && Math.abs(y - handle.y) <= 6) {
      return handle
    }
  }
  return null
}
