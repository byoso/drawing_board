;(function attachDrawingBoardSelectionMethods(globalScope) {
  const { deepClone, normalizeRect, pointToSegmentDistance, hexToRgba } = globalScope.DrawingBoardUtils
  const methods = {
      isElementSelected(elementId) {
        return this.selectedElementIds.includes(elementId)
      },
      setSingleSelection(elementId) {
        this.selectedElementIds = elementId ? [elementId] : []
      },
      toggleElementInSelection(elementId) {
        const index = this.selectedElementIds.indexOf(elementId)
        if (index >= 0) {
          this.selectedElementIds.splice(index, 1)
        } else {
          this.selectedElementIds.push(elementId)
        }
      },
      clearSelection() {
        this.selectedElementIds = []
      },
      getSelectedElement() {
        if (!this.activeSchema || this.selectedElementIds.length !== 1) {
          return null
        }
        return this.activeSchema.elements.find((element) => element.id === this.selectedElementIds[0])
      },
      getSelectedLineStyle() {
        const element = this.getSelectedElement()
        return element && element.type !== 'text' && element.type !== 'frame' ? (element.strokeStyle || 'solid') : null
      },
      getSelectedColor() {
        const element = this.getSelectedElement()
        if (!element) return null
        if (element.type === 'frame') return null
        if (element.type === 'text') return element.color || null
        if (element.type === 'rect' || element.type === 'ellipse') {
          // Pour rect/ellipse, on compare avec le stroke car c'est la couleur principale
          return element.stroke || null
        }
        return element.stroke || null
      },
      getSelectedSize() {
        const element = this.getSelectedElement()
        if (!element) {
          return null
        }
        if (element.type === 'frame') {
          return null
        }
        if (element.type === 'text') {
          return this.drawSize
        }
        if (element.type !== 'icon') {
          return this.drawSize
        }
        return null
      },
      getApplicablePropertiesForSelection() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return { hasLineStyle: false, hasSize: false, hasColor: false, canChangeLayer: false }
        }
        const elements = this.activeSchema.elements.filter((element) => this.selectedElementIds.includes(element.id))
        const hasFrame = elements.some((element) => element.type === 'frame')
        if (elements.length === 1 && hasFrame) {
          return { hasLineStyle: false, hasSize: false, hasColor: false, canChangeLayer: false }
        }
        const hasLineStyle = elements.some((element) => element.type !== 'text' && element.type !== 'frame')
        const hasSize = elements.some((element) => element.type !== 'icon' && element.type !== 'frame')
        const hasColor = elements.some((element) => element.type !== 'icon' && element.type !== 'frame')
        const canChangeLayer = elements.length > 0 && !hasFrame
        return { hasLineStyle, hasSize, hasColor, canChangeLayer }
      },
      getSelectedLayerInfo() {
        if (!this.activeSchema || this.activeTool !== 'select' || this.selectedElementIds.length !== 1) {
          return null
        }
        const selectedId = this.selectedElementIds[0]
        const selectedElement = this.activeSchema.elements.find((element) => element.id === selectedId)
        if (!selectedElement || selectedElement.type === 'frame') {
          return null
        }
        const index = this.activeSchema.elements.findIndex((element) => element.id === selectedId)
        if (index === -1) {
          return null
        }
        const total = this.activeSchema.elements.length
        return {
          index,
          total,
          label: `Layer ${index + 1} / ${total}`,
          canMoveUp: index < total - 1,
          canMoveDown: index > 0
        }
      },
      moveElementLayer(delta) {
        if (!this.activeSchema || this.selectedElementIds.length !== 1 || delta === 0) {
          return
        }
        const selectedId = this.selectedElementIds[0]
        const elements = this.activeSchema.elements
        const index = elements.findIndex((element) => element.id === selectedId)
        if (index === -1) {
          return
        }
        const targetIndex = index + delta
        if (targetIndex < 0 || targetIndex >= elements.length) {
          return
        }
        this.pushHistoryCheckpoint()
        const [element] = elements.splice(index, 1)
        elements.splice(targetIndex, 0, element)
        this.markDirty()
        this.renderCanvas()
      },
      moveSelectedElementToLayer(targetLayerIndex) {
        if (!this.activeSchema || this.selectedElementIds.length !== 1) {
          return
        }
        const elements = this.activeSchema.elements
        const selectedId = this.selectedElementIds[0]
        const currentIndex = elements.findIndex((element) => element.id === selectedId)
        if (currentIndex === -1) {
          return
        }
        const clampedTargetIndex = Math.max(0, Math.min(elements.length - 1, targetLayerIndex))
        if (clampedTargetIndex === currentIndex) {
          return
        }
        this.pushHistoryCheckpoint()
        const [element] = elements.splice(currentIndex, 1)
        elements.splice(clampedTargetIndex, 0, element)
        this.markDirty()
        this.renderCanvas()
      },
      moveLayerUp() {
        this.moveElementLayer(1)
      },
      moveLayerDown() {
        this.moveElementLayer(-1)
      },
      onLayerInputChange(event) {
        const nextValue = Number.parseInt(event.target.value, 10)
        if (Number.isNaN(nextValue)) {
          return
        }
        this.moveSelectedElementToLayer(nextValue - 1)
      },
      applyLineStyle(style) {
        if (!this.activeSchema) {
          return
        }
        this.pushHistoryCheckpoint()
        this.selectedElementIds.forEach((elementId) => {
          const element = this.activeSchema.elements.find((el) => el.id === elementId)
          if (element && element.type !== 'text' && element.type !== 'frame') {
            element.strokeStyle = style
          }
        })
        this.markDirty()
        this.renderCanvas()
      },
      applySize(size) {
        if (!this.activeSchema) {
          return
        }
        this.pushHistoryCheckpoint()
        const preset = this.sizePresets[size] || this.sizePresets.small
        this.selectedElementIds.forEach((elementId) => {
          const element = this.activeSchema.elements.find((el) => el.id === elementId)
          if (!element) {
            return
          }
          if (element.type === 'text') {
            element.fontSize = preset.fontSize
          } else if (element.type !== 'icon' && element.type !== 'frame') {
            element.strokeWidth = preset.strokeWidth
          }
        })
        this.markDirty()
        this.renderCanvas()
      },
      applyColorToSelection(color) {
        if (!this.activeSchema) {
          return
        }
        this.pushHistoryCheckpoint()
        this.selectedElementIds.forEach((elementId) => {
          const element = this.activeSchema.elements.find((el) => el.id === elementId)
          if (!element) {
            return
          }
          if (element.type === 'text') {
            element.color = color
          } else if (element.type === 'frame') {
            return
          } else if (element.type === 'rect' || element.type === 'ellipse') {
            element.stroke = color
            element.fill = hexToRgba(color, 0.22)
          } else {
            element.stroke = color
          }
        })
        this.markDirty()
        this.renderCanvas()
      },
      canMoveLayerUpMultiple() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return false
        }
        const elements = this.activeSchema.elements.filter((element) => this.selectedElementIds.includes(element.id))
        return !elements.some((element) => {
          const index = this.activeSchema.elements.indexOf(element)
          return index >= this.activeSchema.elements.length - 1
        })
      },
      canMoveLayerDownMultiple() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return false
        }
        const elements = this.activeSchema.elements.filter((element) => this.selectedElementIds.includes(element.id))
        return !elements.some((element) => {
          const index = this.activeSchema.elements.indexOf(element)
          return index <= 0
        })
      },
      moveLayerUpMultiple() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return
        }
        const elements = this.activeSchema.elements.filter((element) => this.selectedElementIds.includes(element.id))
        if (elements.some((element) => {
          const index = this.activeSchema.elements.indexOf(element)
          return index >= this.activeSchema.elements.length - 1
        })) {
          return
        }
        this.pushHistoryCheckpoint()
        // Traiter du bas vers le haut pour éviter que les indices changent
        const sortedElements = elements
          .map((el) => ({ element: el, index: this.activeSchema.elements.indexOf(el) }))
          .sort((a, b) => a.index - b.index)

        sortedElements.forEach(({ element, index }) => {
          const currentIndex = this.activeSchema.elements.indexOf(element)
          const [removed] = this.activeSchema.elements.splice(currentIndex, 1)
          this.activeSchema.elements.splice(currentIndex + 1, 0, removed)
        })
        this.markDirty()
        this.renderCanvas()
      },
      moveLayerDownMultiple() {
        if (!this.activeSchema || this.selectedElementIds.length === 0) {
          return
        }
        const elements = this.activeSchema.elements.filter((element) => this.selectedElementIds.includes(element.id))
        if (elements.some((element) => {
          const index = this.activeSchema.elements.indexOf(element)
          return index <= 0
        })) {
          return
        }
        this.pushHistoryCheckpoint()
        // Traiter du haut vers le bas pour éviter que les indices changent
        const sortedElements = elements
          .map((el) => ({ element: el, index: this.activeSchema.elements.indexOf(el) }))
          .sort((a, b) => b.index - a.index)

        sortedElements.forEach(({ element, index }) => {
          const currentIndex = this.activeSchema.elements.indexOf(element)
          const [removed] = this.activeSchema.elements.splice(currentIndex, 1)
          this.activeSchema.elements.splice(currentIndex - 1, 0, removed)
        })
        this.markDirty()
        this.renderCanvas()
      },
      getElementBounds(element, ctx) {
        if (!element) {
          return null
        }
        if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'icon' || element.type === 'frame') {
          const r = normalizeRect(element)
          return { x: r.x, y: r.y, w: r.w, h: r.h }
        }
        if (element.type === 'arrow') {
          return {
            x: Math.min(element.x1, element.x2),
            y: Math.min(element.y1, element.y2),
            w: Math.max(1, Math.abs(element.x2 - element.x1)),
            h: Math.max(1, Math.abs(element.y2 - element.y1))
          }
        }
        if (element.type === 'text') {
          const localCtx = ctx || this.getCanvasContext()
          if (!localCtx) {
            return { x: element.x, y: element.y - 18, w: 1, h: 18 }
          }
          localCtx.save()
          localCtx.font = `${element.fontSize || 18}px Space Grotesk`
          const fontSize = element.fontSize || 18
          const lineHeight = fontSize * 1.2
          const text = element.text || ''
          const lines = text.split('\n')
          let maxWidth = 0
          lines.forEach((line) => {
            const width = localCtx.measureText(line).width
            if (width > maxWidth) maxWidth = width
          })
          localCtx.restore()
          const height = lines.length * lineHeight
          return { x: element.x, y: element.y - fontSize, w: Math.max(1, maxWidth), h: Math.max(height, fontSize) }
        }
        return null
      },
      isBoundsInsideMarquee(bounds, marquee) {
        if (!bounds || !marquee) {
          return false
        }
        const right = bounds.x + bounds.w
        const bottom = bounds.y + bounds.h
        const marqueeRight = marquee.x + marquee.w
        const marqueeBottom = marquee.y + marquee.h
        return bounds.x >= marquee.x && bounds.y >= marquee.y && right <= marqueeRight && bottom <= marqueeBottom
      },
  }
  globalScope.DrawingBoardSelectionMethods = methods
})(window)
