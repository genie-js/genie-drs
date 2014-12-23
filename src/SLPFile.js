var DRSFile = require('./DRSFile')
  , Struct = require('awestruct')

var t = Struct.types

module.exports = SLPFile

// SLP commands
var SLP_END_OF_ROW = 0x0f
  , SLP_COLOR_LIST = 0x00
  , SLP_COLOR_LIST_EX = 0x02
  , SLP_COLOR_LIST_PLAYER = 0x06
  , SLP_SKIP = 0x01
  , SLP_SKIP_EX = 0x03
  , SLP_FILL = 0x07
  , SLP_FILL_PLAYER = 0x0a
  , SLP_SHADOW = 0x0b
  , SLP_EXTENDED = 0x0e
  , SLP_EX_OUTLINE1 = 0x40
  , SLP_EX_FILL_OUTLINE1 = 0x50
  , SLP_EX_OUTLINE2 = 0x60
  , SLP_EX_FILL_OUTLINE2 = 0x70

// Render commands
var RENDER_NEXTLINE = 0x00
  , RENDER_COLOR = 0x01
  , RENDER_SKIP = 0x02
  , RENDER_PLAYER_COLOR = 0x03
  , RENDER_SHADOW = 0x04
  , RENDER_OUTLINE = 0x05
  , RENDER_FILL = 0x06
  , RENDER_PLAYER_FILL = 0x07

// SLP Header
var headerStruct = Struct({
  version: t.char(4)
, numFrames: t.int32
, comment: t.char(24)

, frames: t.array('numFrames', Struct({
    cmdTableOffset: t.uint32
  , outlineTableOffset: t.uint32
  , paletteOffset: t.uint32
  , properties: t.uint32

  , width: t.int32
  , height: t.int32
  , hotspot: Struct({
      x: t.int32
    , y: t.int32
    })
  }))
})

/**
 * @param {Buffer} buf
 * @param {Object} file
 * @extends DRSFile
 */
function SLPFile(buf, file) {
  if (!(this instanceof SLPFile)) return new SLPFile(buf, file)

  DRSFile.call(this, buf, file)
  this.frames = []
  this.bodyOffset = null
}

SLPFile.prototype = Object.create(DRSFile.prototype)

/**
 * Parses the .SLP header.
 */
SLPFile.prototype.parseHeader = function () {
  var offset = 0
    , frame
    , buf = this.buf

  var header = headerStruct(buf)
  this.version = header.version
  this.numFrames = header.numFrames
  this.comment = header.comment
  this.frames = header.frames

  this.bodyOffset = /* header */ 32 + /* frames */ 32 * header.numFrames
}

/**
 * Parses a frame.
 * @param {number} id Frame ID.
 * @return {Object} Frame with added `.outlines` and `.commands` properties.
 */
SLPFile.prototype.parseFrame = function (id) {
  // parse header first
  if (this.bodyOffset === null) {
    this.parseHeader()
  }

  var frame = this.frames[id]
    , offset = frame.outlineTableOffset
    , height = frame.height
    , buf = this.buf
    , i
    , left
    , right
    , outlines = []

  var orNext = function (x) { return x ? x : buf[++offset] }

  for (i = 0; i < height; i++) {
    left = buf.readInt16LE(offset)
    right = buf.readInt16LE(offset + 2)
    outlines.push({ left: left, right: right })
    offset += 4
  }

  offset = frame.cmdTableOffset + frame.height * 4
  var y = 0
    , cmd
    , commands = []
    , pxCount

  while (y < height) {
    cmd = buf[offset]
    lowNibble = cmd & 0x0f
    highNibble = cmd & 0xf0
    lowBits = cmd & 0x03 // 0b00…0011

    if (lowNibble === SLP_END_OF_ROW) {
      commands.push({ command: RENDER_NEXTLINE })
      y++
    }
    else if (lowBits === SLP_COLOR_LIST) {
      pxCount = cmd >> 2
      while (pxCount--) {
        offset++
        commands.push({ command: RENDER_COLOR, arg: /* color */ buf[offset] })
      }
    }
    else if (lowBits === SLP_SKIP) {
      pxCount = orNext(cmd >> 2)
      commands.push({ command: RENDER_SKIP, arg: pxCount })
    }
    else if (lowNibble === SLP_COLOR_LIST_EX) {
      offset++
      pxCount = (highNibble << 4) + buf[offset]
      while (pxCount--) {
        offset++
        commands.push({ command: RENDER_COLOR, arg: /* color */ buf[offset] })
      }
    }
    else if (lowNibble === SLP_SKIP_EX) {
      offset++
      pxCount = (highNibble << 4) + buf[offset]
      commands.push({ command: RENDER_SKIP, arg: pxCount })
    }
    else if (lowNibble === SLP_COLOR_LIST_PLAYER) {
      pxCount = orNext(cmd >> 4)
      while (pxCount--) {
        offset++
        commands.push({ command: RENDER_PLAYER_COLOR, arg: buf[offset] })
      }
    }
    else if (lowNibble === SLP_FILL) {
      pxCount = orNext(cmd >> 4)
      offset++
      commands.push({ command: RENDER_FILL, arg: { pxCount: pxCount, color: buf[offset] } })
    }
    else if (lowNibble === SLP_FILL_PLAYER) {
      pxCount = orNext(cmd >> 4)
      offset++
      commands.push({ command: RENDER_PLAYER_FILL, arg: { pxCount: pxCount, color: buf[offset] } })
    }
    else if (lowNibble === SLP_SHADOW) {
      pxCount = orNext(cmd >> 4)
      commands.push({ command: RENDER_SHADOW, arg: pxCount })
    }
    else if (lowNibble === SLP_EXTENDED) {
      if (highNibble === SLP_EX_OUTLINE1) {
        commands.push({ command: RENDER_OUTLINE, arg: 1 })
      }
      else if (highNibble === SLP_EX_OUTLINE2) {
        commands.push({ command: RENDER_OUTLINE, arg: 2 })
      }
      else if (highNibble === SLP_EX_FILL_OUTLINE1) {
        offset++
        pxCount = buf[offset]
        while (pxCount--) {
          commands.push({ command: RENDER_OUTLINE, arg: 1 })
        }
      }
      else if (highNibble === SLP_EX_FILL_OUTLINE2) {
        offset++
        pxCount = buf[offset]
        while (pxCount--) {
          commands.push({ command: RENDER_OUTLINE, arg: 2 })
        }
      }
    }
    else {
      throw new Error('unrecognized opcode 0x' + cmd.toString(16))
    }
    offset++
  }

  frame.outlines = outlines
  frame.commands = commands
  return frame
}

