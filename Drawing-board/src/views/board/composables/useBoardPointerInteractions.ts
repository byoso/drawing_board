import type { Ref } from 'vue'
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/board/constants'
import { getArrowPathPoints, getElementBounds, hitResizeHandle, hitTestElement, normalizeRect } from '@/board/canvas'
import type { BoardElement, RectAngle, RelationType } from '@/board/types'
import { deepClone, hexToRgba, uid } from '@/board/utils'

export type BoardPointerState = {
  mode: 'idle' | 'draw' | 'drag' | 'resize' | 'pan'
  startX: number
  startY: number
  panStartCanvasX: number
  panStartCanvasY: number
  panStartOffsetX: number
  panStartOffsetY: number
  startElements: Record<string, BoardElement>
  startElement: BoardElement | null
  resizeHandle: string | null
  historyCaptured: boolean
  ctrlPressed: boolean
  initialSelection: string[]
}

type UseBoardPointerInteractionsArgs = {
  selectedElementIds: Ref<string[]>
  draftElement: Ref<BoardElement | null>
  marqueeRect: Ref<{ x: number; y: number; w: number; h: number } | null>
  lastCanvasPointer: Ref<{ x: number; y: number }>
  isSpacePressed: { readonly value: boolean }
  isSlideshowMode: { readonly value: boolean }
  newRectAngle: Ref<RectAngle>
  newRectSquare: Ref<boolean>
  newArrowBreaks: Ref<number>
  newArrowOrthogonal: Ref<boolean>
  newArrowLineOnly: Ref<boolean>
  newRelationBreaks: Ref<number>
  newRelationOrthogonal: Ref<boolean>
  newRelationType: Ref<RelationType>
  viewport: { zoom: number; offsetX: number; offsetY: number }
  pointer: BoardPointerState
  getActiveSchema: () => { elements: BoardElement[] } | null
  getActiveTool: () => string
  getActiveColor: () => string
  getCurrentStrokeWidth: () => number
  getCurrentFontSize: () => number
  getLineStyle: () => string | undefined
  getNextFrameIndex: () => number
  getDefaultFrameName: (index: number) => string
  getCanvasContext: () => CanvasRenderingContext2D | null
  getCanvasPosition: (event: PointerEvent | WheelEvent | MouseEvent) => { x: number; y: number }
  getPointerPosition: (event: PointerEvent | WheelEvent | MouseEvent) => { x: number; y: number }
  clamp: (value: number, min: number, max: number) => number
  getEvenlySpacedArrowBreakPoints: (element: BoardElement, breaks: number) => Array<{ x: number; y: number }>
  applyFrameStyle: (element: BoardElement) => void
  isSelected: (id: string) => boolean
  setSingleSelection: (id: string) => void
  clearSelection: () => void
  pushHistoryCheckpoint: () => void
  markDirty: () => void
  renderCanvas: () => void
  openTextCreateEditor: (pos: { x: number; y: number }) => void
}

