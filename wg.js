const execFile = require('child_process').execFile;
const tmp = require('tmp');
const fs = require('fs');

class Wg {
  constructor(iface) {
    this.iface = iface;
  }

  async up() {
    let wg = this;
    return new Promise((resolve, reject) => {
      execFile("ip", ["link", "add", wg.iface, "type", "wireguard"], () => {
        execFile("ip", ["route", "add", "10.13.37.0/24", "dev", wg.iface], () => {
          resolve()
        })
      })
    })
  }

  async getPeersConfig() {
    let wg = this;
    return new Promise((resolve, reject) => {
      execFile("wg", ["showconf", wg.iface], (error, stdout, stderr) => {
        if (error) {
          reject(error);
        }

        const peers = stdout.toString('utf8')
          .split("\n")
          .filter((line) => {
            return !line.trim().startsWith("[Interface]")
              && !line.trim().startsWith("ListenPort")
              && !line.trim().startsWith("FwMark")
              && !line.trim().startsWith("PrivateKey")
              && line !== ""
          })
          .join("\n");
        resolve(peers);
      });
    });
  }

  /**
   *
   * @param {Object} peer - The new peer's information
   * @param {string} peer.pubkey - The public key
   * @param {string} peer.allowedIPs - The peer's allowed IPs
   */
  async addPeer(peer) {
    let wg = this;
    return new Promise((resolve, reject) => {
      execFile("wg", ["set", wg.iface, "peer", peer.pubkey, "allowed-ips", peer.allowedIPs], () => {
        resolve()
      })
    })
  }

  async addConfig(configString) {
    let wg = this;
    return new Promise((resolve, reject) => {
      tmp.file((err, path, fd, cleanup) => {
        if (err) {
          reject(err);
          return;
        }

        fs.write(fd, configString, (err) => {
          if (err) {
            reject(err);
            return;
          }

          execFile("wg", ["addconf", wg.iface, path], (error, stdout, stderr) => {
            if (error) {
              reject(error);
            }
            cleanup();
            resolve();
          });
        });
      });
    });
  }
}

module.exports = Wg;