```javascript
var scrape = require('scrape-35-usc-156-extensions')
var assert = require('assert')

scrape(function (error, extensions) {
  assert.ifError(error)
  assert(
    extensions.every(function (element) {
      return (
        element.hasOwnProperty('patent') &&
        element.hasOwnProperty('tradename') &&
        element.hasOwnProperty('original') &&
        element.hasOwnProperty('extension') &&
        element.hasOwnProperty('approval') &&
        element.hasOwnProperty('extended')
      )
    })
  )
})
```
