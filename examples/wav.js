#!/usr/bin/env node
var DRS = require('genie-drs')
var wav = require('wav')
var Speaker = require('speaker')

var filename = process.argv[2]
var id = process.argv[3]

if (!filename || !id) {
  console.error('Usage: `node wav.js /path/to/sounds.drs SOUND_ID`')
  process.exit(1)
}

var drs = DRS(filename)
var reader = new wav.Reader()
drs.createReadStream(id).pipe(reader)

reader.on('format', function (format) {
  reader.pipe(new Speaker(format))
})
