var through = require('through2')
var pump = require('pump')
var concat = require('simple-concat')
var Buffer = require('safe-buffer').Buffer
var fromBuffer = require('from2-buffer')
var isBuffer = require('is-buffer')
var Struct = require('awestruct')
var assign = require('object-assign')
var to = require('to2')
var multistream = require('multistream')
var FsSource = require('./FsSource')
var BlobSource = require('./BlobSource')

var t = Struct.types

module.exports = DRS

function isStream (stream) {
  return stream &&
    typeof stream === 'object' &&
    typeof stream.pipe === 'function'
}

var HEADER_SIZE_AOE = 64
var HEADER_SIZE_SWGB = 84
var TABLE_META_SIZE = 12
var FILE_META_SIZE = 12

var COPYRIGHT_AOE = 'Copyright (c) 1997 Ensemble Studios.\0\0\0\0'
var COPYRIGHT_SWGB = 'Copyright (c) 2001 LucasArts Entertainment Company LLC'

// Parse a numeric table type to a string.
var parseTableType = function (num) {
  for (var ext = '', i = 0; i < 4; i++) {
    ext = String.fromCharCode(num & 0xFF) + ext
    num >>= 8
  }
  return ext
}

// Serialize a table type string to a 32-bit integer.
var serializeTableType = function (str) {
  for (var num = 0, i = 0; i < 4; i++) {
    num = (num << 8) + str.charCodeAt(i)
  }
  return num
}

var headerStruct = function (isSwgb) {
  return Struct({
    copyright: isSwgb ? t.char(60) : t.char(40),
    fileVersion: t.char(4),
    fileType: t.char(12),
    numTables: t.int32,
    firstFileOffset: t.int32
  })
}

var tableStruct = Struct({
  ext: t.uint32.map(parseTableType, serializeTableType),
  offset: t.int32,
  numFiles: t.int32
})

/**
 * Represents a DRS file.
 * @constructor
 * @param {string} file Path to a .DRS file.
 */
function DRS (file) {
  if (!(this instanceof DRS)) return new DRS(file)

  this.tables = []
  this.isSWGB = null

  if (typeof file === 'undefined') {
    file = {}
  }
  if (typeof file === 'string') {
    if (typeof FsSource !== 'function') {
      throw new Error('Cannot instantiate with a string filename in the browser')
    }
    this.source = new FsSource(file)
  } else if (typeof Blob !== 'undefined' && file instanceof Blob) {
    this.source = new BlobSource(file)
  } else {
    if (typeof file !== 'object') {
      throw new TypeError('Expected a file path string or an options object, got ' + typeof file)
    }
    this.isSWGB = file.hasOwnProperty('isSWGB') ? file.isSWGB : false
    this.copyright = file.hasOwnProperty('copyright') ? file.copyright :
      (this.isSWGB ? COPYRIGHT_SWGB : COPYRIGHT_AOE)
    this.fileVersion = file.hasOwnProperty('fileVersion') ? file.fileVersion : '1.00'
    this.fileType = file.hasOwnProperty('fileType') ? file.fileType : 'tribe\0\0\0\0\0\0\0'
  }
}

DRS.prototype.getFileCount = function () {
  return this.tables.reduce(function (a, t) { return a + t.files.length }, 0)
}

function getFirstFileOffset (drs) {
  var headerSize = drs.isSWGB ? HEADER_SIZE_SWGB : HEADER_SIZE_AOE

  return headerSize + TABLE_META_SIZE * drs.tables.length +
         FILE_META_SIZE * drs.getFileCount()
}

/**
 * Computes the size of this DRS file.
 * DRS consists of a 64 byte header, an array of 12 byte table infos,
 * an array of 12 byte file infos (the tables), and finally the files.
 * @return {number} The size of this DRS file.
 */
DRS.prototype.getSize = function () {
  return getFirstFileOffset(this) +
         this.getFiles().reduce(function (size, file) { return size + file.size }, 0)
}

/**
 * Opens a DRS file from the file system.
 * @param {function} cb Function to call after opening the file.
 *    Error in first argument, File Descriptor in second (if successful)
 */
DRS.prototype.open = function (cb) {
  if (!this.source) {
    throw new Error('Cannot open an in-memory DRS file')
  }
  this.source.open(cb)
}

