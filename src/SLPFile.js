var DRSFile = require('./DRSFile')
  , PNG = require('png').Png
  , Struct = require('awestruct')

module.exports = SLPFile

// SLP commands
var SLP_END_OF_ROW = 0x0f
  , SLP_COLOR_LIST = 0x00
  , SLP_SKIP = 0x01
  , SLP_COLOR_LIST_EX = 0x02
  , SLP_SKIP_EX = 0x03
  , SLP_COLOR_LIST_PLAYER = 0x06
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
  version: Struct.char(4)
, numFrames: 'int32'
, comment: Struct.char(24)
  
, frames: Struct.array('numFrames', Struct({
    cmdTableOffset: 'uint32'
  , outlineTableOffset: 'uint32'
  , paletteOffset: 'uint32'
  , properties: 'uint32'
    
  , width: 'int32'
  , height: 'int32'
  , hotspot: Struct({
      x: 'int32'
    , y: 'int32'
    })
  }))
})

/**
 * @param {Buffer} buf
 * @param {Object} file
 * @extends DRSFile
 */
function SLPFile(buf, file) {
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
 * @param {number} Frame ID.
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
    lowBits = cmd & 0x03 // 00…0011
    
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
 * Renders a frame to a PNG buffer.
 * @param {number} frameIdx Frame ID.
 * @param {number} player Player colour (1-8) to use for player-specific parts. Defaults to 1 (blue).
 * @param {PaletteFile} palette A Palette file that contains the colours for this SLP.
 * @param {boolean} drawOutline Whether to draw an outline (used when units are behind buildings, etc). Defaults to false.
 */
SLPFile.prototype.renderFrame = function (frameIdx, player, palette, drawOutline) {
  if (this.bodyOffset === null || !this.frames[frameIdx].commands) {
    this.parseFrame(frameIdx)
  }
  var frame = this.frames[frameIdx]
    , outlines = frame.outlines
    , png = new Buffer(frame.width * frame.height * 4)
    , idx = 0
    , i
    , color
    , y = 0
  
  if (arguments.length < 3) {
    palette = player
    player = 1
  }
  
  var pushColor = function (col, opac) {
    png[idx++] = col[0]
    png[idx++] = col[1]
    png[idx++] = col[2]
    png[idx++] = opac
  }

  png.fill(255, 0, outlines[0].left * 4)
  idx = outlines[0].left * 4
  
  frame.commands.forEach(function (c) {
    switch (c.command) {
    case RENDER_SKIP:
      png.fill(255, idx, idx + c.arg * 4)
      idx += c.arg * 4
      break
    case RENDER_NEXTLINE:
      // fill up the rest of this line
      png.fill(255, idx, idx + outlines[y].right * 4)
      idx += outlines[y].right * 4
      y++
      if (y < frame.height) {
        // fill the start of this line until the first pixel
        png.fill(255, idx, idx + outlines[y].left * 4)
        idx += outlines[y].left * 4
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
  
  return new PNG(png, frame.width, frame.height, 'rgba')
}