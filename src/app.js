const { createApp } = Vue

const DB_SCHEMA_VERSION = window.DrawingBoardConstants.SCHEMA_VERSION

createApp({
  data() {
    return {
      tools: [
        { id: 'select', label: 'Select', shortcut: 'S' },
        { id: 'rect', label: 'Rectangle', shortcut: 'R' },
        { id: 'ellipse', label: 'Ellipse', shortcut: 'E' },
        { id: 'arrow', label: 'Arrow', shortcut: 'A' },
        { id: 'frame', label: 'Frame', shortcut: 'F' },
        { id: 'text', label: 'Text', shortcut: 'T' }
      ],
      colorPalette: ['#6B8EEA', '#4FA8A6', '#6DAE6B', '#D0A15A', '#E08960', '#C481B9', '#8E91C8', '#7E8AA2'],
      activeColor: '#6B8EEA',
      lineStyle: 'solid',
      drawSize: 'small',
      sizePresets: {
        small: { strokeWidth: 2, fontSize: 18 },
        medium: { strokeWidth: 4, fontSize: 24 },
        big: { strokeWidth: 6, fontSize: 30 }
      },
      activeTool: 'select',
      store: {
        version: DB_SCHEMA_VERSION,
        activeSchemaId: null,
        schemas: [],
        iconSets: []
      },
      activeSchemaId: null,
      selectedElementIds: [],
      draftElement: null,
      marqueeRect: null,
      viewOffsetX: 0,
      viewOffsetY: 0,
      zoomScale: 1,
      iconSets: [],
      pendingIconSetId: null,
      pointerState: {
        mode: null,
        pointerId: null,
        startX: 0,
        startY: 0,
        startViewOffsetX: 0,
        startViewOffsetY: 0,
        startElement: null,
        startElements: null,
        resizeHandle: null,
        historyCaptured: false,
        ctrlPressed: false,
        initialSelection: []
      },
      isDirty: false,
      historyBySchema: {},
      maxHistoryDepth: 80,
      iconImageCache: {},
      copiedElements: [],
      isPointerInCanvas: false,
      lastCanvasPointer: { x: 0, y: 0 },
      renamingSchemaId: null,
      renameDraft: '',
      isDiagramsCollapsed: false,
      isIconSetsCollapsed: false,
      isSpacePressed: false,
      iconEditor: {
        isOpen: false,
        iconSetId: null,
        iconId: null,
        name: '',
        src: ''
      },
      textEditor: {
        isOpen: false,
        element: null,
        text: '',
        isCreating: false,
        creationPos: { x: 0, y: 0 }
      },
      toast: {
        message: '',
        type: 'info'
      }
    }
  },
  computed: {
    activeSchema() {
      return this.store.schemas.find((schema) => schema.id === this.activeSchemaId) || null
    },
    sortedSchemas() {
      return [...this.store.schemas].sort((a, b) => b.updatedAt - a.updatedAt)
    },
    zoomPercent() {
      return Math.round(this.zoomScale * 100)
    }
  },
  methods: Object.assign(
    {},
    window.DrawingBoardBaseMethods,
    window.DrawingBoardIconMethods,
    window.DrawingBoardSelectionMethods,
    window.DrawingBoardSchemaMethods,
    window.DrawingBoardExportMethods,
    window.DrawingBoardInteractionMethods
  ),
  mounted() {
    this.initStore()
    this.store.schemas.forEach((schema) => this.seedSchemaHistory(schema))
    this.$nextTick(() => {
      this.renderCanvas()
    })
    this.embedExistingRemoteIcons()
    window.addEventListener('resize', this.renderCanvas)
    window.addEventListener('keydown', this.onGlobalKeyDown)
    window.addEventListener('keyup', this.onGlobalKeyUp)
    window.addEventListener('blur', this.onWindowBlur)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.renderCanvas)
    window.removeEventListener('keydown', this.onGlobalKeyDown)
    window.removeEventListener('keyup', this.onGlobalKeyUp)
    window.removeEventListener('blur', this.onWindowBlur)
  }
}).mount('#app')