export function useBoardPointerInteractions(args: UseBoardPointerInteractionsArgs) {
  const {
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
    getActiveSchema,
    getActiveTool,
    getActiveColor,
    getCurrentStrokeWidth,
    getCurrentFontSize,
    getLineStyle,
    getNextFrameIndex,
    getDefaultFrameName,
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
  } = args

  function findSelectedElement(): BoardElement | null {
    const schema = getActiveSchema()
    if (!schema || selectedElementIds.value.length !== 1) {
      return null
    }
    return schema.elements.find((element) => element.id === selectedElementIds.value[0]) || null
  }

  function applyResize(element: BoardElement, start: BoardElement, handle: string, x: number, y: number): void {
    if (element.type === 'arrow' || element.type === 'relation') {
      const currentBreaks = Math.max(0, Math.min(8, Math.round(Number(element.breaks || 0))))
      let currentBreakPoints = getEvenlySpacedArrowBreakPoints(start, currentBreaks)
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

    if (element.type === 'rect') {
      const startRect = normalizeRect(start)
      const centerX = startRect.x + startRect.w / 2
      const centerY = startRect.y + startRect.h / 2
      const angle = Number(start.angle || 0) === 45 ? Math.PI / 4 : 0
      const axisX = { x: Math.cos(angle), y: Math.sin(angle) }
      const axisY = { x: -Math.sin(angle), y: Math.cos(angle) }
      const startHalfWidth = startRect.w / 2
      const startHalfHeight = startRect.h / 2
      const minHalfSize = 3
      const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
      const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
      const isSquare = Boolean(start.square)

      const projectOnAxis = (px: number, py: number, originX: number, originY: number, axis: { x: number; y: number }): number => {
        const dx = px - originX
        const dy = py - originY
        return dx * axis.x + dy * axis.y
      }

      let nextHalfWidth = startHalfWidth
      let nextHalfHeight = startHalfHeight
      let nextCenterX = centerX
      let nextCenterY = centerY

      if (sx !== 0 && sy !== 0) {
        const anchorX = centerX - sx * startHalfWidth * axisX.x - sy * startHalfHeight * axisY.x
        const anchorY = centerY - sx * startHalfWidth * axisX.y - sy * startHalfHeight * axisY.y
        const projectedWidth = Math.max(minHalfSize, (sx * projectOnAxis(x, y, anchorX, anchorY, axisX)) / 2)
        const projectedHeight = Math.max(minHalfSize, (sy * projectOnAxis(x, y, anchorX, anchorY, axisY)) / 2)
        if (isSquare) {
          const size = Math.max(projectedWidth, projectedHeight)
          nextHalfWidth = size
          nextHalfHeight = size
        } else {
          nextHalfWidth = projectedWidth
          nextHalfHeight = projectedHeight
        }
        nextCenterX = anchorX + sx * nextHalfWidth * axisX.x + sy * nextHalfHeight * axisY.x
        nextCenterY = anchorY + sx * nextHalfWidth * axisX.y + sy * nextHalfHeight * axisY.y
      } else if (sx !== 0) {
        const anchorX = centerX - sx * startHalfWidth * axisX.x
        const anchorY = centerY - sx * startHalfWidth * axisX.y
        const projectedWidth = Math.max(minHalfSize, (sx * projectOnAxis(x, y, anchorX, anchorY, axisX)) / 2)
        if (isSquare) {
          const size = Math.max(projectedWidth, startHalfHeight)
          nextHalfWidth = size
          nextHalfHeight = size
        } else {
          nextHalfWidth = projectedWidth
          nextHalfHeight = startHalfHeight
        }
        nextCenterX = anchorX + sx * nextHalfWidth * axisX.x
        nextCenterY = anchorY + sx * nextHalfWidth * axisX.y
      } else if (sy !== 0) {
        const anchorX = centerX - sy * startHalfHeight * axisY.x
        const anchorY = centerY - sy * startHalfHeight * axisY.y
        const projectedHeight = Math.max(minHalfSize, (sy * projectOnAxis(x, y, anchorX, anchorY, axisY)) / 2)
        if (isSquare) {
          const size = Math.max(projectedHeight, startHalfWidth)
          nextHalfWidth = size
          nextHalfHeight = size
        } else {
          nextHalfWidth = startHalfWidth
          nextHalfHeight = projectedHeight
        }
        nextCenterX = anchorX + sy * nextHalfHeight * axisY.x
        nextCenterY = anchorY + sy * nextHalfHeight * axisY.y
      }

      element.x = nextCenterX - nextHalfWidth
      element.y = nextCenterY - nextHalfHeight
      element.w = nextHalfWidth * 2
      element.h = nextHalfHeight * 2
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
    const schema = getActiveSchema()
    if (!schema || !marqueeRect.value) {
      return
    }
    const ctx = getCanvasContext()
    const ids = schema.elements
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
    const activeTool = getActiveTool()
    if (activeTool === 'text') {
      return {
        id: uid('el'),
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: 'Text',
        color: getActiveColor(),
        fontSize: getCurrentFontSize(),
      }
    }

    const base = {
      id: uid('el'),
      stroke: getActiveColor(),
      fill: hexToRgba(getActiveColor(), 0.22),
      strokeWidth: getCurrentStrokeWidth(),
      strokeStyle: getLineStyle(),
    } satisfies Omit<BoardElement, 'type'>

    if (activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'frame' || activeTool === 'table') {
      const elementType = activeTool as 'rect' | 'ellipse' | 'frame' | 'table'
      const draft: BoardElement = {
        ...base,
        type: elementType,
        x: pos.x,
        y: pos.y,
        w: 0,
        h: 0,
      }
      if (elementType === 'rect') {
        draft.angle = newRectAngle.value
        draft.square = newRectSquare.value
      }
      if (elementType === 'frame') {
        draft.frameIndex = getNextFrameIndex()
        draft.name = getDefaultFrameName(Number(draft.frameIndex))
        applyFrameStyle(draft)
      }
      if (elementType === 'table') {
        draft.fill = '#ffffff'
        draft.tableTitle = 'Table'
        draft.tableFields = []
      }
      return draft
    }

    if (activeTool === 'arrow') {
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
        lineOnly: Boolean(newArrowLineOnly.value),
        breakPoints: [],
      }
      draft.breakPoints = getEvenlySpacedArrowBreakPoints(draft, breaks)
      return draft
    }

    if (activeTool === 'relation') {
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
    const schema = getActiveSchema()
    if (!schema) {
      return
    }

    const canPanWithLeftButton = isSpacePressed.value || isSlideshowMode.value
    if (event.button === 1 || (event.button === 0 && canPanWithLeftButton)) {
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

    if (isSlideshowMode.value) {
      return
    }

    const pos = getPointerPosition(event)
    lastCanvasPointer.value = pos
    pointer.startX = pos.x
    pointer.startY = pos.y
    pointer.historyCaptured = false

    if (getActiveTool() === 'select') {
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

      const hit = hitTestElement(pos.x, pos.y, schema.elements, getCanvasContext())
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
        pointer.startElements = schema.elements
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

    const hit = hitTestElement(pos.x, pos.y, schema.elements, getCanvasContext())
    if (hit && isSelected(hit.id)) {
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

      pointer.mode = 'drag'
      pointer.ctrlPressed = false
      pointer.initialSelection = []
      pointer.startElements = schema.elements
        .filter((element) => isSelected(element.id))
        .reduce<Record<string, BoardElement>>((acc, element) => {
          acc[element.id] = deepClone(element)
          return acc
        }, {})
      pointer.startElement = null
      pointer.resizeHandle = null
      marqueeRect.value = null
      renderCanvas()
      return
    }

    const draft = createDraftForTool(pos)
    if (!draft) {
      return
    }

    if (getActiveTool() === 'text') {
      openTextCreateEditor(pos)
      return
    }

    draftElement.value = draft
    pointer.mode = 'draw'
    renderCanvas()
  }

  function onPointerMove(event: PointerEvent): void {
    const schema = getActiveSchema()
    if (!schema) {
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
        let nextWidth = pos.x - pointer.startX
        let nextHeight = pos.y - pointer.startY
        if (draftElement.value.type === 'rect' && draftElement.value.square) {
          const size = Math.max(Math.abs(nextWidth), Math.abs(nextHeight))
          nextWidth = nextWidth < 0 ? -size : size
          nextHeight = nextHeight < 0 ? -size : size
        }
        draftElement.value.w = nextWidth
        draftElement.value.h = nextHeight
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
        const target = schema.elements.find((element) => element.id === elementId)
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

    if (pointer.mode === 'resize' && pointer.startElement && pointer.resizeHandle) {
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
    const schema = getActiveSchema()
    if (!schema) {
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
        schema.elements.push(draftElement.value)
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

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
