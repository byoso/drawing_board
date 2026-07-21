import { FRAME_STYLE, RECT_CORNER_RADIUS } from '@/board/constants'
import type { BoardElement, RectAngle, RelationType } from '@/board/types'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end' | `break_${number}`

export interface ResizeHandlePoint {
  handle: ResizeHandle
  x: number
  y: number
}

export interface ArrowPoint {
  x: number
  y: number
}

interface LineSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function getArrowBreakCount(element: BoardElement): number {
  const raw = Math.round(toFiniteNumber(element.breaks, 0))
  return Math.max(0, Math.min(8, raw))
}

function getRelationType(element: BoardElement): RelationType {
  const value = String(element.relationType || 'many-to-one')
  if (value === 'one-to-one' || value === 'many-to-one' || value === 'one-to-many' || value === 'many-to-many') {
    return value
  }
  return 'many-to-one'
}

function getRelationEndpointKind(type: RelationType, atStart: boolean): 'one' | 'many' {
  if (type === 'one-to-one') {
    return 'one'
  }
  if (type === 'many-to-many') {
    return 'many'
  }
  if (type === 'one-to-many') {
    return atStart ? 'one' : 'many'
  }
  return atStart ? 'many' : 'one'
}

function getRelationEndpointSegments(
  tip: ArrowPoint,
  inner: ArrowPoint,
  kind: 'one' | 'many',
  strokeWidth: number,
): LineSegment[] {
  const sw = Math.max(1, strokeWidth)
  const dx = tip.x - inner.x
  const dy = tip.y - inner.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux

  if (kind === 'one') {
    const offset = Math.round(sw * 3)
    const half = sw * 2 + 1
    const centerX = tip.x - ux * offset
    const centerY = tip.y - uy * offset
    return [
      {
        x1: centerX - px * half,
        y1: centerY - py * half,
        x2: centerX + px * half,
        y2: centerY + py * half,
      },
    ]
  }

  const base = sw * 4 + 2
  const spread = sw * 2 + 2
  const baseX = tip.x - ux * base
  const baseY = tip.y - uy * base
  const centerTipX = tip.x - ux * 1
  const centerTipY = tip.y - uy * 1
  return [
    { x1: baseX, y1: baseY, x2: centerTipX, y2: centerTipY },
    { x1: baseX, y1: baseY, x2: centerTipX + px * spread, y2: centerTipY + py * spread },
    { x1: baseX, y1: baseY, x2: centerTipX - px * spread, y2: centerTipY - py * spread },
  ]
}

