import { getElementBounds } from '@/board/canvas'
import type { BoardElement } from '@/board/types'

type UseBoardCanvasHelpersArgs = {
  getCanvasContext: () => CanvasRenderingContext2D | null
  getActiveSchemaName: () => string | null
}

export function useBoardCanvasHelpers(args: UseBoardCanvasHelpersArgs) {
  const { getCanvasContext, getActiveSchemaName } = args

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
      const bounds = getElementBounds(element, ctx)
      if (!bounds) {
        continue
      }
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x + bounds.w)
      maxY = Math.max(maxY, bounds.y + bounds.h)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null
    }
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
  }

  function triggerBlobDownload(blob: Blob, fallbackName = 'diagram.png'): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const schemaName = getActiveSchemaName()
    const normalizedSchemaName = schemaName ? schemaName.replace(/[^a-z0-9-_]/gi, '_').toLowerCase() : ''
    const extMatch = String(fallbackName).match(/(\.[a-z0-9]+)$/i)
    const extension = extMatch ? extMatch[1] : '.png'
    const fallbackBase = String(fallbackName).replace(/(\.[a-z0-9]+)$/i, '')
    const hasCustomBase = Boolean(fallbackBase) && fallbackBase.toLowerCase() !== 'diagram'
    const downloadBase = hasCustomBase ? fallbackBase : normalizedSchemaName
    anchor.href = url
    anchor.download = downloadBase ? `${downloadBase}${extension}` : fallbackName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return {
    computeElementsBounds,
    triggerBlobDownload,
  }
}
