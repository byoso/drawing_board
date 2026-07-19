;(function attachDrawingBoardStore(globalScope) {
	const STORAGE_KEY = 'drawing_board_store_v1'

	function cloneStore(store) {
		return JSON.parse(JSON.stringify(store || {}))
	}

	function load(options) {
		const {
			schemaVersion,
			fallbackStore,
			normalizeIconSet,
			ensureFrameIndexes,
			makeSchemaId
		} = options || {}

		let nextStore = cloneStore(fallbackStore)
		let hasInvalidJson = false
		const raw = localStorage.getItem(STORAGE_KEY)

		if (raw) {
			try {
				const parsed = JSON.parse(raw)
				if (parsed && Array.isArray(parsed.schemas)) {
					nextStore = {
						version: schemaVersion,
						activeSchemaId: parsed.activeSchemaId || null,
						schemas: parsed.schemas.map((schema) => ({
							id: schema.id || makeSchemaId(),
							name: schema.name || 'Untitled',
							createdAt: typeof schema.createdAt === 'number' ? schema.createdAt : Date.now(),
							updatedAt: typeof schema.updatedAt === 'number' ? schema.updatedAt : Date.now(),
							elements: Array.isArray(schema.elements) ? schema.elements : []
						})),
						iconSets: Array.isArray(parsed.iconSets)
							? parsed.iconSets.map((iconSet) => normalizeIconSet(iconSet))
							: []
					}
					nextStore.schemas.forEach((schema) => ensureFrameIndexes(schema))
				}
			} catch (error) {
				hasInvalidJson = true
			}
		}

		return {
			store: nextStore,
			hasInvalidJson
		}
	}

	function persist(options) {
		const { store, activeSchemaId, iconSets } = options || {}
		store.activeSchemaId = activeSchemaId
		store.iconSets = iconSets
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
	}

	globalScope.DrawingBoardStore = {
		load,
		persist
	}
})(window)
