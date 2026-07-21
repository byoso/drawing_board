import { FRAME_STYLE } from '@/board/constants'
import type { BoardElement } from '@/board/types'

type DialogState = {
  isOpen: boolean
  mode: 'confirm' | 'prompt'
  title: string
  message: string
  value: string
  placeholder: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
}

type ToastState = {
  message: string
  type: 'info' | 'warning' | 'error'
}

type UseBoardUiActionsArgs = {
  isDirty: { value: boolean }
  dialogState: DialogState
  toast: ToastState
  getActiveSchema: () => { updatedAt?: number } | null
}

export function useBoardUiActions(args: UseBoardUiActionsArgs) {
  const { isDirty, dialogState, toast, getActiveSchema } = args

  let resolveDialog: ((result: { confirmed: boolean; value: string }) => void) | null = null

  function applyFrameStyle(element: BoardElement): void {
    element.stroke = FRAME_STYLE.stroke
    element.strokeStyle = FRAME_STYLE.strokeStyle
    element.strokeWidth = FRAME_STYLE.strokeWidth
    element.fill = FRAME_STYLE.fill
  }

  function markDirty(): void {
    isDirty.value = true
    const schema = getActiveSchema()
    if (schema) {
      schema.updatedAt = Date.now()
    }
  }

  function showToast(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    toast.message = message
    toast.type = type
    setTimeout(() => {
      if (toast.message === message) {
        toast.message = ''
      }
    }, 4000)
  }

  function openDialog(options: {
    mode: 'confirm' | 'prompt'
    title: string
    message?: string
    value?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }): Promise<{ confirmed: boolean; value: string }> {
    dialogState.mode = options.mode
    dialogState.title = options.title
    dialogState.message = options.message || ''
    dialogState.value = options.value || ''
    dialogState.placeholder = options.placeholder || ''
    dialogState.confirmLabel = options.confirmLabel || 'Confirm'
    dialogState.cancelLabel = options.cancelLabel || 'Cancel'
    dialogState.danger = Boolean(options.danger)
    dialogState.isOpen = true
    return new Promise((resolve) => {
      resolveDialog = resolve
    })
  }

  async function openConfirmDialog(options: {
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }): Promise<boolean> {
    const result = await openDialog({ mode: 'confirm', ...options })
    return result.confirmed
  }

  async function openPromptDialog(options: {
    title: string
    message?: string
    value?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }): Promise<string | null> {
    const result = await openDialog({ mode: 'prompt', ...options })
    if (!result.confirmed) {
      return null
    }
    return result.value
  }

  function closeDialog(result: { confirmed: boolean; value: string }): void {
    dialogState.isOpen = false
    const resolver = resolveDialog
    resolveDialog = null
    if (resolver) {
      resolver(result)
    }
  }

  function onDialogConfirm(): void {
    closeDialog({ confirmed: true, value: dialogState.value })
  }

  function onDialogCancel(): void {
    closeDialog({ confirmed: false, value: dialogState.value })
  }

  return {
    applyFrameStyle,
    markDirty,
    showToast,
    openConfirmDialog,
    openPromptDialog,
    onDialogConfirm,
    onDialogCancel,
  }
}
