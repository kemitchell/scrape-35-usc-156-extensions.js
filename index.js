/*
MIT License

Copyright (c) 2017 Kyle E. Mitchell

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var cheerio = require('cheerio')
var https = require('https')

module.exports = function (callback) {
  getHTML(function (error, html) {
    if (error) {
      callback(error)
    } else {
      callback(null, dataTable(html))
    }
  })
}

function getHTML (callback) {
  https.get({
    hostname: 'www.uspto.gov',
    path: [
      '',
      'patent',
      'laws-and-regulations',
      'patent-term-extension',
      'patent-terms-extended-under-35-usc-156'
    ].join('/'),
    // Without User-Agent: Something, www.uspto.gov will respond 403.
    headers: {
      'user-agent': 'scrape-35-usc-156-extensions.js'
    }
  })
    .once('error', callback)
    .once('response', function (response) {
      if (response.statusCode !== 200) {
        callback(new Error('Server responded ' + response.statusCode))
      } else {
        var buffers = []
        response
          .once('error', callback)
          .on('data', function (buffer) {
            buffers.push(buffer)
          })
          .once('end', function () {
            callback(null, Buffer.concat(buffers).toString())
          })
      }
    })
    .end()
}

var COLUMNS = [
  {
    fieldName: 'patent',
    transform: trim
  },
  {
    fieldName: 'tradename',
    transform: trim
  },
  {
    fieldName: 'original',
    transform: toISO8601
  },
  {
    fieldName: 'extension',
    transform: trim
  },
  {
    fieldName: 'approval',
    transform: toISO8601
  },
  {
    fieldName: 'extended',
    transform: toISO8601
  }
]

function toISO8601 (string) {
  string = string.trim()
  if (string.length === 0) {
    return null
  } else if (!/^\d/.test(string)) {
    return string
  } else {
    return new Date(string)
      .toISOString()
      .slice(0, 10)
  }
}

function trim (string) {
  return string.trim()
}

var SELECTORS = {
  EXTENSIONS: rowsIn(
    ' Listing of Patent Term Extensions under 35 USC 156.'
  ),
  FOOTNOTES: rowsIn(
    ' Footnotes regarding information found in the 156 Extension Table'
  ),
  ROW: 'td[scope=row]'
}

function rowsIn (title) {
  return 'table[title="' + title + '"] tr'
}

function dataTable (html) {
  var $ = cheerio.load(html)

  var footnotes = {}
  var footnoteSymbols = []
  $(SELECTORS.FOOTNOTES)
    .each(function () {
      var text = cheerio(this).text()
      var parsed = parseFootnote(text)
      footnoteSymbols.push(parsed.symbol)
      footnotes[parsed.symbol] = parsed.text
    })

  return $(SELECTORS.EXTENSIONS)
    .filter(function isDataRow () {
      return cheerio(this).find(SELECTORS.ROW).length > 0
    })
    .map(function () {
      var data = {}
      cheerio(this)
        .find('td')
        .each(function (index) {
          var column = COLUMNS[index]
          var text = cheerio(this).text()
          data[column.fieldName] = column.transform
            ? column.transform(text)
            : text
        })
      addFootnotes(data, footnotes)
      parseExtension(data)
      return data
    })
    .get()
}

var EXTENSION_NOTE_PATTERNS = [
  /(\*+)$/,
  /\(see note (\d)\)$/i
]

var APPROVAL_NOTE_PATTERNS = [
  /see note (\d)$/i
]

function addFootnotes (data, footnotes) {
  addNote(data, 'extension', EXTENSION_NOTE_PATTERNS, footnotes)
  addNote(data, 'approval', APPROVAL_NOTE_PATTERNS, footnotes)
}

function addNote (data, field, patterns, footnotes) {
  var index, match, symbol
  for (index = 0; index < patterns.length; index++) {
    match = patterns[index].exec(data[field])
    if (match) {
      symbol = match[1]
      data[field] = orNull(data[field].replace(match[0], ''))
      data[field + 'Note'] = footnotes[symbol]
    }
  }
}

function orNull (string) {
  return string.length === 0 ? null : string
}

var EXTENSION_PATTERNS = [
  {
    re: /([\d,]+) days/,
    unit: 'day'
  },
  {
    re: /([\d,]+) years/,
    unit: 'year'
  }
]

function parseExtension (data) {
  for (var index = 0; index < EXTENSION_PATTERNS.length; index++) {
    var pattern = EXTENSION_PATTERNS[index]
    var text = data.extension
    var match = pattern.re.exec(text)
    if (match) {
      data.extension = {
        unit: pattern.unit,
        count: parseInt(match[1].replace(/,/g, ''))
      }
    }
  }
}

var FOOTNOTE_PATTERNS = [
  /^(\*+)\s+(.+)/,
  /^Note (\d+)\s+(.+)/
]

function parseFootnote (text) {
  text = text.trim()
  for (var index = 0; index < FOOTNOTE_PATTERNS.length; index++) {
    var match = FOOTNOTE_PATTERNS[index].exec(text)
    if (match) {
      return {
        symbol: match[1],
        text: match[2].trim()
      }
    }
  }
  throw new Error('Could not identify footnote symbol.')
}
