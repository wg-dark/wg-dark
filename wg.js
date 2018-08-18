const execFile = require('child_process').execFile;

class Wg {
    constructor(iface) {
        this.iface = iface;
    }

    async getPeersConfig() {
        let that = this;
        return new Promise(function(resolve, reject) {
            execFile("wg", ["showconf", that.iface], function(error, stdout, stderr) {
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
}

module.exports = Wg;