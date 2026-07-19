function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function normalizeRect(el) {
  const x = el.w < 0 ? el.x + el.w : el.x
  const y = el.h < 0 ? el.y + el.h : el.y
  const w = Math.abs(el.w)
  const h = Math.abs(el.h)
  return { x, y, w, h }
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    const ddx = px - x1
    const ddy = py - y1
    return Math.sqrt(ddx * ddx + ddy * ddy)
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  const ddx = px - cx
  const ddy = py - cy
  return Math.sqrt(ddx * ddx + ddy * ddy)
}

function hexToRgba(hex, alpha) {
  const cleaned = (hex || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `rgba(129, 164, 255, ${alpha})`
  }
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

window.DrawingBoardUtils = {
  uid,
  deepClone,
  normalizeRect,
  pointToSegmentDistance,
  hexToRgba
}
