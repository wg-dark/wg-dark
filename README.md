# wg-dark
a darknet that uses wireguard for the heavy lifting and wants to be
simple.

to that end, the entire project is just over 300 lines of code
(client is ~140 LoC of bash, server is ~170 LoC of node).

read it over coffee.

## usage

client: 

```
$ wg-dark.sh join cool.dark.net:1337:secret
$ wg-dark.sh start
$ wg-dark.sh invite
```

server:

```
$ node wg-dark-server cool.dark.net
```

## license
License Zero Reciprocal Public License 2.0.1

