const execFile = require('child_process').execFile;
const tmp = require('tmp');
const fs = require('fs');

class Wg {
  constructor(iface) {
    this.iface = iface;
  }

  async getPeersConfig() {
    let wg = this;
    return new Promise(function (resolve, reject) {
      execFile("wg", ["showconf", wg.iface], function (error, stdout, stderr) {
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

  async addConfig(configString) {
    let wg = this;
    return new Promise(function (resolve, reject) {
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