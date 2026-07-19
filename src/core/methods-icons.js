;(function attachDrawingBoardIconMethods(globalScope) {
  const { uid } = globalScope.DrawingBoardUtils
  const methods = {
      normalizeIconSet(iconSet) {
        return {
          id: iconSet.id || uid('iconset'),
          name: iconSet.name || 'Untitled set',
          collapsed: Boolean(iconSet.collapsed),
          icons: Array.isArray(iconSet.icons)
            ? iconSet.icons.map((icon) => ({
                id: icon.id || uid('icon'),
                name: icon.name || 'icon',
                src: icon.src || '',
                width: typeof icon.width === 'number' ? icon.width : 128,
                height: typeof icon.height === 'number' ? icon.height : 128
              })).filter((icon) => icon.src)
            : []
        }
      },
      getSortedIcons(iconSet) {
        if (!iconSet || !Array.isArray(iconSet.icons)) {
          return []
        }
        return [...iconSet.icons].sort((a, b) => {
          const aName = (a.name || 'icon').toLowerCase()
          const bName = (b.name || 'icon').toLowerCase()
          if (aName < bName) {
            return -1
          }
          if (aName > bName) {
            return 1
          }
          return 0
        })
      },
      fitSizeWithinLimit(width, height, limit = 128) {
        const safeWidth = Math.max(1, width || limit)
        const safeHeight = Math.max(1, height || limit)
        const ratio = Math.min(limit / safeWidth, limit / safeHeight, 1)
        return {
          width: Math.max(1, Math.round(safeWidth * ratio)),
          height: Math.max(1, Math.round(safeHeight * ratio))
        }
      },
      loadImageDimensions(src) {
        return new Promise((resolve) => {
          const image = new Image()
          image.onload = () => {
            resolve({ width: image.naturalWidth || 128, height: image.naturalHeight || 128 })
          }
          image.onerror = () => resolve({ width: 128, height: 128 })
          image.src = src
        })
      },
      readBlobAsDataUrl(blob) {
        return new Promise((resolve) => {
          if (!blob) {
            resolve('')
            return
          }
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => resolve('')
          reader.readAsDataURL(blob)
        })
      },
      async resolveIconSourceForStorage(src) {
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
          const dataUrl = await this.readBlobAsDataUrl(blob)
          return dataUrl || trimmed
        } catch (error) {
          return trimmed
        } finally {
          clearTimeout(timeoutId)
        }
      },
      async embedExistingRemoteIcons() {
        let changed = false
        for (const iconSet of this.iconSets) {
          if (!iconSet || !Array.isArray(iconSet.icons)) {
            continue
          }
          for (const icon of iconSet.icons) {
            const rawSrc = String((icon && icon.src) || '').trim()
            if (!/^https?:\/\//i.test(rawSrc)) {
              continue
            }
            const storedSrc = await this.resolveIconSourceForStorage(rawSrc)
            if (storedSrc && storedSrc !== rawSrc) {
              icon.src = storedSrc
              delete this.iconImageCache[rawSrc]
              delete this.iconImageCache[storedSrc]
              changed = true
            }
          }
        }
        if (changed) {
          this.persistStore()
          this.renderCanvas()
          this.showToast('Some remote icons were embedded for reliable exports.')
        }
      },
      getCachedIconImage(src) {
        if (!src) {
          return null
        }
        if (!this.iconImageCache[src]) {
          const shouldTryAnonymousCors = /^https?:\/\//i.test(src) && !src.startsWith('data:')
          const image = new Image()
          if (shouldTryAnonymousCors) {
            image.crossOrigin = 'anonymous'
          }
          image.onload = () => {
            this.renderCanvas()
          }
          image.onerror = () => {
            if (shouldTryAnonymousCors) {
              const fallbackImage = new Image()
              fallbackImage.onload = () => {
                this.renderCanvas()
              }
              fallbackImage.onerror = () => {
                this.renderCanvas()
              }
              fallbackImage.src = src
              this.iconImageCache[src] = fallbackImage
              return
            }
            this.renderCanvas()
          }
          image.src = src
          this.iconImageCache[src] = image
        }
        return this.iconImageCache[src]
      },
      loadExportableIconImage(src) {
        if (!src) {
          return Promise.resolve(null)
        }
        if (src.startsWith('data:')) {
          return new Promise((resolve) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => resolve(null)
            image.src = src
          })
        }
        const cached = this.iconImageCache[src]
        if (cached && cached.complete && cached.naturalWidth > 0 && cached.crossOrigin === 'anonymous') {
          return Promise.resolve(cached)
        }
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        return fetch(src, { mode: 'cors', credentials: 'omit', signal: controller.signal })
          .then((response) => {
            clearTimeout(timeoutId)
            if (!response.ok) {
              throw new Error('Unable to fetch icon for export')
            }
            return response.blob()
          })
          .then((blob) => new Promise((resolve) => {
            const objectUrl = URL.createObjectURL(blob)
            const image = new Image()
            image.onload = () => {
              URL.revokeObjectURL(objectUrl)
              resolve(image)
            }
            image.onerror = () => {
              URL.revokeObjectURL(objectUrl)
              resolve(null)
            }
            image.src = objectUrl
          }))
          .catch(() => {
            clearTimeout(timeoutId)
            return null
          })
      },
      async drawElementForExport(ctx, element) {
        if (element.type !== 'icon') {
          this.drawElement(ctx, element, false)
          return false
        }

        const r = normalizeRect(element)
        const image = await this.loadExportableIconImage(element.src)
        if (image && image.naturalWidth > 0) {
          ctx.drawImage(image, r.x, r.y, r.w, r.h)
          return false
        }

        ctx.save()
        ctx.fillStyle = '#eef3fb'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = '#c6d4eb'
        ctx.strokeRect(r.x, r.y, r.w, r.h)
        ctx.fillStyle = '#6b7ea6'
        ctx.font = '12px Space Grotesk'
        ctx.fillText(element.name || 'Icon', r.x + 8, r.y + 20)
        ctx.restore()
        return true
      },
      createIconSet() {
        const name = prompt('Icon set name:')
        if (!name || !name.trim()) {
          return
        }
        this.iconSets.push(this.normalizeIconSet({ name: name.trim(), icons: [] }))
        this.persistStore()
      },
      deleteIconSet(iconSetId) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet) {
          return
        }
        if (!confirm(`Delete icon set "${iconSet.name}"?`)) {
          return
        }
        this.iconSets = this.iconSets.filter((item) => item.id !== iconSetId)
        this.persistStore()
      },
      renameIconSet(iconSetId) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet) {
          return
        }
        const nextName = prompt('Icon set name:', iconSet.name)
        if (!nextName || !nextName.trim()) {
          return
        }
        iconSet.name = nextName.trim()
        this.persistStore()
      },
      toggleIconSetCollapsed(iconSetId) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet) {
          return
        }
        iconSet.collapsed = !iconSet.collapsed
        this.persistStore()
      },
      openIconUploadPicker(iconSetId) {
        this.pendingIconSetId = iconSetId
        this.$refs.iconUploadInput.value = ''
        this.$refs.iconUploadInput.click()
      },
      openImportIconSetPicker() {
        this.$refs.iconSetImportInput.value = ''
        this.$refs.iconSetImportInput.click()
      },
      async addIconUrl(iconSetId) {
        const src = prompt('Icon URL:')
        if (!src || !src.trim()) {
          return
        }
        const name = prompt('Icon name:', 'icon') || 'icon'
        await this.addIconToSet(iconSetId, {
          name: name.trim() || 'icon',
          src: src.trim()
        })
      },
      async addIconToSet(iconSetId, iconData) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet || !iconData || !iconData.src) {
          return
        }
        const rawSrc = String(iconData.src || '').trim()
        const storedSrc = await this.resolveIconSourceForStorage(rawSrc)
        const dimensions = iconData.width && iconData.height
          ? { width: iconData.width, height: iconData.height }
          : await this.loadImageDimensions(storedSrc)
        iconSet.icons.push({
          id: uid('icon'),
          name: iconData.name || 'icon',
          src: storedSrc,
          width: dimensions.width,
          height: dimensions.height
        })
        if (/^https?:\/\//i.test(rawSrc) && storedSrc === rawSrc) {
          this.showToast('Remote icon kept as URL: export may fail if CORS blocks embedding.', 'warning')
        }
        this.persistStore()
      },
      openIconEditor(iconSetId, iconId) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet) {
          return
        }
        const icon = iconSet.icons.find((item) => item.id === iconId)
        if (!icon) {
          return
        }
        this.iconEditor = {
          isOpen: true,
          iconSetId,
          iconId,
          name: icon.name || 'icon',
          src: icon.src || ''
        }
      },
      closeIconEditor() {
        this.iconEditor = {
          isOpen: false,
          iconSetId: null,
          iconId: null,
          name: '',
          src: ''
        }
      },
      async saveIconEditor() {
        if (!this.iconEditor.isOpen || !this.iconEditor.iconSetId || !this.iconEditor.iconId) {
          return
        }
        const iconSet = this.iconSets.find((item) => item.id === this.iconEditor.iconSetId)
        if (!iconSet) {
          this.closeIconEditor()
          return
        }
        const icon = iconSet.icons.find((item) => item.id === this.iconEditor.iconId)
        if (!icon) {
          this.closeIconEditor()
          return
        }
        const nextName = (this.iconEditor.name || '').trim() || 'icon'
        const nextSrc = (this.iconEditor.src || '').trim()
        if (!nextSrc) {
          this.showToast('Icon URL is required.', 'error')
          return
        }

        const previousSrc = icon.src || ''
        icon.name = nextName
        if (nextSrc !== previousSrc) {
          const storedSrc = await this.resolveIconSourceForStorage(nextSrc)
          const dimensions = await this.loadImageDimensions(storedSrc)
          icon.src = storedSrc
          icon.width = dimensions.width
          icon.height = dimensions.height
          delete this.iconImageCache[previousSrc]
          delete this.iconImageCache[nextSrc]
          delete this.iconImageCache[storedSrc]
          if (/^https?:\/\//i.test(nextSrc) && storedSrc === nextSrc) {
            this.showToast('Remote icon kept as URL: export may fail if CORS blocks embedding.', 'warning')
          }
        }

        this.persistStore()
        this.renderCanvas()
        this.closeIconEditor()
        this.showToast('Icon updated.')
      },
      deleteIcon(iconSetId, iconId, options = {}) {
        const { confirmDelete = true } = options
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet) {
          return
        }
        const icon = iconSet.icons.find((item) => item.id === iconId)
        if (!icon) {
          return
        }
        if (confirmDelete && !confirm(`Delete icon "${icon.name}"?`)) {
          return
        }
        delete this.iconImageCache[icon.src || '']
        iconSet.icons = iconSet.icons.filter((item) => item.id !== iconId)
        this.persistStore()
        this.renderCanvas()
      },
      deleteIconFromEditor() {
        if (!this.iconEditor.isOpen || !this.iconEditor.iconSetId || !this.iconEditor.iconId) {
          return
        }
        this.deleteIcon(this.iconEditor.iconSetId, this.iconEditor.iconId, { confirmDelete: false })
        this.closeIconEditor()
        this.showToast('Icon deleted.')
      },
      exportIconSet(iconSetId) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        if (!iconSet) {
          return
        }
        const payload = {
          iconSetVersion: 1,
          exportedAt: Date.now(),
          name: iconSet.name,
          icons: iconSet.icons
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        const safeName = iconSet.name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
        anchor.href = url
        anchor.download = `${safeName || 'icon-set'}.json`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      },
      async onIconUploadFileChange(event) {
        const file = event.target.files && event.target.files[0]
        const iconSetId = this.pendingIconSetId
        this.pendingIconSetId = null
        if (!file || !iconSetId) {
          return
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('Unable to read file'))
          reader.readAsDataURL(file)
        }).catch(() => '')
        if (!dataUrl) {
          this.showToast('Could not read icon file.', 'error')
          return
        }
        await this.addIconToSet(iconSetId, {
          name: file.name.replace(/\.[^.]+$/, '') || 'icon',
          src: dataUrl
        })
      },
      async onIconSetImportFileChange(event) {
        const file = event.target.files && event.target.files[0]
        if (!file) {
          return
        }
        try {
          const content = await file.text()
          const payload = JSON.parse(content)
          if (!payload || !Array.isArray(payload.icons)) {
            this.showToast('Invalid icon set JSON.', 'error')
            return
          }
          const iconSet = this.normalizeIconSet({
            name: payload.name || `Icon set ${this.iconSets.length + 1}`,
            icons: payload.icons
          })
          this.iconSets.push(iconSet)
          this.persistStore()
        } catch (error) {
          this.showToast('Icon set import failed.', 'error')
        }
      },
      onIconDragStart(iconSetId, iconId, event) {
        const iconSet = this.iconSets.find((item) => item.id === iconSetId)
        const icon = iconSet && iconSet.icons.find((item) => item.id === iconId)
        if (!icon) {
          return
        }
        event.dataTransfer.effectAllowed = 'copy'
        const payload = JSON.stringify({
          kind: 'icon',
          iconSetId,
          iconId
        })
        try {
          event.dataTransfer.setData('application/json', payload)
        } catch (error) {
          // Firefox and some contexts can reject custom MIME types.
        }
        event.dataTransfer.setData('text/plain', payload)
      },
      async onCanvasDrop(event) {
        return window.DrawingBoardCanvas.onCanvasDrop(this, event)
      },
  }
  globalScope.DrawingBoardIconMethods = methods
})(window)
