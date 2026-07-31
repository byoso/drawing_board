import { SCHEMA_VERSION, STORE_KEY } from '@/board/constants'
import type { BoardElement, BoardStoreData, IconSet, Schema } from '@/board/types'
import { uid } from '@/board/utils'

function normalizeElement(element: BoardElement): BoardElement {
  if ((element.type === 'arrow' || element.type === 'relation') && element.magnetic === undefined) {
    return {
      ...element,
      magnetic: false,
    }
  }
  if ((element.type === 'rect' || element.type === 'ellipse') && element.filled === undefined) {
    return {
      ...element,
      filled: true,
    }
  }
  return element
}

function normalizeIconSet(iconSet: Partial<IconSet>): IconSet {
  return {
    id: iconSet.id || uid('iconset'),
    name: iconSet.name || 'Untitled set',
    collapsed: Boolean(iconSet.collapsed),
    icons: Array.isArray(iconSet.icons)
      ? iconSet.icons
          .map((icon) => ({
            id: icon.id || uid('icon'),
            name: icon.name || 'icon',
            src: icon.src || '',
            width: typeof icon.width === 'number' ? icon.width : 128,
            height: typeof icon.height === 'number' ? icon.height : 128,
          }))
          .filter((icon) => Boolean(icon.src))
      : [],
  }
}

function ensureFrameIndexes(schema: Schema): Schema {
  const frameElements = schema.elements.filter((element) => element.type === 'frame')
  frameElements
    .sort((a, b) => Number((a as { frameIndex?: number }).frameIndex || 0) - Number((b as { frameIndex?: number }).frameIndex || 0))
    .forEach((frame, index) => {
      ;(frame as { frameIndex?: number }).frameIndex = index + 1
      if (!String((frame as { name?: string }).name || '').trim()) {
        ;(frame as { name?: string }).name = `Frame ${index + 1}`
      }
    })
  return schema
}

function normalizeSchema(schema: Partial<Schema>, index: number): Schema {
  const now = Date.now()
  const normalizedElements = Array.isArray(schema.elements)
    ? schema.elements.map((element) => normalizeElement(element as BoardElement))
    : []
  return ensureFrameIndexes({
    id: schema.id || uid('schema'),
    name: schema.name || `Diagram ${index + 1}`,
    createdAt: typeof schema.createdAt === 'number' ? schema.createdAt : now,
    updatedAt: typeof schema.updatedAt === 'number' ? schema.updatedAt : now,
    elements: normalizedElements,
  })
}

function makeFallbackStore(): BoardStoreData {
  return {
    version: SCHEMA_VERSION,
    activeSchemaId: null,
    schemas: [],
    iconSets: [],
  }
}

export function loadBoardStore(): { store: BoardStoreData; hasInvalidJson: boolean } {
  const fallback = makeFallbackStore()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) {
      return { store: fallback, hasInvalidJson: false }
    }
    const parsed = JSON.parse(raw) as Partial<BoardStoreData>
    const schemas = Array.isArray(parsed.schemas)
      ? parsed.schemas.map((schema, index) => normalizeSchema(schema, index))
      : []
    const iconSets = Array.isArray(parsed.iconSets)
      ? parsed.iconSets.map((set) => normalizeIconSet(set))
      : []

    const store: BoardStoreData = {
      version: SCHEMA_VERSION,
      activeSchemaId: typeof parsed.activeSchemaId === 'string' ? parsed.activeSchemaId : null,
      schemas,
      iconSets,
    }

    if (store.schemas.length > 0 && !store.schemas.some((schema) => schema.id === store.activeSchemaId)) {
      const firstSchema = store.schemas[0]
      if (firstSchema) {
        store.activeSchemaId = firstSchema.id
      }
    }

    return { store, hasInvalidJson: false }
  } catch {
    return { store: fallback, hasInvalidJson: true }
  }
}

export function persistBoardStore(store: BoardStoreData): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}
