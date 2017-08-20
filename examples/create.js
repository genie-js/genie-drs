var fs = require('fs')
var path = require('path')
var DRS = require('../')
var written = 0
var total = 0

var drs = DRS()

add('js', 1, path.join(__dirname, 'create.js'))
add('js', 2, path.join(__dirname, 'wav.js'))
add('js', 3, path.join(__dirname, '../index.js'))
add('json', 4, path.join(__dirname, '../package.json'))

function add (table, id, file) {
  total++
  fs.createReadStream(file)
    .pipe(drs.createWriteStream(table, id))
    .on('finish', onfinish)
}

function onfinish () {
  written++
  if (written === total) {
    archive()
  }
}
function archive () {
  drs.archive().pipe(fs.createWriteStream('./test.drs'))
}
