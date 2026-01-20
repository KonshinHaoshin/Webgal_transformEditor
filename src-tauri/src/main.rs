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
async fn open_script_output_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    // 检查窗口是否已经存在
    if let Some(window) = app.get_webview_window("script-output") {
        window.set_focus().map_err(|e| format!("设置焦点失败: {}", e))?;
        return Ok(());
    }
    
    // 创建新窗口
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "script-output",
        tauri::WebviewUrl::App("script-output.html".into())
    )
    .title("输出脚本")
    .inner_size(800.0, 600.0)
    .min_inner_size(600.0, 400.0)
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
fn extract_jsonl_motions_expressions(file_path: String, game_folder: Option<String>) -> Result<serde_json::Value, String> {
    use serde_json::{json, Value};
    
    // 构造完整文件路径
    let full_path = if let Some(game_folder) = game_folder {
        // 如果提供了游戏文件夹，将相对路径转换为绝对路径
        let game_path = Path::new(&game_folder);
        let file_path_obj = Path::new(&file_path);
        
        // 如果 file_path 已经是绝对路径，直接使用
        if file_path_obj.is_absolute() {
            file_path_obj.to_path_buf()
        } else {
            // 否则相对于游戏文件夹的 game/figure 目录
            // file_path 已经是相对于 game/figure 的路径（如 "爱音睡衣/爱音睡衣/爱音睡衣/model.jsonl"）
            game_path.join("game").join("figure").join(file_path)
        }
    } else {
        // 如果没有游戏文件夹，假设 file_path 是绝对路径
        Path::new(&file_path).to_path_buf()
    };
    
    // 检查文件是否存在
    if !full_path.exists() {
        return Err(format!("文件不存在: {:?}", full_path));
    }
    
    if !full_path.is_file() {
        return Err(format!("路径不是文件: {:?}", full_path));
    }
    
    // 读取文件内容
    let content = fs::read_to_string(&full_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    let mut motions: Vec<String> = Vec::new();
    let mut expressions: Vec<String> = Vec::new();
    
    // 根据文件扩展名判断是 JSON 还是 JSONL
    let ext = full_path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    
    if ext == "json" {
        // 解析 JSON 文件（整个文件是一个 JSON 对象）
        match serde_json::from_str::<Value>(&content) {
            Ok(obj) => {
                // 提取 motions
                if let Some(motions_val) = obj.get("motions") {
                    if let Some(motions_arr) = motions_val.as_array() {
                        // 如果是数组，提取字符串或对象的 name/file/id
                        for m in motions_arr {
                            if let Some(m_str) = m.as_str() {
                                motions.push(m_str.to_string());
                            } else if let Some(m_obj) = m.as_object() {
                                // 如果是对象，尝试提取 name/file/id 字段
                                if let Some(name) = m_obj.get("name").and_then(|n| n.as_str()) {
                                    motions.push(name.to_string());
                                } else if let Some(file) = m_obj.get("file").and_then(|f| f.as_str()) {
                                    motions.push(file.to_string());
                                } else if let Some(id) = m_obj.get("id").and_then(|i| i.as_str()) {
                                    motions.push(id.to_string());
                                }
                            }
                        }
                    } else if let Some(motions_obj) = motions_val.as_object() {
                        // 如果是对象，提取所有键名
                        motions = motions_obj.keys().map(|k| k.to_string()).collect();
                    }
                }
                
                // 提取 expressions
                if let Some(expressions_val) = obj.get("expressions") {
                    if let Some(expressions_arr) = expressions_val.as_array() {
                        // 如果是数组，提取字符串或对象的 name/file/id
                        for e in expressions_arr {
                            if let Some(e_str) = e.as_str() {
                                expressions.push(e_str.to_string());
                            } else if let Some(e_obj) = e.as_object() {
                                // 如果是对象，尝试提取 name/file/id 字段
                                if let Some(name) = e_obj.get("name").and_then(|n| n.as_str()) {
                                    expressions.push(name.to_string());
                                } else if let Some(file) = e_obj.get("file").and_then(|f| f.as_str()) {
                                    expressions.push(file.to_string());
                                } else if let Some(id) = e_obj.get("id").and_then(|i| i.as_str()) {
                                    expressions.push(id.to_string());
                                }
                            }
                        }
                    } else if let Some(expressions_obj) = expressions_val.as_object() {
                        // 如果是对象，提取所有键名
                        expressions = expressions_obj.keys().map(|k| k.to_string()).collect();
                    }
                }
            }
            Err(e) => {
                return Err(format!("解析 JSON 文件失败: {}", e));
            }
        }
    } else {
        // 解析 JSONL 文件（每行一个 JSON 对象）
        let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
        
        // 从后往前查找包含 motions 或 expressions 的行（通常是最后一行）
        for line in lines.iter().rev() {
            match serde_json::from_str::<Value>(line) {
                Ok(obj) => {
                    // 检查是否是汇总行（包含 motions 或 expressions）
                    if obj.get("motions").is_some() || obj.get("expressions").is_some() {
                        // 提取 motions
                        if let Some(motions_val) = obj.get("motions") {
                            if let Some(motions_arr) = motions_val.as_array() {
                                for m in motions_arr {
                                    if let Some(m_str) = m.as_str() {
                                        motions.push(m_str.to_string());
                                    } else if let Some(m_obj) = m.as_object() {
                                        // 如果是对象，尝试提取 name/file/id 字段
                                        if let Some(name) = m_obj.get("name").and_then(|n| n.as_str()) {
                                            motions.push(name.to_string());
                                        } else if let Some(file) = m_obj.get("file").and_then(|f| f.as_str()) {
                                            motions.push(file.to_string());
                                        } else if let Some(id) = m_obj.get("id").and_then(|i| i.as_str()) {
                                            motions.push(id.to_string());
                                        }
                                    }
                                }
                            } else if let Some(motions_obj) = motions_val.as_object() {
                                // 如果是对象，提取所有键名
                                motions = motions_obj.keys().map(|k| k.to_string()).collect();
                            }
                        }
                        
                        // 提取 expressions
                        if let Some(expressions_val) = obj.get("expressions") {
                            if let Some(expressions_arr) = expressions_val.as_array() {
                                for e in expressions_arr {
                                    if let Some(e_str) = e.as_str() {
                                        expressions.push(e_str.to_string());
                                    } else if let Some(e_obj) = e.as_object() {
                                        // 如果是对象，尝试提取 name/file/id 字段
                                        if let Some(name) = e_obj.get("name").and_then(|n| n.as_str()) {
                                            expressions.push(name.to_string());
                                        } else if let Some(file) = e_obj.get("file").and_then(|f| f.as_str()) {
                                            expressions.push(file.to_string());
                                        } else if let Some(id) = e_obj.get("id").and_then(|i| i.as_str()) {
                                            expressions.push(id.to_string());
                                        }
                                    }
                                }
                            } else if let Some(expressions_obj) = expressions_val.as_object() {
                                // 如果是对象，提取所有键名
                                expressions = expressions_obj.keys().map(|k| k.to_string()).collect();
                            }
                        }
                        
                        // 找到汇总行后就可以返回了
                        break;
                    }
                }
                Err(_) => {
                    // 忽略解析失败的行
                    continue;
                }
            }
        }
    }
    
    Ok(json!({
        "motions": motions,
        "expressions": expressions
    }))
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
                    // 默认先根据文件名判断，增加鲁棒性
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    let looks_like_model = file_name.to_lowercase().contains(".char.json") || 
                                         file_name.to_lowercase().contains("model.json");
                    
                    let mut is_live2d_file = looks_like_model;
                    let mut is_mano_file = looks_like_model;
                    let parent_dir = path.parent();

                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            // 检查是否包含 model, textures, motions 字段（Cubism 2 格式）
                            if json.get("model").is_some() || 
                               json.get("textures").is_some() || 
                               json.get("motions").is_some() {
                                is_live2d_file = true;
                                // ... (textures extraction code continues)
                                
                                // 提取 textures 并加入排除列表
                                if let Some(textures) = json.get("textures").and_then(|t| t.as_array()) {
                                    for texture in textures {
                                        if let Some(tex_path) = texture.as_str() {
                                            // 使用 json 文件的父目录作为基准
                                            if let Some(parent) = parent_dir {
                                                let tex_full_path = parent.join(tex_path);
                                                if let Ok(tex_relative) = tex_full_path.strip_prefix(base_dir) {
                                                    excluded_files.insert(tex_relative.to_string_lossy().replace('\\', "/"));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            // 检查是否包含 Version 和 FileReferences 字段（Cubism 3/4 格式）
                            else if json.get("Version").is_some() && json.get("FileReferences").is_some() {
                                is_live2d_file = true;
                                
                                // 提取 FileReferences 中的文件引用并加入排除列表
                                if let Some(file_refs) = json.get("FileReferences").and_then(|fr| fr.as_object()) {
                                    // 提取 Textures 数组中的贴图文件
                                    if let Some(textures) = file_refs.get("Textures").and_then(|t| t.as_array()) {
                                        for texture in textures {
                                            if let Some(tex_path) = texture.as_str() {
                                                if let Some(parent) = parent_dir {
                                                    let tex_full_path = parent.join(tex_path);
                                                    if let Ok(tex_relative) = tex_full_path.strip_prefix(base_dir) {
                                                        excluded_files.insert(tex_relative.to_string_lossy().replace('\\', "/"));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    // 提取 Physics 文件（如果存在）
                                    if let Some(physics) = file_refs.get("Physics").and_then(|p| p.as_str()) {
                                        if let Some(parent) = parent_dir {
                                            let physics_full_path = parent.join(physics);
                                            if let Ok(physics_relative) = physics_full_path.strip_prefix(base_dir) {
                                                excluded_files.insert(physics_relative.to_string_lossy().replace('\\', "/"));
                                            }
                                        }
                                    }
                                    
                                    // 提取 DisplayInfo 文件（如果存在）
                                    if let Some(display_info) = file_refs.get("DisplayInfo").and_then(|d| d.as_str()) {
                                        if let Some(parent) = parent_dir {
                                            let display_info_full_path = parent.join(display_info);
                                            if let Ok(display_info_relative) = display_info_full_path.strip_prefix(base_dir) {
                                                excluded_files.insert(display_info_relative.to_string_lossy().replace('\\', "/"));
                                            }
                                        }
                                    }
                                    
                                    // 提取 Moc 文件（如果存在）
                                    if let Some(moc) = file_refs.get("Moc").and_then(|m| m.as_str()) {
                                        if let Some(parent) = parent_dir {
                                            let moc_full_path = parent.join(moc);
                                            if let Ok(moc_relative) = moc_full_path.strip_prefix(base_dir) {
                                                excluded_files.insert(moc_relative.to_string_lossy().replace('\\', "/"));
                                            }
                                        }
                                    }
                                }
                            }
                            // 检查是否包含 settings, assets, controller 字段 (Mano 格式)
                            // 兼容 "setting" 或 "settings"
                            if json.get("settings").is_some() || 
                                    json.get("setting").is_some() || 
                                    json.get("assets").is_some() || 
                                    json.get("controller").is_some() {
                                is_mano_file = true;
                                
                                // 提取 assets 中的 layers 并加入排除列表
                                if let Some(assets) = json.get("assets") {
                                    if let Some(layers) = assets.get("layers").and_then(|l| l.as_array()) {
                                        for layer in layers {
                                            if let Some(layer_path) = layer.get("path").and_then(|p| p.as_str()) {
                                                // 使用 json 文件的父目录作为基准
                                                if let Some(parent) = parent_dir {
                                                    let img_full_path = parent.join(layer_path);
                                                    if let Ok(img_relative) = img_full_path.strip_prefix(base_dir) {
                                                        excluded_files.insert(img_relative.to_string_lossy().replace('\\', "/"));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // 如果是 Live2D 或 Mano 文件，添加到结果列表中
                            if is_live2d_file || is_mano_file {
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
        .invoke_handler(tauri::generate_handler![get_asset_path, scan_directory_recursive, start_local_server, open_filter_editor_window, open_script_output_window, extract_jsonl_motions_expressions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
