var fs = require('fs')

module.exports = FsSource

function FsSource (filename) {
  this.filename = filename
  this.fd = null
}

FsSource.prototype.isOpen = function () {
  return this.fd !== null
}

FsSource.prototype.open = function (cb) {
  var source = this
  if (source.fd) return cb(null, source.fd)
  fs.open(source.filename, 'r', function (err, fd) {
    if (err) return cb(err)
    source.fd = fd
    cb(null, fd)
  })
}

FsSource.prototype.read = function (start, end, cb) {
  var size = end - start
  fs.read(this.fd, Buffer.alloc(size), 0, size, start, function (err, bytesRead, buffer) {
    cb(err, buffer)
  })
}

FsSource.prototype.createReadStream = function (start, end) {
  return fs.createReadStream(this.filename, {
    fd: this.fd,
    start: start,
    end: end,
    autoClose: false
  })
}

FsSource.prototype.close = function (cb) {
  fs.close(this.fd, cb)
  this.fd = null
}
