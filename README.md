# wg-dark
wireguard darknet.

## usage
```
$ wg-dark-server cool.dark.net [--port 1337]
$ wg-dark-server invite
$ wg-dark join cool.dark.net:1337:secret [--keyfile /tmp/key00]
$ wg-dark [status]
```

## API
### POST /join
```
{ invite : "secret", pubkey : "lolwut" }
```

### GET - /status
```
{ ip : "10.20.30.3", peers : ["pubkey:10.20.30.1:1337", "pubkey:10.20.30.2:1337"] }
```

## license
License Zero Reciprocal Public License 2.0.1