export function getArrowPathPoints(element: BoardElement): ArrowPoint[] {
  const start = {
    x: toFiniteNumber(element.x1, 0),
    y: toFiniteNumber(element.y1, 0),
  }
  const end = {
    x: toFiniteNumber(element.x2, 0),
    y: toFiniteNumber(element.y2, 0),
  }
  const breakCount = getArrowBreakCount(element)
  const source = Array.isArray(element.breakPoints) ? element.breakPoints : []
  const breaks: ArrowPoint[] = []

  for (let i = 0; i < breakCount; i += 1) {
    const raw = source[i]
    if (raw && typeof raw === 'object') {
      breaks.push({ x: toFiniteNumber(raw.x, start.x), y: toFiniteNumber(raw.y, start.y) })
      continue
    }
    const t = (i + 1) / (breakCount + 1)
    breaks.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    })
  }

  const legacyForceSquare = (element as { forceSquarePath?: unknown }).forceSquarePath
  const isOrthogonal = Boolean(element.orthogonal ?? legacyForceSquare)
  if (!isOrthogonal) {
    return [start, ...breaks, end]
  }

  // Orthogonal with no user-defined breaks: generate a single implicit elbow (L-shape).
  if (breaks.length === 0) {
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    const elbow = dx >= dy
      ? { x: end.x, y: start.y }   // horizontal first, then vertical
      : { x: start.x, y: end.y }   // vertical first, then horizontal
    return [start, elbow, end]
  }

  const orthogonalBreaks: ArrowPoint[] = []
  // Anchor initial orientation to the first user break so orientation can flip naturally near endpoints.
  let horizontalSegment = Math.abs(breaks[0]!.x - start.x) >= Math.abs(breaks[0]!.y - start.y)

  for (let i = 0; i < breaks.length; i += 1) {
    const previous = i === 0 ? start : orthogonalBreaks[i - 1]!
    const raw = breaks[i]!
    const isLastBreak = i === breaks.length - 1

    if (!isLastBreak) {
      if (horizontalSegment) {
        orthogonalBreaks.push({ x: raw.x, y: previous.y })
      } else {
        orthogonalBreaks.push({ x: previous.x, y: raw.y })
      }
      horizontalSegment = !horizontalSegment
      continue
    }

    const candidateVerticalToEnd: ArrowPoint = { x: end.x, y: previous.y }
    const candidateHorizontalToEnd: ArrowPoint = { x: previous.x, y: end.y }
    const distToVertical = Math.hypot(raw.x - candidateVerticalToEnd.x, raw.y - candidateVerticalToEnd.y)
    const distToHorizontal = Math.hypot(raw.x - candidateHorizontalToEnd.x, raw.y - candidateHorizontalToEnd.y)

    if (distToVertical === distToHorizontal) {
      orthogonalBreaks.push(horizontalSegment ? candidateVerticalToEnd : candidateHorizontalToEnd)
    } else {
      orthogonalBreaks.push(distToVertical <= distToHorizontal ? candidateVerticalToEnd : candidateHorizontalToEnd)
    }
  }

  return [start, ...orthogonalBreaks, end]
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

function getRectAngle(element: BoardElement): RectAngle {
  return Number(element.angle || 0) === 45 ? 45 : 0
}

function rotatePoint(x: number, y: number, cx: number, cy: number, angleRad: number): { x: number; y: number } {
  const dx = x - cx
  const dy = y - cy
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }
}

