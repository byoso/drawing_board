import type { Ref } from 'vue'
import { getArrowPathPoints } from '@/board/canvas'
import { clearConnectorAttachments, getConnectorMagnetic, isMagneticConnector, updateConnectorAttachments } from '@/board/magnetic'
import type { BoardElement, OrthogonalFirstSegment, RectAngle, RelationType, ToolId } from '@/board/types'
import { hexToRgba } from '@/board/utils'

type PointerMode = 'idle' | 'draw' | 'drag' | 'resize' | 'pan'

type SizePresetMap = {
  small: { strokeWidth: number; fontSize: number }
  medium: { strokeWidth: number; fontSize: number }
  big: { strokeWidth: number; fontSize: number }
}

type UseBoardSelectionPropertiesOptions = {
  selectedElementIds: Ref<string[]>
  draftElement: Ref<BoardElement | null>
  getPointerMode: () => PointerMode
  getActiveSchema: () => { elements: BoardElement[] } | null
  getActiveTool: () => ToolId
  getSizePresets: () => SizePresetMap
  newRectAngle: Ref<RectAngle>
  newRectSquare: Ref<boolean>
  newShapeFilled: Ref<boolean>
  newArrowBreaks: Ref<number>
  newArrowMagnetic: Ref<boolean>
  newArrowFirstSegment: Ref<OrthogonalFirstSegment>
  newArrowOrthogonal: Ref<boolean>
  newArrowLineOnly: Ref<boolean>
  newRelationBreaks: Ref<number>
  newRelationMagnetic: Ref<boolean>
  newRelationFirstSegment: Ref<OrthogonalFirstSegment>
  newRelationOrthogonal: Ref<boolean>
  newRelationType: Ref<RelationType>
  pushHistoryCheckpoint: () => void
  markDirty: () => void
  renderCanvas: () => void
}

function isConnectorElement(element: BoardElement | null | undefined): boolean {
  return Boolean(element && (element.type === 'arrow' || element.type === 'relation'))
}

