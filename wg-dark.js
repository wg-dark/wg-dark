const execSync = require('child_process').execSync;
const fetch = require('node-fetch');
const commandExists = require('command-exists');
const Wg = require('./wg')

const argv = require('minimist')(process.argv.slice(2))
const cmd  = argv._.length < 1 ? 'help' : argv._[0]


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
      body: JSON.stringify({pubkey: keypair.pubkey, invite: invite[2]})
    };

    console.log(keypair);

    try {
      const res = await fetch(`http://${invite[0]}:${invite[1]}/join`, opts);
      const json = await res.json();
      wg.up(keypair.privkey, json.address)
      await wg.addPeer({ pubkey: json.pubkey, allowedIPs: "10.13.37.1/24", endpoint: `${invite[0]}:${invite[1]}` })
    } catch (error) {
      console.error('failed to contact the server');
      process.exit(1);
    }
  }
})();
