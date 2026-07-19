;(function attachDrawingBoardFrames(globalScope) {
	function normalizeRect(el) {
		const x = el.w < 0 ? el.x + el.w : el.x
		const y = el.h < 0 ? el.y + el.h : el.y
		const w = Math.abs(el.w)
		const h = Math.abs(el.h)
		return { x, y, w, h }
	}

	function getFrameIndexValue(vm, frame) {
		const parsed = Number.parseInt(frame && frame.frameIndex, 10)
		if (!Number.isFinite(parsed) || parsed < 1) {
			return null
		}
		return parsed
	}

	function getDefaultFrameName(index) {
		return `Frame ${index}`
	}

	function getFrameDisplayName(vm, frame) {
		const index = getFrameIndexValue(vm, frame) || 1
		const name = String((frame && frame.name) || '').trim()
		return name || getDefaultFrameName(index)
	}

	function getSelectedFrameName(vm) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return ''
		}
		return getFrameDisplayName(vm, frame)
	}

	function onSelectedFrameNameChange(vm, event) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return
		}
		const index = getFrameIndexValue(vm, frame) || 1
		const nextName = String(event.target.value || '').trim()
		const resolvedName = nextName || getDefaultFrameName(index)
		if (resolvedName === getFrameDisplayName(vm, frame)) {
			return
		}
		vm.pushHistoryCheckpoint()
		frame.name = resolvedName
		event.target.value = resolvedName
		vm.markDirty()
		vm.renderCanvas()
	}

	function getFramesForSchema(vm, schema) {
		if (!schema || !Array.isArray(schema.elements)) {
			return []
		}
		return schema.elements
			.filter((element) => element.type === 'frame')
			.sort((a, b) => {
				const aIndex = getFrameIndexValue(vm, a)
				const bIndex = getFrameIndexValue(vm, b)
				const safeA = aIndex == null ? Number.MAX_SAFE_INTEGER : aIndex
				const safeB = bIndex == null ? Number.MAX_SAFE_INTEGER : bIndex
				if (safeA !== safeB) {
					return safeA - safeB
				}
				return a.id.localeCompare(b.id)
			})
	}

	function getFramesForActiveSchema(vm) {
		return getFramesForSchema(vm, vm.activeSchema)
	}

	function ensureFrameIndexes(vm, schema) {
		if (!schema || !Array.isArray(schema.elements)) {
			return
		}
		const frames = getFramesForSchema(vm, schema)
		const used = new Set()
		let next = 1
		frames.forEach((frame) => {
			let idx = getFrameIndexValue(vm, frame)
			if (idx == null || used.has(idx)) {
				while (used.has(next)) {
					next += 1
				}
				idx = next
			}
			frame.frameIndex = idx
			if (!String(frame.name || '').trim()) {
				frame.name = getDefaultFrameName(idx)
			}
			applyFrameStyle(vm, frame)
			used.add(idx)
			if (idx >= next) {
				next = idx + 1
			}
		})
	}

	function getNextFrameIndex(vm, schema) {
		const target = schema || vm.activeSchema
		const frames = getFramesForSchema(vm, target)
		if (frames.length === 0) {
			return 1
		}
		return Math.max(...frames.map((frame) => getFrameIndexValue(vm, frame) || 0)) + 1
	}

	function getSelectedFrame(vm) {
		if (!vm.activeSchema || vm.selectedElementIds.length !== 1) {
			return null
		}
		const frame = vm.activeSchema.elements.find((element) => element.id === vm.selectedElementIds[0])
		if (!frame || frame.type !== 'frame') {
			return null
		}
		return frame
	}

	function getSelectedFrameExportBounds(vm, showErrorToast = true) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			if (showErrorToast) {
				vm.showToast('Select a frame first.', 'error')
			}
			return null
		}
		const bounds = normalizeRect(frame)
		if (bounds.w <= 0 || bounds.h <= 0) {
			if (showErrorToast) {
				vm.showToast('Frame has invalid dimensions.', 'error')
			}
			return null
		}
		return bounds
	}

	function getSelectedFrameExportFileBase(vm) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return 'frame'
		}
		const raw = getFrameDisplayName(vm, frame).replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
		return raw || `frame_${getFrameIndexValue(vm, frame) || 1}`
	}

	function canShiftSelectedFrameIndex(vm, delta) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return false
		}
		const total = getFramesForActiveSchema(vm).length
		if (total <= 1) {
			return false
		}
		const current = getFrameIndexValue(vm, frame) || 1
		const next = current + delta
		return next >= 1 && next <= total
	}

	function setSelectedFrameIndex(vm, nextIndex) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return
		}
		const frames = getFramesForActiveSchema(vm)
		const total = frames.length
		if (total === 0) {
			return
		}
		const current = getFrameIndexValue(vm, frame) || 1
		const targetIndex = vm.clamp(nextIndex, 1, total)
		if (targetIndex === current) {
			return
		}
		const targetFrame = frames.find((item) => item.id !== frame.id && (getFrameIndexValue(vm, item) || 1) === targetIndex)
		vm.pushHistoryCheckpoint()
		frame.frameIndex = targetIndex
		if (targetFrame) {
			targetFrame.frameIndex = current
		}
		vm.markDirty()
		vm.renderCanvas()
	}

	function shiftSelectedFrameIndex(vm, delta) {
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return
		}
		const current = getFrameIndexValue(vm, frame) || 1
		setSelectedFrameIndex(vm, current + delta)
	}

	function onSelectedFrameIndexInputChange(vm, event) {
		const value = Number.parseInt(event.target.value, 10)
		const frame = getSelectedFrame(vm)
		if (!frame) {
			return
		}
		if (Number.isNaN(value)) {
			event.target.value = String(getFrameIndexValue(vm, frame) || 1)
			return
		}
		setSelectedFrameIndex(vm, value)
	}

	function focusFrame(vm, frameId) {
		if (!vm.activeSchema) {
			return
		}
		const frame = vm.activeSchema.elements.find((element) => element.id === frameId && element.type === 'frame')
		if (!frame) {
			return
		}
		const canvas = vm.$refs.canvas
		if (!canvas) {
			return
		}

		const bounds = normalizeRect(frame)
		const rect = canvas.getBoundingClientRect()
		const viewportWidth = Math.max(1, rect.width)
		const viewportHeight = Math.max(1, rect.height)
		const padding = 24
		const fitZoomX = Math.max(0.1, (viewportWidth - (padding * 2)) / Math.max(1, bounds.w))
		const fitZoomY = Math.max(0.1, (viewportHeight - (padding * 2)) / Math.max(1, bounds.h))
		const fitZoom = Math.min(fitZoomX, fitZoomY)
		const targetZoom = vm.clamp(Math.min(1, fitZoom), 0.1, 4)

		vm.zoomScale = targetZoom
		const centerX = bounds.x + (bounds.w / 2)
		const centerY = bounds.y + (bounds.h / 2)
		const clampedView = vm.clampViewOffset(
			centerX - (viewportWidth / (2 * targetZoom)),
			centerY - (viewportHeight / (2 * targetZoom)),
			targetZoom
		)
		vm.viewOffsetX = clampedView.x
		vm.viewOffsetY = clampedView.y
		vm.activeTool = 'select'
		vm.setSingleSelection(frame.id)
		vm.renderCanvas()
	}

	function applyFrameStyle(vm, frame) {
		if (!frame) {
			return
		}
		frame.stroke = FRAME_STYLE.stroke
		frame.strokeStyle = FRAME_STYLE.strokeStyle
		frame.strokeWidth = FRAME_STYLE.strokeWidth
		frame.fill = FRAME_STYLE.fill
	}

	async function saveSelectedFrameAsPng(vm) {
		const bounds = getSelectedFrameExportBounds(vm)
		if (!bounds) {
			return
		}
		const blob = await vm.buildSchemaPngBlob(bounds)
		if (!blob) {
			return
		}
		vm.triggerBlobDownload(blob, `${getSelectedFrameExportFileBase(vm)}.png`)
		vm.showToast('Frame PNG downloaded.')
	}

	async function copySelectedFramePngToClipboard(vm) {
		const bounds = getSelectedFrameExportBounds(vm)
		if (!bounds) {
			return
		}
		const blob = await vm.buildSchemaPngBlob(bounds)
		if (!blob) {
			return
		}
		const capabilities = vm.getBrowserCapabilities()
		if (!capabilities.clipboardWriteImage || !capabilities.secureContext) {
			vm.triggerBlobDownload(blob, `${getSelectedFrameExportFileBase(vm)}.png`)
			vm.showToast('Clipboard image API unavailable here. Frame PNG downloaded instead.', 'warning')
			return
		}
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
			vm.showToast('Frame PNG copied to clipboard.')
		} catch (error) {
			vm.triggerBlobDownload(blob, `${getSelectedFrameExportFileBase(vm)}.png`)
			vm.showToast('Clipboard copy failed. Frame PNG downloaded instead.', 'warning')
		}
	}

	function saveSelectedFrameAsSvg(vm) {
		const bounds = getSelectedFrameExportBounds(vm)
		if (!bounds) {
			return
		}
		const markup = vm.buildCroppedSchemaSvgString(bounds)
		if (!markup) {
			return
		}
		const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
		vm.triggerBlobDownload(blob, `${getSelectedFrameExportFileBase(vm)}.svg`)
		vm.showToast('Frame SVG downloaded.')
	}

	async function copySelectedFrameSvgToClipboard(vm) {
		const bounds = getSelectedFrameExportBounds(vm)
		if (!bounds) {
			return
		}
		const markup = vm.buildCroppedSchemaSvgString(bounds)
		if (!markup) {
			return
		}
		const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })

		if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write || !window.isSecureContext) {
			vm.triggerBlobDownload(blob, `${getSelectedFrameExportFileBase(vm)}.svg`)
			vm.showToast('Clipboard SVG API unavailable here. Frame SVG downloaded instead.', 'warning')
			return
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					'image/svg+xml': blob,
					'text/plain': new Blob([markup], { type: 'text/plain;charset=utf-8' })
				})
			])
			vm.showToast('Frame SVG copied to clipboard.')
		} catch (error) {
			vm.triggerBlobDownload(blob, `${getSelectedFrameExportFileBase(vm)}.svg`)
			vm.showToast('Clipboard copy failed. Frame SVG downloaded instead.', 'warning')
		}
	}

	globalScope.DrawingBoardFrames = {
		getFrameIndexValue,
		getDefaultFrameName,
		getFrameDisplayName,
		getSelectedFrameName,
		onSelectedFrameNameChange,
		getFramesForSchema,
		getFramesForActiveSchema,
		ensureFrameIndexes,
		getNextFrameIndex,
		getSelectedFrame,
		getSelectedFrameExportBounds,
		getSelectedFrameExportFileBase,
		canShiftSelectedFrameIndex,
		setSelectedFrameIndex,
		shiftSelectedFrameIndex,
		onSelectedFrameIndexInputChange,
		focusFrame,
		applyFrameStyle,
		saveSelectedFrameAsPng,
		copySelectedFramePngToClipboard,
		saveSelectedFrameAsSvg,
		copySelectedFrameSvgToClipboard
	}
})(window)
