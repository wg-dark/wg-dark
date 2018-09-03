# wg-dark
a darknet that uses wireguard for the heavy lifting and wants to be
simple.

to that end, the entire project is just over 300 lines of code
(client is ~140 LoC of bash, server is ~170 LoC of node).

read it over coffee.

## usage

#### client 

```
$ wg-dark.sh join cool.dark.net:1337:secret
$ wg-dark.sh start
$ wg-dark.sh invite
```

#### server

The server talks TLS externally on port 1337, and plain old HTTP
internally on the same port.

To start the server with an external DNS of `cool.dark.net`:
```
$ node wg-dark-server cool.dark.net
```

To listen externally with TLS, use a reverse proxy server like Caddy,
which makes it easy by automatically setting up a Let's Encrypt cert.

Example Caddyfile:

```
https://cool.dark.net:1337

bind <external ip>
proxy / 10.13.37.1:1337 {
  transparent
}
```

And then from the server (or another connected peer):

```
$ wg-dark.sh invite
```

And you're off.

