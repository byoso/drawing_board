;(function attachDrawingBoardSchemaMethods(globalScope) {
  const { SCHEMA_VERSION } = globalScope.DrawingBoardConstants
  const { uid, deepClone } = globalScope.DrawingBoardUtils
  const methods = {
      initStore() {
        const { store, hasInvalidJson } = window.DrawingBoardStore.load({
          schemaVersion: SCHEMA_VERSION,
          fallbackStore: this.store,
          normalizeIconSet: (iconSet) => this.normalizeIconSet(iconSet),
          ensureFrameIndexes: (schema) => this.ensureFrameIndexes(schema),
          makeSchemaId: () => uid('schema')
        })
        this.store = store
        this.iconSets = this.store.iconSets

        if (hasInvalidJson) {
          this.showToast('Invalid local store detected, resetting it.', 'error')
        }

        if (this.store.schemas.length === 0) {
          this.store.schemas.push(this.makeEmptySchema('First diagram'))
        }

        if (!this.store.schemas.some((schema) => schema.id === this.store.activeSchemaId)) {
          this.store.activeSchemaId = this.store.schemas[0].id
        }

        this.activeSchemaId = this.store.activeSchemaId
        this.persistStore()
      },
      makeEmptySchema(name) {
        const now = Date.now()
        return {
          id: uid('schema'),
          name,
          createdAt: now,
          updatedAt: now,
          elements: []
        }
      },
      persistStore() {
        window.DrawingBoardStore.persist({
          store: this.store,
          activeSchemaId: this.activeSchemaId,
          iconSets: this.iconSets
        })
      },
      ensureSchemaHistory(schemaId) {
        if (!schemaId) {
          return null
        }
        if (!this.historyBySchema[schemaId]) {
          this.historyBySchema[schemaId] = {
            past: [],
            future: []
          }
        }
        return this.historyBySchema[schemaId]
      },
      areSnapshotsEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b)
      },
      seedSchemaHistory(schema) {
        if (!schema) {
          return
        }
        this.historyBySchema[schema.id] = {
          past: [deepClone(schema.elements || [])],
          future: []
        }
      },
      pushHistoryCheckpoint() {
        if (!this.activeSchema) {
          return
        }
        const history = this.ensureSchemaHistory(this.activeSchema.id)
        const snapshot = deepClone(this.activeSchema.elements)
        const last = history.past.length > 0 ? history.past[history.past.length - 1] : null
        if (!last || !this.areSnapshotsEqual(last, snapshot)) {
          history.past.push(snapshot)
          if (history.past.length > this.maxHistoryDepth) {
            history.past.shift()
          }
        }
        history.future = []
      },
      undo() {
        if (!this.activeSchema) {
          return
        }
        const history = this.ensureSchemaHistory(this.activeSchema.id)
        const current = deepClone(this.activeSchema.elements)
        let previous = null
        while (history.past.length > 0) {
          const candidate = history.past.pop()
          if (!this.areSnapshotsEqual(candidate, current)) {
            previous = candidate
            break
          }
        }
        if (!previous) {
          return
        }
        history.future.push(current)
        if (history.future.length > this.maxHistoryDepth) {
          history.future.shift()
        }
        this.activeSchema.elements = deepClone(previous)
        this.clearSelection()
        this.isDirty = true
        this.renderCanvas()
      },
      redo() {
        if (!this.activeSchema) {
          return
        }
        const history = this.ensureSchemaHistory(this.activeSchema.id)
        if (history.future.length === 0) {
          return
        }
        const current = deepClone(this.activeSchema.elements)
        const next = history.future.pop()
        history.past.push(current)
        if (history.past.length > this.maxHistoryDepth) {
          history.past.shift()
        }
        this.activeSchema.elements = deepClone(next)
        this.clearSelection()
        this.isDirty = true
        this.renderCanvas()
      },
      confirmDiscardUnsaved(actionLabel = 'continue') {
        if (!this.isDirty) {
          return true
        }
        return confirm(`You have unsaved changes. Discard them and ${actionLabel}?`)
      },
      markDirty() {
        this.isDirty = true
      },
      saveCurrentSchema(showToast = true) {
        if (!this.activeSchema) {
          return
        }
        this.activeSchema.updatedAt = Date.now()
        this.isDirty = false
        this.persistStore()
        if (showToast) {
          this.showToast('Diagram saved.')
        }
      },
      createSchema() {
        if (!this.confirmDiscardUnsaved('create a new diagram')) {
          return
        }
        const name = `Diagram ${this.store.schemas.length + 1}`
        const schema = this.makeEmptySchema(name)
        this.store.schemas.push(schema)
        this.seedSchemaHistory(schema)
        this.activeSchemaId = schema.id
        this.clearSelection()
        this.isDirty = false
        this.persistStore()
        this.renderCanvas()
      },
      activateSchema(schemaId) {
        if (schemaId === this.activeSchemaId) {
          return
        }
        if (!this.confirmDiscardUnsaved('switch diagrams')) {
          return
        }
        this.activeSchemaId = schemaId
        this.clearSelection()
        this.isDirty = false
        this.persistStore()
        this.renderCanvas()
      },
      startRename(schema) {
        this.renamingSchemaId = schema.id
        this.renameDraft = schema.name
      },
      commitRename(schemaId) {
        const schema = this.store.schemas.find((item) => item.id === schemaId)
        if (!schema) {
          this.renamingSchemaId = null
          return
        }
        const nextName = this.renameDraft.trim()
        if (nextName) {
          schema.name = nextName
          schema.updatedAt = Date.now()
          this.persistStore()
        }
        this.renamingSchemaId = null
      },
      deleteSchema(schemaId) {
        const schema = this.store.schemas.find((item) => item.id === schemaId)
        if (!schema) {
          return
        }
        if (!confirm(`Delete "${schema.name}"?`)) {
          return
        }
        this.store.schemas = this.store.schemas.filter((item) => item.id !== schemaId)
        delete this.historyBySchema[schemaId]
        if (this.store.schemas.length === 0) {
          const fallback = this.makeEmptySchema('First diagram')
          this.store.schemas.push(fallback)
          this.seedSchemaHistory(fallback)
        }
        if (this.activeSchemaId === schemaId) {
          this.activeSchemaId = this.store.schemas[0].id
          this.clearSelection()
        }
        this.isDirty = false
        this.persistStore()
        this.renderCanvas()
      },
      openImportPicker() {
        this.$refs.importInput.value = ''
        this.$refs.importInput.click()
      },
      async onImportFileChange(event) {
        const file = event.target.files && event.target.files[0]
        if (!file) {
          return
        }
        try {
          const content = await file.text()
          const imported = JSON.parse(content)
          this.importSchemaObject(imported)
        } catch (error) {
          this.showToast('JSON import failed.', 'error')
        }
      },
      importSchemaObject(payload) {
        if (!payload || payload.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.elements)) {
          this.showToast('Invalid JSON format or unsupported version.', 'error')
          return
        }
        if (!this.confirmDiscardUnsaved('import this diagram')) {
          return
        }
        const schema = this.makeEmptySchema(payload.name || `Import ${new Date().toLocaleString('en-GB')}`)
        schema.elements = payload.elements.map((element) => ({ ...element, id: element.id || uid('el') }))
        this.ensureFrameIndexes(schema)
        schema.updatedAt = Date.now()
        this.store.schemas.push(schema)
        this.seedSchemaHistory(schema)
        this.activeSchemaId = schema.id
        this.clearSelection()
        this.isDirty = false
        this.persistStore()
        this.renderCanvas()
        this.showToast('Diagram imported.')
      },
      exportCurrentSchema() {
        if (!this.activeSchema) {
          return
        }
        const payload = {
          schemaVersion: SCHEMA_VERSION,
          exportedAt: Date.now(),
          name: this.activeSchema.name,
          elements: this.activeSchema.elements
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        const safeName = this.activeSchema.name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase()
        anchor.href = url
        anchor.download = `${safeName || 'schema'}.json`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
        this.showToast('JSON export completed.')
      },
  }
  globalScope.DrawingBoardSchemaMethods = methods
})(window)
