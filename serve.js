const http = require('http')
const express = require('express')

const app = express()
const argv = require('minimist')(process.argv.slice(2))

function serveHTTP(port) {
  return new Promise((res, rej) => {
    var httpd = http.createServer(app)
    httpd.once('error', rej)
    httpd.once('listening', res)
    httpd.listen(port)
  })
}

app.post('/join', function (req, res) {
  res.send('joinnn')
})

app.get('/status', function (req, res) {
  res.send('ip and peer list')
})

serveHTTP(argv.port)
  .then(() => console.log('http up'))
  .catch((err) => console.log(err))
