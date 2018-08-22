#[macro_use] extern crate failure;
#[macro_use] extern crate log;
#[macro_use] extern crate serde_derive;
extern crate pretty_env_logger;
extern crate futures;
extern crate hyper;
extern crate hyper_tls;
extern crate serde;
extern crate serde_json;
extern crate structopt;
extern crate tokio;
extern crate tokio_signal;
extern crate xdg;

mod wg;

use failure::{Error, err_msg};
use futures::{Stream, future::{lazy, Future, FutureResult}};
use hyper::{Client, Request};
use hyper_tls::HttpsConnector;
use structopt::StructOpt;
use std::{path::Path, time::{Duration, Instant}, process};
use wg::Wg;
use tokio::timer::Interval;

#[derive(StructOpt, Debug)]
#[structopt(name = "wg-dark")]
enum Cmd {
    /// Join a darknet.
    #[structopt(name = "join")]
    Join {
        invite_code: String
    },

    /// Start up a darknet you've already joined.
    #[structopt(name = "start")]
    Start {
        name: String
    }
}

#[derive(Debug, Serialize)]
struct JoinRequest {
    pubkey: String,
    invite: String
}

#[derive(Debug, Deserialize)]
struct JoinResponse {
    address: String,
    pubkey: String
}

#[derive(Debug, Deserialize)]
struct StatusResponse {
    peers: String,
}

fn request<J>(request: Request<hyper::Body>) -> impl Future<Item = J, Error = Error>
    where J: serde::de::DeserializeOwned
{
    let https = HttpsConnector::new(4).expect("TLS initialization failed");
    let client = Client::builder().build::<_, hyper::Body>(https);

    client.request(request)
        .map_err(|e| e.into())
        // fail the future on non-success status codes
        .and_then(|res| {
            if !res.status().is_success() {
                bail!("server returned {}.", res.status());
            }
            Ok(res)
        })
        // collect the body into chunks and deserialize JSON
        .and_then(move |res| -> Box<Future<Item = J, Error = Error> + Send> { 
            debug!("collecting body");
            Box::new(res.into_body().concat2().map(|body| {
                serde_json::from_slice::<J>(&body).unwrap()
            }).map_err(|e| e.into()))
        })
}

/// Listen for interrupts and cleans up before exiting.
fn spawn_interrupt_watcher(wg: Wg) {
    tokio::spawn({
        let wg = wg.clone();
        tokio_signal::ctrl_c()
            .flatten_stream()
            .map_err(|_|())
            .for_each(move |()| -> FutureResult<(), ()> {
                info!("cleaning up interface.");
                wg.down().unwrap();
                process::exit(0);
            })
    });
}

/// Poll the coordination server for updates to the darknet.
fn spawn_update_loop(wg: Wg) {
    tokio::spawn(Interval::new(Instant::now(), Duration::from_secs(20))
        .map_err(|e| error!("{:?}", e))
        .and_then(|_| {
            debug!("building update request");
            let req = Request::get("http://10.13.37.1:1337/status")
                .header("User-Agent", "wg-dark")
                .header("Content-Type", "application/json")
                .body(hyper::Body::empty())
                .unwrap();
            request(req)
                .then(|result| {
                    match result {
                        Ok(good) => Ok(Some(good)),
                        Err(e) => {
                            warn!("status request failed: {:?}", e);
                            Ok(None)
                        }
                    }
                })
        })
        .for_each(move |status: Option<StatusResponse>| {
            if let Some(status) = status {
                wg.add_config(&status.peers).expect("failed to add new peer config");
                debug!("updated peers");
            } else {
                info!("did nothing.");
            }
            Ok(())
        }));
}

fn start(name: String) -> Result<(), Error> {
    let path = format!("/etc/wireguard/{}.conf", name);
    if !Path::new(&path).exists() {
        error!("{} missing.", path);
        bail!("join the darknet with an invite before running \"start\"");
    }

    wg.set_config_path(&path)?;
    tokio::run(lazy(|| {
        let wg = Wg::new(&name);
        wg.up()?;

        spawn_interrupt_watcher(wg);
        spawn_update_loop(wg);
    }));
    Ok(())
}

fn join(invite_code: String) -> Result<(), Error> {
    if let [host, port, code] = &invite_code.split(':').collect::<Vec<&str>>()[..] {
        debug!("endpoint: {}:{}, code: {}", host, port, code);
        let keypair = Wg::generate_keypair().unwrap();

        let join_request = JoinRequest {
            pubkey: keypair.pubkey.to_string(),
            invite: code.to_string()
        };

        let req = Request::post(format!("https://{}:{}/join", host, port))
            .header("User-Agent", "wg-dark")
            .header("Content-Type", "application/json")
            .body(serde_json::to_string(&join_request).unwrap().into())
            .unwrap();

        let wg = Wg::new(host);
        let host = host.to_string();
        let port = port.to_string();
        let fut = request(req)
            .and_then(move |json: JoinResponse| {
                debug!("json: {:?}", json);
                info!("bringing up wg interface ({})", wg.iface);

                wg.up().map_err(|_| err_msg("wg failed to be brought up"))?;
                wg.set_key_and_addr(&keypair.privkey, &json.address).map_err(|_| err_msg("failed to set privkey and address"))?;

                spawn_interrupt_watcher(wg.clone());

                wg.add_config(&format!("
                    [Peer]
                    PublicKey = {}
                    Endpoint = {}:{}
                    AllowedIPs = 10.13.37.1/24
                    PersistentKeepalive = 25
                ", json.pubkey, &host, &port))
                    .map_err(|_| err_msg("failed to set server as peer on interface"))?;
                info!("wg-dark interface up and configured.");

                spawn_update_loop(wg);
                Ok(())
            })
            .map_err(|e| { error!("{}", e); process::exit(1) });
        tokio::run(fut);
        Ok(())
    } else {
        bail!("malformed invite code");
    }
}

fn main() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "wg_dark=debug")
    }

    pretty_env_logger::init();

    let result = match Cmd::from_args() {
        Cmd::Join { invite_code } => join(invite_code),
        Cmd::Start { name } => start(name)
    };

    if let Err(e) = result {
        error!("{}", e);
        process::exit(1);
    }
}
