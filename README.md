# genie-drs

Genie Engine (used in Age of Empires 1&2, Star Wars Galactic Battlegrounds) DRS file reader/writer in Node.js

[![NPM](https://nodei.co/npm/genie-drs.png?compact=true)](https://nodei.co/npm/genie-drs)

## Usage Example

Read a palette file and a unit graphic from the Age of Empires 2 data files:

```javascript
var DRS = require('genie-drs')
var Palette = require('jascpal')
var SLP = require('genie-slp')
var PNG = require('pngjs').PNG

// using Age of Empires 2 files
var int = DRS('interfac.drs')
  , gra = DRS('graphics.drs')

// id 50500 is the main in-game palette.
int.readFile(50500, function (err, buffer) {
  if (err) throw err
  var palette = Palette(buffer)
  int.close()
  onpalette(palette)
})

function onpalette (palette) {
  // 3088 is the 'Champion Dying' graphic.
  gra.readFile(3088, function (err, buffer) {
    if (err) throw err
    var slp = SLP(buffer)
    onslp(palette, slp)
  })
}

function onslp (palette, slp) {
  var frame = slp.renderFrame(1, palette, { player: 1, drawOutline: false })
  var png = new PNG({
    width: frame.width,
    height: frame.height
  })
  png.data = Buffer.from(frame.data.buffer)
  png.pack().pipe(fs.createWriteStream('champion-dying.png'))
}
```

Create a new DRS file:

```js
var DRS = require('genie-drs')
var after = require('after')
var drs = DRS()

var cb = after(3, onfinish)
fs.createReadStream('./somefile.slp').pipe(drs.createWriteStream('slp ', 1, cb))
fs.createReadStream('./bgm.wav').pipe(drs.createWriteStream('wav ', 2, cb))
fs.createReadStream('./palette.pal').pipe(drs.createWriteStream('bina', 3, cb))

function onfinish () {
  drs.archive().pipe(fs.createWriteStream('./archive.drs'))
}
```

## API

### DRS([options])

Create a new DRS file. Options can be:

 - `isSWGB` - Whether this is a file for Star Wars: Galactic Battlegrounds. Default `false`.
 - `copyright` - Copyright string to use, uses the Age of Empires or Star Wars: Galactic Battlegrounds string by default.
   This should be exactly 40 characters long for DRS files intended for AoE and exactly 60 characters long for DRS files for SWGB.
 - `fileVersion` - Version number as a 4-character string, default '1.00'.
 - `fileType` - File type as a 12-character string, pad with NUL bytes. Default 'tribe\0\0\0\0\0\0\0' like in Age of Empires 2 files.

### DRS(filename)

Creates a new DRS instance for the .DRS file `filename`.

#### DRS#read(callback)

Reads the DRS table headers.  You have to call this before calling any other method, except `.readFile`, which will implicitly call `.read` if it you haven't done so yet.  `callback` takse an error `err` or `null` if everything's fine.

#### DRS#getSize()

Returns the size of the DRS file.  Includes any unsaved modifications.  Won't work if the file hasn't been `.read()` yet.

#### DRS#getFiles()

Returns an array of all the file entries in this DRS file.  Format:
```javascript
{ id: Number     // internal file ID
, type: String   // 4-character, space-padded type of file: "wav ", "slp ", "bina"
, size: Number   // file size in bytes
, offset: Number // file offset in the main DRS, in bytes
}
```

Won't work if the file hasn't been `.read()` yet.

#### DRS#getFile(id)

Finds one file entry by its file ID.  See [DRS#getFiles()](#drsgetfiles)

#### DRS#putFile(id, buffer, callback)

Replaces one file in the DRS.  `id` is the ID of the file to replace, `buffer` is a Buffer or string with the new file contents, `callback` is a function receiving an `err` and the new file table entry.

#### DRS#readFile(id, callback)

Reads a file's contents for ID `id`.  The callback gets an `err` and a `Buffer` containing the file contents.

#### DRS#createReadStream(id)

Returns a Readable stream of the file contents for file ID `id`.

The returned stream also emits a `meta` event with information about the file, like in `getFiles()`.

#### DRS#createWriteStream(type, id)

Returns a stream, stuff that is written to it will be saved in the DRS file.
Note that this method works in-memory, use the `archive()` method to flush changes back to disk.

The returned stream emits a `meta` event with information about the new file, like in `getFiles()`.

`type` is the file type, i.e. the table in which to store the file.
 If a file type is given for which a table does not exist, a new table is created.
 `id` is the new file ID.

#### DRS#archive()

Returns the entire DRS file as a stream.
If the DRS instance was initialized from an existing DRS file, this method may attempt to read data from that file--it's not safe to pipe the stream straight back to the original DRS file.
If that is necessary, use a module like [`fs-write-stream-atomic`](https://www.npmjs.com/package/fs-write-stream-atomic), which will not touch the initial file until everything has been read.

```js
var createWriteStream = require('fs-write-stream-atomic')

var drs = DRS('./archive.drs')
fs.createReadStream('./custom-palette.pal')
  .pipe(drs.createWriteStream('bina', 50501))
  .on('finish', onfinish)

function onfinish () {
  drs.archive().pipe(createWriteStream('./archive.drs'))
}
```
