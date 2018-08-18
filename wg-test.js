const Wg = require('./wg');

(async function() {
    const wg = new Wg("blah");
    await wg.up();

    await wg.addConfig(`
    [Peer]
    PublicKey = AAAAAL1mtigKIfM51OhxD+FBBSk+/SHEUE9UlDJ45W4=
    AllowedIPs = 1.0.0.0/1
    Endpoint = 185.65.135.131:51820
    `)

    await wg.addPeer({
        pubkey: "BBBBBL1mtigKIfM51OhxD+FBBSk+/SHEUE9UlDJ45W4=",
        allowedIPs: "10.13.37.3/32"
    })

    let config = await wg.getPeersConfig()
    console.log("got config")
    console.log(config)
})();

