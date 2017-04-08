var DRSFile = require('./DRSFile')
var Palette = require('jascpal')

module.exports = PaletteFile

function PaletteFile (buf, file) {
  if (!(this instanceof PaletteFile)) return new PaletteFile(buf, file)

  DRSFile.call(this, buf, file)
  this.palette = Palette(buf)
}

PaletteFile.prototype = Object.create(DRSFile.prototype)

/**
 * Returns the colour at a given index in the palette.
 * @param {number} idx Colour index in the palette.
 * @return {Array.<number>} [r, g, b] colour array.
 */
PaletteFile.prototype.getColor = function (idx) {
  return this.palette.getColor(idx)
}

/**
 * Sets the colour at a given index in the palette.
 * @param {number} idx Colour index in the palette.
 * @param {Array.<number>} color [r, g, b] colour array.
 * @return {PaletteFile}
 */
PaletteFile.prototype.setColor = function (idx, color) {
  this.palette.setColor(idx, color)
  return this
}

/**
 * Returns up-to-date Palette file source.
 * @return {string}
 */
PaletteFile.prototype.toString = function () {
  return this.palette.toString()
}
