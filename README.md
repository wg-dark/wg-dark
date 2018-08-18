# wg-dark
wireguard darknet.

## usage
```
$ wg-dark serve 1337
$ wg-dark join cool.dark.net:1337 1337
$ wg-dark refresh
$ wg-dark [status]
```

## API
### POST /join
```
{ pubkey : "lolwut", port : 1337 }
```

### GET - /status
```
{ ip : "10.20.30.3", peers : ["10.20.30.1:1337", "10.20.30.2:1337"] }
```

## license
License Zero Reciprocal Public License 2.0.1
