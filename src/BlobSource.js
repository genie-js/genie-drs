var fromBlob = require('from2-blob')
var toBuffer = require('blob-to-buffer')

module.exports = BlobSource

function BlobSource (blob) {
  this.blob = blob
}

BlobSource.prototype.isOpen = function () {
  return true
}

BlobSource.prototype.open = function (cb) {
  setTimeout(function () {
    cb(null)
  })
}

BlobSource.prototype.read = function (start, end, cb) {
  toBuffer(this.blob.slice(start, end), cb)
}

BlobSource.prototype.createReadStream = function (start, end) {
  return fromBlob(this.blob.slice(start, end))
}

BlobSource.prototype.close = function (cb) {
  setTimeout(function () {
    cb(null)
  })
}
