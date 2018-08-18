const codec     = require('codecs')('json')
const pull      = require('pull-stream')
const toPull    = require('stream-to-pull-stream')
const hypercore = require('hypercore')
const hyperkeys = require('dat-encoding')
const swarm     = require('hyperdiscovery')
const net       = require('net')
const MRPC      = require('muxrpc')

const API = { append : 'async' }
const argv = require('minimist')(process.argv.slice(2))
const readtime = argv.readtime ? argv.readtime : 250
const capacity = argv.capacity ? argv.capacity : 65536
const tagsys = { type : 'system', wacn : argv.wacn, sysid : argv.sysid, rfssid : argv.rfssid, siteid : argv.siteid }

function openCore() {
  const opts = { valueEncoding : 'binary', sparse : true }
  const core = hypercore('./frames', opts)
  return new Promise((res, rej) => {
    core.once('ready', () => {
      console.log(`public key -> dat://${hyperkeys.encode(core.key)}`)
      res(core)
    })
    core.once('error', (err) => {
      console.log('hyper.error', err)
      core.close()
      rej(err)
    })
    core.once('close', () => console.log('hyper.close'))
  })
}

function readCore(core, index) {
  if (core.length <= index) { return Promise.resolve(null) }
  const opts = { wait : false, timeout : readtime }
  return new Promise((res, rej) => {
    core.get(index, opts, (err, data) => {
      if (err) {
        console.log('hyper.read.error', err)
        core.close()
        rej(err)
      } else {
        res(data)
      }
    })
  })
}

function appendCore(core, data) {
  return new Promise((res, rej) => {
    core.append(data, (err) => {
      if (err) {
        console.log('hyper.append.error', err)
        core.close()
        rej(err)
      } else {
        res(core.length)
      }
    })
  })
}

function clearCore(core) {
  const end = (core.length - capacity)
  if (core.length % 100 !== 0 || end <= 0) { return Promise.resolve(0) }
  return new Promise((res, rej) => {
    core.clear(1, end, (err) => {
      if (err) {
        console.log('hyper.clear.error', err)
        core.close()
        rej(err)
      } else {
        console.log(`cleared -> 1 -> ${end} of ${core.length}`)
        res(end - 1)
      }
    })
  })
}

function encode(tag, frame) {
  switch (tag.type) {
    case 'system':
      return codec.encode(Object.assign({}, { timems : Date.now() }, tag))

    case 'control':
    case 'group':
      return codec.encode(Object.assign({}, { frame : frame.data }, tag))

    default:
      return null
  }
}

function appendTagSys(core) {
  return readCore(core, 0).then((data) => {
    if (!data) {
      return appendCore(core, encode(tagsys)).then((seq) => tagsys)
    } else {
      return codec.decode(data)
    }
  }).then((tag) => {
    console.log(`system tag -> ${JSON.stringify(tag)}`)
    return core
  })
}

function replicateCore(core) {
  const opts = { live : true, upload : true, download : false, port : 3282 }
  const sw = swarm(core, opts)
  return new Promise((res, rej) => {
    sw.once('listening', () => res(core))
    sw.once('error', (err) => {
      console.log('swarm.error', err)
      sw.close()
      rej(err)
    })
    sw.once('close', () => {
      console.log('swarm.close')
      core.close()
    })
    core.once('close', () => sw.close())
    sw.on('connection', () => console.log('peers ->', sw.connections.length))
  })
}

function appendFrame(core, tag, frame) {
  var tagged = encode(tag, frame)
  if (!tagged) {
    return Promise.reject(new Error('invalid frame tag'))
  } else {
    return appendCore(core, tagged).then((seq) => {
      console.log('frame -> seq:', seq, 'tag:', tag, 'length:', tagged.length)
      return seq
    })
  }
}

const appendFrameRpc = (core, tag, frame, cb) => {
  clearCore(core)
    .then((del) => appendFrame(core, tag, frame))
    .then((seq) => cb(null, seq))
    .catch((err) => cb(err))
}

function serveRpc(core) {
  const server = net.createServer(function (sock) {
    sock.once('error', (err) => sock.destroy())
    var psock = toPull.duplex(sock)
    var rpc = MRPC(null, API) ({ append : appendFrameRpc.bind(null, core) })
    pull(psock, rpc.createStream(), psock)
  })

  server.once('error', (err) => {
    console.log('rpc.error', err)
    server.close()
  })
  server.once('close', () => {
    console.log('rpc.close')
    core.close()
  })
  core.once('close', () => server.close())
  server.listen(2181)
}

openCore()
  .then(appendTagSys)
  .then(replicateCore)
  .then(serveRpc)
  .catch((err) => console.log(err))
