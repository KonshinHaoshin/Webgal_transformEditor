use std::fs;
use std::path::Path;

#[tauri::command]
fn get_asset_path() -> String {
    "assets/example.png".to_string()
}

#[tauri::command]
fn scan_directory_recursive(dir_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir_path);
    
    if !path.exists() {
        return Err(format!("路径不存在: {}", dir_path));
    }
    
    if !path.is_dir() {
        return Err(format!("路径不是目录: {}", dir_path));
    }
    
    let mut files = Vec::new();
    
    fn walk_dir(dir: &Path, base_dir: &Path, files: &mut Vec<String>) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))? {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();
            
            if path.is_dir() {
                walk_dir(&path, base_dir, files)?;
            } else if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                // 支持所有图像文件、视频文件(gif, webm)和配置文件(json, jsonl)
                if ["png", "jpg", "jpeg", "gif", "bmp", "webp", "webm", "json", "jsonl"].contains(&ext_lower.as_str()) {
                    let relative_path = path.strip_prefix(base_dir)
                        .map_err(|e| format!("计算相对路径失败: {}", e))?;
                    files.push(relative_path.to_string_lossy().replace('\\', "/"));
                }
            }
        }
        Ok(())
    }
    
    walk_dir(path, path, &mut files)?;
    Ok(files)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_asset_path, scan_directory_recursive])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
