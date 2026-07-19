const SCHEMA_VERSION = 1
const RECT_CORNER_RADIUS = 8
const WORLD_WIDTH = 15000
const WORLD_HEIGHT = 10000
const FRAME_STYLE = Object.freeze({
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
    yOffset: -6
  })
})

window.DrawingBoardConstants = {
  SCHEMA_VERSION,
  RECT_CORNER_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  FRAME_STYLE
}
