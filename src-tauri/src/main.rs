// Windows desktop shell for Wortschatz 4034: a native window (WebView2) showing the live app,
// so it always has the newest version, the same account, sync and AI as the web app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // no console window

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Wortschatz 4034");
}
