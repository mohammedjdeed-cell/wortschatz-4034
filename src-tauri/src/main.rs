// Windows desktop shell for Wortschatz 4034: a native window (WebView2) showing the live app,
// so it always has the newest version, the same account, sync and AI as the web app.
//
// Google blocks sign-in inside embedded app windows, so Google login runs in the normal browser:
// the app opens https://…/#desktop-login/<port>~<state> there, the page signs in with Google and POSTs the
// Google credential to http://127.0.0.1:<port>/login (this process only, random port, origin-checked),
// and we hand it to the app window, which signs in to Firebase with it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // no console window

use std::io::Read;
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const APP: &str = "https://wortschatz-4034.vercel.app/";
const HOST: &str = "wortschatz-4034.vercel.app";
const ORIGIN: &str = "https://wortschatz-4034.vercel.app";

fn header(k: &str, v: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("valid header")
}
fn cors<R: Read>(mut r: tiny_http::Response<R>) -> tiny_http::Response<R> {
    for (k, v) in [
        ("Access-Control-Allow-Origin", ORIGIN),
        ("Access-Control-Allow-Methods", "POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type"),
        ("Access-Control-Allow-Private-Network", "true"),
        ("Vary", "Origin"),
    ] {
        r.add_header(header(k, v));
    }
    r
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
            let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
            let nav = app.handle().clone();
            let handle = app.handle().clone();

            // First start of a new app version: clear the webview's cached site data (old service worker / old code).
            let version = app.package_info().version.to_string();
            let marker = app.path().app_data_dir().ok().map(|d| d.join("webview-version"));
            let fresh = marker.as_ref().map(|m| std::fs::read_to_string(m).unwrap_or_default() != version).unwrap_or(false);

            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::External("about:blank".parse::<Url>().expect("blank")))
                .title("Wortschatz 4034")
                .inner_size(1280.0, 860.0)
                .min_inner_size(380.0, 560.0)
                .center()
                .initialization_script(&format!("window.__WZ_DESKTOP = {{ port: {port} }};"))
                .on_navigation(move |url: &Url| {
                    // An in-window Google sign-in (old cached code) must never be handed to the browser: it cannot finish there.
                    let auth_redirect = url.host_str() == Some("accounts.google.com")
                        || (url.host_str() == Some(HOST) && url.path().starts_with("/__/auth/handler"));
                    if auth_redirect {
                        if let Some(w) = nav.get_webview_window("main") {
                            let _ = w.eval("location.replace('/')");
                        }
                        return false;
                    }
                    if url.host_str() == Some(HOST) {
                        // the app asks to open a page in the normal browser (Google login, external links)
                        if url.path() == "/__desktop_open" {
                            if let Some((_, u)) = url.query_pairs().find(|(k, _)| k == "u") {
                                let _ = nav.opener().open_url(u.to_string(), None::<&str>);
                            }
                            return false;
                        }
                        return true;
                    }
                    if url.scheme() == "http" || url.scheme() == "https" {
                        let _ = nav.opener().open_url(url.as_str(), None::<&str>); // other sites → normal browser
                        return false;
                    }
                    true
                })
                .build()?;
            if fresh {
                let _ = win.clear_all_browsing_data();
                if let Some(m) = &marker {
                    let _ = std::fs::create_dir_all(m.parent().unwrap());
                    let _ = std::fs::write(m, &version);
                }
            }
            win.navigate(APP.parse::<Url>().expect("app url"))?;

            std::thread::spawn(move || {
                for mut req in server.incoming_requests() {
                    if *req.method() == tiny_http::Method::Options {
                        let _ = req.respond(cors(tiny_http::Response::empty(204)));
                        continue;
                    }
                    let origin_ok = req
                        .headers()
                        .iter()
                        .any(|h| h.field.equiv("Origin") && h.value.as_str() == ORIGIN);
                    if !origin_ok || *req.method() != tiny_http::Method::Post || req.url() != "/login" {
                        let _ = req.respond(cors(tiny_http::Response::from_string("forbidden").with_status_code(403)));
                        continue;
                    }
                    let mut body = String::new();
                    let _ = req.as_reader().take(32_000).read_to_string(&mut body);
                    if serde_json::from_str::<serde_json::Value>(&body).is_err() {
                        let _ = req.respond(cors(tiny_http::Response::from_string("bad request").with_status_code(400)));
                        continue;
                    }
                    if let Some(w) = handle.get_webview_window("main") {
                        let lit = serde_json::to_string(&body).unwrap_or_else(|_| "\"{}\"".into());
                        let _ = w.eval(&format!(
                            "window.__wzDesktopLogin && window.__wzDesktopLogin(JSON.parse({lit}))"
                        ));
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                    let _ = req.respond(cors(tiny_http::Response::from_string("ok")));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Wortschatz 4034");
}
