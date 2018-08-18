# wg-dark
wireguard darknet.

## usage
```
$ wg-dark-server serve cool.dark.net [--port 1337]
$ wg-dark-server invite [--port 1337]
$ wg-dark join cool.dark.net:1337:secret [--keyfile /tmp/key00]
$ wg-dark [status]
```

## API
### POST /join
```
{ invite : "secret", publicKey : "lolwut" }
```

### GET - /config
```
{ address : "10.20.30.3/32", peers : [{ publicKey : "blahhhh", allowedIps : ["10.20.30.1/32"], endpoint : "1.1.1.1:1337" }] }
```

## license
License Zero Reciprocal Public License 2.0.1
