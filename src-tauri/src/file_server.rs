use std::fs;
use std::path::Path;
use std::sync::Arc;
use tiny_http::{Response, Server};
use urlencoding;

pub fn start_file_server(port: u16, base_path: String) -> Option<std::thread::JoinHandle<()>> {
    let address = format!("127.0.0.1:{}", port);

    match Server::http(&address) {
        Ok(server) => {
            println!("✅ 文件服务器已启动: http://{}", address);
            let base_path_arc = Arc::new(base_path);

            let handle = std::thread::spawn(move || {
                for request in server.incoming_requests() {
                    let url = request.url();
                    let base_path = Arc::clone(&base_path_arc);

                    // 处理请求
                    let response = handle_request(url, base_path);
                    match request.respond(response) {
                        Ok(_) => {}
                        Err(e) => eprintln!("发送响应失败: {}", e),
                    }
                }
            });

            Some(handle)
        }
        Err(e) => {
            eprintln!("启动文件服务器失败: {}", e);
            None
        }
    }
}

fn handle_request(url: &str, base_path: Arc<String>) -> Response<std::io::Cursor<Vec<u8>>> {
    // 移除查询参数
    let path_part_encoded = url.split('?').next().unwrap_or(url);

    println!("🔍 请求 URL: {}", url);
    println!("🔍 路径部分（编码前）: {}", path_part_encoded);

    // 解码 URL 编码的路径
    let path_part = urlencoding::decode(path_part_encoded)
        .map(|s| s.to_string())
        .unwrap_or_else(|_| path_part_encoded.to_string());

    println!("🔍 路径部分（解码后）: {}", path_part);
    println!("🔍 基础路径: {}", *base_path);

    // 构造完整文件路径
    let file_path = Path::new(&*base_path).join(path_part.trim_start_matches('/'));

    println!("🔍 完整文件路径: {:?}", file_path);

    // 检查文件是否存在
    if !file_path.exists() || !file_path.is_file() {
        return add_cors_headers(Response::from_string("File not found").with_status_code(404));
    }

    // 读取文件
    match fs::read(&file_path) {
        Ok(content) => {
            // 猜测 MIME 类型
            let mime_type = guess_mime_type(&file_path);

            // 构造响应
            let mut response = Response::from_data(content).with_status_code(200);

            // 添加 Content-Type header
            if let Ok(header) =
                tiny_http::Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes())
            {
                response = response.with_header(header);
            }

            // 添加所有 CORS headers
            add_cors_headers(response)
        }
        Err(e) => {
            eprintln!("读取文件失败: {}", e);
            add_cors_headers(
                Response::from_string(format!("Internal Server Error: {}", e))
                    .with_status_code(500),
            )
        }
    }
}

fn add_cors_headers(
    mut response: Response<std::io::Cursor<Vec<u8>>>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    if let Ok(header) = tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], b"*") {
        response = response.with_header(header);
    }
    if let Ok(header) =
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Methods"[..], b"GET, POST, OPTIONS")
    {
        response = response.with_header(header);
    }
    if let Ok(header) =
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Headers"[..], b"Content-Type")
    {
        response = response.with_header(header);
    }
    response
}

fn guess_mime_type(path: &Path) -> String {
    if let Some(ext) = path.extension() {
        match ext.to_string_lossy().to_lowercase().as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "webm" => "video/webm",
            "json" => "application/json",
            "jsonl" => "application/x-ndjson",
            "moc" => "application/octet-stream",
            "moc3" => "application/octet-stream",
            "physics" | "physics3" => "application/octet-stream",
            "motion" | "motion3" => "application/octet-stream",
            "expression" | "exp3" => "application/octet-stream",
            "mtn" => "application/octet-stream",
            "exp" => "application/octet-stream",
            _ => "application/octet-stream",
        }
        .to_string()
    } else {
        "application/octet-stream".to_string()
    }
}