/**
 * Reads the file tables.
 * @param {function} cb Function to call when finished. Error in first parameter.
 */
DRS.prototype.read = function (cb) {
  var drs = this
  // make sure we have an open file first
  if (!this.source.isOpen()) {
    return this.open(function (e) {
      if (e) cb(e)
      else drs.read(cb)
    })
  }

  var fileOffset = 0

  // header is 64 bytes
  drs.source.read(0, HEADER_SIZE_SWGB, onHeader)

  function onHeader (err, buf) {
    if (err) return cb(err)

    drs.isSWGB = buf.slice(0, COPYRIGHT_SWGB.length).toString('ascii') === COPYRIGHT_SWGB

    if (!drs.isSWGB) {
      buf = buf.slice(0, HEADER_SIZE_AOE)
    }

    var readHeader = headerStruct(drs.isSWGB)
    assign(drs, readHeader(buf.slice(fileOffset)))

    fileOffset += buf.length
    drs.source.read(fileOffset, fileOffset + TABLE_META_SIZE * drs.numTables, onTableInfo)
  }

  function onTableInfo (err, buf) {
    if (err) return cb(err)

    // Tables reader
    var tables = t.array(drs.numTables, tableStruct.transform(function (tab) { tab.files = []; return tab }))

    drs.tables = tables(buf)
    var totalFiles = drs.tables.reduce(function (total, table) {
      return total + table.numFiles
    }, 0)

    fileOffset += buf.length
    drs.source.read(fileOffset, fileOffset + FILE_META_SIZE * totalFiles, onTables)
  }

  function onTables (err, buf) {
    if (err) return cb(err)

    var offset = 0
    drs.tables.forEach(function (table) {
      var file
      for (var i = 0, l = table.numFiles; i < l; i++) {
        file = {}
        file.id = buf.readInt32LE(offset)
        offset += 4
        file.offset = buf.readInt32LE(offset)
        offset += 4
        file.size = buf.readInt32LE(offset)
        offset += 4
        file.type = table.ext
        table.files.push(file)
      }
    })

    fileOffset += buf.length
    cb()
  }
}

/**
 * Returns all the table entries in the DRS file.
 * @return {Array}
 */
DRS.prototype.getFiles = function () {
  return this.tables.reduce(function (arr, table) {
    return arr.concat(table.files)
  }, [])
}

/**
 * Gets a single table entry from the DRS by its file id.
 * @param {number} id File ID.
 * @return {Object=} Appropriate file entry.
 */
DRS.prototype.getFile = function (id) {
  for (var tableI = 0; tableI < this.tables.length; tableI++) {
    var table = this.tables[tableI]
    for (var i = 0; i < table.numFiles; i++) {
      if (table.files[i].id === id) {
        return table.files[i]
      }
    }
  }
  return null
}

/**
 * Create a read stream for a file in the DRS.
 *
 * @param {number} id File ID.
 *
 * @return {Readable} A Readable stream.
 */
DRS.prototype.createReadStream = function (id) {
  var drs = this

  var stream = through()
  if (!drs.numTables) {
    drs.read(onread)
  } else {
    onread()
  }

  return stream

  function onread (err) {
    if (err) {
      stream.emit('error', err)
      return
    }
    var file = drs.getFile(id)
    if (!file) {
      stream.emit('error', new Error('File ' + id + ' does not exist'))
    }
    stream.emit('meta', file)
    if (file.buffer) {
      pump(fromBuffer(file.buffer), stream)
      return
    }
    pump(drs.source.createReadStream(file.offset, file.offset + file.size - 1), stream)
  }
}

/**
 * Reads a file's content from the DRS by id.
 *
 * @param {number} id File ID.
 * @param {function} cb Function `(err, file)` to call when finished. `file` is a `DRSFile` object.
 */
DRS.prototype.readFile = function (id, cb) {
  var drs = this
  // make sure we've read tables first
  if (!this.numTables) {
    return this.read(function (e) {
      if (e) cb(e)
      else drs.readFile(id, cb)
    })
  }

  var file = this.getFile(id)
  if (file == null) return cb(new Error('Cannot find file #' + id))
  this.source.read(file.offset, file.offset + file.size, function (err, buffer) {
    if (err) cb(err)
    else cb(null, buffer, file)
  })
}

