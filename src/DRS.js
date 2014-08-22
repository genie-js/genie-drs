var fs = require('fs')
  , DRSFile = require('./DRSFile')
  , PaletteFile = require('./PaletteFile')
  , SLPFile = require('./SLPFile')
  , WAVFile = require('./WAVFile')
  , Struct = require('awestruct')

module.exports = DRS

const merge = function (base, obj) {
  Object.keys(obj).forEach(function (key) {
    base[key] = obj[key]
  })
}
const reverse = function (str) { return str.split('').reverse().join('') }

var headerStruct = Struct({
  copyright: Struct.char(40)
, fileVersion: Struct.char(4)
, fileType: Struct.char(12)
, numTables: 'int32'
, firstFileOffset: 'int32'
})

var tableStruct = Struct({
  unknownByte: 'uint8'
, ext: Struct.char(3).transform(reverse)
, offset: 'int32'
, numFiles: 'int32'
})

/**
 * Represents a DRS file.
 * @constructor
 * @param {string} file Path to a .DRS file.
 */
function DRS(file) {
  this.files = {}
  this.newOffset = {}
  this.tables = []
  this.filename = file
  this.fd = null
}

/**
 * Computes the size of this DRS file.
 * DRS consists of a 64 byte header, an array of 12 byte table infos,
 * an array of 12 byte file infos (the tables), and finally the files.
 * @return {number} The size of this DRS file.
 */
DRS.prototype.getSize = function () {
  return /* header */ 64 + /* tableInfo */ 12 * this.tables.length +
         /* tables */ 12 * this.tables.reduce(function (a, t) { return a + t.files.length }, 0) +
         /* files  */ this.getFiles().reduce(function (size, file) { return size + file.size }, 0)
}

/**
 * Opens a DRS file from the file system.
 * @param {string} file Filename to open.
 * @param {function} cb Function to call after opening the file.
 *    Error in first argument, File Descriptor in second (if successful)
 */
DRS.prototype.open = function (cb) {
  fs.open(this.filename, 'r', function (e, fd) {
    if (e) return cb(e)
    this.fd = fd
    cb(null, fd)
  }.bind(this))
}

/**
 * Reads the file tables.
 * @param {function} cb Function to call when finished. Error in first parameter.
 */
