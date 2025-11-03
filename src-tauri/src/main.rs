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
async fn open_filter_editor_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    // 检查窗口是否已经存在
    if let Some(window) = app.get_webview_window("filter-editor") {
        window.set_focus().map_err(|e| format!("设置焦点失败: {}", e))?;
        return Ok(());
    }
    
    // 创建新窗口
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "filter-editor",
        tauri::WebviewUrl::App("filter-editor.html".into())
    )
    .title("滤镜编辑器")
    .inner_size(450.0, 600.0)
    .min_inner_size(375.0, 450.0)
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;
    
    window.set_focus().map_err(|e| format!("设置焦点失败: {}", e))?;
    
    Ok(())
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
    let mut excluded_files = std::collections::HashSet::new();
    
    fn walk_dir(dir: &Path, base_dir: &Path, files: &mut Vec<String>, excluded_files: &mut std::collections::HashSet<String>) -> Result<(), String> {
        // 先收集并排序：确保 jsonl/json 先于 png 等被处理，从而先填充 excluded_files
        let mut entries: Vec<std::path::PathBuf> = Vec::new();
        for entry in fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))? {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            entries.push(entry.path());
        }
        entries.sort_by(|a, b| {
            let a_ext = a.extension().and_then(|e| Some(e.to_string_lossy().to_lowercase())).unwrap_or_default();
            let b_ext = b.extension().and_then(|e| Some(e.to_string_lossy().to_lowercase())).unwrap_or_default();
            let a_rank = if a_ext == "jsonl" || a_ext == "json" { 0 } else { 1 };
            let b_rank = if b_ext == "jsonl" || b_ext == "json" { 0 } else { 1 };
            a_rank.cmp(&b_rank)
        });
        
        for path in entries.into_iter() {
            
            if path.is_dir() {
                walk_dir(&path, base_dir, files, excluded_files)?;
            } else if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                
                // 处理 JSONL 聚合模型文件
                if ext_lower.as_str() == "jsonl" {
                    if let Ok(content) = fs::read_to_string(&path) {
                        // 解析 JSONL，每行一个 JSON 对象
                        for line in content.lines() {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                                if let Some(path_str) = json.get("path").and_then(|p| p.as_str()) {
                                    // 获取父目录
                                    if let Some(parent_dir) = path.parent() {
                                        let sub_model_path = parent_dir.join(path_str);
                                        if let Ok(relative_path) = sub_model_path.strip_prefix(base_dir) {
                                            let relative_str = relative_path.to_string_lossy().replace('\\', "/");
                                            excluded_files.insert(relative_str);
                                            
                                            // 也读取该子模型，提取 textures
                                            if sub_model_path.exists() && sub_model_path.is_file() {
                                                if let Ok(sub_content) = fs::read_to_string(&sub_model_path) {
                                                    if let Ok(sub_json) = serde_json::from_str::<serde_json::Value>(&sub_content) {
                                                        if let Some(textures) = sub_json.get("textures").and_then(|t| t.as_array()) {
                                                            for texture in textures {
                                                                if let Some(tex_path) = texture.as_str() {
                                                                    // 纹理路径以子模型 json 所在目录为基准
                                                                    let tex_base = sub_model_path.parent().unwrap_or(parent_dir);
                                                                    let tex_full_path = tex_base.join(tex_path);
                                                                    if let Ok(tex_relative) = tex_full_path.strip_prefix(base_dir) {
                                                                        excluded_files.insert(tex_relative.to_string_lossy().replace('\\', "/"));
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // JSONL 文件本身应该包含在结果中
                    let relative_path = path.strip_prefix(base_dir)
                        .map_err(|e| format!("计算相对路径失败: {}", e))?;
                    files.push(relative_path.to_string_lossy().replace('\\', "/"));
                }
                // 对于普通 JSON 文件，检查是否包含 Live2D 模型字段
                else if ext_lower.as_str() == "json" {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            // 检查是否包含 model, textures, motions 字段
                            if json.get("model").is_some() || 
                               json.get("textures").is_some() || 
                               json.get("motions").is_some() {
                                let relative_path = path.strip_prefix(base_dir)
                                    .map_err(|e| format!("计算相对路径失败: {}", e))?;
                                let relative_str = relative_path.to_string_lossy().replace('\\', "/");
                                
                                // 提取 textures 并加入排除列表
                                if let Some(textures) = json.get("textures").and_then(|t| t.as_array()) {
                                    for texture in textures {
                                        if let Some(tex_path) = texture.as_str() {
                                            // 使用 json 文件的父目录作为基准
                                            if let Some(parent_dir) = path.parent() {
                                                let tex_full_path = parent_dir.join(tex_path);
                                                if let Ok(tex_relative) = tex_full_path.strip_prefix(base_dir) {
                                                    excluded_files.insert(tex_relative.to_string_lossy().replace('\\', "/"));
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // 只添加未被排除的文件
                                if !excluded_files.contains(&relative_str) {
                                    files.push(relative_str);
                                }
                            }
                        }
                    }
                } else if ["png", "jpg", "jpeg", "gif", "bmp", "webp", "webm"].contains(&ext_lower.as_str()) {
                    // 其他文件类型直接添加（但也要排除）
                    let relative_path = path.strip_prefix(base_dir)
                        .map_err(|e| format!("计算相对路径失败: {}", e))?;
                    let relative_str = relative_path.to_string_lossy().replace('\\', "/");
                    // 只添加未被排除的文件
                    if !excluded_files.contains(&relative_str) {
                        files.push(relative_str);
                    }
                }
            }
        }
        Ok(())
    }
    
    walk_dir(path, path, &mut files, &mut excluded_files)?;
    Ok(files)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_asset_path, scan_directory_recursive, start_local_server, open_filter_editor_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
