const http    = require('http')
const parser  = require('body-parser')
const crypto  = require('crypto')
const express = require('express')
const fetch   = require('node-fetch')
const ip      = require('ip')
const level   = require('level')
const Wg      = require('./wg')

const argv = require('minimist')(process.argv.slice(2))
const cmd  = argv._.length < 1 ? 'help' : argv._[0]
const host = argv._.length < 2 ? undefined : argv._[1]
const port = isNaN(argv.port) ? 1337 : argv.port
const wg = new Wg(host)

const invites = level('./invites_db')

process.on('SIGINT', async () => {
    console.log("caught interrupt signal, killing interface");
    await wg.down()
    process.exit(0)
});

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

function serve(host, port, pubkey) {
  const app = express()
  app.use(parser.json())

  app.get('/invite', async (req, res) => {
    if (isAuthed(req.ip)) {
      var invite = crypto.randomBytes(16).toString('hex')
      await invites.put(invite, '')
      console.log(`generated invite code ${invite}`)
      res.send(`${host}:${port}:${invite}`)
    } else {
      res.status(403).send()
    }
  })

  app.post('/join', async function (req, res) {
    if (!req.body.invite || !req.body.pubkey) {
      res.status(400).send()
    }

    try {
      await invites.get(req.body.invite)

      const cidr = await nextCidr(req.body.pubkey)
      await wg.addPeer({ pubkey: req.body.pubkey, allowedIPs: cidr})

      await invites.del(req.body.invite)
      console.log(`invite ${req.body.invite} redeemed by ${req.body.pubkey}`)

      res.send({address: cidr, server: "10.13.37.1/32", pubkey})

    } catch (err) {
      if (err.notFound) res.status(403).send()
      else              res.status(500).send()
    }
  })

  app.get('/status', async function (req, res) {
    if (isAuthed(req.ip)) {
      res.send({ peers : await wg.getPeersConfig() })
    } else {
      res.status(403).send()
    }
  })

  return new Promise((res, rej) => {
    var httpd = http.createServer(app)
    httpd.once('error', rej)
    httpd.once('listening', res)
    httpd.listen(port, "0.0.0.0")
  })
}

(async function() {
  if (cmd === 'serve' && host) {
    await wg.createOrStart()
    const pubkey = await wg.pubkey()
    await serve(host, port, pubkey)
    console.log('http up')
  } else {
    console.error('usage might one day go here')
    process.exit(1)
  }
})()
