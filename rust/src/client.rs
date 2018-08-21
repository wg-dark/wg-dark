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
use futures::{Stream, future::{Future, FutureResult}};
use hyper::{Client, Request};
use hyper_tls::HttpsConnector;
use structopt::StructOpt;
use std::{time::{Duration, Instant}, process};
use wg::Wg;
use tokio::timer::Interval;

#[derive(StructOpt, Debug)]
#[structopt(name = "wg-dark")]
enum Cmd {
    /// Join a darknet.
    #[structopt(name = "join")]
    Join {
        invite_code: String
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
        // filer out bad status codes
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

fn main() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "wg_dark=debug")
    }

    pretty_env_logger::init();

    let cmd = Cmd::from_args();
    let keypair = Wg::generate_keypair().unwrap();
    let Cmd::Join { invite_code } = cmd;

    if let [host, port, code] = &invite_code.split(':').collect::<Vec<&str>>()[..] {
        debug!("endpoint: {}:{}, code: {}", host, port, code);

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

                wg.up(&keypair.privkey, &json.address)
                    .map_err(|_| err_msg("wg failed to be brought up"))?;

                // Now the interface is up, add a handler to clean it up
                // on exit.
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

                wg.add_config(&format!("
                    [Peer]
                    PublicKey = {}
                    Endpoint = {}:{}
                    AllowedIPs = 10.13.37.1/24
                    PersistentKeepalive = 25
                ", json.pubkey, &host, &port))
                    .map_err(|_| err_msg("failed to set server as peer on interface"))?;
                info!("wg interface up with server added as peer.");

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
                Ok(())
            })
            .map_err(|e| { error!("{}", e); process::exit(1) });
        tokio::run(fut);
    } else {
        error!("malformed invite code");
    }

}
