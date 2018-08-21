#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
#
# Copyright (C) 2015-2018 Jason A. Donenfeld <Jason@zx2c4.com>. All Rights Reserved.
# Copyright (C) 2018 Jake McGinty <me@jake.su>. All Rights Reserved.
#

set -xeE -o pipefail
shopt -s extglob
export LC_ALL=C

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
export PATH="${SELF%/*}:$PATH"
PROGRAM="${0##*/}"
ARGS=( "$@" )
INTERFACE=""

cmd() {
  echo "[#] $*" >&2
  "$@"
}

die() {
  echo "$PROGRAM: $*" >&2
  exit 1
}

auto_su() {
  [[ $UID == 0 ]] || exec sudo -p "$PROGRAM must be run as root. Please enter the password for %u to continue: " -- "$BASH" -- "$SELF" "${ARGS[@]}"
}

cmd_usage() {
  cat >&2 <<-_EOF
  Usage: $PROGRAM [ join INVITE | start INTERFACE ]

    join INVITE - join a $PROGRAM net specified by the INVITE argument. The invite
      contains both a one-time invite code as well as the endpoint for the
      coordinating server. ex:

        $PROGRAM join cool.dark.net:1337:2479773dc9a04d2efcd4e2772b872d5f

    start INTERFACE - start up and re-sync the peers for a $PROGRAM net that you've
      previously joined. ex:

        $PROGRAM start cool.dark.net
_EOF
}

update_loop() {
  trap "echo updating peers failed." ERR
  local res
  local body
  local http_status
  echo "entering update loop"
  while true; do
    local config=$(curl -s "http://10.13.37.1:1337/status" | jq -r .peers)

    if [ ! "$config" = "null" ]; then
      cmd wg addconf "$INTERFACE" <(echo "$config")
      echo "updated peers."
      sleep 15
    else
      echo "failed to get updated peers list."
      sleep 1
    fi
  done
}

cmd_join() {
  trap "echo join failed." ERR
  local pieces=(${1//:/ })
  local host=${pieces[0]}
  local port=${pieces[1]}
  local code=${pieces[2]}
  INTERFACE="$host"
  echo  "endpoint $host:$port, code $code"

  local privkey=$(wg genkey)
  local pubkey=$(echo "$privkey" | wg pubkey)
  echo  "keypair $privkey/$pubkey"

  local request_body="{\"pubkey\":\"$pubkey\", \"invite\":\"$code\"}"

  echo "submitting /join request"
  local body
  body=$(curl --fail -s -d "$request_body" -H "Content-Type: application/json" -X POST "https://$host:$port/join")

  if [ $? -ne 0 ]; then
    die "non-200 status on /join"
  fi

  local server_pubkey=$(echo "$body" | jq -re .pubkey)
  local address=$(echo "$body" | jq -re .address)

  cat >/etc/wireguard/${host}.conf <<EOL
[Interface]
PrivateKey = ${privkey}
Address = ${address}
SaveConfig = true

[Peer]
PublicKey = ${server_pubkey}
AllowedIPs = 10.13.37.1/24
Endpoint = ${host}:${port}
PersistentKeepalive = 25
EOL

  cmd wg-quick up "${host}"
  sleep 1
  echo "slept"
  update_loop
  echo "update_loop done"
}

if ! [ -x "$(command -v wg-quick)" ]; then
  echo 'Error: wg-quick is not installed.' >&2
  exit 1
fi

if ! [ -x "$(command -v jq)" ]; then
  echo 'Error: jq is not installed.' >&2
  exit 1
fi

if [[ $# -eq 1 && ( $1 == --help || $1 == -h || $1 == help ) ]]; then
  cmd_usage
elif [[ $# -eq 2 && $1 == join ]]; then
  auto_su
  cmd_join "$2"
elif [[ $# -eq 2 && $1 == start ]]; then
  auto_su
  cmd_start "$2"
else
  cmd_usage
  exit 1
fi

exit 0