function getRectCorners(element: BoardElement): Array<{ x: number; y: number }> {
  const r = normalizeRect(element)
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const angle = getRectAngle(element)
  if (angle === 0) {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ]
  }
  const angleRad = (angle * Math.PI) / 180
  return [
    rotatePoint(r.x, r.y, cx, cy, angleRad),
    rotatePoint(r.x + r.w, r.y, cx, cy, angleRad),
    rotatePoint(r.x + r.w, r.y + r.h, cx, cy, angleRad),
    rotatePoint(r.x, r.y + r.h, cx, cy, angleRad),
  ]
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
  if (element.type === 'rect') {
    const corners = getRectCorners(element)
    const xs = corners.map((point) => point.x)
    const ys = corners.map((point) => point.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
  }
  if (element.type === 'ellipse' || element.type === 'icon' || element.type === 'frame' || element.type === 'table') {
    return normalizeRect(element)
  }
  if (element.type === 'arrow' || element.type === 'relation') {
    const points = getArrowPathPoints(element)
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    let padding = 0
    if (element.type === 'relation') {
      padding = 12
    }
    return {
      x: Math.min(...xs) - padding,
      y: Math.min(...ys) - padding,
      w: Math.max(...xs) - Math.min(...xs) + padding * 2,
      h: Math.max(...ys) - Math.min(...ys) + padding * 2,
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
    const angle = getRectAngle(element)
    if (angle === 45) {
      ctx.save()
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2)
      ctx.rotate((angle * Math.PI) / 180)
      drawRoundedRectPath(ctx, -r.w / 2, -r.h / 2, r.w, r.h)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    } else {
      drawRoundedRectPath(ctx, r.x, r.y, r.w, r.h)
      ctx.fill()
      ctx.stroke()
    }
  }

  if (element.type === 'ellipse') {
    const r = normalizeRect(element)
    ctx.beginPath()
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  if (element.type === 'table') {
    const r = normalizeRect(element)
    const title = String(element.tableTitle || 'Table').trim() || 'Table'
    const fields = Array.isArray(element.tableFields) ? element.tableFields.map((field) => String(field || '')) : []

    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = String(element.stroke || '#1f2d54')
    ctx.lineWidth = Number(element.strokeWidth || 2)
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.fill()
    ctx.stroke()

    const headerHeight = Math.min(34, Math.max(24, r.h * 0.28))
    ctx.fillStyle = '#eef4ff'
    ctx.fillRect(r.x, r.y, r.w, headerHeight)
    ctx.beginPath()
    ctx.moveTo(r.x, r.y + headerHeight)
    ctx.lineTo(r.x + r.w, r.y + headerHeight)
    ctx.stroke()

    ctx.fillStyle = '#1f2d54'
    ctx.font = '700 14px Space Grotesk'
    ctx.textBaseline = 'middle'
    ctx.fillText(title, r.x + 10, r.y + headerHeight / 2)

    const rowHeight = 20
    ctx.font = '13px Space Grotesk'
    fields.forEach((field, index) => {
      const y = r.y + headerHeight + rowHeight * index + rowHeight / 2
      if (y + rowHeight / 2 > r.y + r.h) {
        return
      }
      ctx.fillStyle = '#2d4169'
      ctx.fillText(field, r.x + 10, y)
      ctx.strokeStyle = '#dfe7f7'
      ctx.lineWidth = 1
      const lineY = r.y + headerHeight + rowHeight * (index + 1)
      if (lineY < r.y + r.h) {
        ctx.beginPath()
        ctx.moveTo(r.x, lineY)
        ctx.lineTo(r.x + r.w, lineY)
        ctx.stroke()
      }
    })
    ctx.restore()
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
    const points = getArrowPathPoints(element)
    if (points.length < 2) {
      ctx.restore()
      return
    }
    const startPoint = points[0]!
    const end = points[points.length - 1]!
    const prev = points[points.length - 2]!
    ctx.beginPath()
    ctx.moveTo(startPoint.x, startPoint.y)
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()

    if (!element.lineOnly) {
      const angle = Math.atan2(end.y - prev.y, end.x - prev.x)
      const sw = Number(element.strokeWidth || 2)
      const size = sw * 3 + 6
      ctx.beginPath()
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6))
      ctx.closePath()
      ctx.fillStyle = String(element.stroke || '#1f2d54')
      ctx.fill()
    }
  }

  if (element.type === 'relation') {
    const points = getArrowPathPoints(element)
    if (points.length < 2) {
      ctx.restore()
      return
    }
    const startPoint = points[0]!
    const end = points[points.length - 1]!
    const next = points[1]!
    const prev = points[points.length - 2]!
    ctx.beginPath()
    ctx.moveTo(startPoint.x, startPoint.y)
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()

    const relationType = getRelationType(element)
    const sw = Number(element.strokeWidth || 2)
    const startSegments = getRelationEndpointSegments(startPoint, next, getRelationEndpointKind(relationType, true), sw)
    const endSegments = getRelationEndpointSegments(end, prev, getRelationEndpointKind(relationType, false), sw)

    ctx.save()
    ctx.strokeStyle = String(element.stroke || '#1f2d54')
    ctx.lineWidth = Number(element.strokeWidth || 2)
    ctx.lineCap = 'round'
    for (const segment of [...startSegments, ...endSegments]) {
      ctx.beginPath()
      ctx.moveTo(segment.x1, segment.y1)
      ctx.lineTo(segment.x2, segment.y2)
      ctx.stroke()
    }
    ctx.restore()
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
    if (element.type === 'rect') {
      const r = normalizeRect(element)
      const angle = getRectAngle(element)
      const padding = 4
      ctx.save()
      ctx.strokeStyle = '#ff5f2a'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      if (angle === 45) {
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2)
        ctx.rotate((angle * Math.PI) / 180)
        drawRoundedRectPath(ctx, -r.w / 2 - padding, -r.h / 2 - padding, r.w + padding * 2, r.h + padding * 2)
      } else {
        drawRoundedRectPath(ctx, r.x - padding, r.y - padding, r.w + padding * 2, r.h + padding * 2)
      }
      ctx.stroke()
      ctx.restore()
    } else {
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
  }

  ctx.restore()
}