export function useBoardSelectionProperties(options: UseBoardSelectionPropertiesOptions) {
  function isSelected(id: string): boolean {
    return options.selectedElementIds.value.includes(id)
  }

  function clearSelection(): void {
    options.selectedElementIds.value = []
  }

  function setSingleSelection(id: string): void {
    options.selectedElementIds.value = id ? [id] : []
  }

  function getSelectedElements(): BoardElement[] {
    const schema = options.getActiveSchema()
    if (!schema || options.selectedElementIds.value.length === 0) {
      return []
    }
    const idSet = new Set(options.selectedElementIds.value)
    return schema.elements.filter((element) => idSet.has(element.id))
  }

  function getSizeKeyFromElement(element: BoardElement | null): 'small' | 'medium' | 'big' | null {
    if (!element) {
      return null
    }
    const presets = options.getSizePresets()
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
    if (options.selectedElementIds.value.length !== 1) {
      return null
    }
    const selected = getSelectedElements()[0]
    if (!selected) {
      return null
    }
    if (selected.type === 'text') {
      return String(selected.color || '') || null
    }
    if (selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'arrow' || selected.type === 'relation' || selected.type === 'table') {
      return String(selected.stroke || '') || null
    }
    return null
  }

  function getSelectedLineStyle(): 'solid' | 'dashed' | null {
    if (options.selectedElementIds.value.length !== 1) {
      return null
    }
    const selected = getSelectedElements()[0]
    if (!selected) {
      return null
    }
    if (selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'arrow' || selected.type === 'relation' || selected.type === 'table') {
      return selected.strokeStyle === 'dashed' ? 'dashed' : 'solid'
    }
    return null
  }

  function getSelectedSize(): 'small' | 'medium' | 'big' | null {
    if (options.selectedElementIds.value.length !== 1) {
      return null
    }
    return getSizeKeyFromElement(getSelectedElements()[0] || null)
  }

  function getSelectedRect(): BoardElement | null {
    if (options.selectedElementIds.value.length !== 1) {
      return null
    }
    const selected = getSelectedElements()[0] || null
    if (!selected || selected.type !== 'rect') {
      return null
    }
    return selected
  }

  function getSelectedEllipse(): BoardElement | null {
    if (options.selectedElementIds.value.length !== 1) {
      return null
    }
    const selected = getSelectedElements()[0] || null
    if (!selected || selected.type !== 'ellipse') {
      return null
    }
    return selected
  }

  function getSelectedRectAngle(): RectAngle {
    if (options.getActiveTool() === 'rect') {
      return options.newRectAngle.value
    }
    const rect = getSelectedRect()
    return rect && Number(rect.angle || 0) === 45 ? 45 : 0
  }

  function getSelectedRectSquare(): boolean {
    if (options.getActiveTool() === 'rect') {
      return Boolean(options.newRectSquare.value)
    }
    return Boolean(getSelectedRect()?.square)
  }

  function getSelectedFilled(): boolean {
    if (options.getActiveTool() === 'rect' || options.getActiveTool() === 'ellipse') {
      return Boolean(options.newShapeFilled.value)
    }
    const rect = getSelectedRect()
    if (rect) {
      return rect.filled !== false
    }
    const ellipse = getSelectedEllipse()
    if (ellipse) {
      return ellipse.filled !== false
    }
    return true
  }

  function getSelectedConnector(): BoardElement | null {
    if (options.selectedElementIds.value.length !== 1) {
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
    if (options.getActiveTool() === 'arrow') {
      return Math.max(0, Math.min(8, Math.round(Number(options.newArrowBreaks.value || 0))))
    }
    if (options.getActiveTool() === 'relation') {
      return Math.max(0, Math.min(8, Math.round(Number(options.newRelationBreaks.value || 0))))
    }
    return 0
  }

  function getSelectedArrowOrthogonal(): boolean {
    const connector = getSelectedConnector()
    if (connector) {
      return Boolean(connector.orthogonal)
    }
    if (options.getActiveTool() === 'arrow') {
      return Boolean(options.newArrowOrthogonal.value)
    }
    if (options.getActiveTool() === 'relation') {
      return Boolean(options.newRelationOrthogonal.value)
    }
    return false
  }

  function inferOrthogonalFirstSegment(element: BoardElement): OrthogonalFirstSegment {
    const source = Array.isArray(element.breakPoints) && element.breakPoints.length > 0
      ? element.breakPoints[0]
      : { x: Number(element.x2 || 0), y: Number(element.y2 || 0) }
    const startX = Number(element.x1 || 0)
    const startY = Number(element.y1 || 0)
    const dx = Math.abs(Number(source?.x || 0) - startX)
    const dy = Math.abs(Number(source?.y || 0) - startY)
    return dx >= dy ? 'horizontal' : 'vertical'
  }

  function getSelectedArrowFirstSegment(): OrthogonalFirstSegment {
    const connector = getSelectedConnector()
    if (connector) {
      return (connector.orthogonalFirstSegment as OrthogonalFirstSegment | undefined) || inferOrthogonalFirstSegment(connector)
    }
    if (options.getActiveTool() === 'arrow') {
      return options.newArrowFirstSegment.value
    }
    if (options.getActiveTool() === 'relation') {
      return options.newRelationFirstSegment.value
    }
    return 'horizontal'
  }

  function getSelectedArrowMagnetic(): boolean {
    const connector = getSelectedConnector()
    if (connector) {
      return getConnectorMagnetic(connector)
    }
    if (options.getActiveTool() === 'arrow') {
      return Boolean(options.newArrowMagnetic.value)
    }
    if (options.getActiveTool() === 'relation') {
      return Boolean(options.newRelationMagnetic.value)
    }
    return false
  }

  function getSelectedRelationType(): RelationType {
    if (options.getActiveTool() === 'relation') {
      return options.newRelationType.value
    }
    const relation = getSelectedRelation()
    if (relation) {
      return getSelectedRelationTypeFromElement(relation)
    }
    return 'many-to-one'
  }

  function getSelectedRelationTypeFromElement(element: BoardElement): RelationType {
    const value = String(element.relationType || 'many-to-one')
    if (value === 'one-to-one' || value === 'many-to-one' || value === 'one-to-many' || value === 'many-to-many') {
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
    const from = path[path.length - 2]!
    const to = path[path.length - 1]!
    return {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    }
  }

  function shiftSelectedArrowBreaks(delta: number): void {
    const connector = getSelectedConnector()
    if (!connector) {
      if (options.getActiveTool() !== 'arrow' && options.getActiveTool() !== 'relation') {
        return
      }
      const current = options.getActiveTool() === 'relation' ? options.newRelationBreaks.value : options.newArrowBreaks.value
      const next = Math.max(0, Math.min(8, current + delta))
      if (next === current) {
        return
      }
      if (options.getActiveTool() === 'relation') {
        options.newRelationBreaks.value = next
      } else {
        options.newArrowBreaks.value = next
      }
      if (options.getPointerMode() === 'draw' && options.draftElement.value && isConnectorElement(options.draftElement.value)) {
        options.draftElement.value.breaks = next
        options.draftElement.value.breakPoints = getEvenlySpacedArrowBreakPoints(options.draftElement.value, next)
        options.renderCanvas()
      }
      return
    }
    const current = getSelectedArrowBreaks()
    const next = Math.max(0, Math.min(8, current + delta))
    if (next === current) {
      return
    }
    options.pushHistoryCheckpoint()
    if (next > current) {
      const points = ensureArrowBreakPoints(connector, current)
      points.push(getDefaultNewArrowBreakPoint({ ...connector, breakPoints: points, breaks: current }))
      connector.breakPoints = points.slice(0, next)
    } else {
      const points = ensureArrowBreakPoints(connector, current)
      connector.breakPoints = points.slice(0, next)
    }
    connector.breaks = next
    options.markDirty()
    options.renderCanvas()
  }

  function getSelectedArrowLineOnly(): boolean {
    const connector = getSelectedConnector()
    if (connector) {
      return Boolean(connector.lineOnly)
    }
    if (options.getActiveTool() === 'arrow') {
      return Boolean(options.newArrowLineOnly.value)
    }
    return false
  }

  function setSelectedArrowLineOnly(value: boolean): void {
    const connector = getSelectedConnector()
    if (!connector) {
      if (options.getActiveTool() !== 'arrow') {
        return
      }
      if (Boolean(options.newArrowLineOnly.value) === value) {
        return
      }
      options.newArrowLineOnly.value = value
      if (options.getPointerMode() === 'draw' && options.draftElement.value && isConnectorElement(options.draftElement.value)) {
        options.draftElement.value.lineOnly = value
        options.renderCanvas()
      }
      return
    }
    if (Boolean(connector.lineOnly) === value) {
      return
    }
    options.pushHistoryCheckpoint()
    connector.lineOnly = value
    options.markDirty()
    options.renderCanvas()
  }

  function setSelectedArrowOrthogonal(value: boolean): void {
    const connector = getSelectedConnector()
    if (!connector) {
      if (options.getActiveTool() !== 'arrow' && options.getActiveTool() !== 'relation') {
        return
      }
      const current = options.getActiveTool() === 'relation' ? options.newRelationOrthogonal.value : options.newArrowOrthogonal.value
      if (current === value) {
        return
      }
      if (options.getActiveTool() === 'relation') {
        options.newRelationOrthogonal.value = value
      } else {
        options.newArrowOrthogonal.value = value
      }
      if (options.getPointerMode() === 'draw' && options.draftElement.value && isConnectorElement(options.draftElement.value)) {
        options.draftElement.value.orthogonal = value
        if (value && !options.draftElement.value.orthogonalFirstSegment) {
          options.draftElement.value.orthogonalFirstSegment = inferOrthogonalFirstSegment(options.draftElement.value)
        }
        options.renderCanvas()
      }
      return
    }
    if (Boolean(connector.orthogonal) === value) {
      return
    }
    options.pushHistoryCheckpoint()
    connector.orthogonal = value
    if (value && !connector.orthogonalFirstSegment) {
      connector.orthogonalFirstSegment = inferOrthogonalFirstSegment(connector)
    }
    options.markDirty()
    options.renderCanvas()
  }

  function flipSelectedArrowOrthogonalOrientation(): void {
    const next = getSelectedArrowFirstSegment() === 'horizontal' ? 'vertical' : 'horizontal'

    if (options.getActiveTool() === 'arrow') {
      options.newArrowFirstSegment.value = next
    }
    if (options.getActiveTool() === 'relation') {
      options.newRelationFirstSegment.value = next
    }

    const connector = getSelectedConnector()
    if (!connector) {
      if (
        (options.getActiveTool() === 'arrow' || options.getActiveTool() === 'relation')
        && options.getPointerMode() === 'draw'
        && options.draftElement.value
        && isConnectorElement(options.draftElement.value)
      ) {
        options.draftElement.value.orthogonalFirstSegment = next
        options.renderCanvas()
      }
      return
    }

    options.pushHistoryCheckpoint()
    connector.orthogonalFirstSegment = next
    options.markDirty()
    options.renderCanvas()
  }

  function setSelectedArrowMagnetic(value: boolean): void {
    if (options.getActiveTool() === 'arrow' && options.newArrowMagnetic.value !== value) {
      options.newArrowMagnetic.value = value
    }
    if (options.getActiveTool() === 'relation' && options.newRelationMagnetic.value !== value) {
      options.newRelationMagnetic.value = value
    }

    const connector = getSelectedConnector()
    if (!connector) {
      if ((options.getActiveTool() === 'arrow' || options.getActiveTool() === 'relation')
        && options.getPointerMode() === 'draw'
        && options.draftElement.value
        && isMagneticConnector(options.draftElement.value)) {
        options.draftElement.value.magnetic = value
        if (value) {
          const schema = options.getActiveSchema()
          updateConnectorAttachments(options.draftElement.value, schema ? schema.elements : [])
        } else {
          clearConnectorAttachments(options.draftElement.value)
        }
        options.renderCanvas()
      }
      return
    }

    if (getConnectorMagnetic(connector) === value) {
      return
    }

    options.pushHistoryCheckpoint()
    connector.magnetic = value
    const schema = options.getActiveSchema()
    if (value) {
      updateConnectorAttachments(connector, schema ? schema.elements : [])
    } else {
      clearConnectorAttachments(connector)
    }
    options.markDirty()
    options.renderCanvas()
  }

  function setSelectedRelationType(value: RelationType): void {
    if (options.getActiveTool() === 'relation' && options.newRelationType.value !== value) {
      options.newRelationType.value = value
    }

    const relation = getSelectedRelation()
    if (!relation) {
      if (options.getActiveTool() !== 'relation') {
        return
      }
      if (options.getPointerMode() === 'draw' && options.draftElement.value?.type === 'relation') {
        options.draftElement.value.relationType = value
        options.renderCanvas()
      }
      return
    }
    if (relation.relationType === value) {
      return
    }
    options.pushHistoryCheckpoint()
    relation.relationType = value
    options.markDirty()
    options.renderCanvas()
  }

  function setSelectedRectAngle(value: RectAngle): void {
    if (options.getActiveTool() === 'rect' && options.newRectAngle.value !== value) {
      options.newRectAngle.value = value
    }

    const rect = getSelectedRect()
    if (!rect) {
      if (options.getActiveTool() !== 'rect') {
        return
      }
      if (options.getPointerMode() === 'draw' && options.draftElement.value?.type === 'rect') {
        options.draftElement.value.angle = value
        options.renderCanvas()
      }
      return
    }
    if ((Number(rect.angle || 0) === 45 ? 45 : 0) === value) {
      return
    }
    options.pushHistoryCheckpoint()
    rect.angle = value
    options.markDirty()
    options.renderCanvas()
  }

  function setSelectedRectSquare(value: boolean): void {
    if (options.getActiveTool() === 'rect' && options.newRectSquare.value !== value) {
      options.newRectSquare.value = value
    }

    const rect = getSelectedRect()
    if (!rect) {
      if (options.getActiveTool() !== 'rect') {
        return
      }
      if (options.getPointerMode() === 'draw' && options.draftElement.value?.type === 'rect') {
        options.draftElement.value.square = value
        if (value) {
          const size = Math.max(Math.abs(Number(options.draftElement.value.w || 0)), Math.abs(Number(options.draftElement.value.h || 0)))
          options.draftElement.value.w = Number(options.draftElement.value.w || 0) < 0 ? -size : size
          options.draftElement.value.h = Number(options.draftElement.value.h || 0) < 0 ? -size : size
        }
        options.renderCanvas()
      }
      return
    }
    if (Boolean(rect.square) === value) {
      return
    }
    options.pushHistoryCheckpoint()
    rect.square = value
    if (value) {
      const size = Math.max(Math.abs(Number(rect.w || 0)), Math.abs(Number(rect.h || 0)))
      rect.w = size
      rect.h = size
    }
    options.markDirty()
    options.renderCanvas()
  }

  function setSelectedFilled(value: boolean): void {
    if ((options.getActiveTool() === 'rect' || options.getActiveTool() === 'ellipse') && options.newShapeFilled.value !== value) {
      options.newShapeFilled.value = value
      if (
        options.getPointerMode() === 'draw'
        && options.draftElement.value
        && (options.draftElement.value.type === 'rect' || options.draftElement.value.type === 'ellipse')
      ) {
        options.draftElement.value.filled = value
        options.renderCanvas()
      }
    }

    const rect = getSelectedRect()
    if (rect) {
      if ((rect.filled !== false) === value) {
        return
      }
      options.pushHistoryCheckpoint()
      rect.filled = value
      options.markDirty()
      options.renderCanvas()
      return
    }

    const ellipse = getSelectedEllipse()
    if (!ellipse) {
      return
    }
    if ((ellipse.filled !== false) === value) {
      return
    }
    options.pushHistoryCheckpoint()
    ellipse.filled = value
    options.markDirty()
    options.renderCanvas()
  }

  function getApplicablePropertiesForSelection(): { hasColor: boolean; hasLineStyle: boolean; hasSize: boolean } {
    const elements = getSelectedElements()
    const hasColor = elements.some((element) => element.type === 'text' || element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation' || element.type === 'table')
    const hasLineStyle = elements.some((element) => element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation' || element.type === 'table')
    const hasSize = elements.some((element) => element.type === 'text' || element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation' || element.type === 'table')
    return { hasColor, hasLineStyle, hasSize }
  }

  function applyColorToSelection(color: string): void {
    const schema = options.getActiveSchema()
    if (!schema || options.selectedElementIds.value.length === 0) {
      return
    }
    options.pushHistoryCheckpoint()
    const idSet = new Set(options.selectedElementIds.value)
    for (const element of schema.elements) {
      if (!idSet.has(element.id)) {
        continue
      }
      if (element.type === 'text') {
        element.color = color
        continue
      }
      if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation' || element.type === 'table') {
        element.stroke = color
        if (element.type === 'rect' || element.type === 'ellipse') {
          element.fill = hexToRgba(color, 0.22)
        }
      }
    }
    options.markDirty()
    options.renderCanvas()
  }

  function applyLineStyle(style: 'solid' | 'dashed'): void {
    const schema = options.getActiveSchema()
    if (!schema || options.selectedElementIds.value.length === 0) {
      return
    }
    options.pushHistoryCheckpoint()
    const idSet = new Set(options.selectedElementIds.value)
    for (const element of schema.elements) {
      if (!idSet.has(element.id)) {
        continue
      }
      if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation' || element.type === 'table') {
        element.strokeStyle = style
      }
    }
    options.markDirty()
    options.renderCanvas()
  }

  function applySize(size: 'small' | 'medium' | 'big'): void {
    const schema = options.getActiveSchema()
    if (!schema || options.selectedElementIds.value.length === 0) {
      return
    }
    const preset = options.getSizePresets()[size]
    options.pushHistoryCheckpoint()
    const idSet = new Set(options.selectedElementIds.value)
    for (const element of schema.elements) {
      if (!idSet.has(element.id)) {
        continue
      }
      if (element.type === 'text') {
        element.fontSize = preset.fontSize
        continue
      }
      if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'relation' || element.type === 'table') {
        element.strokeWidth = preset.strokeWidth
      }
    }
    options.markDirty()
    options.renderCanvas()
  }

  return {
    isSelected,
    clearSelection,
    setSingleSelection,
    getSelectedElements,
    getSelectedColor,
    getSelectedLineStyle,
    getSelectedSize,
    getSelectedRect,
    getSelectedEllipse,
    getSelectedRectAngle,
    getSelectedRectSquare,
    getSelectedFilled,
    getSelectedConnector,
    getSelectedArrow,
    getSelectedRelation,
    getSelectedArrowBreaks,
    getSelectedArrowOrthogonal,
    getSelectedArrowFirstSegment,
    getSelectedArrowMagnetic,
    getSelectedArrowLineOnly,
    getSelectedRelationType,
    getSelectedRelationTypeFromElement,
    ensureArrowBreakPoints,
    getEvenlySpacedArrowBreakPoints,
    shiftSelectedArrowBreaks,
    setSelectedArrowOrthogonal,
    flipSelectedArrowOrthogonalOrientation,
    setSelectedArrowMagnetic,
    setSelectedArrowLineOnly,
    setSelectedRelationType,
    setSelectedRectAngle,
    setSelectedRectSquare,
    setSelectedFilled,
    getApplicablePropertiesForSelection,
    applyColorToSelection,
    applyLineStyle,
    applySize,
  }
}
