#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
#
# Copyright (C) 2015-2018 Jason A. Donenfeld <Jason@zx2c4.com>. All Rights Reserved.
# Copyright (C) 2018 Jake McGinty <me@jake.su>. All Rights Reserved.
#

set -eE -o pipefail
shopt -s extglob
export LC_ALL=C

# via https://git.zx2c4.com/WireGuard/tree/src/tools/wg-quick/darwin.bash
SELF="${BASH_SOURCE[0]}"
[[ $SELF == */* ]] || SELF="./$SELF"
SELF="$(cd "${SELF%/*}" && pwd -P)/${SELF##*/}"

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${SELF%/*}:$PATH"
PROGRAM="${0##*/}"
ARGS=( "$@" )
INTERFACE=""
REAL_INTERFACE=""

trap 'echo failure at line $LINENO.' ERR

cmd() {
  echo -e "\033[96m$\033[0m $*"
  "$@"
}

die() {
  echo -e "\033[91m(oops)\033[0m $*" >&2
  exit 1
}

resolve_real_interface() {
  if [[ $OSTYPE =~ ^(openbsd|darwin) ]]; then
    REAL_INTERFACE=$(cat "/var/run/wireguard/$INTERFACE.name")
  else
    REAL_INTERFACE="$INTERFACE"
  fi
}

debug() { echo -e "\033[95m(debg)\033[0m $*" ; }

info() { echo -e "\033[92m(info)\033[0m $*" ; }

warn() { echo -e "\033[93m(warn)\033[0m $*" ; }

auto_su() {
  [[ $UID == 0 ]] || exec sudo -p "$PROGRAM must be run as root. Please enter the password for %u to continue: " -- "$BASH" -- "$SELF" "${ARGS[@]}"
}

cmd_usage() {
  cat >&2 <<-_EOF
  Usage: $PROGRAM [ join CODE | start INTERFACE | invite ]

    join INVITE - join a $PROGRAM net specified by the INVITE argument. ex:

        $PROGRAM join cool.dark.net:1337:2479773dc9a04d2efcd4e2772b872d5f

    start INTERFACE - start up and re-sync for a network that you've already joined. ex:

        $PROGRAM start cool.dark.net

    invite - ask the coordinating server to generate an invite code which you can
      give to your most elite friends. You must be connected to the network before
      running this.
_EOF
}

update_loop() {
  local res body http_status
  resolve_real_interface
  while true; do
    local config=$(curl -s "http://10.13.37.1:1337/status")

    if [ ! "$config" = "null" ]; then
      cmd wg addconf "$REAL_INTERFACE" <(echo "$config") 2> /dev/null
      debug "updated peers."
      sleep 15
    else
      warn "failed to get updated peers list."
      sleep 1
    fi
  done
}

cmd_start() {
  INTERFACE="$1"

  info "fetching latest peer updates..."
  resolve_real_interface
  wg show "$REAL_INTERFACE" > /dev/null || cmd wg-quick up "$INTERFACE" 2> /dev/null
  sleep 1
  update_loop
}

cmd_invite() {
  if ! ip r | grep -q 10.13.37; then
    die "it doesn't look like you're connected to a darknet."
  fi

  body=$(curl -s --fail 10.13.37.1:1337/invite)

  if [ $? -ne 0 ]; then
    die "invite request failed. are you even connected to a $PROGRAM net?"
  fi

  echo -e "\n\033[1;35m  Invite code:\033[0m"
  echo -e "  $body"
  echo -e "\n\033[90m  this code can only be redeemed once. share wisely.\033[0m"
}

cmd_join() {

  local pieces=(${1//:/ })
  local host=${pieces[0]}
  local port=${pieces[1]}
  local code=${pieces[2]}
  local body

  INTERFACE="$host"
  debug "endpoint $host:$port, code $code"

  local privkey=$(wg genkey)
  local pubkey=$(echo "$privkey" | wg pubkey)

  local request_body="{\"pubkey\":\"$pubkey\", \"invite\":\"$code\"}"

  debug "submitting /join request"
  body=$(curl --fail -s -d "$request_body" -H "Content-Type: application/json" -X POST "https://$host:$port/join")

  if [ $? -ne 0 ]; then
    die "non-200 status on /join"
  fi

  info "successfully reedeemed invite code."

  debug "body $body"

  IFS=: read -r address server_pubkey <<< "$body"

  debug "address $address, pubkey: $server_pubkey"


  sh -c "umask 077; mkdir -p /etc/wireguard; cat > /etc/wireguard/${host}.conf" <<_EOF
[Interface]
PrivateKey = ${privkey}
Address = ${address}
SaveConfig = true

[Peer]
PublicKey = ${server_pubkey}
AllowedIPs = 10.13.37.1/24
Endpoint = ${host}:${port}
PersistentKeepalive = 25
_EOF

  info "bringing up interface..."
  cmd wg-quick up "${host}" 2> /dev/null
  sleep 1
  update_loop
}

if ! [ -x "$(command -v wg-quick)" ]; then
  die 'Error: wg-quick is not installed.'
fi

if [[ $# -eq 1 && ( $1 == --help || $1 == -h || $1 == help ) ]]; then
  cmd_usage
elif [[ $# -eq 2 && $1 == join ]]; then
  auto_su
  cmd_join "$2"
elif [[ $# -eq 2 && $1 == start ]]; then
  auto_su
  cmd_start "$2"
elif [[ $1 == invite ]]; then
  cmd_invite "$2"
else
  cmd_usage
  exit 1
fi

exit 0
