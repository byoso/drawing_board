import type { Ref } from 'vue'
import { downloadJsonFile, safeJsonParse } from '@/board/jsonTransfer'
import type { IconSet } from '@/board/types'
import { uid } from '@/board/utils'

type IconEditorState = {
  isOpen: boolean
  iconSetId: string | null
  iconId: string | null
  name: string
  src: string
}

type UseBoardIconsOptions = {
  iconSets: Ref<IconSet[]>
  iconImageCache: Ref<Record<string, HTMLImageElement>>
  iconEditorState: IconEditorState
  pendingIconSetId: Ref<string | null>
  iconUploadInputRef: Ref<HTMLInputElement | null>
  iconSetImportInputRef: Ref<HTMLInputElement | null>
  persist: () => void
  renderCanvas: () => void
  openPromptDialog: (options: {
    title: string
    message?: string
    value?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }) => Promise<string | null>
  openConfirmDialog: (options: {
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }) => Promise<boolean>
  showToast: (message: string, type?: 'info' | 'warning' | 'error') => void
}

export function useBoardIcons(options: UseBoardIconsOptions) {
  function fitSizeWithinLimit(width: number, height: number, limit = 128): { width: number; height: number } {
    const safeWidth = Math.max(1, width || limit)
    const safeHeight = Math.max(1, height || limit)
    const ratio = Math.min(limit / safeWidth, limit / safeHeight, 1)
    return {
      width: Math.max(1, Math.round(safeWidth * ratio)),
      height: Math.max(1, Math.round(safeHeight * ratio)),
    }
  }

  function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth || 128, height: image.naturalHeight || 128 })
      image.onerror = () => resolve({ width: 128, height: 128 })
      image.src = src
    })
  }

  function readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  }

  async function resolveIconSourceForStorage(src: string): Promise<string> {
    const trimmed = String(src || '').trim()
    if (!trimmed) {
      return ''
    }
    if (trimmed.startsWith('data:') || !/^https?:\/\//i.test(trimmed)) {
      return trimmed
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(trimmed, { mode: 'cors', credentials: 'omit', signal: controller.signal })
      if (!response.ok) {
        throw new Error('Icon fetch failed')
      }
      const blob = await response.blob()
      const dataUrl = await readBlobAsDataUrl(blob)
      return dataUrl || trimmed
    } catch {
      return trimmed
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function createIconSet(): Promise<void> {
    const name = await options.openPromptDialog({
      title: 'Create icon set',
      message: 'Enter a name for the new icon set.',
      placeholder: 'Icon set name',
      confirmLabel: 'Create',
    })
    const trimmedName = String(name || '').trim()
    if (!trimmedName) {
      return
    }
    options.iconSets.value.push({ id: uid('iconset'), name: trimmedName, collapsed: false, icons: [] })
    options.persist()
  }

  async function renameIconSet(iconSetId: string): Promise<void> {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    if (!iconSet) {
      return
    }
    const nextName = await options.openPromptDialog({
      title: 'Rename icon set',
      value: iconSet.name,
      placeholder: 'Icon set name',
      confirmLabel: 'Rename',
    })
    const trimmedName = String(nextName || '').trim()
    if (!trimmedName) {
      return
    }
    iconSet.name = trimmedName
    options.persist()
  }

  async function deleteIconSet(iconSetId: string): Promise<void> {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    if (!iconSet) {
      return
    }
    const confirmed = await options.openConfirmDialog({
      title: 'Delete icon set',
      message: `Delete icon set "${iconSet.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    options.iconSets.value = options.iconSets.value.filter((item) => item.id !== iconSetId)
    options.persist()
  }

  async function addIconToSet(iconSetId: string, iconData: { name: string; src: string }): Promise<void> {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    if (!iconSet || !iconData.src) {
      return
    }
    const src = await resolveIconSourceForStorage(iconData.src)
    const dimensions = await loadImageDimensions(src)
    iconSet.icons.push({ id: uid('icon'), name: iconData.name || 'icon', src, width: dimensions.width, height: dimensions.height })
    options.persist()
  }

  async function addIconUrl(iconSetId: string): Promise<void> {
    const src = await options.openPromptDialog({
      title: 'Add icon URL',
      placeholder: 'https://example.com/icon.svg',
      confirmLabel: 'Next',
    })
    const trimmedSrc = String(src || '').trim()
    if (!trimmedSrc) {
      return
    }
    const name = await options.openPromptDialog({
      title: 'Icon name',
      value: 'icon',
      placeholder: 'icon',
      confirmLabel: 'Add',
    })
    const trimmedName = String(name || '').trim() || 'icon'
    await addIconToSet(iconSetId, { name: trimmedName, src: trimmedSrc })
  }

  function removeIcon(iconSetId: string, iconId: string): boolean {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    if (!iconSet) {
      return false
    }
    const icon = iconSet.icons.find((item) => item.id === iconId)
    if (!icon) {
      return false
    }
    delete options.iconImageCache.value[String(icon.src || '')]
    iconSet.icons = iconSet.icons.filter((item) => item.id !== iconId)
    options.persist()
    options.renderCanvas()
    return true
  }

  async function deleteIcon(iconSetId: string, iconId: string): Promise<void> {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    const icon = iconSet?.icons.find((item) => item.id === iconId)
    if (!iconSet || !icon) {
      return
    }
    const confirmed = await options.openConfirmDialog({
      title: 'Delete icon',
      message: `Delete icon "${icon.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    removeIcon(iconSetId, iconId)
  }

  function openIconEditor(iconSetId: string, iconId: string): void {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    const icon = iconSet?.icons.find((item) => item.id === iconId)
    if (!iconSet || !icon) {
      return
    }
    options.iconEditorState.isOpen = true
    options.iconEditorState.iconSetId = iconSetId
    options.iconEditorState.iconId = iconId
    options.iconEditorState.name = String(icon.name || 'icon')
    options.iconEditorState.src = String(icon.src || '')
  }

  function closeIconEditor(): void {
    options.iconEditorState.isOpen = false
    options.iconEditorState.iconSetId = null
    options.iconEditorState.iconId = null
    options.iconEditorState.name = ''
    options.iconEditorState.src = ''
  }

  async function saveIconEditor(): Promise<void> {
    const iconSetId = options.iconEditorState.iconSetId
    const iconId = options.iconEditorState.iconId
    if (!iconSetId || !iconId) {
      return
    }
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    const icon = iconSet?.icons.find((item) => item.id === iconId)
    if (!iconSet || !icon) {
      closeIconEditor()
      return
    }
    const nextName = String(options.iconEditorState.name || '').trim() || 'icon'
    const nextSrcRaw = String(options.iconEditorState.src || '').trim()
    if (!nextSrcRaw) {
      options.showToast('Icon source cannot be empty.', 'error')
      return
    }
    const nextSrc = await resolveIconSourceForStorage(nextSrcRaw)
    const dimensions = await loadImageDimensions(nextSrc)
    const prevSrc = String(icon.src || '')
    icon.name = nextName
    icon.src = nextSrc
    icon.width = dimensions.width
    icon.height = dimensions.height
    if (prevSrc && prevSrc !== nextSrc) {
      delete options.iconImageCache.value[prevSrc]
    }
    options.persist()
    options.renderCanvas()
    closeIconEditor()
    options.showToast('Icon updated.')
  }

  function deleteIconFromEditor(): void {
    const iconSetId = options.iconEditorState.iconSetId
    const iconId = options.iconEditorState.iconId
    if (!iconSetId || !iconId) {
      return
    }
    if (removeIcon(iconSetId, iconId)) {
      closeIconEditor()
      options.showToast('Icon deleted.')
    }
  }

  function exportIconSet(iconSetId: string): void {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    if (!iconSet) {
      return
    }
    const payload = {
      iconSetVersion: 1,
      exportedAt: Date.now(),
      name: iconSet.name,
      icons: iconSet.icons,
    }
    downloadJsonFile(payload, iconSet.name, 'icon-set')
  }

  function openImportIconSetPicker(): void {
    if (options.iconSetImportInputRef.value) {
      options.iconSetImportInputRef.value.value = ''
      options.iconSetImportInputRef.value.click()
    }
  }

  async function onIconSetImportFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      return
    }
    try {
      const content = await file.text()
      const payload = safeJsonParse<{
        iconSetVersion?: number
        name?: string
        icons?: Array<{ id?: string; name?: string; src?: string; width?: number; height?: number }>
      }>(content)
      if (!payload || !Array.isArray(payload.icons)) {
        options.showToast('Invalid icon set JSON.', 'error')
        return
      }
      const iconSet = {
        id: uid('iconset'),
        name: String(payload.name || `Icon set ${options.iconSets.value.length + 1}`),
        collapsed: false,
        icons: payload.icons
          .map((icon) => ({
            id: String(icon.id || uid('icon')),
            name: String(icon.name || 'icon'),
            src: String(icon.src || ''),
            width: typeof icon.width === 'number' ? icon.width : 128,
            height: typeof icon.height === 'number' ? icon.height : 128,
          }))
          .filter((icon) => Boolean(icon.src)),
      }
      options.iconSets.value.push(iconSet)
      options.persist()
      options.showToast('Icon set imported.')
    } catch {
      options.showToast('Icon set import failed.', 'error')
    }
  }

  function openIconUploadPicker(iconSetId: string): void {
    options.pendingIconSetId.value = iconSetId
    if (options.iconUploadInputRef.value) {
      options.iconUploadInputRef.value.value = ''
      options.iconUploadInputRef.value.click()
    }
  }

  function toggleIconSetCollapse(iconSetId: string): void {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    if (!iconSet) {
      return
    }
    iconSet.collapsed = !iconSet.collapsed
    options.persist()
  }

  async function onIconUploadFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0]
    const iconSetId = options.pendingIconSetId.value
    options.pendingIconSetId.value = null
    if (!file || !iconSetId) {
      return
    }
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    if (!dataUrl) {
      options.showToast('Could not read icon file.', 'error')
      return
    }
    await addIconToSet(iconSetId, { name: file.name.replace(/\.[^.]+$/, '') || 'icon', src: dataUrl })
  }

  function getCachedIconImage(src: string): HTMLImageElement | null {
    if (!src) {
      return null
    }
    const cached = options.iconImageCache.value[src]
    if (cached && (cached as HTMLImageElement & { _corsReady?: boolean })._corsReady !== false) {
      if (!cached.crossOrigin) {
        // Already loaded without crossOrigin – evict so it reloads with CORS.
        delete options.iconImageCache.value[src]
      } else {
        return cached
      }
    }
    if (!options.iconImageCache.value[src]) {
      const image = new Image() as HTMLImageElement & { _corsReady?: boolean }
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        image._corsReady = true
        options.renderCanvas()
      }
      image.onerror = () => {
        // CORS or network failure – clear entry so the next call retries.
        delete options.iconImageCache.value[src]
        options.renderCanvas()
      }
      image.src = src
      options.iconImageCache.value[src] = image
    }
    return options.iconImageCache.value[src]
  }

  function onIconDragStart(iconSetId: string, iconId: string, event: DragEvent): void {
    const iconSet = options.iconSets.value.find((item) => item.id === iconSetId)
    const icon = iconSet?.icons.find((item) => item.id === iconId)
    if (!icon || !event.dataTransfer) {
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    const payload = JSON.stringify({ kind: 'icon', iconSetId, iconId })
    try {
      event.dataTransfer.setData('application/json', payload)
    } catch {
      // Firefox and some contexts can reject custom MIME types.
    }
    event.dataTransfer.setData('text/plain', payload)
  }

  return {
    fitSizeWithinLimit,
    createIconSet,
    renameIconSet,
    deleteIconSet,
    addIconUrl,
    deleteIcon,
    openIconEditor,
    closeIconEditor,
    saveIconEditor,
    deleteIconFromEditor,
    exportIconSet,
    openImportIconSetPicker,
    onIconSetImportFileChange,
    openIconUploadPicker,
    toggleIconSetCollapse,
    onIconUploadFileChange,
    getCachedIconImage,
    onIconDragStart,
  }
}
