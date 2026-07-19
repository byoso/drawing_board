;(function attachDrawingBoardBaseMethods(globalScope) {
  const { WORLD_WIDTH, WORLD_HEIGHT } = globalScope.DrawingBoardConstants
  const methods = {
      getCanvasContext() {
        return window.DrawingBoardCanvas.getCanvasContext(this)
      },
      getCurrentStrokeWidth() {
        return (this.sizePresets[this.drawSize] || this.sizePresets.small).strokeWidth
      },
      getCurrentFontSize() {
        return (this.sizePresets[this.drawSize] || this.sizePresets.small).fontSize
      },
      getBrowserCapabilities() {
        return {
          clipboardWriteImage: Boolean(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write),
          secureContext: Boolean(window.isSecureContext),
          pointerCapture: Boolean(this.$refs.canvas && typeof this.$refs.canvas.setPointerCapture === 'function'),
          cssColorMix: Boolean(window.CSS && typeof window.CSS.supports === 'function' && window.CSS.supports('background', 'color-mix(in srgb, red, blue)'))
        }
      },
      triggerBlobDownload(blob, fallbackName = 'diagram.png') {
        if (!blob) {
          return
        }
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        const schemaName = this.activeSchema && this.activeSchema.name
          ? this.activeSchema.name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
          : ''
        const extensionMatch = String(fallbackName || '').match(/(\.[a-z0-9]+)$/i)
        const extension = extensionMatch ? extensionMatch[1] : '.png'
        const fallbackBase = String(fallbackName || '').replace(/(\.[a-z0-9]+)$/i, '')
        const hasCustomFallbackBase = Boolean(fallbackBase) && fallbackBase.toLowerCase() !== 'diagram'
        const downloadBase = hasCustomFallbackBase ? fallbackBase : schemaName
        anchor.href = url
        anchor.download = downloadBase ? `${downloadBase}${extension}` : fallbackName
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      },
      escapeXml(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
      },
      toSvgNumber(value) {
        const num = Number(value)
        if (!Number.isFinite(num)) {
          return 0
        }
        return Math.round(num * 100) / 100
      },
      clamp(value, min, max) {
        return Math.min(max, Math.max(min, value))
      },
      clampPointToWorld(point) {
        return {
          x: this.clamp(point.x, 0, WORLD_WIDTH),
          y: this.clamp(point.y, 0, WORLD_HEIGHT)
        }
      },
      clampElementToWorld(element) {
        if (!element) {
          return
        }
        if (element.type === 'arrow') {
          element.x1 = this.clamp(element.x1, 0, WORLD_WIDTH)
          element.y1 = this.clamp(element.y1, 0, WORLD_HEIGHT)
          element.x2 = this.clamp(element.x2, 0, WORLD_WIDTH)
          element.y2 = this.clamp(element.y2, 0, WORLD_HEIGHT)
          return
        }
        if (element.type === 'text') {
          element.x = this.clamp(element.x, 0, WORLD_WIDTH)
          element.y = this.clamp(element.y, 0, WORLD_HEIGHT)
          return
        }
        if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'icon' || element.type === 'frame') {
          const width = Math.abs(element.w || 0)
          const height = Math.abs(element.h || 0)
          const maxX = Math.max(0, WORLD_WIDTH - width)
          const maxY = Math.max(0, WORLD_HEIGHT - height)
          element.x = this.clamp(element.x, 0, maxX)
          element.y = this.clamp(element.y, 0, maxY)
        }
      },
      getFrameIndexValue(frame) {
        return window.DrawingBoardFrames.getFrameIndexValue(this, frame)
      },
      getDefaultFrameName(index) {
        return window.DrawingBoardFrames.getDefaultFrameName(index)
      },
      getFrameDisplayName(frame) {
        return window.DrawingBoardFrames.getFrameDisplayName(this, frame)
      },
      getSelectedFrameName() {
        return window.DrawingBoardFrames.getSelectedFrameName(this)
      },
      onSelectedFrameNameChange(event) {
        return window.DrawingBoardFrames.onSelectedFrameNameChange(this, event)
      },
      getFramesForSchema(schema) {
        return window.DrawingBoardFrames.getFramesForSchema(this, schema)
      },
      getFramesForActiveSchema() {
        return window.DrawingBoardFrames.getFramesForActiveSchema(this)
      },
      ensureFrameIndexes(schema) {
        return window.DrawingBoardFrames.ensureFrameIndexes(this, schema)
      },
      getNextFrameIndex(schema = this.activeSchema) {
        return window.DrawingBoardFrames.getNextFrameIndex(this, schema)
      },
      getSelectedFrame() {
        return window.DrawingBoardFrames.getSelectedFrame(this)
      },
      getSelectedFrameExportBounds(showErrorToast = true) {
        return window.DrawingBoardFrames.getSelectedFrameExportBounds(this, showErrorToast)
      },
      getSelectedFrameExportFileBase() {
        return window.DrawingBoardFrames.getSelectedFrameExportFileBase(this)
      },
      canShiftSelectedFrameIndex(delta) {
        return window.DrawingBoardFrames.canShiftSelectedFrameIndex(this, delta)
      },
      setSelectedFrameIndex(nextIndex) {
        return window.DrawingBoardFrames.setSelectedFrameIndex(this, nextIndex)
      },
      shiftSelectedFrameIndex(delta) {
        return window.DrawingBoardFrames.shiftSelectedFrameIndex(this, delta)
      },
      onSelectedFrameIndexInputChange(event) {
        return window.DrawingBoardFrames.onSelectedFrameIndexInputChange(this, event)
      },
      focusFrame(frameId) {
        return window.DrawingBoardFrames.focusFrame(this, frameId)
      },
      clampViewOffset(nextX, nextY, zoom = this.zoomScale) {
        return window.DrawingBoardCanvas.clampViewOffset(this, nextX, nextY, zoom)
      },
      getDashArrayFromStyle(style) {
        return style === 'dashed' ? [10, 7] : []
      },
      applyFrameStyle(frame) {
        return window.DrawingBoardFrames.applyFrameStyle(this, frame)
      },
  }
  globalScope.DrawingBoardBaseMethods = methods
})(window)
