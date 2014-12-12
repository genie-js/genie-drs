var DRSFile = require('./DRSFile')

module.exports = PaletteFile

function PaletteFile(buf, file) {
  if (!(this instanceof PaletteFile)) return new PaletteFile(buf, file)

  DRSFile.call(this, buf, file)
  this.colors = []
  this.numColors = null
  this.parsed = false
}

PaletteFile.prototype = Object.create(DRSFile.prototype)

/**
 * Parses a palette file.
 * Format:
 * ```
 * "JASC-PAL"
 * 4 character version
 * amount of lines
 * palette lines: three space-separated numbers (0-255), "red green blue"
 * ```
 */
PaletteFile.prototype.parse = function () {
  if (this.parsed) return

  var colors = this.colors
    , str = this.buf.toString('ascii')
    , lines = str.split('\n')
    , i

  // lines[0] == "JASC-PAL\n"
  // lines[1] == "0100"
  this.numColors = parseInt(lines[2], 10)
  
  for (i = 0; i < this.numColors; i++) {
    colors.push(lines[i + 3].split(' ').map(function (x) { return parseInt(x, 10) }))
  }
  
  this.parsed = true
}

/**
 * Returns the colour at a given index in the palette.
 * @param {number} idx Colour index in the palette.
 * @return {Array.<number>} [r, g, b] colour array.
 */
PaletteFile.prototype.getColor = function (idx) {
  if (!this.parsed) this.parse()
  if (idx < 0 || idx >= this.colors.length) {
    throw new RangeError('Requested invalid color')
  }
  return this.colors[idx]
}

/**
 * Returns the player colour for a given player & index in the palette.
 * @param {number} idx Colour index in the palette.
 * @param {number} player The player id (1-8).
 * @return {Array.<number>} [r, g, b] colour array.
 */
PaletteFile.prototype.getPlayerColor = function (idx, player) {
  return this.getColor(idx + 16 * player)
}

/**
 * Sets the colour at a given index in the palette.
 * @param {number} idx Colour index in the palette.
 * @param {Array.<number>} color [r, g, b] colour array.
 * @return {PaletteFile}
 */
PaletteFile.prototype.setColor = function (idx, color) {
  if (!this.parsed) this.parse()
  this.colors[idx] = color
  return this
}

/**
 * Sets the colour at a given index in the palette.
 * @param {number} idx Colour index in the palette.
 * @param {number} player The player id (1-8).
 * @param {Array.<number>} color [r, g, b] colour array.
 * @return {PaletteFile}
 */
PaletteFile.prototype.setPlayerColor = function (idx, player, color) {
  return this.setColor(idx + 16 * player, color)
}

/**
 * Returns up-to-date Palette file source.
 * @return {string}
 */
PaletteFile.prototype.toString = function () {
  var str = ''
    , colors = this.colors
    , i = 0
    , l = this.colors.length
  // header
  str += 'JASC-PAL\n'
  // version
  str += '0100\n'
  // amount of colors
  str += l
  
  // colors
  for (; i < l; i++) {
    str += colors[i].join(' ') + '\n'
  }
  
  return str
}