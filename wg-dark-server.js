const http    = require('http')
const parser  = require('body-parser')
const express = require('express')

const app = express()
const argv = require('minimist')(process.argv.slice(2))
app.use(parser.json())

function serveHTTP(port) {
  return new Promise((res, rej) => {
    var httpd = http.createServer(app)
    httpd.once('error', rej)
    httpd.once('listening', res)
    httpd.listen(port)
  })
}

app.post('/join', function (req, res) {
  console.log(`join request from ${req.ip}:${req.body.port} with pubkey ${req.body.pubkey}`)
  res.status(204).send()
})

app.get('/status', function (req, res) {
  res.send({
    ip : '127.0.0.1',
    peers : [
      '0.0.0.0:1337',
      '1.1.1.1:31337'
    ]
  })
})

serveHTTP(argv.port)
  .then(() => console.log('http up'))
  .catch((err) => console.log(err))
