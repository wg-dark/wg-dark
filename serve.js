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
  console.log(`alias ${req.body.alias} wanna join with pubkey ${req.body.key}`)
  res.status(204).send()
})

app.get('/status', function (req, res) {
  res.send('ip and peer list')
})

serveHTTP(argv.port)
  .then(() => console.log('http up'))
  .catch((err) => console.log(err))