/**
 * Get a parsed frame.
 * @param {number} id Frame ID.
 * @return {Object} Parsed frame object.
 */
SLPFile.prototype.getFrame = function (id) {
  if (this.bodyOffset === null || !this.frames[id] || !this.frames[id].commands) {
    this.parseFrame(id)
  }
  return this.frames[id]
}

/**
 * Renders a frame to a buffer.
 * @param {number} frameIdx Frame ID.
 * @param {number} player Player colour (1-8) to use for player-specific parts. Defaults to 1 (blue).
 * @param {PaletteFile} palette A Palette file that contains the colours for this SLP.
 * @param {boolean} drawOutline Whether to draw an outline (used when units are behind buildings, etc). Defaults to false.
 * @return {Object} Object containing Buffer of r,g,b,a values.
 */
SLPFile.prototype.renderFrame = function (frameIdx, player, palette, drawOutline) {
  var frame = this.getFrame(frameIdx)
    , outlines = frame.outlines
    , pixels = new Buffer(frame.width * frame.height * 4)
    , idx = 0
    , i
    , color
    , y = 0

  if (arguments.length < 3) {
    palette = player
    player = 1
  }

  var pushColor = function (col, opac) {
    pixels[idx++] = col[0]
    pixels[idx++] = col[1]
    pixels[idx++] = col[2]
    pixels[idx++] = opac
  }

  var skip = outlines[0].left
  if (skip < 0) {
    skip = frame.width
  }
  pixels.fill(255, 0, skip * 4)
  idx = skip * 4

  var log = []
  frame.commands.forEach(function (c) {
    switch (c.command) {
    case RENDER_SKIP:
      pixels.fill(255, idx, idx + c.arg * 4)
      idx += c.arg * 4
      break
    case RENDER_NEXTLINE:
      // fill up the rest of this line
      pixels.fill(255, idx, idx + outlines[y].right * 4)
      idx += outlines[y].right * 4
      y++
      if (y < frame.height) {
        // transparent lines are stored as a negative outline
        skip = outlines[y].left
        if (skip < 0) {
          skip = frame.width
        }
        // fill the start of this line until the first pixel
        pixels.fill(255, idx, idx + skip * 4)
        idx += skip * 4
      }
      break
    case RENDER_COLOR:
      pushColor(palette.getColor(c.arg), 0)
      break
    case RENDER_FILL:
      i = c.arg.pxCount
      color = palette.getColor(c.arg.color)
      while (i--) pushColor(color, 0)
      break
    case RENDER_OUTLINE:
      pushColor([ 0, 0, 0 ], drawOutline ? 0 : 255)
      break
    case RENDER_PLAYER_COLOR:
      pushColor(palette.getPlayerColor(c.arg, player), 0)
      break
    case RENDER_PLAYER_FILL:
      i = c.arg.pxCount
      color = palette.getPlayerColor(c.arg.color, player)
      while (i--) pushColor(color, 0)
      break
    case RENDER_SHADOW:
      i = c.arg
      while (i--) pushColor([ 255, 0, 0 ], 0)
      break
    }
  })

  return { buf: pixels, width: frame.width, height: frame.height }
}