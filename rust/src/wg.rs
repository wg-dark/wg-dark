use failure::Error;
use std::ffi::OsStr;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Debug, Clone)]
pub struct Wg {
  pub iface: String
}

#[derive(Debug)]
pub struct Keypair {
  pub privkey: String,
  pub pubkey: String
}

fn run<I, S>(cmd: &str, args: I, input: Option<&str>) -> Result<String, Error>
  where I: IntoIterator<Item = S>,
        S: AsRef<OsStr>
{
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

  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
impl Wg {
  pub fn new(iface: &str) -> Wg {
    Wg { iface: iface.to_string() }
  }

  pub fn generate_keypair() -> Result<Keypair, Error> {
    let privkey = run("wg", &["genkey"], None)?;
    let pubkey  = run("wg", &["pubkey"], Some(&privkey))?;

    Ok(Keypair { privkey, pubkey })
  }

  pub fn up(&self, privkey: &str, address: &str) -> Result<(), Error> {
    run("ip", &["link", "add", &self.iface, "type", "wireguard"], None)?;
    run("ip", &["link", "set", "mtu", "1420", "dev", &self.iface], None)?;
    run("ip", &["addr", "add", &address, "dev", &self.iface], None)?;
    run("ip", &["link", "set", &self.iface, "up"], None)?;
    let _ = run("ip", &["route", "add", "10.13.37.0/24", "dev", &self.iface], None);

    self.add_config(&format!("[Interface]\nPrivateKey = {}\nListenPort = 1337", privkey))?;

    Ok(())
  }

  pub fn down(&self) -> Result<(), Error> {
    run("ip", &["link", "del", "dev", &self.iface], None)?;

    Ok(())
  }

  pub fn add_config(&self, config: &str) -> Result<(), Error> {
    run("wg", &["addconf", &self.iface, "/dev/stdin"], Some(config))?;

    Ok(())
  }
}