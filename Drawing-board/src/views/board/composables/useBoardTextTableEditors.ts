import type { BoardElement } from '@/board/types'
import { uid } from '@/board/utils'

type TableEditorState = {
  isOpen: boolean
  tableId: string | null
  title: string
  fieldsText: string
}

type TextEditorState = {
  isOpen: boolean
  mode: 'create' | 'edit'
  textId: string | null
  x: number
  y: number
  value: string
}

type UseBoardTextTableEditorsOptions = {
  tableEditorState: TableEditorState
  textEditorState: TextEditorState
  getActiveSchema: () => { elements: BoardElement[] } | null
  getActiveColor: () => string
  getCurrentFontSize: () => number
  pushHistoryCheckpoint: () => void
  setSingleSelection: (id: string) => void
  markDirty: () => void
  renderCanvas: () => void
}

export function useBoardTextTableEditors(options: UseBoardTextTableEditorsOptions) {
  function openTableEditor(table: BoardElement): void {
    options.tableEditorState.isOpen = true
    options.tableEditorState.tableId = table.id
    options.tableEditorState.title = String(table.tableTitle || 'Table')
    const fields = Array.isArray(table.tableFields) ? table.tableFields.map((field) => String(field || '')) : []
    options.tableEditorState.fieldsText = fields.join('\n')
  }

  function closeTableEditor(): void {
    options.tableEditorState.isOpen = false
    options.tableEditorState.tableId = null
    options.tableEditorState.title = 'Table'
    options.tableEditorState.fieldsText = ''
  }

  function onTableEditorTitleChange(value: string): void {
    options.tableEditorState.title = String(value || '')
  }

  function onTableEditorFieldsTextChange(value: string): void {
    options.tableEditorState.fieldsText = String(value || '')
  }

  function saveTableEditor(): void {
    const schema = options.getActiveSchema()
    if (!schema || !options.tableEditorState.tableId) {
      return
    }
    const table = schema.elements.find((element) => element.id === options.tableEditorState.tableId && element.type === 'table')
    if (!table) {
      closeTableEditor()
      return
    }

    options.pushHistoryCheckpoint()
    table.tableTitle = String(options.tableEditorState.title || '').trim() || 'Table'
    table.tableFields = options.tableEditorState.fieldsText
      .split('\n')
      .map((field) => String(field || '').trim())
      .filter((field) => field.length > 0)
    options.markDirty()
    options.renderCanvas()
    closeTableEditor()
  }

  function openTextCreateEditor(position: { x: number; y: number }): void {
    options.textEditorState.isOpen = true
    options.textEditorState.mode = 'create'
    options.textEditorState.textId = null
    options.textEditorState.x = position.x
    options.textEditorState.y = position.y
    options.textEditorState.value = 'Text'
  }

  function openTextEditEditor(element: BoardElement): void {
    options.textEditorState.isOpen = true
    options.textEditorState.mode = 'edit'
    options.textEditorState.textId = element.id
    options.textEditorState.x = Number(element.x || 0)
    options.textEditorState.y = Number(element.y || 0)
    options.textEditorState.value = String(element.text || '')
  }

  function closeTextEditor(): void {
    options.textEditorState.isOpen = false
    options.textEditorState.mode = 'create'
    options.textEditorState.textId = null
    options.textEditorState.x = 0
    options.textEditorState.y = 0
    options.textEditorState.value = 'Text'
  }

  function saveTextEditor(): void {
    const schema = options.getActiveSchema()
    if (!schema) {
      return
    }
    const nextText = String(options.textEditorState.value || '')
    if (options.textEditorState.mode === 'create') {
      const textElement: BoardElement = {
        id: uid('el'),
        type: 'text',
        x: options.textEditorState.x,
        y: options.textEditorState.y,
        text: nextText || 'Text',
        color: options.getActiveColor(),
        fontSize: options.getCurrentFontSize(),
      }
      options.pushHistoryCheckpoint()
      schema.elements.push(textElement)
      options.setSingleSelection(textElement.id)
      options.markDirty()
      options.renderCanvas()
      closeTextEditor()
      return
    }

    const textElement = schema.elements.find(
      (element) => element.id === options.textEditorState.textId && element.type === 'text',
    )
    if (!textElement) {
      closeTextEditor()
      return
    }
    if (String(textElement.text || '') === nextText) {
      closeTextEditor()
      return
    }
    options.pushHistoryCheckpoint()
    textElement.text = nextText || 'Text'
    options.markDirty()
    options.renderCanvas()
    closeTextEditor()
  }

  return {
    openTableEditor,
    closeTableEditor,
    onTableEditorTitleChange,
    onTableEditorFieldsTextChange,
    saveTableEditor,
    openTextCreateEditor,
    openTextEditEditor,
    closeTextEditor,
    saveTextEditor,
  }
}
