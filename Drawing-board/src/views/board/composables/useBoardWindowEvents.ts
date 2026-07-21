import type { Ref } from 'vue'

type DialogState = {
  isOpen: boolean
}

type EditorState = {
  isOpen: boolean
}

type UseBoardWindowEventsArgs = {
  isSlideshowMode: { readonly value: boolean }
  isSpacePressed: Ref<boolean>
  isDirty: Ref<boolean>
  dialogState: DialogState
  iconEditorState: EditorState
  tableEditorState: EditorState
  textEditorState: EditorState
  stopSlideshow: () => void
  goToPreviousSlide: () => void
  goToNextSlide: () => void
  onDialogCancel: () => void
  closeIconEditor: () => void
  closeTableEditor: () => void
  closeTextEditor: () => void
  renderCanvas: () => void
  shortcutsHandler: (event: KeyboardEvent) => void
}

export function useBoardWindowEvents(args: UseBoardWindowEventsArgs) {
  const {
    isSlideshowMode,
    isSpacePressed,
    isDirty,
    dialogState,
    iconEditorState,
    tableEditorState,
    textEditorState,
    stopSlideshow,
    goToPreviousSlide,
    goToNextSlide,
    onDialogCancel,
    closeIconEditor,
    closeTableEditor,
    closeTextEditor,
    renderCanvas,
    shortcutsHandler,
  } = args

  function isEditableTarget(target: EventTarget | null): boolean {
    const node = target as HTMLElement | null
    const tag = node?.tagName?.toLowerCase() || ''
    return tag === 'input' || tag === 'textarea' || Boolean(node?.isContentEditable)
  }

  function onGlobalKeyDown(event: KeyboardEvent): void {
    if (isSlideshowMode.value) {
      if (event.code === 'Space' && !isEditableTarget(event.target)) {
        isSpacePressed.value = true
        event.preventDefault()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        stopSlideshow()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousSlide()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToNextSlide()
        return
      }
      return
    }
    if (event.code === 'Space' && !isEditableTarget(event.target)) {
      isSpacePressed.value = true
      event.preventDefault()
    }
    shortcutsHandler(event)
  }

  function onGlobalKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      isSpacePressed.value = false
    }
  }

  function onWindowBlur(): void {
    isSpacePressed.value = false
    if (dialogState.isOpen) {
      onDialogCancel()
    }
    if (iconEditorState.isOpen) {
      closeIconEditor()
    }
    if (tableEditorState.isOpen) {
      closeTableEditor()
    }
    if (textEditorState.isOpen) {
      closeTextEditor()
    }
  }

  function onResize(): void {
    renderCanvas()
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isDirty.value) {
      return
    }
    event.preventDefault()
    event.returnValue = ''
  }

  return {
    onGlobalKeyDown,
    onGlobalKeyUp,
    onWindowBlur,
    onResize,
    onBeforeUnload,
  }
}
