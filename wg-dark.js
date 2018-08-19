const execSync = require('child_process').execSync;
const fetch = require('node-fetch');
const commandExists = require('command-exists');
const Wg = require('./wg')

const argv = require('minimist')(process.argv.slice(2))
const cmd  = argv._.length < 1 ? 'help' : argv._[0];

function refreshLoop() {
    console.info("fetching server update")
    fetch("http://10.13.37.1:1337/status")
      .then(res => {
        console.log(`status: ${res.status}`)
        return res.json()
      })
      .then(json => {
        const peerCount = json.peers.split("\n")
          .filter(line => line === "[Peer]")
          .length;
        console.info(`updating ${peerCount} peers.`)
        return wg.addConfig(json.peers)
      })
      .then(() => {
        console.info("updated. sleeping 30 seconds.")
      })
      .catch(err => console.error(err));
    setTimeout(refreshLoop, 30000)
}

(async function() {
  if (!(await commandExists('wg'))) {
    console.error('wireguard is not installed.');
    process.exit(1);
  }
  
  if (cmd === "join" && argv._.length > 1) {
    const invite = argv._[1]
      .split(":");
    const wg = new Wg(invite[0])
    const keypair = Wg.generateKeypair();
    const opts = {
      method: 'POST',
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({pubkey: keypair.pubkey, invite: invite[2]})
    };

    process.on('SIGINT', async () => {
        console.log("caught interrupt signal, killing interface");
        await wg.down()
        process.exit(0)
    });


    console.log(keypair);

    try {
      const url = `http://${invite[0]}:${invite[1]}/join`
      console.log(url)
      console.log(opts)
      let res = await fetch(url, opts);
      console.log(res.status)
      let json = await res.json();
      wg.up(keypair.privkey, json.address)
      await wg.addPeer({ pubkey: json.pubkey, allowedIPs: "10.13.37.1/24", endpoint: `${invite[0]}:${invite[1]}` })
      console.info("added server peer")
    } catch (error) {
      console.error(error);
      process.exit(1);
    }

    refreshLoop()
  }
})();
