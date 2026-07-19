;(function attachBasicTools(globalScope) {
	function uid(prefix = 'id') {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
	}

	function hexToRgba(hex, alpha) {
		const cleaned = (hex || '').replace('#', '')
		if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
			return `rgba(129, 164, 255, ${alpha})`
		}
		const r = parseInt(cleaned.slice(0, 2), 16)
		const g = parseInt(cleaned.slice(2, 4), 16)
		const b = parseInt(cleaned.slice(4, 6), 16)
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	function normalizeRect(el) {
		const x = el.w < 0 ? el.x + el.w : el.x
		const y = el.h < 0 ? el.y + el.h : el.y
		const w = Math.abs(el.w)
		const h = Math.abs(el.h)
		return { x, y, w, h }
	}

	function handleTextPointerDown(vm, pos) {
		vm.textEditor.isCreating = true
		vm.textEditor.creationPos = { x: pos.x, y: pos.y }
		vm.textEditor.text = ''
		vm.textEditor.element = null
		vm.textEditor.isOpen = true
		vm.$nextTick(() => {
			const textarea = vm.$refs.textEditorInput
			if (textarea) {
				textarea.focus()
			}
		})
	}

	function handlePointerDown(vm, pos) {
		if (vm.activeTool === 'text') {
			handleTextPointerDown(vm, pos)
			return
		}

		const base = {
			id: uid('el'),
			stroke: vm.activeColor,
			fill: hexToRgba(vm.activeColor, 0.22),
			strokeWidth: vm.getCurrentStrokeWidth(),
			strokeStyle: vm.lineStyle
		}

		if (vm.activeTool === 'rect' || vm.activeTool === 'ellipse' || vm.activeTool === 'frame') {
			if (vm.activeTool === 'frame') {
				const frameIndex = vm.getNextFrameIndex()
				vm.draftElement = {
					id: uid('el'),
					type: 'frame',
					x: pos.x,
					y: pos.y,
					w: 0,
					h: 0,
					frameIndex,
					name: vm.getDefaultFrameName(frameIndex)
				}
				vm.applyFrameStyle(vm.draftElement)
				vm.pointerState.mode = 'draw'
				vm.pointerState.startX = pos.x
				vm.pointerState.startY = pos.y
				vm.renderCanvas()
				return
			}
			vm.draftElement = {
				...base,
				type: vm.activeTool,
				x: pos.x,
				y: pos.y,
				w: 0,
				h: 0
			}
			vm.pointerState.mode = 'draw'
			vm.pointerState.startX = pos.x
			vm.pointerState.startY = pos.y
			vm.renderCanvas()
			return
		}

		if (vm.activeTool === 'arrow') {
			vm.draftElement = {
				...base,
				type: 'arrow',
				x1: pos.x,
				y1: pos.y,
				x2: pos.x,
				y2: pos.y
			}
			vm.pointerState.mode = 'draw'
			vm.renderCanvas()
		}
	}

	function handlePointerMove(vm, pos) {
		if (vm.pointerState.mode === 'draw' && vm.draftElement) {
			if (vm.draftElement.type === 'arrow') {
				vm.draftElement.x2 = pos.x
				vm.draftElement.y2 = pos.y
			} else {
				vm.draftElement.w = pos.x - vm.pointerState.startX
				vm.draftElement.h = pos.y - vm.pointerState.startY
			}
			vm.renderCanvas()
			return true
		}
		return false
	}

	function finalizeDraw(vm) {
		const element = vm.draftElement
		if (!element) {
			return
		}
		let shouldAdd = true
		if (element.type === 'arrow') {
			shouldAdd = Math.hypot(element.x2 - element.x1, element.y2 - element.y1) > 5
		} else {
			const rect = normalizeRect(element)
			shouldAdd = rect.w > 6 && rect.h > 6
		}
		if (shouldAdd) {
			vm.clampElementToWorld(element)
			vm.pushHistoryCheckpoint()
			vm.activeSchema.elements.push(element)
			vm.setSingleSelection(element.id)
			vm.markDirty()
		}
	}

	function getToolFromShortcut(key) {
		const map = {
			r: 'rect',
			e: 'ellipse',
			a: 'arrow',
			f: 'frame',
			t: 'text'
		}
		return map[key] || null
	}

	globalScope.DrawingBoardBasicTools = {
		handlePointerDown,
		handlePointerMove,
		finalizeDraw,
		getToolFromShortcut
	}
})(window)