function getTable (drs, type) {
  var table
  for (var i = 0; i < drs.tables.length; i += 1) {
    table = drs.tables[i]
    if (table.ext === type) {
      break
    }
  }

  if (!table) {
    table = {
      ext: type,
      offset: null,
      numFiles: 0,
      files: []
    }
    drs.tables.push(table)
    drs.numTables = drs.tables.length
  }

  return table
}

function newFile (type, id) {
  return {
    id: id,
    offset: null,
    size: null,
    type: type
  }
}

function createFileBufferCallback (file, table, cb) {
  return function onbuffer (err, buffer) {
    if (err) return cb(err)
    file.buffer = buffer
    file.size = buffer.byteLength

    var replaced = false
    for (var i = 0; i < table.numFiles; i++) {
      if (table.files[i].id === file.id) {
        table.files[i] = file
        replaced = true
        break
      }
    }
    if (!replaced) {
      table.files.push(file)
      table.numFiles = table.files.length
    }

    cb(null, file)
  }
}

/**
 * Add a new file to the DRS archive.
 *
 * @param {string} type The file type, i.e. the table in which to store the file.
 *    If a file type is given for which a table does not exist, a new table is created.
 * @param {number} id The new file ID.
 * @param {Buffer|Stream} data File contents.
 * @param {function} cb Function `(err, file)` to call when finished.
 */
DRS.prototype.putFile = function (type, id, data, cb) {
  var file = newFile(type, id)
  var table = getTable(this, type)

  var onbuffer = createFileBufferCallback(file, table, cb)

  if (isBuffer(data)) {
    setTimeout(function () {
      onbuffer(null, data)
    }, 0)
  } else if (isStream(data)) {
    concat(data, onbuffer)
  } else {
    throw new TypeError('Expected a Buffer or a Stream, but got \'' + typeof data + '\'')
  }
}

/**
 * Add a new file to the DRS archive, returning a writable stream.
 *
 * @param {string} type The file type, i.e. the table in which to store the file.
 *    If a file type is given for which a table does not exist, a new table is created.
 * @param {number} id The new file ID.
 * @param {function} cb Function `(err, file)` to call when finished.
 */
DRS.prototype.createWriteStream = function (type, id) {
  var file = newFile(type, id)
  var table = getTable(this, type)

  var data = []
  var stream = to(function (chunk, enc, next) {
    data.push(chunk)
    next()
  }, function (next) {
    var cb = createFileBufferCallback(file, table, onfinish)
    cb(null, Buffer.concat(data))

    function onfinish (err, file) {
      if (!err) {
        stream.emit('meta', file)
      }

      next(err)
    }
  })

  return stream
}

DRS.prototype.archive = function () {
  var drs = this
  function getHeader () {
    return fromBuffer(headerStruct(drs.isSwgb).encode({
      copyright: drs.copyright,
      fileVersion: drs.fileVersion,
      fileType: drs.fileType,
      numTables: drs.numTables,
      firstFileOffset: getFirstFileOffset(drs)
    }))
  }

  function getTableInfo () {
    return fromBuffer(Buffer.concat(
      drs.tables.map(function (table) {
        return tableStruct.encode(table)
      })
    ))
  }

  var fileOffset = getFirstFileOffset(drs)
  var tables = drs.tables.map(function (table) {
    return function () {
      var offset = 0
      var buffer = Buffer.alloc(table.numFiles * FILE_META_SIZE)
      for (var i = 0; i < table.numFiles; i++) {
        var file = table.files[i]
        buffer.writeInt32LE(file.id, offset)
        offset += 4
        buffer.writeInt32LE(fileOffset, offset)
        offset += 4
        buffer.writeInt32LE(file.size, offset)
        fileOffset += file.size
      }
      return fromBuffer(buffer)
    }
  })

  var files = drs.getFiles().map(function (file) {
    return function () {
      return drs.createReadStream(file.id)
    }
  })

  var chunks = [ getHeader, getTableInfo ]
    .concat(tables)
    .concat(files)

  return multistream(chunks)
}

/**
 * Closes the file.
 * @param {function} cb Callback passed straight to `fs.close`.
 */
DRS.prototype.close = function (cb) {
  this.source.close(cb)
}