export function hitTestElement(
  x: number,
  y: number,
  elements: BoardElement[],
  ctx: CanvasRenderingContext2D | null,
): BoardElement | null {
  const borderTolerance = 8

  function distancePointToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) {
      return Math.hypot(px - x1, py - y1)
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    return Math.hypot(px - projX, py - projY)
  }

  function isPointInTriangle(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
  ): boolean {
    const v0x = cx - ax
    const v0y = cy - ay
    const v1x = bx - ax
    const v1y = by - ay
    const v2x = px - ax
    const v2y = py - ay

    const dot00 = v0x * v0x + v0y * v0y
    const dot01 = v0x * v1x + v0y * v1y
    const dot02 = v0x * v2x + v0y * v2y
    const dot11 = v1x * v1x + v1y * v1y
    const dot12 = v1x * v2x + v1y * v2y

    const denom = dot00 * dot11 - dot01 * dot01
    if (denom === 0) {
      return false
    }
    const invDenom = 1 / denom
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom
    return u >= 0 && v >= 0 && u + v <= 1
  }

  function isPointNearArrow(px: number, py: number, element: BoardElement): boolean {
    const points = getArrowPathPoints(element)
    if (points.length < 2) {
      return false
    }
    const end = points[points.length - 1]!
    const prev = points[points.length - 2]!
    const lineTolerance = Math.max(6, Number(element.strokeWidth || 2) + 4)

    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i]!
      const to = points[i + 1]!
      if (distancePointToSegment(px, py, from.x, from.y, to.x, to.y) <= lineTolerance) {
        return true
      }
    }

    const angle = Math.atan2(end.y - prev.y, end.x - prev.x)
    const size = Number((element as { strokeWidth?: unknown }).strokeWidth || 2) * 3 + 6
    const hx1 = end.x - size * Math.cos(angle - Math.PI / 6)
    const hy1 = end.y - size * Math.sin(angle - Math.PI / 6)
    const hx2 = end.x - size * Math.cos(angle + Math.PI / 6)
    const hy2 = end.y - size * Math.sin(angle + Math.PI / 6)

    if (isPointInTriangle(px, py, end.x, end.y, hx1, hy1, hx2, hy2)) {
      return true
    }

    return (
      distancePointToSegment(px, py, end.x, end.y, hx1, hy1) <= lineTolerance ||
      distancePointToSegment(px, py, end.x, end.y, hx2, hy2) <= lineTolerance
    )
  }

  function isPointNearRelation(px: number, py: number, element: BoardElement): boolean {
    const points = getArrowPathPoints(element)
    if (points.length < 2) {
      return false
    }
    const lineTolerance = Math.max(6, Number(element.strokeWidth || 2) + 4)

    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i]!
      const to = points[i + 1]!
      if (distancePointToSegment(px, py, from.x, from.y, to.x, to.y) <= lineTolerance) {
        return true
      }
    }

    const relationType = getRelationType(element)
    const start = points[0]!
    const next = points[1]!
    const prev = points[points.length - 2]!
    const end = points[points.length - 1]!
    const hitSw = Number(element.strokeWidth || 2)
    const endpointSegments = [
      ...getRelationEndpointSegments(start, next, getRelationEndpointKind(relationType, true), hitSw),
      ...getRelationEndpointSegments(end, prev, getRelationEndpointKind(relationType, false), hitSw),
    ]
    return endpointSegments.some(
      (segment) => distancePointToSegment(px, py, segment.x1, segment.y1, segment.x2, segment.y2) <= lineTolerance,
    )
  }

  function isPointInRoundedRect(
    px: number,
    py: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    radiusInput = RECT_CORNER_RADIUS,
  ): boolean {
    if (bw <= 0 || bh <= 0) {
      return false
    }
    const radius = Math.max(0, Math.min(radiusInput, bw / 2, bh / 2))
    const left = bx
    const right = bx + bw
    const top = by
    const bottom = by + bh

    if (px < left || px > right || py < top || py > bottom) {
      return false
    }

    if (radius <= 0) {
      return true
    }

    if ((px >= left + radius && px <= right - radius) || (py >= top + radius && py <= bottom - radius)) {
      return true
    }

    const corners = [
      { cx: left + radius, cy: top + radius },
      { cx: right - radius, cy: top + radius },
      { cx: right - radius, cy: bottom - radius },
      { cx: left + radius, cy: bottom - radius },
    ]

    for (const corner of corners) {
      const dx = px - corner.cx
      const dy = py - corner.cy
      if (dx * dx + dy * dy <= radius * radius) {
        return true
      }
    }

    return false
  }

  function isPointInEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean {
    if (rx <= 0 || ry <= 0) {
      return false
    }
    const nx = (px - cx) / rx
    const ny = (py - cy) / ry
    return nx * nx + ny * ny <= 1
  }

  function isPointOnRoundedRectBorder(px: number, py: number, bx: number, by: number, bw: number, bh: number): boolean {
    const outerX = bx - borderTolerance
    const outerY = by - borderTolerance
    const outerW = bw + borderTolerance * 2
    const outerH = bh + borderTolerance * 2
    const outerRadius = RECT_CORNER_RADIUS + borderTolerance

    if (!isPointInRoundedRect(px, py, outerX, outerY, outerW, outerH, outerRadius)) {
      return false
    }

    const innerX = bx + borderTolerance
    const innerY = by + borderTolerance
    const innerW = bw - borderTolerance * 2
    const innerH = bh - borderTolerance * 2
    if (innerW <= 0 || innerH <= 0) {
      return true
    }

    const innerRadius = Math.max(0, RECT_CORNER_RADIUS - borderTolerance)
    return !isPointInRoundedRect(px, py, innerX, innerY, innerW, innerH, innerRadius)
  }

  function isPointOnRectBorder(px: number, py: number, element: BoardElement): boolean {
    const r = normalizeRect(element)
    const angle = getRectAngle(element)
    if (angle === 0) {
      return isPointOnRoundedRectBorder(px, py, r.x, r.y, r.w, r.h)
    }
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const local = rotatePoint(px, py, cx, cy, (-angle * Math.PI) / 180)
    return isPointOnRoundedRectBorder(local.x, local.y, r.x, r.y, r.w, r.h)
  }

  function isPointOnEllipseBorder(px: number, py: number, bx: number, by: number, bw: number, bh: number): boolean {
    if (bw <= 0 || bh <= 0) {
      return false
    }
    const cx = bx + bw / 2
    const cy = by + bh / 2
    const outerRx = bw / 2 + borderTolerance
    const outerRy = bh / 2 + borderTolerance
    if (!isPointInEllipse(px, py, cx, cy, outerRx, outerRy)) {
      return false
    }

    const innerRx = bw / 2 - borderTolerance
    const innerRy = bh / 2 - borderTolerance
    if (innerRx <= 0 || innerRy <= 0) {
      return true
    }
    return !isPointInEllipse(px, py, cx, cy, innerRx, innerRy)
  }

  function isPointOnFrameBorder(px: number, py: number, bx: number, by: number, bw: number, bh: number): boolean {
    const outerLeft = bx - borderTolerance
    const outerTop = by - borderTolerance
    const outerRight = bx + bw + borderTolerance
    const outerBottom = by + bh + borderTolerance
    if (px < outerLeft || px > outerRight || py < outerTop || py > outerBottom) {
      return false
    }

    const innerLeft = bx + borderTolerance
    const innerTop = by + borderTolerance
    const innerRight = bx + bw - borderTolerance
    const innerBottom = by + bh - borderTolerance
    if (innerLeft >= innerRight || innerTop >= innerBottom) {
      return true
    }

    return !(px >= innerLeft && px <= innerRight && py >= innerTop && py <= innerBottom)
  }

  function getFrameNameForHitTest(frame: BoardElement): string {
    const name = String(frame.name || '').trim()
    if (name) {
      return name
    }
    const parsed = Number.parseInt(String(frame.frameIndex || ''), 10)
    const index = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    return `Frame ${index}`
  }

  function isPointInFrameTitle(px: number, py: number, frame: BoardElement, bx: number, by: number): boolean {
    const fontSize = FRAME_STYLE.title.fontSize
    const baselineX = bx + FRAME_STYLE.title.xOffset
    const baselineY = by + FRAME_STYLE.title.yOffset
    const text = getFrameNameForHitTest(frame)
    let textWidth = text.length * fontSize * 0.62
    if (ctx) {
      ctx.save()
      ctx.font = `${FRAME_STYLE.title.fontWeight} ${fontSize}px ${FRAME_STYLE.title.fontFamily}`
      textWidth = Math.max(1, ctx.measureText(text).width)
      ctx.restore()
    }
    const top = baselineY - fontSize
    const bottom = baselineY
    return px >= baselineX && px <= baselineX + textWidth && py >= top && py <= bottom
  }

  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i]
    if (!element) {
      continue
    }
    const b = getElementBounds(element, ctx)
    if (!b) {
      continue
    }

    if (element.type === 'ellipse') {
      if (isPointOnEllipseBorder(x, y, b.x, b.y, b.w, b.h)) {
        return element
      }
      continue
    }

    if (element.type === 'rect') {
      if (isPointOnRectBorder(x, y, element)) {
        return element
      }
      continue
    }

    if (element.type === 'frame') {
      if (isPointOnFrameBorder(x, y, b.x, b.y, b.w, b.h) || isPointInFrameTitle(x, y, element, b.x, b.y)) {
        return element
      }
      continue
    }

    if (element.type === 'arrow') {
      if (isPointNearArrow(x, y, element)) {
        return element
      }
      continue
    }

    if (element.type === 'relation') {
      if (isPointNearRelation(x, y, element)) {
        return element
      }
      continue
    }

    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return element
    }
  }
  return null
}

