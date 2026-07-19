;(function attachDrawingBoardRender(globalScope) {
	function normalizeRect(el) {
		const x = el.w < 0 ? el.x + el.w : el.x
		const y = el.h < 0 ? el.y + el.h : el.y
		const w = Math.abs(el.w)
		const h = Math.abs(el.h)
		return { x, y, w, h }
	}

	function drawRoundedRectPath(ctx, x, y, w, h, radius = 8) {
		const safeRadius = Math.max(0, Math.min(radius, w / 2, h / 2))
		ctx.beginPath()
		ctx.moveTo(x + safeRadius, y)
		ctx.lineTo(x + w - safeRadius, y)
		ctx.arcTo(x + w, y, x + w, y + safeRadius, safeRadius)
		ctx.lineTo(x + w, y + h - safeRadius)
		ctx.arcTo(x + w, y + h, x + w - safeRadius, y + h, safeRadius)
		ctx.lineTo(x + safeRadius, y + h)
		ctx.arcTo(x, y + h, x, y + h - safeRadius, safeRadius)
		ctx.lineTo(x, y + safeRadius)
		ctx.arcTo(x, y, x + safeRadius, y, safeRadius)
		ctx.closePath()
	}

	function drawSelectionRect(vm, ctx, x, y, w, h) {
		ctx.save()
		ctx.strokeStyle = '#ff5f2a'
		ctx.lineWidth = 1
		ctx.setLineDash([6, 4])
		ctx.strokeRect(x - 4, y - 4, w + 8, h + 8)
		ctx.restore()
	}

	function drawResizeHandles(vm, ctx, element) {
		const handles = vm.getResizeHandles(element)
		if (handles.length === 0) {
			return
		}
		ctx.save()
		ctx.fillStyle = '#ffffff'
		ctx.strokeStyle = '#ff5f2a'
		ctx.lineWidth = 1.5
		handles.forEach((handle) => {
			ctx.beginPath()
			ctx.rect(handle.x - 4, handle.y - 4, 8, 8)
			ctx.fill()
			ctx.stroke()
		})
		ctx.restore()
	}

	function drawElement(vm, ctx, element, selected = false) {
		ctx.save()
		ctx.strokeStyle = element.stroke || '#1f2d54'
		ctx.fillStyle = element.fill || '#8ea9ff22'
		ctx.lineWidth = element.strokeWidth || 2
		ctx.setLineDash(vm.getDashArrayFromStyle(element.strokeStyle))

		if (element.type === 'frame') {
			const r = normalizeRect(element)
			const dash = vm.getDashArrayFromStyle(element.strokeStyle || FRAME_STYLE.strokeStyle)
			ctx.strokeStyle = FRAME_STYLE.stroke
			ctx.lineWidth = FRAME_STYLE.strokeWidth
			ctx.setLineDash(dash)
			ctx.strokeRect(r.x, r.y, r.w, r.h)

			ctx.setLineDash([])
			ctx.fillStyle = FRAME_STYLE.stroke
			ctx.font = `${FRAME_STYLE.title.fontWeight} ${FRAME_STYLE.title.fontSize}px ${FRAME_STYLE.title.fontFamily}`
			ctx.textBaseline = 'bottom'
			ctx.fillText(vm.getFrameDisplayName(element), r.x + FRAME_STYLE.title.xOffset, r.y + FRAME_STYLE.title.yOffset)

			if (selected) {
				drawSelectionRect(vm, ctx, r.x, r.y, r.w, r.h)
			}
		}

		if (element.type === 'rect') {
			const r = normalizeRect(element)
			drawRoundedRectPath(ctx, r.x, r.y, r.w, r.h)
			ctx.fill()
			ctx.stroke()
			if (selected) {
				drawSelectionRect(vm, ctx, r.x, r.y, r.w, r.h)
			}
		}

		if (element.type === 'icon') {
			const r = normalizeRect(element)
			const image = vm.getCachedIconImage(element.src)
			if (image && image.complete && image.naturalWidth > 0) {
				ctx.drawImage(image, r.x, r.y, r.w, r.h)
			} else {
				ctx.fillStyle = '#eef3fb'
				ctx.fillRect(r.x, r.y, r.w, r.h)
				ctx.strokeStyle = '#c6d4eb'
				ctx.strokeRect(r.x, r.y, r.w, r.h)
				ctx.fillStyle = '#6b7ea6'
				ctx.font = '12px Space Grotesk'
				ctx.fillText('Loading icon...', r.x + 8, r.y + 20)
			}
			if (selected) {
				drawSelectionRect(vm, ctx, r.x, r.y, r.w, r.h)
			}
		}

		if (element.type === 'ellipse') {
			const r = normalizeRect(element)
			ctx.beginPath()
			ctx.ellipse(r.x + (r.w / 2), r.y + (r.h / 2), r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
			ctx.fill()
			ctx.stroke()
			if (selected) {
				drawSelectionRect(vm, ctx, r.x, r.y, r.w, r.h)
			}
		}

		if (element.type === 'arrow') {
			ctx.beginPath()
			ctx.moveTo(element.x1, element.y1)
			ctx.lineTo(element.x2, element.y2)
			ctx.stroke()

			const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1)
			const size = 12
			ctx.beginPath()
			ctx.moveTo(element.x2, element.y2)
			ctx.lineTo(element.x2 - size * Math.cos(angle - Math.PI / 6), element.y2 - size * Math.sin(angle - Math.PI / 6))
			ctx.lineTo(element.x2 - size * Math.cos(angle + Math.PI / 6), element.y2 - size * Math.sin(angle + Math.PI / 6))
			ctx.closePath()
			ctx.fillStyle = element.stroke || '#1f2d54'
			ctx.fill()

			if (selected) {
				const minX = Math.min(element.x1, element.x2)
				const minY = Math.min(element.y1, element.y2)
				const w = Math.abs(element.x2 - element.x1)
				const h = Math.abs(element.y2 - element.y1)
				drawSelectionRect(vm, ctx, minX, minY, w, h)
			}
		}

		if (element.type === 'text') {
			ctx.setLineDash([])
			ctx.font = `${element.fontSize || 18}px Space Grotesk`
			ctx.fillStyle = element.color || '#17233f'
			ctx.textBaseline = 'alphabetic'
			const text = element.text || ''
			const lines = text.split('\n')
			const fontSize = element.fontSize || 18
			const lineHeight = fontSize * 1.2
			let maxWidth = 0
			lines.forEach((line, index) => {
				ctx.fillText(line, element.x, element.y + (index * lineHeight))
				const width = ctx.measureText(line).width
				if (width > maxWidth) maxWidth = width
			})
			if (selected) {
				const height = lines.length * lineHeight
				drawSelectionRect(vm, ctx, element.x, element.y - fontSize, maxWidth, height)
			}
		}

		ctx.restore()
	}

	globalScope.DrawingBoardRender = {
		drawElement,
		drawSelectionRect,
		drawResizeHandles
	}
})(window)
