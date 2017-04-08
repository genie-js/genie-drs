var DRSFile = require('./DRSFile')

module.exports = WAVFile

// does not yet do anything special.
function WAVFile (buf, file) {
  if (!(this instanceof WAVFile)) return new WAVFile(buf, file)

  DRSFile.call(this, buf, file)
}

WAVFile.prototype = Object.create(DRSFile.prototype)
