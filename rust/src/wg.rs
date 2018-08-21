//! A module for interfacing with wireguard and the OS's
//! network interface controls.

use failure::Error;
use std::io::Write;
use std::process::{Command, Stdio};

/// A struct that handles the communication necessary to bring up
/// and control the wireguard interface for the darknet.
#[derive(Debug, Clone)]
pub struct Wg {
  pub iface: String
}

/// A simple container for the base64-encoded key data provided by "wg".
#[derive(Debug)]
pub struct Keypair {
  pub privkey: String,
  pub pubkey: String
}

/// A lightweight wrapper around `process::Command` that makes it easier to
/// deal with string stdin/stdout communication.
fn run(cmd: &str, args: &[&str], input: Option<&str>) -> Result<String, Error> {
  debug!("$ {} {}", cmd, args.join(" "));
  let mut child = Command::new(cmd)
    .args(args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .spawn()?;

  if let Some(input) = input {
      let mut stdin = child.stdin.as_mut().expect("Failed to open stdin");
      stdin.write_all(input.as_bytes()).expect("Failed to write to stdin");
  }

  let output = child.wait_with_output()?;

  if !output.status.success() {
    bail!("command failed")
  }

  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

impl Wg {
  /// Create a new instance, but this does *not* create the
  /// interface in the OS.
  pub fn new(iface: &str) -> Wg {
    Wg { iface: iface.to_string() }
  }

  /// Generate a static keypair.
  pub fn generate_keypair() -> Result<Keypair, Error> {
    let privkey = run("wg", &["genkey"], None)?;
    let pubkey  = run("wg", &["pubkey"], Some(&privkey))?;

    Ok(Keypair { privkey, pubkey })
  }

  /// Create the interface and initialize it with the initial assignment data
  /// provided by the server.
  pub fn up(&self, privkey: &str, address: &str) -> Result<(), Error> {
    run("ip", &["link", "add", &self.iface, "type", "wireguard"], None)?;
    run("ip", &["link", "set", "mtu", "1420", "dev", &self.iface], None)?;
    run("ip", &["addr", "add", &address, "dev", &self.iface], None)?;
    run("ip", &["link", "set", &self.iface, "up"], None)?;
    let _ = run("ip", &["route", "add", "10.13.37.0/24", "dev", &self.iface], None);

    self.add_config(&format!("[Interface]\nPrivateKey = {}\nListenPort = 1337", privkey))?;

    Ok(())
  }

  /// Destroy the interface.
  pub fn down(&self) -> Result<(), Error> {
    run("ip", &["link", "del", "dev", &self.iface], None)?;

    Ok(())
  }

  /// Add a configuration in the wireguard conf file format.
  ///
  /// Note: This appends configuration data to the interface and does not
  /// clobber old config.
  pub fn add_config(&self, config: &str) -> Result<(), Error> {
    run("wg", &["addconf", &self.iface, "/dev/stdin"], Some(config))?;

    Ok(())
  }
}