DRS.prototype.read = function (cb) {
  var drs = this
    , fd = this.fd
  // make sure we have an open file first
  if (this.fd === null) {
    return this.open(function (e) {
      if (e) cb(e)
      else drs.read(cb)
    })
  }
  
  var fileOffset = 0

  // header is 64 bytes
  fs.read(fd, new Buffer(64), 0, 64, 0, onHeader)

  function onHeader(err, bytesRead, buf) {
    if (err) return cb(err)

    merge(drs, headerStruct(buf.slice(fileOffset)))

    fileOffset += buf.length
    fs.read(fd, new Buffer(12 * drs.numTables), 0, 12 * drs.numTables, fileOffset, onTableInfo)
  }

  function onTableInfo(err, bytesRead, buf) {
    if (err) return cb(err)

    var offset = 0
      , table
      , i
      , totalFiles = 0
    for (i = 0; i < drs.numTables; i++) {
      table = tableStruct(buf.slice(offset))//{ files: [] }
      table.files = []
      // skip 1st byte
      //table.unknownByte = buf.readUInt8(offset)
      offset += 1
      // reversed file ext
      //table.ext = buf.slice(offset, offset + 3).toString().split('').reverse().join('')
      offset += 3
      //table.offset = buf.readInt32LE(offset)
      offset += 4
      //table.numFiles = buf.readInt32LE(offset)
      totalFiles += table.numFiles
      offset += 4
      drs.tables.push(table)
    }

    fileOffset += buf.length
    fs.read(fd, new Buffer(12 * totalFiles), 0, 12 * totalFiles, fileOffset, onTables)
  }

  function onTables(err, bytesRead, buf) {
    if (err) return cb(err)

    var offset = 0
    drs.tables.forEach(function (table) {
      var file, i, l
      for (i = 0, l = table.numFiles; i < l; i++) {
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
 * Writes the DRS file to a buffer.
 * @param {function} cb Function to call when done. Error in first parameter, buffer in second.
 */
DRS.prototype.write = function (buf, cb) {
  var offset = 0
    , files = this.getFiles()
    , drs = this

  this.computeOffsets()

  // header
  buf.write(this.copyright, offset, 40)
  offset += 40
  buf.write(this.fileVersion, offset, 4)
  offset += 4
  buf.write(this.fileType, offset, 12)
  offset += 12
  buf.writeInt32LE(this.tables.length, offset)
  offset += 4
  buf.writeInt32LE(this.firstFileOffset, offset)
  offset += 4

  this.tables.forEach(function (table) {
    buf.writeUInt8(table.unknownByte, offset)
    offset += 1
    buf.write(table.ext.split('').reverse().join(''), offset, 3, 'ascii')
    offset += 3
    buf.writeInt32LE(table.offset, offset)
    offset += 4
    buf.writeInt32LE(table.numFiles, offset)
    offset += 4
  })

  this.tables.forEach(function (table) {
    table.files.forEach(function (file) {
      buf.writeInt32LE(file.id, offset)
      offset += 4
      buf.writeInt32LE(drs.newOffset[file.id], offset)
      offset += 4
      buf.writeInt32LE(file.size, offset)
      offset += 4
    })
  })

  // TODO copy unedited subsequent files all at once
  function nextFile(i) {
    var fileMeta = files[i]
    drs.readFile(fileMeta.id, function (e, file) {
      if (e) return cb(e)
      file.buf.copy(buf, drs.newOffset[fileMeta.id])
      offset += fileMeta.size
      if (i + 1 < files.length) {
        nextFile(i + 1)
      }
      else {
        cb(null, buf)
      }
    })
  }
  nextFile(0)
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
  var i = 0
    , l = this.tables.length
    , j
    , m
    , table
  for (; i < l; i++) {
    table = this.tables[i]
    j = 0
    m = table.numFiles
    for (; j < m; j++) {
      if (table.files[j].id === id) {
        return table.files[j]
      }
    }
  }
  return null
}

/**
 * Replaces a file entry's contents in the DRS body.
 * File offsets are not recomputed by default.
 * If you need the offsets in the resulting DRS, call `.computeOffsets()`
 * first.
 * @param {number} id File ID.
 * @param {String|Buffer|Array} cont New contents.
 * @param {function} cb Function `(err, file)` to call when finished. `file` is a `DRSFile` object.
 */
DRS.prototype.putFile = function (id, cont, cb) {
  var fileMeta = this.getFile(id)
  this.readFile(id, function (e, file) {
    if (e) return cb(e)
    var buf = Buffer.isBuffer(cont) ? cont : new Buffer(cont)
    file.buf = buf
    fileMeta.size = buf.length
    this.files[id] = file
    cb(null, file)
  }.bind(this))
}

/**
 * Reads a file's content from the DRS by id.
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
  
  if (this.files[id]) {
    return setTimeout(function () {
      cb(null, this.files[id])
    }.bind(this), 1)
  }
  var file = this.getFile(id)
  if (file == null) return cb(new Error('Cannot find file #' + id))
  fs.read(this.fd, new Buffer(file.size), 0, file.size, file.offset, function (e, bytesRead, buf) {
    if (e) return cb(e)
    var fileInst
    if (file.type === 'slp') {
      fileInst = new SLPFile(buf, file)
    }
    else if (file.type === 'wav') {
      fileInst = new WAVFile(buf, file)
    }
    else if (file.type === 'bin' && buf.slice(0, 8).toString('ascii') === 'JASC-PAL') {
      fileInst = new PaletteFile(buf, file)
    }
    else {
      fileInst = new DRSFile(buf, file)
    }
    cb(null, fileInst)
  }.bind(this))
}

/**
 * Recomputes file offsets. New offsets will be in `.newOffset[fileId] == fileOffset`.
 * (This will change.)
 */
DRS.prototype.computeOffsets = function () {
  var offset = /* header */ 64 + /* tableInfo */ 12 * this.tables.length +
               /* tables */ 12 * this.tables.reduce(function (a, t) { return a + t.files.length }, 0)
    , drs = this
  this.tables.forEach(function (table) {
    // TODO also recompute table offset if new files were added
    table.files.forEach(function (file) {
      drs.newOffset[file.id] = offset
      offset += file.size
    })
  })
}

/**
 * Closes the file.
 * @param {function} cb Callback passed straight to `fs.close`.
 */
DRS.prototype.close = function (cb) {
  fs.close(this.fd, cb)
}