import type { ToolId, ToolSetId } from '@/board/types'

type UseBoardShortcutsOptions = {
  getActiveTool: () => ToolId
  getActiveToolSet: () => ToolSetId
  setActiveTool: (tool: ToolId) => void
  undo: () => void
  redo: () => void
  save: () => void
  copySelection: () => boolean
  pasteSelection: () => boolean
  deleteSelection: () => void
}

export function createBoardShortcutsHandler(options: UseBoardShortcutsOptions) {
  return (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase() || ''
    const isEditable = tag === 'input' || tag === 'textarea' || Boolean(target?.isContentEditable)
    if (isEditable) {
      return
    }

    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'z') {
      event.preventDefault()
      options.undo()
      return
    }

    if ((event.ctrlKey || event.metaKey) && (key === 'y' || (event.shiftKey && key === 'z'))) {
      event.preventDefault()
      options.redo()
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault()
      options.save()
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === 'c' && options.getActiveTool() === 'select') {
      if (options.copySelection()) {
        event.preventDefault()
      }
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === 'v' && options.getActiveTool() === 'select') {
      if (options.pasteSelection()) {
        event.preventDefault()
      }
      return
    }

    if (key === 'delete' || key === 'backspace') {
      event.preventDefault()
      options.deleteSelection()
      return
    }

    if (key === 's') {
      options.setActiveTool('select')
      return
    }

    const basicShortcuts: Record<string, 'rect' | 'ellipse' | 'arrow' | 'frame' | 'text' | 'relation'> = {
      r: options.getActiveToolSet() === 'database' ? 'relation' : 'rect',
      e: 'ellipse',
      a: 'arrow',
      f: 'frame',
      t: 'text',
    }
    if (basicShortcuts[key]) {
      options.setActiveTool(basicShortcuts[key])
    }
  }
}
