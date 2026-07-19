import { ref } from 'vue'
import { deepClone } from '@/board/utils'
import type { BoardElement } from '@/board/types'

type SchemaLike = {
  id: string
  elements: BoardElement[]
}

type HistoryState = {
  past: BoardElement[][]
  future: BoardElement[][]
}

type UseSchemaHistoryOptions = {
  getActiveSchema: () => SchemaLike | null
  applyElements: (elements: BoardElement[]) => void
  onAfterTimeTravel?: () => void
  maxHistoryDepth?: number
}

function areSnapshotsEqual(a: BoardElement[], b: BoardElement[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useSchemaHistory(options: UseSchemaHistoryOptions) {
  const maxHistoryDepth = options.maxHistoryDepth ?? 80
  const historyBySchema = ref<Record<string, HistoryState>>({})

  function ensureSchemaHistory(schemaId: string | null): HistoryState | null {
    if (!schemaId) {
      return null
    }
    if (!historyBySchema.value[schemaId]) {
      historyBySchema.value[schemaId] = { past: [], future: [] }
    }
    return historyBySchema.value[schemaId]
  }

  function seedSchemaHistory(schemaId: string, elements: BoardElement[]): void {
    historyBySchema.value[schemaId] = {
      past: [deepClone(elements)],
      future: [],
    }
  }

  function clearSchemaHistory(schemaId: string): void {
    delete historyBySchema.value[schemaId]
  }

  function pushHistoryCheckpoint(): void {
    const activeSchema = options.getActiveSchema()
    if (!activeSchema) {
      return
    }
    const history = ensureSchemaHistory(activeSchema.id)
    if (!history) {
      return
    }
    const snapshot = deepClone(activeSchema.elements)
    const last = history.past.length > 0 ? history.past[history.past.length - 1] : null
    if (!last || !areSnapshotsEqual(last, snapshot)) {
      history.past.push(snapshot)
      if (history.past.length > maxHistoryDepth) {
        history.past.shift()
      }
    }
    history.future = []
  }

  function undo(): void {
    const activeSchema = options.getActiveSchema()
    if (!activeSchema) {
      return
    }
    const history = ensureSchemaHistory(activeSchema.id)
    if (!history) {
      return
    }
    const current = deepClone(activeSchema.elements)
    let previous: BoardElement[] | null = null
    while (history.past.length > 0) {
      const candidate = history.past.pop()
      if (candidate && !areSnapshotsEqual(candidate, current)) {
        previous = candidate
        break
      }
    }
    if (!previous) {
      return
    }
    history.future.push(current)
    if (history.future.length > maxHistoryDepth) {
      history.future.shift()
    }
    options.applyElements(deepClone(previous))
    options.onAfterTimeTravel?.()
  }

  function redo(): void {
    const activeSchema = options.getActiveSchema()
    if (!activeSchema) {
      return
    }
    const history = ensureSchemaHistory(activeSchema.id)
    if (!history || history.future.length === 0) {
      return
    }
    const current = deepClone(activeSchema.elements)
    const next = history.future.pop()
    if (!next) {
      return
    }
    history.past.push(current)
    if (history.past.length > maxHistoryDepth) {
      history.past.shift()
    }
    options.applyElements(deepClone(next))
    options.onAfterTimeTravel?.()
  }

  return {
    seedSchemaHistory,
    clearSchemaHistory,
    pushHistoryCheckpoint,
    undo,
    redo,
  }
}
