const { execFile, spawnSync } = require('child_process');
const { withFile } = require('tmp-promise');
const fs = require('fs');
const fsPromises = fs.promises;

async function execAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve(stdout.toString('utf8').trim())
      }
    })
  })
}

class Wg {
  constructor(iface) {
    this.iface = iface;
  }

  async createOrStart() {
    try {
      console.log("bringing up existing wireguard config.")
      await execAsync("wg-quick", ["up", this.iface])
    } catch (e) {
      console.log("creating new wireguard config.")
      const privkey = await execAsync("wg", ["genkey"])

      await fsPromises.writeFile(`/etc/wireguard/${this.iface}.conf`,
        `[Interface]
        PrivateKey = ${privkey}
        Address = 10.13.37.1/24
        SaveConfig = true
        ListenPort = 1337`)

      await execAsync("wg-quick", ["up", this.iface])
    }

    // Make sure the "default" route is added for our subnet.
    try {
      await execAsync("ip", ["route", "add", "10.13.37.0/24", "dev", this.iface])
    } catch (e) {
      console.log("didn't set ip route, exists already probably.")
    }
  }

  async down() {
    await execAsync("wg-quick", ["down", this.iface])
  }

  async pubkey() {
    return await execAsync("wg", ["show", this.iface, "public-key"])
  }

  async getPeersConfig() {
    return (await execAsync("wg", ["showconf", this.iface]))
      .split("\n")
      .filter((raw_line) => {
        const line = raw_line.trim()
        return !line.startsWith("[Interface]")
          && !line.startsWith("ListenPort")
          && !line.startsWith("FwMark")
          && !line.startsWith("PrivateKey")
          && line.length > 0
      })
      .join("\n")
  }

  /**
   *
   * @param {Object} peer - The new peer's information
   * @param {string} peer.pubkey - The public key
   * @param {string} peer.endpoint - The endpoint
   * @param {string} peer.allowedIPs - The peer's allowed IPs
   */
  async addPeer(peer) {
    await this.addConfig(`
      [Peer]
      PublicKey = ${peer.pubkey}
      AllowedIPs = ${peer.allowedIPs}
      PersistentKeepalive = 25
      ${peer.endpoint ? `Endpoint = ${peer.endpoint}` : ''}
    `)
  }

  async getPeers() {
    let wg = this;
    return new Promise(function (resolve, reject) {
      execFile("wg", ["show", wg.iface, "allowed-ips"], function (error, stdout, stderr) {
        if (error) { reject(error) }
        resolve(stdout.toString('utf8').split('\n').filter(line => line.length > 16).map(peer => {
          var pubkey = peer.split('\t')[0];
          var ip = peer.split('\t')[1].split(' ')[0];
          return { pubkey : pubkey, ip : ip };
        }));
      });
    });
  }

  async addConfig(config) {
    withFile(async ({path, fd}) => {
      await fsPromises.writeFile(path, config)
      await execAsync("wg", ["addconf", this.iface, path])
    });
  }
}

module.exports = Wg;
