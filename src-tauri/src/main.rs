use std::{fs, io};
use serde::{Serialize, Deserialize};
use std::path::Path;
use std::ffi::OsStr;
use base64::{Engine as _, engine::general_purpose};
use image::GenericImageView;

#[derive(Debug, Serialize, Deserialize)]
struct FileOrDir {
    name: String,
    path: String,
    is_directory: bool,
    children: Vec<FileOrDir>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ImageMetadata {
    width: u32,
    height: u32,
    format: String,
    file_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileInfo {
    name: String,
    path: String,
    size: u64,
    is_directory: bool,
    extension: Option<String>,
    is_image: bool,
}

#[tauri::command]
/// 递归地列出目录下的所有文件和子目录，并返回一个包含文件和目录信息的向量
fn list_files_and_directories_internal<P: AsRef<Path>>(dir: P) -> io::Result<FileOrDir> {
    let path = dir.as_ref();
    let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let is_directory = path.is_dir();
    let mut children = Vec::new();

    if is_directory {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let entry_path = entry.path();
            children.push(list_files_and_directories_internal(entry_path)?);
        }
    }

    Ok(FileOrDir {
        name,
        path: path.to_string_lossy().into_owned(),
        is_directory,
        children,
    })
}

#[tauri::command]
fn list_files_and_directories(dir_path: &str) -> Result<FileOrDir, String> {
    list_files_and_directories_internal(dir_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_content(file_path: &str) -> Result<Vec<u8>, String> {
    fs::read(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image_as_base64(file_path: &str) -> Result<String, String> {
    let file_content = fs::read(file_path).map_err(|e| e.to_string())?;
    let base64_content = general_purpose::STANDARD.encode(&file_content);
    
    // 根据文件扩展名确定MIME类型
    let mime_type = match Path::new(file_path)
        .extension()
        .and_then(OsStr::to_str)
        .map(|s| s.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        _ => "image/png", // 默认使用PNG
    };
    
    Ok(format!("data:{};base64,{}", mime_type, base64_content))
}

#[tauri::command]
fn file_exists(file_path: &str) -> Result<bool, String> {
    Ok(Path::new(file_path).exists())
}

#[tauri::command]
fn get_asset_path() -> String {
    "assets/example.png".to_string()
}

#[tauri::command]
/// 检查目录是否存在
fn dir_exists(dir_path: &str) -> Result<bool, String> {
    Ok(Path::new(dir_path).is_dir())
}

#[tauri::command]
/// 获取文件或目录的父目录
fn get_parent_dir(path: &str) -> Result<Option<String>, String> {
    let path = Path::new(path);
    match path.parent() {
        Some(parent) => Ok(Some(parent.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
/// 读取目录内容
fn read_directory(dir_path: &str) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(dir_path)
        .map_err(|e| e.to_string())?
        .map(|entry| {
            entry
                .map_err(|e| e.to_string())
                .map(|e| e.file_name().to_string_lossy().to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    
    Ok(entries)
}

#[tauri::command]
/// 获取文件详细信息
fn get_file_info(file_path: &str) -> Result<FileInfo, String> {
    let path = Path::new(file_path);
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    
    let name = path.file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_string();
    
    let extension = path.extension()
        .and_then(OsStr::to_str)
        .map(|s| s.to_lowercase());
    
    let is_image = match extension.as_deref() {
        Some("png") | Some("jpg") | Some("jpeg") | Some("gif") | 
        Some("webp") | Some("bmp") | Some("svg") => true,
        _ => false,
    };
    
    Ok(FileInfo {
        name,
        path: file_path.to_string(),
        size: metadata.len(),
        is_directory: metadata.is_dir(),
        extension,
        is_image,
    })
}

#[tauri::command]
/// 获取图片元数据
fn get_image_metadata(file_path: &str) -> Result<ImageMetadata, String> {
    let metadata = fs::metadata(file_path).map_err(|e| e.to_string())?;
    
    // 尝试读取图片尺寸
    let (width, height) = match image::open(file_path) {
        Ok(img) => {
            let dimensions = img.dimensions();
            (dimensions.0, dimensions.1)
        }
        Err(_) => {
            // 如果无法读取图片，返回0尺寸
            (0, 0)
        }
    };
    
    Ok(ImageMetadata {
        width,
        height,
        format: Path::new(file_path)
            .extension()
            .and_then(OsStr::to_str)
            .unwrap_or("unknown")
            .to_lowercase(),
        file_size: metadata.len(),
    })
}

#[tauri::command]
/// 批量检查文件是否存在
fn batch_file_exists(file_paths: Vec<String>) -> Result<Vec<bool>, String> {
    let results: Result<Vec<bool>, String> = file_paths
        .into_iter()
        .map(|path| Ok(Path::new(&path).exists()))
        .collect();
    
    results
}

#[tauri::command]
/// 获取目录下的所有图片文件
fn get_image_files_in_directory(dir_path: &str) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut image_files = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        if path.is_file() {
            let extension = path.extension()
                .and_then(OsStr::to_str)
                .map(|s| s.to_lowercase());
            
            let is_image = match extension.as_deref() {
                Some("png") | Some("jpg") | Some("jpeg") | Some("gif") | 
                Some("webp") | Some("bmp") | Some("svg") => true,
                _ => false,
            };
            
            if is_image {
                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                let name = path.file_name()
                    .and_then(OsStr::to_str)
                    .unwrap_or("")
                    .to_string();
                
                image_files.push(FileInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size: metadata.len(),
                    is_directory: false,
                    extension,
                    is_image: true,
                });
            }
        }
    }
    
    Ok(image_files)
}

#[tauri::command]
/// 搜索指定目录下的图片文件
fn search_image_files(dir_path: &str, pattern: &str) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut matching_files = Vec::new();
    let pattern_lower = pattern.to_lowercase();
    
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        if path.is_file() {
            let name = path.file_name()
                .and_then(OsStr::to_str)
                .unwrap_or("")
                .to_lowercase();
            
            if name.contains(&pattern_lower) {
                let extension = path.extension()
                    .and_then(OsStr::to_str)
                    .map(|s| s.to_lowercase());
                
                let is_image = match extension.as_deref() {
                    Some("png") | Some("jpg") | Some("jpeg") | Some("gif") | 
                    Some("webp") | Some("bmp") | Some("svg") => true,
                    _ => false,
                };
                
                if is_image {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    
                    matching_files.push(FileInfo {
                        name: path.file_name()
                            .and_then(OsStr::to_str)
                            .unwrap_or("")
                            .to_string(),
                        path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        is_directory: false,
                        extension,
                        is_image: true,
                    });
                }
            }
        }
    }
    
    Ok(matching_files)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_asset_path,
            list_files_and_directories,
            read_file_content,
            read_image_as_base64,
            file_exists,
            dir_exists,
            get_parent_dir,
            read_directory,
            get_file_info,
            get_image_metadata,
            batch_file_exists,
            get_image_files_in_directory,
            search_image_files
        ])
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}