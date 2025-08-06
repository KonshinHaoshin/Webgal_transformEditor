#[tauri::command]
fn get_asset_path() -> String {
    "assets/example.png".to_string()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_asset_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
