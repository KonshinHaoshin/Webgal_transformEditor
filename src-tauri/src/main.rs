use std::fs;
use std::path::Path;
mod file_server;

static mut FILE_SERVER_HANDLE: Option<std::thread::JoinHandle<()>> = None;
static mut FILE_SERVER_PORT: u16 = 0;
static mut FILE_SERVER_BASE_PATH: Option<String> = None;

#[tauri::command]
fn get_asset_path() -> String {
    "assets/example.png".to_string()
}

#[tauri::command]
fn start_local_server(base_path: String) -> Result<String, String> {
    unsafe {
        // 如果服务器已经在运行，先停止它
        if let Some(handle) = FILE_SERVER_HANDLE.take() {
            handle.thread().unpark();
        }
        
        // 查找可用端口
        let port = find_available_port(8000).ok_or("找不到可用端口")?;
        FILE_SERVER_PORT = port;
        FILE_SERVER_BASE_PATH = Some(base_path.clone());
        
        // 启动文件服务器
        if let Some(handle) = file_server::start_file_server(port, base_path) {
            FILE_SERVER_HANDLE = Some(handle);
            Ok(format!("http://127.0.0.1:{}", port))
        } else {
            Err("启动文件服务器失败".to_string())
        }
    }
}

fn find_available_port(start_port: u16) -> Option<u16> {
    use std::net::TcpListener;
    for port in start_port..=start_port + 100 {
        if TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return Some(port);
        }
    }
    None
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
                
                // 对于 JSON 文件，检查是否包含 Live2D 模型字段
                if ext_lower.as_str() == "json" {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            // 检查是否包含 model, textures, motions 字段
                            if json.get("model").is_some() || 
                               json.get("textures").is_some() || 
                               json.get("motions").is_some() {
                                let relative_path = path.strip_prefix(base_dir)
                                    .map_err(|e| format!("计算相对路径失败: {}", e))?;
                                files.push(relative_path.to_string_lossy().replace('\\', "/"));
                            }
                        }
                    }
                } else if ["jsonl", "png", "jpg", "jpeg", "gif", "bmp", "webp", "webm"].contains(&ext_lower.as_str()) {
                    // 其他文件类型直接添加
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
        .invoke_handler(tauri::generate_handler![get_asset_path, scan_directory_recursive, start_local_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
