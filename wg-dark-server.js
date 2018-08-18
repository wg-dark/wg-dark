const http    = require('http')
const parser  = require('body-parser')
const crypto  = require('crypto')
const express = require('express')
const fetch   = require('node-fetch')

const argv = require('minimist')(process.argv.slice(2))
const cmd = argv._.length < 1 ? 'help' : argv._[0]
const host = argv._.length < 2 ? undefined : argv._[1]
const port = isNaN(argv.port) ? 1337 : argv.port

const isLocal = (addr) => { return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' }

function serve(host, port) {
  var invites = []
  const app = express()
  app.use(parser.json())

  app.get('/invite', function (req, res) {
    if (!isLocal(req.ip)) {
      console.log(`forbidden GET /invite from ${req.ip}`)
      res.status(403).send()
    } else {
      var invite = crypto.randomBytes(16).toString('hex')
      invites.push(invite)
      res.send(`${host}:${port}:${invite}`)
    }
  })

  app.post('/join', function (req, res) {
    if (!req.body.invite || !req.body.pubkey) {
      res.status(400).send()
    } else if (invites.indexOf(req.body.invite) < 0) {
      res.status(403).send()
    } else {
      invites.splice(invites.indexOf(req.body.invite), 1)
      console.log(`invite ${req.body.invite} redeemed by ${req.body.pubkey}`)
      res.status(204).send()
    }
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

  return new Promise((res, rej) => {
    var httpd = http.createServer(app)
    httpd.once('error', rej)
    httpd.once('listening', res)
    httpd.listen(port)
  })
}

(async function() {
  if (cmd === 'serve' && host) {
    serve(host, port)
      .then(() => console.log('http up'))
      .catch((err) => console.log(err))
  } else if (cmd === 'invite') {
    const res = await fetch(`http://localhost:${port}/invite`, { method : 'GET' })
    const body = await res.text()
    console.log(body)
  } else {
    console.error('usage goes here')
    process.exit(1)
  }
})()
