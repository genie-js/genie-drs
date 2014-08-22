module.exports = DRSFile

/**
 * Represents a file inside a DRS file. (eg., an .SLP)
 * @param {Buffer} buf File contents.
 * @param {Object} file File table entry.
 */
function DRSFile(buf, file) {
  this.file = file
  this.buf = buf
}