;(function attachDrawingBoardExportMethods(globalScope) {
  const { RECT_CORNER_RADIUS, FRAME_STYLE } = globalScope.DrawingBoardConstants
  const { normalizeRect } = globalScope.DrawingBoardUtils
  const methods = {
      computeElementsBounds(elements, ctx) {
        if (!elements || elements.length === 0) {
          return null
        }
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        elements.forEach((element) => {
          const b = this.getElementBounds(element, ctx)
          if (!b) {
            return
          }
          minX = Math.min(minX, b.x)
          minY = Math.min(minY, b.y)
          maxX = Math.max(maxX, b.x + b.w)
          maxY = Math.max(maxY, b.y + b.h)
        })
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
          return null
        }
        return {
          x: minX,
          y: minY,
          w: Math.max(1, maxX - minX),
          h: Math.max(1, maxY - minY)
        }
      },
      async buildSchemaPngBlob(exportBounds = null) {
        if (!this.activeSchema || this.activeSchema.elements.length === 0) {
          this.showToast('Nothing to export: diagram is empty.', 'error')
          return null
        }

        let bounds = null
        let exportWidth = 0
        let exportHeight = 0
        let offsetX = 0
        let offsetY = 0
        let clipToBounds = false

        if (exportBounds) {
          bounds = normalizeRect(exportBounds)
          if (bounds.w <= 0 || bounds.h <= 0) {
            this.showToast('Could not compute export bounds.', 'error')
            return null
          }
          exportWidth = Math.ceil(bounds.w)
          exportHeight = Math.ceil(bounds.h)
          offsetX = -bounds.x
          offsetY = -bounds.y
          clipToBounds = true
        } else {
          const margin = 5
          const measureCanvas = document.createElement('canvas')
          const measureCtx = measureCanvas.getContext('2d')
          bounds = this.computeElementsBounds(this.activeSchema.elements, measureCtx)
          if (!bounds) {
            this.showToast('Could not compute diagram bounds.', 'error')
            return null
          }
          exportWidth = Math.ceil(bounds.w + (margin * 2))
          exportHeight = Math.ceil(bounds.h + (margin * 2))
          offsetX = margin - bounds.x
          offsetY = margin - bounds.y
        }

        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))

        const outCanvas = document.createElement('canvas')
        outCanvas.width = Math.max(1, Math.floor(exportWidth * dpr))
        outCanvas.height = Math.max(1, Math.floor(exportHeight * dpr))
        const outCtx = outCanvas.getContext('2d')

        outCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        outCtx.clearRect(0, 0, exportWidth, exportHeight)
        outCtx.fillStyle = '#ffffff'
        outCtx.fillRect(0, 0, exportWidth, exportHeight)
        outCtx.save()
        if (clipToBounds) {
          outCtx.beginPath()
          outCtx.rect(0, 0, exportWidth, exportHeight)
          outCtx.clip()
        }
        outCtx.translate(offsetX, offsetY)

        let usedFallbackForRemoteIcons = false
        for (const element of this.activeSchema.elements) {
          const usedFallback = await this.drawElementForExport(outCtx, element)
          usedFallbackForRemoteIcons = usedFallbackForRemoteIcons || usedFallback
        }
        outCtx.restore()

        const blob = await new Promise((resolve) => {
          try {
            outCanvas.toBlob((result) => resolve(result), 'image/png')
          } catch (error) {
            resolve(null)
          }
        })

        if (!blob) {
          this.showToast('PNG export failed due to browser security restrictions (likely CORS).', 'error')
          return null
        }

        if (blob && usedFallbackForRemoteIcons) {
          this.showToast('Some remote icons could not be embedded and were replaced in the export.', 'warning')
        }

        return blob
      },
      async buildCroppedSchemaPngBlob() {
        return this.buildSchemaPngBlob()
      },
      buildCroppedSchemaSvgString(exportBounds = null) {
        if (!this.activeSchema || this.activeSchema.elements.length === 0) {
          this.showToast('Nothing to export: diagram is empty.', 'error')
          return null
        }

        let bounds = null
        let exportWidth = 0
        let exportHeight = 0
        let offsetX = 0
        let offsetY = 0
        let clipToBounds = false

        if (exportBounds) {
          bounds = normalizeRect(exportBounds)
          if (bounds.w <= 0 || bounds.h <= 0) {
            this.showToast('Could not compute export bounds.', 'error')
            return null
          }
          exportWidth = Math.ceil(bounds.w)
          exportHeight = Math.ceil(bounds.h)
          offsetX = -bounds.x
          offsetY = -bounds.y
          clipToBounds = true
        } else {
          const margin = 5
          const measureCanvas = document.createElement('canvas')
          const measureCtx = measureCanvas.getContext('2d')
          bounds = this.computeElementsBounds(this.activeSchema.elements, measureCtx)
          if (!bounds) {
            this.showToast('Could not compute diagram bounds.', 'error')
            return null
          }
          exportWidth = Math.ceil(bounds.w + (margin * 2))
          exportHeight = Math.ceil(bounds.h + (margin * 2))
          offsetX = margin - bounds.x
          offsetY = margin - bounds.y
        }

        const lines = []
        lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
        lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`)
        lines.push(`<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" fill="#ffffff"/>`)
        if (clipToBounds) {
          lines.push(`<defs><clipPath id="frameExportClip"><rect x="0" y="0" width="${exportWidth}" height="${exportHeight}"/></clipPath></defs>`)
          lines.push(`<g clip-path="url(#frameExportClip)">`)
        }

        this.activeSchema.elements.forEach((element) => {
          if (element.type === 'rect') {
            const r = normalizeRect(element)
            const rx = this.toSvgNumber(Math.max(0, Math.min(RECT_CORNER_RADIUS, r.w / 2, r.h / 2)))
            const dash = element.strokeStyle === 'dashed' ? ` stroke-dasharray="10 7"` : ''
            lines.push(`<rect x="${this.toSvgNumber(r.x + offsetX)}" y="${this.toSvgNumber(r.y + offsetY)}" width="${this.toSvgNumber(r.w)}" height="${this.toSvgNumber(r.h)}" rx="${rx}" ry="${rx}" fill="${this.escapeXml(element.fill || '#8ea9ff22')}" stroke="${this.escapeXml(element.stroke || '#1f2d54')}" stroke-width="${this.toSvgNumber(element.strokeWidth || 2)}"${dash}/>`)
            return
          }

          if (element.type === 'frame') {
            const r = normalizeRect(element)
            const dash = (element.strokeStyle || FRAME_STYLE.strokeStyle) === 'dashed' ? ` stroke-dasharray="${FRAME_STYLE.dashArray.join(' ')}"` : ''
            lines.push(`<rect x="${this.toSvgNumber(r.x + offsetX)}" y="${this.toSvgNumber(r.y + offsetY)}" width="${this.toSvgNumber(r.w)}" height="${this.toSvgNumber(r.h)}" fill="none" stroke="${this.escapeXml(FRAME_STYLE.stroke)}" stroke-width="${this.toSvgNumber(FRAME_STYLE.strokeWidth)}"${dash}/>`)
            lines.push(`<text x="${this.toSvgNumber(r.x + offsetX + FRAME_STYLE.title.xOffset)}" y="${this.toSvgNumber(r.y + offsetY + FRAME_STYLE.title.yOffset)}" fill="${this.escapeXml(FRAME_STYLE.stroke)}" font-family="${this.escapeXml(`${FRAME_STYLE.title.fontFamily}, Space Grotesk, sans-serif`)}" font-size="${this.toSvgNumber(FRAME_STYLE.title.fontSize)}" font-weight="${this.toSvgNumber(FRAME_STYLE.title.fontWeight)}">${this.escapeXml(this.getFrameDisplayName(element))}</text>`)
            return
          }

          if (element.type === 'ellipse') {
            const r = normalizeRect(element)
            const dash = element.strokeStyle === 'dashed' ? ` stroke-dasharray="10 7"` : ''
            lines.push(`<ellipse cx="${this.toSvgNumber(r.x + offsetX + (r.w / 2))}" cy="${this.toSvgNumber(r.y + offsetY + (r.h / 2))}" rx="${this.toSvgNumber(r.w / 2)}" ry="${this.toSvgNumber(r.h / 2)}" fill="${this.escapeXml(element.fill || '#8ea9ff22')}" stroke="${this.escapeXml(element.stroke || '#1f2d54')}" stroke-width="${this.toSvgNumber(element.strokeWidth || 2)}"${dash}/>`)
            return
          }

          if (element.type === 'arrow') {
            const stroke = this.escapeXml(element.stroke || '#1f2d54')
            const width = this.toSvgNumber(element.strokeWidth || 2)
            const dash = element.strokeStyle === 'dashed' ? ` stroke-dasharray="10 7"` : ''
            const x1 = this.toSvgNumber(element.x1 + offsetX)
            const y1 = this.toSvgNumber(element.y1 + offsetY)
            const x2 = this.toSvgNumber(element.x2 + offsetX)
            const y2 = this.toSvgNumber(element.y2 + offsetY)
            lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash}/>`)

            const angle = Math.atan2((element.y2 || 0) - (element.y1 || 0), (element.x2 || 0) - (element.x1 || 0))
            const size = 12
            const p2x = this.toSvgNumber((element.x2 + offsetX) - size * Math.cos(angle - Math.PI / 6))
            const p2y = this.toSvgNumber((element.y2 + offsetY) - size * Math.sin(angle - Math.PI / 6))
            const p3x = this.toSvgNumber((element.x2 + offsetX) - size * Math.cos(angle + Math.PI / 6))
            const p3y = this.toSvgNumber((element.y2 + offsetY) - size * Math.sin(angle + Math.PI / 6))
            lines.push(`<polygon points="${x2},${y2} ${p2x},${p2y} ${p3x},${p3y}" fill="${stroke}"/>`)
            return
          }

          if (element.type === 'text') {
            const fontSize = this.toSvgNumber(element.fontSize || 18)
            const lineHeight = this.toSvgNumber((element.fontSize || 18) * 1.2)
            const x = this.toSvgNumber((element.x || 0) + offsetX)
            const y = this.toSvgNumber((element.y || 0) + offsetY)
            const color = this.escapeXml(element.color || '#17233f')
            const linesText = String(element.text || '').split('\n')
            lines.push(`<text x="${x}" y="${y}" fill="${color}" font-family="Space Grotesk, sans-serif" font-size="${fontSize}">`)
            linesText.forEach((lineText, index) => {
              const dy = index === 0 ? 0 : lineHeight
              lines.push(`<tspan x="${x}" dy="${dy}">${this.escapeXml(lineText)}</tspan>`)
            })
            lines.push(`</text>`)
            return
          }

          if (element.type === 'icon') {
            const r = normalizeRect(element)
            const href = this.escapeXml(element.src || '')
            if (!href) {
              return
            }
            lines.push(`<image x="${this.toSvgNumber(r.x + offsetX)}" y="${this.toSvgNumber(r.y + offsetY)}" width="${this.toSvgNumber(r.w)}" height="${this.toSvgNumber(r.h)}" href="${href}" preserveAspectRatio="none"/>`)
          }
        })

        if (clipToBounds) {
          lines.push(`</g>`)
        }

        lines.push(`</svg>`)
        return lines.join('\n')
      },
      buildCroppedSchemaSvgBlob() {
        const markup = this.buildCroppedSchemaSvgString()
        if (!markup) {
          return null
        }
        return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
      },
      async saveCurrentSchemaAsPng() {
        const blob = await this.buildCroppedSchemaPngBlob()
        if (!blob) {
          return
        }
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        const safeName = this.activeSchema.name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
        anchor.href = url
        anchor.download = `${safeName || 'diagram'}.png`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
        this.showToast('PNG downloaded.')
      },
      async copySchemaPngToClipboard() {
        const blob = await this.buildCroppedSchemaPngBlob()
        if (!blob) {
          return
        }
        const capabilities = this.getBrowserCapabilities()
        if (!capabilities.clipboardWriteImage || !capabilities.secureContext) {
          this.triggerBlobDownload(blob)
          this.showToast('Clipboard image API unavailable here. PNG downloaded instead.', 'warning')
          return
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          this.showToast('PNG copied to clipboard.')
        } catch (error) {
          this.triggerBlobDownload(blob)
          this.showToast('Clipboard copy failed. PNG downloaded instead.', 'warning')
        }
      },
      saveCurrentSchemaAsSvg() {
        const blob = this.buildCroppedSchemaSvgBlob()
        if (!blob) {
          return
        }
        this.triggerBlobDownload(blob, 'diagram.svg')
        this.showToast('SVG downloaded.')
      },
      async copySchemaSvgToClipboard() {
        const markup = this.buildCroppedSchemaSvgString()
        if (!markup) {
          return
        }
        const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })

        if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write || !window.isSecureContext) {
          this.triggerBlobDownload(blob, 'diagram.svg')
          this.showToast('Clipboard SVG API unavailable here. SVG downloaded instead.', 'warning')
          return
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/svg+xml': blob,
              'text/plain': new Blob([markup], { type: 'text/plain;charset=utf-8' })
            })
          ])
          this.showToast('SVG copied to clipboard.')
        } catch (error) {
          this.triggerBlobDownload(blob, 'diagram.svg')
          this.showToast('Clipboard copy failed. SVG downloaded instead.', 'warning')
        }
      },
  }
  globalScope.DrawingBoardExportMethods = methods
})(window)
