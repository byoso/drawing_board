export type ToolId = 'select' | 'rect' | 'ellipse' | 'arrow' | 'frame' | 'text'

export interface ToolDef {
  id: ToolId
  label: string
  shortcut: string
}

export interface BoardElement {
  id: string
  type: string
  x?: number
  y?: number
  w?: number
  h?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  breaks?: number
  orthogonal?: boolean
  breakPoints?: Array<{ x: number; y: number }>
  stroke?: string
  fill?: string
  strokeWidth?: number
  strokeStyle?: string
  fontSize?: number
  text?: string
  color?: string
  frameIndex?: number
  name?: string
  [key: string]: unknown
}

export interface Schema {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  elements: BoardElement[]
}

export interface IconItem {
  id: string
  name: string
  src: string
  width: number
  height: number
}

export interface IconSet {
  id: string
  name: string
  collapsed: boolean
  icons: IconItem[]
}

export interface BoardStoreData {
  version: number
  activeSchemaId: string | null
  schemas: Schema[]
  iconSets: IconSet[]
}
