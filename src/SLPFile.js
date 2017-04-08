var DRSFile = require('./DRSFile')
var PaletteFile = require('./PaletteFile')
var SLP = require('genie-slp')

module.exports = SLPFile

/**
 * @param {Buffer} buf
 * @param {Object} file
 * @extends DRSFile
 */
function SLPFile (buf, file) {
  if (!(this instanceof SLPFile)) return new SLPFile(buf, file)

  DRSFile.call(this, buf, file)
  this.frames = []
  this.bodyOffset = null
  this.slp = SLP(buf)
}

SLPFile.prototype = Object.create(DRSFile.prototype)

/**
 * Get a parsed frame.
 * @param {number} id Frame ID.
 * @return {Object} Parsed frame object.
 */
SLPFile.prototype.getFrame = function (id) {
  return this.slp.getFrame(id)
}

/**
 * Renders a frame to a buffer.
 * @param {number}  frameIdx Frame ID.
 * @param {Palette} palette  Colour Palette to use.
 * @param {Object}  opts     Options for `genie-slp`.
 * @return {Object} Object containing a Buffer of r,g,b,a values, and the size of the frame.
 */
SLPFile.prototype.renderFrame = function (frameIdx, palette, opts) {
  if (palette instanceof PaletteFile) {
    palette = palette.palette
  }
  return this.slp.renderFrame(frameIdx, palette, opts)
}
