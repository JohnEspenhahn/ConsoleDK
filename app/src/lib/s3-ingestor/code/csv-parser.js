const { Transform } = require('stream')

const [cr] = Buffer.from('\r')
const [nl] = Buffer.from('\n')
const defaults = {
  escape: '"',
  headers: null,
  mapHeaders: ({ header }) => header,
  mapValues: ({ value }) => value,
  newline: '\n',
  quote: '"',
  raw: false,
  separator: ',',
  skipComments: false,
  startAfter: null,
  maxRowBytes: Number.MAX_SAFE_INTEGER,
  strict: false
  // TODO skipHeaderLines
}

// https://github.com/mafintosh/csv-parser/tree/master

class RowSizeExceededError extends Error {

  constructor(msg, start, end) {
    super(msg)

    this.start = start
    this.end = end
  }

}

class CsvParser extends Transform {
  constructor (opts = {}, callback) {
    super({ objectMode: true, highWaterMark: 16 })

    if (Array.isArray(opts)) opts = { headers: opts }

    const options = Object.assign({}, defaults, opts)

    options.customNewline = options.newline !== defaults.newline

    for (const key of ['newline', 'quote', 'separator']) {
      if (typeof options[key] !== 'undefined') {
        ([options[key]] = Buffer.from(options[key]))
      }
    }

    // if escape is not defined on the passed options, use the end value of quote
    options.escape = (opts || {}).escape ? Buffer.from(options.escape)[0] : options.quote

    this.state = {
      empty: options.raw ? Buffer.alloc(0) : '',
      escaped: false,
      first: true,
      lineNumber: 0,
      previousEnd: 0,
      rowLength: 0,
      quoted: false,
      maximumSizeExceeded: false,
      skipping: options.startAfter && options.startAfter > 0,
    }

    this._prev = null

    if (options.headers === false) {
      // enforce, as the column length check will fail if headers:false
      options.strict = false
    }

    if (options.headers || options.headers === false) {
      this.state.first = false
    }

    this.options = options
    this.headers = options.headers
    this.callback = callback
  }

  parseCell (buffer, start, end) {
    const { escape, quote } = this.options
    // remove quotes from quoted cells
    if (buffer[start] === quote && buffer[end - 1] === quote) {
      start++
      end--
    }

    let y = start

    for (let i = start; i < end; i++) {
      // check for escape characters and skip them
      if (buffer[i] === escape && i + 1 < end && buffer[i + 1] === quote) {
        i++
      }

      if (y !== i) {
        buffer[y] = buffer[i]
      }
      y++
    }

    return this.parseValue(buffer, start, y)
  }

  parseLine = async (buffer, start, end) => {
    const { customNewline, escape, mapHeaders, mapValues, quote, separator, skipComments } = this.options

    end-- // trim newline
    if (!customNewline && buffer.length && buffer[end - 1] === cr) {
      end--
    }

    const comma = separator
    const cells = []
    let isQuoted = false
    let offset = start

    if (skipComments) {
      const char = typeof skipComments === 'string' ? skipComments : '#'
      if (buffer[start] === Buffer.from(char)[0]) {
        return
      }
    }

    const mapValue = (value) => {
      if (this.state.first) {
        return value
      }

      const index = cells.length
      const header = this.headers[index]

      return mapValues({ header, index, value })
    }

    for (let i = start; i < end; i++) {
      const isStartingQuote = !isQuoted && buffer[i] === quote
      const isEndingQuote = isQuoted && buffer[i] === quote && i + 1 <= end && buffer[i + 1] === comma
      const isEscape = isQuoted && buffer[i] === escape && i + 1 < end && buffer[i + 1] === quote

      if (isStartingQuote || isEndingQuote) {
        isQuoted = !isQuoted
        continue
      } else if (isEscape) {
        i++
        continue
      }

      if (buffer[i] === comma && !isQuoted) {
        let value = this.parseCell(buffer, offset, i)
        value = mapValue(value)
        cells.push(value)
        offset = i + 1
      }
    }

    if (offset < end) {
      let value = this.parseCell(buffer, offset, end)
      value = mapValue(value)
      cells.push(value)
    }

    if (buffer[end - 1] === comma) {
      cells.push(mapValue(this.state.empty))
    }

    if (this.state.first && !this.headers) {
      this.state.first = false
      this.headers = cells.map((header, index) => mapHeaders({ header, index }))

      this.emit('headers', this.headers)
      return
    }

    if (!this.state.skipping) {
      if (this.options.strict && cells.length !== this.headers.length) {
        const e = new RangeError('Row length does not match headers')
        // this.emit('error', e)
        await this.callback(undefined, e);
      } else {
        await this.writeRow(cells)
      }
    }

    this.incrementLineNumber()
  }

