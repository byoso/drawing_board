import { drawElement, getArrowPathPoints, getElementBounds } from '@/board/canvas'
import { FRAME_STYLE, RECT_CORNER_RADIUS } from '@/board/constants'
import type { BoardElement, RelationType } from '@/board/types'

type Bounds = { x: number; y: number; w: number; h: number }

type UseBoardSchemaImageExportOptions = {
  getActiveSchema: () => { name: string; elements: BoardElement[] } | null
  getFrameDisplayName: (frame: { name?: unknown; frameIndex?: unknown }) => string
  getSelectedFrame: () => BoardElement | null
  getSelectedRelationTypeFromElement: (element: BoardElement) => RelationType
  getCanvasContext: () => CanvasRenderingContext2D | null
  getDashArrayFromStyle: (style: unknown) => number[]
  getCachedIconImage: (src: string) => HTMLImageElement | null
  computeElementsBounds: (elements: BoardElement[]) => Bounds | null
  showToast: (message: string, type?: 'info' | 'warning' | 'error') => void
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
  if (type === 'one-to-many') {
    return atStart ? 'one' : 'many'
  }
  return atStart ? 'many' : 'one'
}

function buildRelationEndpointSegments(
  tip: { x: number; y: number },
  inner: { x: number; y: number },
  kind: 'one' | 'many',
  strokeWidth: number,
): Segment2D[] {
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

function triggerBlobDownload(blob: Blob, fallbackName = 'diagram.png', schemaName = ''): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const sanitizedSchemaName = schemaName ? schemaName.replace(/[^a-z0-9-_]/gi, '_').toLowerCase() : ''
  const extMatch = String(fallbackName).match(/(\.[a-z0-9]+)$/i)
  const extension = extMatch ? extMatch[1] : '.png'
  const fallbackBase = String(fallbackName).replace(/(\.[a-z0-9]+)$/i, '')
  const hasCustomBase = Boolean(fallbackBase) && fallbackBase.toLowerCase() !== 'diagram'
  const downloadBase = hasCustomBase ? fallbackBase : sanitizedSchemaName
  anchor.href = url
  anchor.download = downloadBase ? `${downloadBase}${extension}` : fallbackName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function useBoardSchemaImageExport(options: UseBoardSchemaImageExportOptions) {
  function getSelectedFrameExportBounds(): Bounds | null {
    const frame = options.getSelectedFrame()
    if (!frame) {
      options.showToast('Select a frame first.', 'error')
      return null
    }
    const bounds = getElementBounds(frame, options.getCanvasContext())
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
      options.showToast('Frame has invalid dimensions.', 'error')
      return null
    }
    return bounds
  }

  function getSelectedFrameExportFileBase(): string {
    const frame = options.getSelectedFrame()
    if (!frame) {
      return 'frame'
    }
    const raw = options.getFrameDisplayName(frame).replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
    return raw || `frame_${Number(frame.frameIndex || 1)}`
  }

  async function buildSchemaPngBlob(exportBounds: Bounds | null = null): Promise<Blob | null> {
    const schema = options.getActiveSchema()
    if (!schema || schema.elements.length === 0) {
      options.showToast('Nothing to export: diagram is empty.', 'error')
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
      const computedBounds = options.computeElementsBounds(schema.elements)
      if (!computedBounds) {
        options.showToast('Could not compute diagram bounds.', 'error')
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
      options.showToast('Canvas export context unavailable.', 'error')
      return null
    }

    outCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    outCtx.clearRect(0, 0, exportWidth, exportHeight)
    outCtx.fillStyle = '#ffffff'
    outCtx.fillRect(0, 0, exportWidth, exportHeight)
    outCtx.save()
    outCtx.translate(offsetX, offsetY)
    for (const element of schema.elements) {
      outCtx.setLineDash(options.getDashArrayFromStyle(element.strokeStyle))
      drawElement(outCtx, element, {
        selected: false,
        getFrameName: options.getFrameDisplayName,
        getIconImage: options.getCachedIconImage,
      })
    }
    outCtx.restore()

    try {
      return await new Promise((resolve) => outCanvas.toBlob((result) => resolve(result), 'image/png'))
    } catch {
      options.showToast('PNG export failed: some icons have cross-origin restrictions. Try re-adding them as data URLs.', 'error')
      return null
    }
  }

  function buildSchemaSvgString(exportBounds: Bounds | null = null): string | null {
    const schema = options.getActiveSchema()
    if (!schema || schema.elements.length === 0) {
      options.showToast('Nothing to export: diagram is empty.', 'error')
      return null
    }

    const bounds = exportBounds || options.computeElementsBounds(schema.elements)
    if (!bounds) {
      options.showToast('Could not compute diagram bounds.', 'error')
      return null
    }

    const margin = exportBounds ? 0 : 5
    const width = Math.ceil(bounds.w + margin * 2)
    const height = Math.ceil(bounds.h + margin * 2)
    const translateX = margin - bounds.x
    const translateY = margin - bounds.y

    const shapes: string[] = []
    for (const element of schema.elements) {
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
          `<text x="${labelX}" y="${labelY}" fill="${FRAME_STYLE.stroke}" font-size="${FRAME_STYLE.title.fontSize}" font-family="${FRAME_STYLE.title.fontFamily}" font-weight="${FRAME_STYLE.title.fontWeight}">${escapeXml(options.getFrameDisplayName(element))}</text>`,
        )
        continue
      }

      if (element.type === 'rect') {
        const x = toSvgNumber(Number(element.x || 0) + translateX)
        const y = toSvgNumber(Number(element.y || 0) + translateY)
        const w = toSvgNumber(Math.abs(Number(element.w || 0)))
        const h = toSvgNumber(Math.abs(Number(element.h || 0)))
        const dash = options.getDashArrayFromStyle(element.strokeStyle)
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
        const dash = options.getDashArrayFromStyle(element.strokeStyle)
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
        const dash = options.getDashArrayFromStyle(element.strokeStyle)
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
        const dash = options.getDashArrayFromStyle(element.strokeStyle)
        const pointsAttr = points.map((point) => `${toSvgNumber(point.x)},${toSvgNumber(point.y)}`).join(' ')
        shapes.push(
          `<polyline points="${pointsAttr}" fill="none" stroke="${stroke}" stroke-width="${widthValue}" stroke-linejoin="round" stroke-linecap="round" ${dash.length ? `stroke-dasharray="${dash.join(',')}"` : ''} />`,
        )

        const relationType = options.getSelectedRelationTypeFromElement(element)
        const start = points[0]!
        const next = points[1]!
        const prev = points[points.length - 2]!
        const end = points[points.length - 1]!
        const svgSw = Number(element.strokeWidth || 2)
        const startSegments = buildRelationEndpointSegments(start, next, getRelationEndpointKind(relationType, true), svgSw)
        const endSegments = buildRelationEndpointSegments(end, prev, getRelationEndpointKind(relationType, false), svgSw)
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
    triggerBlobDownload(blob, 'diagram.png', options.getActiveSchema()?.name || '')
    options.showToast('PNG export completed.')
  }

  function saveCurrentSchemaAsSvg(): void {
    const markup = buildSchemaSvgString()
    if (!markup) {
      return
    }
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    triggerBlobDownload(blob, 'diagram.svg', options.getActiveSchema()?.name || '')
    options.showToast('SVG export completed.')
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
    triggerBlobDownload(blob, `${getSelectedFrameExportFileBase()}.png`, options.getActiveSchema()?.name || '')
    options.showToast('Frame PNG downloaded.')
  }

  async function copySelectedFramePngToClipboard(): Promise<void> {
    const bounds = getSelectedFrameExportBounds()
    if (!bounds) {
      return
    }
    const blob = await buildSchemaPngBlob(bounds)
    if (!blob) {
      return
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      options.showToast('Frame PNG copied to clipboard.')
    } catch {
      options.showToast('Clipboard write failed. Your browser may not support it.', 'error')
    }
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
    triggerBlobDownload(blob, `${getSelectedFrameExportFileBase()}.svg`, options.getActiveSchema()?.name || '')
    options.showToast('Frame SVG downloaded.')
  }

  return {
    saveCurrentSchemaAsPng,
    saveCurrentSchemaAsSvg,
    saveSelectedFrameAsPng,
    copySelectedFramePngToClipboard,
    saveSelectedFrameAsSvg,
  }
}
