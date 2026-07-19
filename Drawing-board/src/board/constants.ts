export const SCHEMA_VERSION = 1
export const STORE_KEY = 'drawing_board_store_v1'

export const RECT_CORNER_RADIUS = 8
export const WORLD_WIDTH = 15000
export const WORLD_HEIGHT = 10000

export const FRAME_STYLE = Object.freeze({
  stroke: '#ff8a00',
  strokeWidth: 2,
  strokeStyle: 'solid',
  fill: 'rgba(0,0,0,0)',
  dashArray: [10, 7],
  title: Object.freeze({
    fontSize: 24,
    fontWeight: 700,
    fontFamily: 'Sora',
    xOffset: 10,
    yOffset: -6,
  }),
})
