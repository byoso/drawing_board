import type { Ref } from 'vue'
import { downloadJsonFile, safeJsonParse } from '@/board/jsonTransfer'
import type { BoardElement } from '@/board/types'
import { uid } from '@/board/utils'

type SchemaLike = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  elements: BoardElement[]
}

type UseBoardSchemasOptions = {
  getIsDirty: () => boolean
  setIsDirty: (value: boolean) => void
  getActiveSchema: () => SchemaLike | null
  getStoreSchemas: () => SchemaLike[]
  setStoreSchemas: (schemas: SchemaLike[]) => void
  getActiveSchemaId: () => string | null
  setActiveSchemaId: (schemaId: string | null) => void
  activateSchemaInStore: (schemaId: string) => void
  createSchemaInStore: () => void
  persist: () => void
  seedSchemaHistory: (schemaId: string, elements: BoardElement[]) => void
  clearSchemaHistory: (schemaId: string) => void
  clearSelection: () => void
  renderCanvas: () => void
  showToast: (message: string, type?: 'info' | 'warning' | 'error') => void
  openConfirmDialog: (options: {
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }) => Promise<boolean>
  importInputRef: Ref<HTMLInputElement | null>
  renamingSchemaId: Ref<string | null>
  renameDraft: Ref<string>
}

export function useBoardSchemas(options: UseBoardSchemasOptions) {
  async function confirmDiscardUnsaved(actionLabel = 'continue'): Promise<boolean> {
    if (!options.getIsDirty()) {
      return true
    }
    return await options.openConfirmDialog({
      title: 'Unsaved changes',
      message: `You have unsaved changes. Discard them and ${actionLabel}?`,
      confirmLabel: 'Discard changes',
      danger: true,
    })
  }

  async function activateSchema(schemaId: string): Promise<void> {
    if (schemaId === options.getActiveSchemaId()) {
      return
    }
    if (!(await confirmDiscardUnsaved('switch diagrams'))) {
      return
    }
    options.activateSchemaInStore(schemaId)
    options.clearSelection()
    options.setIsDirty(false)
    options.renderCanvas()
  }

  async function createSchema(): Promise<void> {
    if (!(await confirmDiscardUnsaved('create a new diagram'))) {
      return
    }
    options.createSchemaInStore()
    const activeSchema = options.getActiveSchema()
    if (activeSchema) {
      options.seedSchemaHistory(activeSchema.id, activeSchema.elements)
    }
    options.clearSelection()
    options.setIsDirty(false)
    options.renderCanvas()
  }

  function startRename(schema: { id: string; name: string }): void {
    options.renamingSchemaId.value = schema.id
    options.renameDraft.value = schema.name
  }

  function commitRename(schemaId: string): void {
    const schema = options.getStoreSchemas().find((item) => item.id === schemaId)
    if (!schema) {
      options.renamingSchemaId.value = null
      return
    }
    const nextName = options.renameDraft.value.trim()
    if (nextName) {
      schema.name = nextName
      schema.updatedAt = Date.now()
      options.persist()
      options.renderCanvas()
    }
    options.renamingSchemaId.value = null
  }

  async function deleteSchema(schemaId: string): Promise<void> {
    const schema = options.getStoreSchemas().find((item) => item.id === schemaId)
    if (!schema) {
      return
    }
    const confirmedDelete = await options.openConfirmDialog({
      title: 'Delete diagram',
      message: `Delete "${schema.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmedDelete) {
      return
    }
    if (schemaId === options.getActiveSchemaId() && !(await confirmDiscardUnsaved('delete the current diagram'))) {
      return
    }
    options.setStoreSchemas(options.getStoreSchemas().filter((item) => item.id !== schemaId))
    options.clearSchemaHistory(schemaId)
    if (options.getStoreSchemas().length === 0) {
      await createSchema()
      return
    }
    if (options.getActiveSchemaId() === schemaId) {
      options.setActiveSchemaId(options.getStoreSchemas()[0]?.id || null)
      options.clearSelection()
    }
    options.setIsDirty(false)
    options.persist()
    options.renderCanvas()
  }

  function exportCurrentSchema(): void {
    const activeSchema = options.getActiveSchema()
    if (!activeSchema) {
      return
    }
    const payload = {
      schemaVersion: 1,
      exportedAt: Date.now(),
      name: activeSchema.name,
      elements: activeSchema.elements,
    }
    downloadJsonFile(payload, activeSchema.name, 'schema')
    options.showToast('JSON export completed.')
  }

  async function openImportPicker(): Promise<void> {
    if (!(await confirmDiscardUnsaved('import a diagram'))) {
      return
    }
    if (options.importInputRef.value) {
      options.importInputRef.value.value = ''
      options.importInputRef.value.click()
    }
  }

  function importSchemaObject(payload: { schemaVersion?: number; name?: string; elements?: BoardElement[] }): void {
    if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.elements)) {
      options.showToast('Invalid JSON format or unsupported version.', 'error')
      return
    }
    const now = Date.now()
    const schemas = options.getStoreSchemas()
    const schema: SchemaLike = {
      id: uid('schema'),
      name: payload.name || `Imported ${schemas.length + 1}`,
      createdAt: now,
      updatedAt: now,
      elements: payload.elements,
    }
    schemas.push(schema)
    options.setActiveSchemaId(schema.id)
    options.seedSchemaHistory(schema.id, schema.elements)
    options.clearSelection()
    options.setIsDirty(false)
    options.persist()
    options.renderCanvas()
    options.showToast('Diagram imported.')
  }

  async function onImportFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      return
    }
    try {
      const content = await file.text()
      const imported = safeJsonParse<{ schemaVersion?: number; name?: string; elements?: BoardElement[] }>(content)
      if (!imported) {
        options.showToast('JSON import failed.', 'error')
        return
      }
      importSchemaObject(imported)
    } catch {
      options.showToast('JSON import failed.', 'error')
    }
  }

  return {
    activateSchema,
    createSchema,
    startRename,
    commitRename,
    deleteSchema,
    exportCurrentSchema,
    openImportPicker,
    onImportFileChange,
  }
}
