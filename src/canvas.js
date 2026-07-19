;(function attachDrawingBoardCanvas(globalScope) {
	function uid(prefix = 'id') {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
	}


	function getCanvasContext(vm) {
		const canvas = vm.$refs.canvas
		return canvas ? canvas.getContext('2d') : null
	}

	function getCanvasPosition(vm, event) {
		const canvas = vm.$refs.canvas
		const rect = canvas.getBoundingClientRect()
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		}
	}

	function getPointerPosition(vm, event) {
		const p = getCanvasPosition(vm, event)
		return vm.clampPointToWorld({
			x: (p.x / vm.zoomScale) + vm.viewOffsetX,
			y: (p.y / vm.zoomScale) + vm.viewOffsetY
		})
	}

	function onCanvasWheel(vm, event) {
		if (!vm.isPointerInCanvas) {
			return
		}
		const oldZoom = vm.zoomScale
		const currentPercent = Math.round(oldZoom * 100)
		const direction = event.deltaY < 0 ? 1 : -1
		const nextPercent = Math.min(400, Math.max(10, currentPercent + (direction * 10)))
		const nextZoom = nextPercent / 100
		if (nextZoom === oldZoom) {
			return
		}
		const canvasPos = getCanvasPosition(vm, event)
		const worldXBefore = (canvasPos.x / oldZoom) + vm.viewOffsetX
		const worldYBefore = (canvasPos.y / oldZoom) + vm.viewOffsetY
		vm.zoomScale = nextZoom
		const clampedView = vm.clampViewOffset(
			worldXBefore - (canvasPos.x / nextZoom),
			worldYBefore - (canvasPos.y / nextZoom),
			nextZoom
		)
		vm.viewOffsetX = clampedView.x
		vm.viewOffsetY = clampedView.y
		updateCanvasPointerPosition(vm, event)
		vm.renderCanvas()
	}

	function resetZoomView(vm) {
		vm.zoomScale = 1

		if (!vm.activeSchema || vm.activeSchema.elements.length === 0) {
			vm.viewOffsetX = 0
			vm.viewOffsetY = 0
			vm.renderCanvas()
			return
		}

		const ctx = vm.getCanvasContext()
		const entries = vm.activeSchema.elements
			.map((element) => ({ element, bounds: vm.getElementBounds(element, ctx) }))
			.filter((entry) => Boolean(entry.bounds))

		if (entries.length === 0) {
			vm.viewOffsetX = 0
			vm.viewOffsetY = 0
			vm.renderCanvas()
			return
		}

		entries.sort((a, b) => {
			if (a.bounds.x !== b.bounds.x) {
				return a.bounds.x - b.bounds.x
			}
			return a.bounds.y - b.bounds.y
		})

		const target = entries[0].bounds
		const canvas = vm.$refs.canvas
		const rect = canvas.getBoundingClientRect()
		const viewportWidth = Math.max(1, rect.width)
		const viewportHeight = Math.max(1, rect.height)
		const targetCenterX = target.x + (target.w / 2)
		const targetCenterY = target.y + (target.h / 2)

		const clampedView = vm.clampViewOffset(
			targetCenterX - (viewportWidth / 2),
			targetCenterY - (viewportHeight / 2),
			vm.zoomScale
		)
		vm.viewOffsetX = clampedView.x
		vm.viewOffsetY = clampedView.y
		vm.renderCanvas()
	}

	function updateCanvasPointerPosition(vm, event) {
		if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
			return
		}
		vm.lastCanvasPointer = getPointerPosition(vm, event)
	}

	function onCanvasPointerEnter(vm, event) {
		vm.isPointerInCanvas = true
		updateCanvasPointerPosition(vm, event)
	}

	function onCanvasPointerMove(vm, event) {
		vm.isPointerInCanvas = true
		updateCanvasPointerPosition(vm, event)
	}

	function onCanvasPointerLeave(vm) {
		vm.isPointerInCanvas = false
	}

	function hitTextAt(vm, x, y) {
		const ctx = vm.getCanvasContext()
		if (!ctx || !vm.activeSchema) {
			return null
		}
		for (let i = vm.activeSchema.elements.length - 1; i >= 0; i -= 1) {
			const element = vm.activeSchema.elements[i]
			if (element.type !== 'text') {
				continue
			}
			ctx.save()
			ctx.font = `${element.fontSize || 18}px Space Grotesk`
			const width = ctx.measureText(element.text || '').width
			ctx.restore()
			const height = element.fontSize || 18
			if (x >= element.x && x <= element.x + width && y <= element.y && y >= element.y - height) {
				return element
			}
		}
		return null
	}

	function onCanvasDoubleClick(vm, event) {
		if (vm.activeTool !== 'select') {
			return
		}
		const pos = getPointerPosition(vm, event)
		const textElement = hitTextAt(vm, pos.x, pos.y)
		if (!textElement) {
			return
		}
		vm.textEditor.element = textElement
		vm.textEditor.text = textElement.text || ''
		vm.textEditor.isCreating = false
		vm.textEditor.isOpen = true
		vm.setSingleSelection(textElement.id)
		vm.$nextTick(() => {
			const textarea = vm.$refs.textEditorInput
			if (textarea) {
				textarea.focus()
				textarea.select()
			}
		})
	}

	async function onCanvasDrop(vm, event) {
		const raw = (event.dataTransfer && event.dataTransfer.getData('application/json'))
			|| (event.dataTransfer && event.dataTransfer.getData('text/plain'))
		if (!raw) {
			return
		}
		let payload = null
		try {
			payload = JSON.parse(raw)
		} catch (error) {
			return
		}
		if (!payload || payload.kind !== 'icon') {
			return
		}
		const iconSet = vm.iconSets.find((item) => item.id === payload.iconSetId)
		const icon = iconSet && iconSet.icons.find((item) => item.id === payload.iconId)
		if (!icon) {
			return
		}
		const pos = getPointerPosition(vm, event)
		const fit = vm.fitSizeWithinLimit(icon.width, icon.height, 128)
		const element = {
			id: uid('el'),
			type: 'icon',
			x: pos.x - fit.width / 2,
			y: pos.y - fit.height / 2,
			w: fit.width,
			h: fit.height,
			src: icon.src,
			name: icon.name,
			strokeWidth: vm.getCurrentStrokeWidth(),
			strokeStyle: vm.lineStyle
		}
		vm.clampElementToWorld(element)
		vm.pushHistoryCheckpoint()
		vm.activeSchema.elements.push(element)
		vm.setSingleSelection(element.id)
		vm.markDirty()
		vm.renderCanvas()
	}

	function clampViewOffset(vm, nextX, nextY, zoom) {
		const z = zoom == null ? vm.zoomScale : zoom
		const canvas = vm.$refs.canvas
		if (!canvas) {
			return {
				x: Math.max(0, nextX),
				y: Math.max(0, nextY)
			}
		}
		const rect = canvas.getBoundingClientRect()
		const viewportWorldWidth = rect.width / z
		const viewportWorldHeight = rect.height / z
		const maxOffsetX = Math.max(0, WORLD_WIDTH - viewportWorldWidth)
		const maxOffsetY = Math.max(0, WORLD_HEIGHT - viewportWorldHeight)
		return {
			x: vm.clamp(nextX, 0, maxOffsetX),
			y: vm.clamp(nextY, 0, maxOffsetY)
		}
	}

	function drawElement(vm, ctx, element, selected = false) {
		return window.DrawingBoardRender.drawElement(vm, ctx, element, selected)
	}

	function drawSelectionRect(vm, ctx, x, y, w, h) {
		return window.DrawingBoardRender.drawSelectionRect(vm, ctx, x, y, w, h)
	}

	function drawResizeHandles(vm, ctx, element) {
		return window.DrawingBoardRender.drawResizeHandles(vm, ctx, element)
	}

	function renderCanvas(vm) {
		const canvas = vm.$refs.canvas
		const ctx = vm.getCanvasContext()
		if (!canvas || !ctx) {
			return
		}

		const rect = canvas.getBoundingClientRect()
		const dpr = window.devicePixelRatio || 1
		const width = Math.max(300, Math.floor(rect.width))
		const height = Math.max(250, Math.floor(rect.height))
		canvas.width = Math.floor(width * dpr)
		canvas.height = Math.floor(height * dpr)

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.clearRect(0, 0, width, height)

		ctx.fillStyle = '#fde8ef'
		ctx.fillRect(0, 0, width, height)

		const worldScreenX = -vm.viewOffsetX * vm.zoomScale
		const worldScreenY = -vm.viewOffsetY * vm.zoomScale
		const worldScreenW = WORLD_WIDTH * vm.zoomScale
		const worldScreenH = WORLD_HEIGHT * vm.zoomScale
		const visibleWorldX = Math.max(0, worldScreenX)
		const visibleWorldY = Math.max(0, worldScreenY)
		const visibleWorldW = Math.min(width, worldScreenX + worldScreenW) - visibleWorldX
		const visibleWorldH = Math.min(height, worldScreenY + worldScreenH) - visibleWorldY

		if (visibleWorldW > 0 && visibleWorldH > 0) {
			ctx.fillStyle = '#f8fbff'
			ctx.fillRect(visibleWorldX, visibleWorldY, visibleWorldW, visibleWorldH)

			ctx.save()
			ctx.beginPath()
			ctx.rect(visibleWorldX, visibleWorldY, visibleWorldW, visibleWorldH)
			ctx.clip()

			ctx.strokeStyle = '#e9eef8'
			ctx.lineWidth = 1
			const grid = 20
			const scaledGrid = grid * vm.zoomScale
			const startX = -((((vm.viewOffsetX * vm.zoomScale) % scaledGrid) + scaledGrid) % scaledGrid)
			const startY = -((((vm.viewOffsetY * vm.zoomScale) % scaledGrid) + scaledGrid) % scaledGrid)

			for (let x = startX; x < width; x += scaledGrid) {
				ctx.beginPath()
				ctx.moveTo(x, 0)
				ctx.lineTo(x, height)
				ctx.stroke()
			}
			for (let y = startY; y < height; y += scaledGrid) {
				ctx.beginPath()
				ctx.moveTo(0, y)
				ctx.lineTo(width, y)
				ctx.stroke()
			}

			ctx.restore()
		}

		ctx.save()
		ctx.scale(vm.zoomScale, vm.zoomScale)
		ctx.translate(-vm.viewOffsetX, -vm.viewOffsetY)

		if (vm.activeSchema) {
			vm.activeSchema.elements.forEach((element) => {
				drawElement(vm, ctx, element, vm.isElementSelected(element.id))
				if (vm.selectedElementIds.length === 1 && vm.isElementSelected(element.id) && (element.type === 'rect' || element.type === 'ellipse' || element.type === 'arrow' || element.type === 'icon' || element.type === 'frame')) {
					drawResizeHandles(vm, ctx, element)
				}
			})
		}

		if (vm.draftElement) {
			drawElement(vm, ctx, vm.draftElement, false)
		}

		if (vm.marqueeRect) {
			ctx.save()
			ctx.fillStyle = '#2c79f226'
			ctx.strokeStyle = '#2c79f2'
			ctx.lineWidth = 1
			ctx.setLineDash([5, 4])
			ctx.fillRect(vm.marqueeRect.x, vm.marqueeRect.y, vm.marqueeRect.w, vm.marqueeRect.h)
			ctx.strokeRect(vm.marqueeRect.x, vm.marqueeRect.y, vm.marqueeRect.w, vm.marqueeRect.h)
			ctx.restore()
		}

		ctx.restore()
	}

	globalScope.DrawingBoardCanvas = {
		getCanvasContext,
		getCanvasPosition,
		getPointerPosition,
		onCanvasWheel,
		resetZoomView,
		updateCanvasPointerPosition,
		onCanvasPointerEnter,
		onCanvasPointerMove,
		onCanvasPointerLeave,
		hitTextAt,
		onCanvasDoubleClick,
		onCanvasDrop,
		clampViewOffset,
		drawElement,
		drawSelectionRect,
		drawResizeHandles,
		renderCanvas
	}
})(window)
