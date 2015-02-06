# genie-drs

Genie Engine (used in Age of Empires 1&2, Star Wars Galactic Battlegrounds) DRS file reader/writer in Node.js

[![NPM](https://nodei.co/npm/genie-drs.png?compact=true)](https://nodei.co/npm/genie-drs)

## Usage Example

```javascript
// using Age of Empires 2 files
var int = DRS('interfac.drs')
  , gra = DRS('graphics.drs')
// id 50500 is the main in-game palette.
int.readFile(50500, function (e, palette) {
  int.close()
  // 3088 is the 'Champion Dying' graphic.
  gra.readFile(3088, function (e, slp) {
    slp.renderFrame(1, 1, palette, false).encode(function (buf) {
      fs.writeFile('champion-dying.png', buf)
    })
  })
})
```

## API

### DRS(filename)

Creates a new DRS reader instance for the .DRS file `filename`.

#### DRS#read(callback)

Reads the DRS table headers.  You have to call this before calling any other method, except `.readFile`, which will implicitly call `.read` if it you haven't done so yet.  `callback` takse an error `err` or `null` if everything's fine.

#### DRS#getSize()

Returns the size of the DRS file.  Includes any unsaved modifications.  Won't work if the file hasn't been `.read()` yet.

#### DRS#getFiles()

Returns an array of all the file entries in this DRS file.  Format:
```javascript
{ id: Number     // internal file ID
, type: String   // type of file: wav, slp, bin
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

Reads a file's contents for ID `id`.  The callback gets an `err` and a `DRSFile` subclass instance depending on the type of file. ([SLPFile](#slpfile) for .SLPs, `WAVFile` for .WAVs, [PaletteFile](#palettefile) for palette .BINs, `DRSFile` for other .BINs.)

### SLPFile

Represents a .SLP graphics file in a .DRS archive. Uses [genie-slp](https://github.com/goto-bus-stop/genie-slp) for parsing and rendering.

#### SLPFile#slp

Genie-slp instance.

#### SLPFile#renderFrame(frameId, palette, opts)

Renders a frame to a PNG buffer. `frameId` is the frame to render, `palette` is the Palette to use (either an array of colours, a jascpal instance, or a `PaletteFile`), `opts` are [genie-slp](https://github.com/goto-bus-stop/genie-slp#slprenderframeframeindex--palette-player----buffer-width-height-) options.

### PaletteFile

Represents a .BIN Paint Shop Pro palette file in a .DRS archive. Palette files use
[jascpal](https://github.com/goto-bus-stop/jascpal) for parsing.

#### PaletteFile#palette

Jascpal instance.

#### PaletteFile#getColor(idx)

Returns the `[r, g, b]` colour at index `idx`.

#### PaletteFile#setColor(idx, color)

Sets the colour at index `idx` to the specified `[r, g, b]` array `color`.