  incrementLineNumber() {
    this.state.lineNumber++

    if (this.state.skipping && this.state.lineNumber >= this.options.startAfter) {
      this.state.skipping = false;
    }
  }

  parseValue (buffer, start, end) {
    if (this.options.raw) {
      return buffer.slice(start, end)
    }

    return buffer.toString('utf-8', start, end)
  }

  writeRow = async (cells) => {
    const headers = (this.headers === false) ? cells.map((value, index) => index) : this.headers

    const row = cells.reduce((o, cell, index) => {
      const header = headers[index]
      if (header === null) return o // skip columns
      if (header !== undefined) {
        o[header] = cell
      } else {
        o[`_${index}`] = cell
      }
      return o
    }, {})

    this.push(row)
    await this.callback({ row: row, lineNumber: this.state.lineNumber });
  }

  _flush = async (cb) => {
    if (this.state.escaped || this.state.maximumSizeExceeded || !this._prev) return cb()
    await this.parseLine(this._prev, this.state.previousEnd, this._prev.length + 1) // plus since online -1s
    cb()
  }

  _transform = async (data, enc, cb) => {
    if (typeof data === 'string') {
      data = Buffer.from(data)
    }

    const { escape, quote } = this.options
    let start = 0
    let buffer = data

    if (this._prev) {
      start = this._prev.length
      buffer = Buffer.concat([this._prev, data])
      this._prev = null
    }

    const bufferLength = buffer.length

    for (let i = start; i < bufferLength; i++) {
      const chr = buffer[i]
      const nextChr = i + 1 < bufferLength ? buffer[i + 1] : null

      this.state.rowLength++
      if (!this.state.skipping && this.state.rowLength > this.options.maxRowBytes) {
        this.state.maximumSizeExceeded = true;
      }

      if (!this.state.escaped && chr === escape && nextChr === quote && i !== start) {
        this.state.escaped = true
        continue
      } else if (chr === quote) {
        if (this.state.escaped) {
          this.state.escaped = false
          // non-escaped quote (quoting the cell)
        } else {
          this.state.quoted = !this.state.quoted
        }
        continue
      }

      if (!this.state.quoted) {
        if (this.state.first && !this.options.customNewline) {
          if (chr === nl) {
            this.options.newline = nl
          } else if (chr === cr) {
            if (nextChr !== nl) {
              this.options.newline = cr
            }
          }
        }

        if (chr === this.options.newline) {
          if (!this.state.maximumSizeExceeded) {
            if (!this.state.skipping || (this.state.first && !this.headers)) {
              await this.parseLine(buffer, this.state.previousEnd, i + 1)
            } else {
              this.incrementLineNumber()
            }
          } else {
            const e = new RowSizeExceededError('Row exceeds the maximum size', this.state.previousEnd, i + 1)
            // this.emit('error', e)
            await this.callback(undefined, e)
          }
          this.state.previousEnd = i + 1
          this.state.rowLength = 0
          this.state.maximumSizeExceeded = false;
        }
      }
    }

    // Overflowing, continue discarding blocks
    if (this.state.maximumSizeExceeded) {
        return cb()
    }

    // Skipping, continue discarding blocks
    if (this.state.skipping) {
      return cb()
    }

    // Line ended right at the end of this block
    if (this.state.previousEnd === bufferLength) {
      this.state.previousEnd = 0
      return cb()
    }

    // Line ended in this block, and next line is ongoing
    if (bufferLength - this.state.previousEnd < data.length) {
      this._prev = data
      this.state.previousEnd -= (bufferLength - data.length)
      return cb()
    }

    this._prev = buffer
    cb()
  }

  _destroy = async (err, cb) => {
    console.log("Destroying...");

    if (err) {
      await this.callback(undefined, err, true);
    } else {
      await this.callback({}, undefined, true);
    }

    cb()
  }

  _final = async (cb) => {
    console.log("Finally...");

    await this.callback({}, undefined, true);

    cb()
  }
}

module.exports = (opts, callback) => new CsvParser(opts, callback)