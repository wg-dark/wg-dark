const http    = require('http')
const parser  = require('body-parser')
const crypto  = require('crypto')
const express = require('express')
const fetch   = require('node-fetch')
const ip      = require('ip')
const Wg      = require('./wg')

const argv = require('minimist')(process.argv.slice(2))
const cmd  = argv._.length < 1 ? 'help' : argv._[0]
const host = argv._.length < 2 ? undefined : argv._[1]
const port = isNaN(argv.port) ? 1337 : argv.port
const wg = new Wg(host)

const isAuthed = (addr) => {
  return ip.cidrSubnet('10.13.37.0/24').contains(addr)
    || ip.isEqual(addr, '127.0.0.1')
    || ip.isEqual(addr, '::1')
}

function nextCidr(pubkey) {
  return new Promise((res, rej) => {
    wg.getPeers().then(peers => {
      if (peers.some(peer => peer.pubkey === pubkey)) {
        res(peers.find(peer => peer.pubkey === pubkey).ip)
      } else {
        res(`10.13.37.${peers.length + 2}/32`)
      }
    })
  })
}

function serve(host, port, keypair) {
  var invites = []
  const app = express()
  app.use(parser.json())

  app.get('/invite', function (req, res) {
    if (!isAuthed(req.ip)) {
      console.log(`forbidden GET /invite from ${req.ip}`)
      res.status(403).send()
    } else {
      var invite = crypto.randomBytes(16).toString('hex')
      invites.push(invite)
      res.send(`${host}:${port}:${invite}`)
    }
  })

  app.post('/join', async function (req, res) {
    if (!req.body.invite || !req.body.pubkey) {
      res.status(400).send()
    } else if (invites.indexOf(req.body.invite) < 0) {
      res.status(403).send()
    } else {
      invites.splice(invites.indexOf(req.body.invite), 1)
      console.log(`invite ${req.body.invite} redeemed by ${req.body.pubkey}`)

      const cidr = await nextCidr(req.body.pubkey)
      console.log(`cidr ${cidr}`)
      await wg.addPeer({ pubkey: req.body.pubkey, allowedIPs: cidr})
      console.log(`peer added`)

      res.send({address: cidr, pubkey: keypair.pubkey})
      console.log(`sent`)
    }
  })

  app.get('/status', async function (req, res) {
    if (!isAuthed(req.ip)) {
      console.log(`forbidden GET /status from ${req.ip}`)
      res.status(403).send()
    } else {
      res.send({
        peers : await wg.getPeersConfig()
      })
    }
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
    const keypair = Wg.generateKeypair()
    await wg.up(keypair.privkey, "10.13.37.1/24")
    serve(host, port, keypair)
      .then(() => console.log('http up'))
      .catch((err) => console.error(err))
  } else if (cmd === 'invite') {
    const res = await fetch(`http://localhost:${port}/invite`, { method : 'GET' })
    const body = await res.text()
    console.log(body)
  } else {
    console.error('usage goes here')
    process.exit(1)
  }
})()