export function getResizeHandles(element: BoardElement, ctx: CanvasRenderingContext2D | null): ResizeHandlePoint[] {
  if (element.type === 'arrow' || element.type === 'relation') {
    const points = getArrowPathPoints(element)
    if (points.length < 2) {
      return []
    }
    const handles: ResizeHandlePoint[] = [{ handle: 'start', x: points[0]!.x, y: points[0]!.y }]
    for (let i = 1; i < points.length - 1; i += 1) {
      handles.push({ handle: `break_${i - 1}`, x: points[i]!.x, y: points[i]!.y })
    }
    handles.push({ handle: 'end', x: points[points.length - 1]!.x, y: points[points.length - 1]!.y })
    return handles
  }

  if (element.type === 'text') {
    return []
  }

  if (element.type === 'rect' && getRectAngle(element) === 45) {
    const corners = getRectCorners(element)
    const nw = corners[0]!
    const ne = corners[1]!
    const se = corners[2]!
    const sw = corners[3]!
    const midpoint = (from: { x: number; y: number }, to: { x: number; y: number }) => ({
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    })
    const n = midpoint(nw, ne)
    const e = midpoint(ne, se)
    const s = midpoint(sw, se)
    const w = midpoint(nw, sw)

    return [
      { handle: 'nw', x: nw.x, y: nw.y },
      { handle: 'n', x: n.x, y: n.y },
      { handle: 'ne', x: ne.x, y: ne.y },
      { handle: 'e', x: e.x, y: e.y },
      { handle: 'se', x: se.x, y: se.y },
      { handle: 's', x: s.x, y: s.y },
      { handle: 'sw', x: sw.x, y: sw.y },
      { handle: 'w', x: w.x, y: w.y },
    ]
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
