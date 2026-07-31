import type { BoardElement } from '@/board/types'

export const MAGNETIC_SNAP_DISTANCE = 18

export type MagneticEndpoint = 'start' | 'end'

type SnapPoint = {
  x: number
  y: number
  distance: number
  containerId: string
}

function normalizeRect(el: { x?: number; y?: number; w?: number; h?: number }) {
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

function isContainer(element: BoardElement): boolean {
  return element.type === 'rect' || element.type === 'ellipse' || element.type === 'table'
}

export function isMagneticConnector(element: BoardElement | null | undefined): boolean {
  return Boolean(element && (element.type === 'arrow' || element.type === 'relation'))
}

export function getConnectorMagnetic(element: BoardElement): boolean {
  return element.magnetic === true
}

export function clearConnectorAttachment(element: BoardElement, endpoint: MagneticEndpoint): void {
  if (endpoint === 'start') {
    delete element.startAttachedToId
    return
  }
  delete element.endAttachedToId
}

function setConnectorAttachment(element: BoardElement, endpoint: MagneticEndpoint, containerId: string): void {
  if (endpoint === 'start') {
    element.startAttachedToId = containerId
    return
  }
  element.endAttachedToId = containerId
}

function getEndpointPosition(element: BoardElement, endpoint: MagneticEndpoint): { x: number; y: number } {
  if (endpoint === 'start') {
    return {
      x: Number(element.x1 || 0),
      y: Number(element.y1 || 0),
    }
  }
  return {
    x: Number(element.x2 || 0),
    y: Number(element.y2 || 0),
  }
}

function setEndpointPosition(element: BoardElement, endpoint: MagneticEndpoint, x: number, y: number): void {
  if (endpoint === 'start') {
    element.x1 = x
    element.y1 = y
    return
  }
  element.x2 = x
  element.y2 = y
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

function getRectSnapPoint(element: BoardElement, x: number, y: number): { x: number; y: number } {
  const rect = normalizeRect(element)
  if (rect.w <= 0 || rect.h <= 0) {
    return { x: rect.x, y: rect.y }
  }

  const angle = Number(element.angle || 0) === 45 ? 45 : 0
  const centerX = rect.x + rect.w / 2
  const centerY = rect.y + rect.h / 2
  const local = angle === 0
    ? { x, y }
    : rotatePoint(x, y, centerX, centerY, (-angle * Math.PI) / 180)

  const minX = rect.x
  const maxX = rect.x + rect.w
  const minY = rect.y
  const maxY = rect.y + rect.h

  let snapX = Math.max(minX, Math.min(maxX, local.x))
  let snapY = Math.max(minY, Math.min(maxY, local.y))

  const inside = local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY
  if (inside) {
    const distLeft = Math.abs(local.x - minX)
    const distRight = Math.abs(maxX - local.x)
    const distTop = Math.abs(local.y - minY)
    const distBottom = Math.abs(maxY - local.y)
    const minDist = Math.min(distLeft, distRight, distTop, distBottom)

    if (minDist === distLeft) {
      snapX = minX
    } else if (minDist === distRight) {
      snapX = maxX
    } else if (minDist === distTop) {
      snapY = minY
    } else {
      snapY = maxY
    }
  }

  if (angle === 0) {
    return { x: snapX, y: snapY }
  }
  return rotatePoint(snapX, snapY, centerX, centerY, (angle * Math.PI) / 180)
}

function getEllipseSnapPoint(element: BoardElement, x: number, y: number): { x: number; y: number } {
  const rect = normalizeRect(element)
  const rx = rect.w / 2
  const ry = rect.h / 2
  const cx = rect.x + rx
  const cy = rect.y + ry
  if (rx <= 0 || ry <= 0) {
    return { x: cx, y: cy }
  }

  const dx = x - cx
  const dy = y - cy
  if (dx === 0 && dy === 0) {
    return { x: cx + rx, y: cy }
  }

  const denom = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) || 1
  return {
    x: cx + dx / denom,
    y: cy + dy / denom,
  }
}

function getContainerSnapPoint(container: BoardElement, x: number, y: number): { x: number; y: number } {
  if (container.type === 'ellipse') {
    return getEllipseSnapPoint(container, x, y)
  }
  return getRectSnapPoint(container, x, y)
}

function getDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

export function findClosestContainerSnap(
  elements: BoardElement[],
  x: number,
  y: number,
  maxDistance = MAGNETIC_SNAP_DISTANCE,
): SnapPoint | null {
  let best: SnapPoint | null = null

  for (const element of elements) {
    if (!isContainer(element)) {
      continue
    }
    const snap = getContainerSnapPoint(element, x, y)
    const distance = getDistance(x, y, snap.x, snap.y)
    if (distance > maxDistance) {
      continue
    }
    if (!best || distance < best.distance) {
      best = {
        x: snap.x,
        y: snap.y,
        distance,
        containerId: element.id,
      }
    }
  }

  return best
}

export function updateConnectorEndpointAttachment(
  connector: BoardElement,
  endpoint: MagneticEndpoint,
  elements: BoardElement[],
  maxDistance = MAGNETIC_SNAP_DISTANCE,
): void {
  if (!isMagneticConnector(connector) || !getConnectorMagnetic(connector)) {
    clearConnectorAttachment(connector, endpoint)
    return
  }

  const point = getEndpointPosition(connector, endpoint)
  const snap = findClosestContainerSnap(elements, point.x, point.y, maxDistance)
  if (!snap) {
    clearConnectorAttachment(connector, endpoint)
    return
  }

  setEndpointPosition(connector, endpoint, snap.x, snap.y)
  setConnectorAttachment(connector, endpoint, snap.containerId)
}

export function updateConnectorAttachments(
  connector: BoardElement,
  elements: BoardElement[],
  maxDistance = MAGNETIC_SNAP_DISTANCE,
): void {
  updateConnectorEndpointAttachment(connector, 'start', elements, maxDistance)
  updateConnectorEndpointAttachment(connector, 'end', elements, maxDistance)
}

export function clearConnectorAttachments(connector: BoardElement): void {
  clearConnectorAttachment(connector, 'start')
  clearConnectorAttachment(connector, 'end')
}

export function syncConnectorWithMovedContainers(
  connector: BoardElement,
  movedContainerIds: Set<string>,
  dx: number,
  dy: number,
): boolean {
  if (!isMagneticConnector(connector) || !getConnectorMagnetic(connector)) {
    return false
  }

  const moveStart = Boolean(connector.startAttachedToId && movedContainerIds.has(connector.startAttachedToId))
  const moveEnd = Boolean(connector.endAttachedToId && movedContainerIds.has(connector.endAttachedToId))
  if (!moveStart && !moveEnd) {
    return false
  }

  if (moveStart) {
    connector.x1 = Number(connector.x1 || 0) + dx
    connector.y1 = Number(connector.y1 || 0) + dy
  }
  if (moveEnd) {
    connector.x2 = Number(connector.x2 || 0) + dx
    connector.y2 = Number(connector.y2 || 0) + dy
  }

  if (Array.isArray(connector.breakPoints) && connector.breakPoints.length > 0) {
    connector.breakPoints = connector.breakPoints.map((point) => ({
      x: Number(point?.x || 0) + dx,
      y: Number(point?.y || 0) + dy,
    }))
  }

  return true
}
