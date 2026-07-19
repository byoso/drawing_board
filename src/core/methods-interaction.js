(function attachDrawingBoardInteractionMethods(globalScope) {
  const { uid, deepClone, normalizeRect, pointToSegmentDistance } = globalScope.DrawingBoardUtils
  const methods = {
      async saveSelectedFrameAsPng() {
        return window.DrawingBoardFrames.saveSelectedFrameAsPng(this)
      },
      async copySelectedFramePngToClipboard() {
        return window.DrawingBoardFrames.copySelectedFramePngToClipboard(this)
      },
      saveSelectedFrameAsSvg() {
        return window.DrawingBoardFrames.saveSelectedFrameAsSvg(this)
      },
      async copySelectedFrameSvgToClipboard() {
        return window.DrawingBoardFrames.copySelectedFrameSvgToClipboard(this)
      },
      getCanvasPosition(event) {
        return window.DrawingBoardCanvas.getCanvasPosition(this, event)
      },
      getPointerPosition(event) {
        return window.DrawingBoardCanvas.getPointerPosition(this, event)
      },
      onCanvasWheel(event) {
        return window.DrawingBoardCanvas.onCanvasWheel(this, event)
      },
      resetZoomView() {
        return window.DrawingBoardCanvas.resetZoomView(this)
      },
      updateCanvasPointerPosition(event) {
        return window.DrawingBoardCanvas.updateCanvasPointerPosition(this, event)
      },
      onCanvasPointerEnter(event) {
        return window.DrawingBoardCanvas.onCanvasPointerEnter(this, event)
      },
      onCanvasPointerMove(event) {
        return window.DrawingBoardCanvas.onCanvasPointerMove(this, event)
      },
      onCanvasPointerLeave() {
        return window.DrawingBoardCanvas.onCanvasPointerLeave(this)
      },
      hitTextAt(x, y) {
        return window.DrawingBoardCanvas.hitTextAt(this, x, y)
      },
      onCanvasDoubleClick(event) {
        return window.DrawingBoardCanvas.onCanvasDoubleClick(this, event)
      },
      saveTextEdit() {
        if (!this.textEditor.text.trim()) {
          this.textEditor.isOpen = false
          return
        }
        this.pushHistoryCheckpoint()
        if (this.textEditor.isCreating) {
          // Création d'un nouveau texte
          this.activeSchema.elements.push({
            id: uid('el'),
            type: 'text',
            x: this.textEditor.creationPos.x,
            y: this.textEditor.creationPos.y,
            text: this.textEditor.text,
            color: this.activeColor,
            fontSize: this.getCurrentFontSize()
          })
          const newElement = this.activeSchema.elements[this.activeSchema.elements.length - 1]
          this.setSingleSelection(newElement.id)
        } else {
          // Édition d'un texte existant
          if (this.textEditor.element) {
            this.textEditor.element.text = this.textEditor.text
          }
        }
        this.markDirty()
        this.renderCanvas()
        this.textEditor.isOpen = false
        this.textEditor.isCreating = false
      },
      cancelTextEdit() {
        this.textEditor.isOpen = false
        this.textEditor.isCreating = false
        this.textEditor.element = null
        this.textEditor.text = ''
      },
      onPointerDown(event) {
        const canvas = this.$refs.canvas
        if (canvas && typeof canvas.setPointerCapture === 'function') {
          try {
            canvas.setPointerCapture(event.pointerId)
          } catch (error) {
            // Ignore if pointer capture is not available for this interaction.
          }
        }

        const isPanPointerDown = event.button === 1 || (event.button === 0 && this.isSpacePressed)
        if (isPanPointerDown) {
          event.preventDefault()
          const canvasPos = this.getCanvasPosition(event)
          this.pointerState.pointerId = event.pointerId
          this.pointerState.mode = 'pan'
          this.pointerState.startX = canvasPos.x
          this.pointerState.startY = canvasPos.y
          this.pointerState.startViewOffsetX = this.viewOffsetX
          this.pointerState.startViewOffsetY = this.viewOffsetY
          return
        }

        if (event.button !== 0) {
          return
        }

        if (canvas && typeof canvas.focus === 'function') {
          canvas.focus({ preventScroll: true })
        }
        const pos = this.getPointerPosition(event)
        this.pointerState.pointerId = event.pointerId
        this.pointerState.historyCaptured = false

        if (this.activeTool === 'select') {
          window.DrawingBoardCommonTools.handleSelectionPointerDown(this, event, pos)
          return
        }

        window.DrawingBoardBasicTools.handlePointerDown(this, pos)
      },
      onPointerMove(event) {
        if (this.pointerState.pointerId == null || event.pointerId !== this.pointerState.pointerId) {
          return
        }

        if (this.pointerState.mode === 'pan') {
          event.preventDefault()
          const canvasPos = this.getCanvasPosition(event)
          const dx = canvasPos.x - this.pointerState.startX
          const dy = canvasPos.y - this.pointerState.startY
          const clampedView = this.clampViewOffset(
            this.pointerState.startViewOffsetX - (dx / this.zoomScale),
            this.pointerState.startViewOffsetY - (dy / this.zoomScale)
          )
          this.viewOffsetX = clampedView.x
          this.viewOffsetY = clampedView.y
          this.renderCanvas()
          return
        }

        const pos = this.getPointerPosition(event)

        if (window.DrawingBoardCommonTools.handleSelectionPointerMove(this, pos)) {
          return
        }

        window.DrawingBoardBasicTools.handlePointerMove(this, pos)
      },
      onPointerUp(event) {
        if (this.pointerState.pointerId != null && event.pointerId !== this.pointerState.pointerId) {
          return
        }

        const canvas = this.$refs.canvas
        if (canvas && typeof canvas.releasePointerCapture === 'function') {
          try {
            canvas.releasePointerCapture(event.pointerId)
          } catch (error) {
            // Ignore when pointer capture was not acquired.
          }
        }

        if (this.pointerState.mode === 'pan') {
          this.pointerState.mode = null
          this.pointerState.pointerId = null
          return
        }

        if (this.pointerState.mode === 'draw' && this.draftElement) {
          window.DrawingBoardBasicTools.finalizeDraw(this)
        }

        this.draftElement = null
        this.marqueeRect = null
        this.pointerState.mode = null
        this.pointerState.pointerId = null
        this.pointerState.startElement = null
        this.pointerState.startElements = null
        this.pointerState.resizeHandle = null
        this.pointerState.historyCaptured = false
        this.pointerState.ctrlPressed = false
        this.pointerState.initialSelection = []
        this.renderCanvas()
      },
      getResizeHandles(element) {
        if (!element) {
          return []
        }
        if (element.type === 'arrow') {
          return [
            { key: 'start', x: element.x1, y: element.y1, cursor: 'move' },
            { key: 'end', x: element.x2, y: element.y2, cursor: 'move' }
          ]
        }
        if (element.type !== 'rect' && element.type !== 'ellipse' && element.type !== 'icon' && element.type !== 'frame') {
          return []
        }
        const r = normalizeRect(element)
        const right = r.x + r.w
        const bottom = r.y + r.h
        const midX = r.x + (r.w / 2)
        const midY = r.y + (r.h / 2)
        return [
          { key: 'nw', x: r.x, y: r.y, cursor: 'nwse-resize' },
          { key: 'n', x: midX, y: r.y, cursor: 'ns-resize' },
          { key: 'ne', x: right, y: r.y, cursor: 'nesw-resize' },
          { key: 'e', x: right, y: midY, cursor: 'ew-resize' },
          { key: 'se', x: right, y: bottom, cursor: 'nwse-resize' },
          { key: 's', x: midX, y: bottom, cursor: 'ns-resize' },
          { key: 'sw', x: r.x, y: bottom, cursor: 'nesw-resize' },
          { key: 'w', x: r.x, y: midY, cursor: 'ew-resize' }
        ]
      },
      hitResizeHandle(x, y) {
        if (!this.activeSchema || this.selectedElementIds.length !== 1) {
          return null
        }
        const element = this.activeSchema.elements.find((item) => item.id === this.selectedElementIds[0])
        if (!element || (element.type !== 'rect' && element.type !== 'ellipse' && element.type !== 'arrow' && element.type !== 'icon' && element.type !== 'frame')) {
          return null
        }
        const handles = this.getResizeHandles(element)
        const radius = 7
        for (let i = 0; i < handles.length; i += 1) {
          const handle = handles[i]
          if (Math.hypot(x - handle.x, y - handle.y) <= radius) {
            return { element, handle: handle.key }
          }
        }
        return null
      },
      applyResize(target, startElement, handle, pointerX, pointerY) {
        if (target.type === 'arrow') {
          if (handle === 'start') {
            target.x1 = pointerX
            target.y1 = pointerY
          }
          if (handle === 'end') {
            target.x2 = pointerX
            target.y2 = pointerY
          }
          return
        }
        const minSize = 12
        const start = normalizeRect(startElement)
        let left = start.x
        let top = start.y
        let right = start.x + start.w
        let bottom = start.y + start.h

        if (handle.includes('n')) {
          top = Math.min(pointerY, bottom - minSize)
        }
        if (handle.includes('s')) {
          bottom = Math.max(pointerY, top + minSize)
        }
        if (handle.includes('w')) {
          left = Math.min(pointerX, right - minSize)
        }
        if (handle.includes('e')) {
          right = Math.max(pointerX, left + minSize)
        }

        target.x = left
        target.y = top
        target.w = right - left
        target.h = bottom - top
      },
      hitTest(x, y) {
        const ctx = this.getCanvasContext()
        if (!ctx || !this.activeSchema) {
          return null
        }

        for (let i = this.activeSchema.elements.length - 1; i >= 0; i -= 1) {
          const element = this.activeSchema.elements[i]
          if (element.type === 'frame') {
            const r = normalizeRect(element)
            const frameTitle = this.getFrameDisplayName(element)
            const frameTitleFontSize = 24
            const frameTitleX = r.x + 10
            const frameTitleBaselineY = r.y - 6

            ctx.save()
            ctx.font = '700 24px Sora'
            const frameTitleWidth = ctx.measureText(frameTitle).width
            ctx.restore()

            const titlePadding = 4
            const titleLeft = frameTitleX - titlePadding
            const titleTop = (frameTitleBaselineY - frameTitleFontSize) - titlePadding
            const titleRight = frameTitleX + frameTitleWidth + titlePadding
            const titleBottom = frameTitleBaselineY + titlePadding
            if (x >= titleLeft && x <= titleRight && y >= titleTop && y <= titleBottom) {
              return element
            }

            ctx.save()
            ctx.beginPath()
            ctx.rect(r.x, r.y, r.w, r.h)
            ctx.lineWidth = Math.max(10, (element.strokeWidth || 2) + 8)
            const isHit = ctx.isPointInStroke(x, y)
            ctx.restore()
            if (isHit) {
              return element
            }
          }
          if (element.type === 'rect') {
            const r = normalizeRect(element)
            ctx.save()
            ctx.beginPath()
            ctx.rect(r.x, r.y, r.w, r.h)
            ctx.lineWidth = Math.max(10, (element.strokeWidth || 2) + 8)
            const isHit = ctx.isPointInStroke(x, y)
            ctx.restore()
            if (isHit) {
              return element
            }
          }
          if (element.type === 'icon') {
            const r = normalizeRect(element)
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              return element
            }
          }
          if (element.type === 'ellipse') {
            const r = normalizeRect(element)
            const rx = r.w / 2
            const ry = r.h / 2
            if (rx > 0 && ry > 0) {
              ctx.save()
              ctx.beginPath()
              ctx.ellipse(r.x + rx, r.y + ry, rx, ry, 0, 0, Math.PI * 2)
              ctx.lineWidth = Math.max(10, (element.strokeWidth || 2) + 8)
              const isHit = ctx.isPointInStroke(x, y)
              ctx.restore()
              if (isHit) {
                return element
              }
            }
          }
          if (element.type === 'arrow') {
            const distance = pointToSegmentDistance(x, y, element.x1, element.y1, element.x2, element.y2)
            if (distance <= Math.max(8, (element.strokeWidth || 2) + 4)) {
              return element
            }
          }
          if (element.type === 'text') {
            ctx.font = `${element.fontSize || 18}px Space Grotesk`
            const width = ctx.measureText(element.text || '').width
            const height = element.fontSize || 18
            if (x >= element.x && x <= element.x + width && y <= element.y && y >= element.y - height) {
              return element
            }
          }
        }
        return null
      },
      drawElement(ctx, element, selected = false) {
        return window.DrawingBoardCanvas.drawElement(this, ctx, element, selected)
      },
      drawSelectionRect(ctx, x, y, w, h) {
        return window.DrawingBoardCanvas.drawSelectionRect(this, ctx, x, y, w, h)
      },
      drawResizeHandles(ctx, element) {
        return window.DrawingBoardCanvas.drawResizeHandles(this, ctx, element)
      },
      renderCanvas() {
        return window.DrawingBoardCanvas.renderCanvas(this)
      },
      deleteSelectedElement() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return
        }
        const before = this.activeSchema.elements.length
        this.pushHistoryCheckpoint()
        this.activeSchema.elements = this.activeSchema.elements.filter((element) => !this.selectedElementIds.includes(element.id))
        if (this.activeSchema.elements.length !== before) {
          this.clearSelection()
          this.markDirty()
          this.renderCanvas()
        }
      },
      copySelectionToClipboard() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return false
        }
        this.copiedElements = this.activeSchema.elements
          .filter((element) => this.selectedElementIds.includes(element.id))
          .map((element) => deepClone(element))
        return this.copiedElements.length > 0
      },
      pasteClipboardSelection() {
        if (!this.activeSchema || !Array.isArray(this.copiedElements) || this.copiedElements.length === 0) {
          return false
        }
        if (!this.isPointerInCanvas) {
          return false
        }
        const clones = this.copiedElements.map((element) => ({
          ...deepClone(element),
          id: uid('el')
        }))
        const ctx = this.getCanvasContext()
        const sourceBounds = this.computeElementsBounds(this.copiedElements, ctx)
        if (sourceBounds) {
          const dx = this.lastCanvasPointer.x - (sourceBounds.x + sourceBounds.w / 2)
          const dy = this.lastCanvasPointer.y - (sourceBounds.y + sourceBounds.h / 2)
          clones.forEach((element) => {
            if (element.type === 'arrow') {
              element.x1 += dx
              element.y1 += dy
              element.x2 += dx
              element.y2 += dy
            } else {
              element.x += dx
              element.y += dy
            }
            this.clampElementToWorld(element)
          })
        }
        let nextFrameIndex = this.getNextFrameIndex()
        clones.forEach((element) => {
          if (element.type === 'frame') {
            element.frameIndex = nextFrameIndex
            element.name = String((element.name || '')).trim() || this.getDefaultFrameName(nextFrameIndex)
            this.applyFrameStyle(element)
            nextFrameIndex += 1
          }
        })
        this.pushHistoryCheckpoint()
        this.activeSchema.elements.push(...clones)
        this.selectedElementIds = clones.map((element) => element.id)
        this.markDirty()
        this.renderCanvas()
        return true
      },
      onGlobalKeyDown(event) {
        const target = event.target
        const targetTag = target && target.tagName ? target.tagName.toLowerCase() : ''
        const isEditable = targetTag === 'input' || targetTag === 'textarea' || (target && target.isContentEditable)

        if (event.code === 'Space') {
          this.isSpacePressed = true
          if (!isEditable) {
            event.preventDefault()
          }
        }

        if (isEditable) {
          return
        }

        const key = event.key.toLowerCase()
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'z') {
          event.preventDefault()
          this.undo()
          return
        }

        if ((event.ctrlKey || event.metaKey) && (key === 'y' || (event.shiftKey && key === 'z'))) {
          event.preventDefault()
          this.redo()
          return
        }

        if ((event.ctrlKey || event.metaKey) && key === 's') {
          event.preventDefault()
          this.saveCurrentSchema()
          return
        }

        if ((event.ctrlKey || event.metaKey) && key === 'c' && this.activeTool === 'select') {
          if (this.copySelectionToClipboard()) {
            event.preventDefault()
          }
          return
        }

        if ((event.ctrlKey || event.metaKey) && key === 'v' && this.activeTool === 'select') {
          if (this.pasteClipboardSelection()) {
            event.preventDefault()
          }
          return
        }

        if (key === 'delete' || key === 'backspace') {
          event.preventDefault()
          this.deleteSelectedElement()
          return
        }

        const selectTool = window.DrawingBoardCommonTools.getToolFromShortcut(key)
        if (selectTool) {
          this.activeTool = selectTool
          return
        }

        const basicTool = window.DrawingBoardBasicTools.getToolFromShortcut(key)
        if (basicTool) {
          this.activeTool = basicTool
        }
      },
      onGlobalKeyUp(event) {
        if (event.code === 'Space') {
          this.isSpacePressed = false
        }
      },
      onWindowBlur() {
        this.isSpacePressed = false
      },
      formatDate(timestamp) {
        return new Date(timestamp).toLocaleString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        })
      },
      showToast(message, type = 'info') {
        this.toast.message = message
        this.toast.type = type
        setTimeout(() => {
          if (this.toast.message === message) {
            this.toast.message = ''
          }
        }, 5000)
      }
  }
  globalScope.DrawingBoardInteractionMethods = methods
})(window)
