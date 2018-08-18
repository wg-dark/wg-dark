const Wg = require('./wg');

(async function() {
    const wg = new Wg("blah");
    let config = await wg.getPeersConfig();
    console.log("got config");
    console.log(config);

    wg.addConfig(`
    [Peer]
    PublicKey = DfyxzL1mtigKIfM51OhxD+FBBSk+/SHEUE9UlDJ45W4=
    AllowedIPs = 1.0.0.0/1
    Endpoint = 185.65.135.131:51820
    `);
})();

