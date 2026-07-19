;(function attachCommonTools(globalScope) {
	function deepClone(value) {
		return JSON.parse(JSON.stringify(value))
	}

	function handleSelectionPointerDown(vm, event, pos) {
		const resizeTarget = vm.hitResizeHandle(pos.x, pos.y)
		if (resizeTarget) {
			vm.setSingleSelection(resizeTarget.element.id)
			vm.pointerState.mode = 'resize'
			vm.pointerState.startX = pos.x
			vm.pointerState.startY = pos.y
			vm.pointerState.startElement = deepClone(resizeTarget.element)
			vm.pointerState.startElements = null
			vm.pointerState.resizeHandle = resizeTarget.handle
			vm.renderCanvas()
			return
		}

		const hit = vm.hitTest(pos.x, pos.y)
		if (hit) {
			if (event.ctrlKey || event.metaKey) {
				vm.toggleElementInSelection(hit.id)
			} else if (!vm.isElementSelected(hit.id)) {
				vm.setSingleSelection(hit.id)
			}
			vm.pointerState.mode = 'drag'
			vm.pointerState.startX = pos.x
			vm.pointerState.startY = pos.y
			vm.pointerState.startElement = null
			vm.pointerState.startElements = vm.activeSchema.elements
				.filter((element) => vm.isElementSelected(element.id))
				.reduce((acc, element) => {
					acc[element.id] = deepClone(element)
					return acc
				}, {})
			vm.pointerState.resizeHandle = null
		} else {
			vm.pointerState.mode = 'marquee'
			vm.pointerState.ctrlPressed = event.ctrlKey || event.metaKey
			vm.pointerState.initialSelection = vm.selectedElementIds.slice()
			if (!vm.pointerState.ctrlPressed) {
				vm.clearSelection()
			}
			vm.pointerState.startX = pos.x
			vm.pointerState.startY = pos.y
			vm.pointerState.startElement = null
			vm.pointerState.startElements = null
			vm.pointerState.resizeHandle = null
			vm.marqueeRect = { x: pos.x, y: pos.y, w: 0, h: 0 }
		}
		vm.renderCanvas()
	}

	function handleSelectionPointerMove(vm, pos) {
		if (vm.pointerState.mode === 'drag' && vm.selectedElementIds.length > 0) {
			if (!vm.pointerState.startElements) {
				return true
			}
			const dx = pos.x - vm.pointerState.startX
			const dy = pos.y - vm.pointerState.startY
			if (dx === 0 && dy === 0) {
				return true
			}
			if (!vm.pointerState.historyCaptured) {
				vm.pushHistoryCheckpoint()
				vm.pointerState.historyCaptured = true
			}
			vm.selectedElementIds.forEach((elementId) => {
				const target = vm.activeSchema.elements.find((element) => element.id === elementId)
				const startElement = vm.pointerState.startElements[elementId]
				if (!target || !startElement) {
					return
				}
				if (target.type === 'arrow') {
					target.x1 = startElement.x1 + dx
					target.y1 = startElement.y1 + dy
					target.x2 = startElement.x2 + dx
					target.y2 = startElement.y2 + dy
				} else {
					target.x = startElement.x + dx
					target.y = startElement.y + dy
				}
				vm.clampElementToWorld(target)
			})
			vm.markDirty()
			vm.renderCanvas()
			return true
		}

		if (vm.pointerState.mode === 'resize' && vm.selectedElementIds.length === 1) {
			const target = vm.activeSchema.elements.find((element) => element.id === vm.selectedElementIds[0])
			if (!target || !vm.pointerState.startElement || !vm.pointerState.resizeHandle) {
				return true
			}
			if (target.type !== 'rect' && target.type !== 'ellipse' && target.type !== 'arrow' && target.type !== 'icon' && target.type !== 'frame') {
				return true
			}
			if (!vm.pointerState.historyCaptured) {
				vm.pushHistoryCheckpoint()
				vm.pointerState.historyCaptured = true
			}
			vm.applyResize(target, vm.pointerState.startElement, vm.pointerState.resizeHandle, pos.x, pos.y)
			vm.clampElementToWorld(target)
			vm.markDirty()
			vm.renderCanvas()
			return true
		}

		if (vm.pointerState.mode === 'marquee') {
			const left = Math.min(vm.pointerState.startX, pos.x)
			const top = Math.min(vm.pointerState.startY, pos.y)
			const width = Math.abs(pos.x - vm.pointerState.startX)
			const height = Math.abs(pos.y - vm.pointerState.startY)
			vm.marqueeRect = { x: left, y: top, w: width, h: height }
			const ctx = vm.getCanvasContext()
			const newSelection = vm.activeSchema.elements
				.filter((element) => vm.isBoundsInsideMarquee(vm.getElementBounds(element, ctx), vm.marqueeRect))
				.map((element) => element.id)
			if (vm.pointerState.ctrlPressed) {
				vm.selectedElementIds = [
					...new Set([...vm.pointerState.initialSelection, ...newSelection])
				]
			} else {
				vm.selectedElementIds = newSelection
			}
			vm.renderCanvas()
			return true
		}

		return false
	}

	function getToolFromShortcut(key) {
		return key === 's' ? 'select' : null
	}

	globalScope.DrawingBoardCommonTools = {
		handleSelectionPointerDown,
		handleSelectionPointerMove,
		getToolFromShortcut
	}
})(window)
