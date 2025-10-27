/**
 * 文件类型检测器
 * 根据文件扩展名判断文件类型
 */

export type FileCategory = 'image' | 'gif' | 'live2d_json' | 'live2d_jsonl' | 'video_webm' | 'unknown';

export interface FileTypeInfo {
  category: FileCategory;
  ext: string;
  description: string;
}

// 支持的图片扩展名
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'webp'];

// 支持的视频扩展名（WebM）
const VIDEO_WEBM_EXTENSIONS = ['webm'];

// Live2D JSON 扩展名
const LIVE2D_JSON_EXTENSIONS = ['json'];

// Live2D JSONL 扩展名
const LIVE2D_JSONL_EXTENSIONS = ['jsonl'];

// GIF 扩展名
const GIF_EXTENSIONS = ['gif'];

/**
 * 获取文件扩展名（小写）
 * @param filePath 文件路径或文件名
 * @returns 扩展名，如果没有则返回空字符串
 */
export function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * 根据文件路径判断文件类型
 * @param filePath 文件路径或文件名
 * @returns 文件类型信息
 */
export function detectFileType(filePath: string): FileTypeInfo {
  const ext = getFileExtension(filePath);
  
  // GIF
  if (GIF_EXTENSIONS.includes(ext)) {
    return {
      category: 'gif',
      ext,
      description: 'GIF 动图'
    };
  }
  
  // WebM 视频
  if (VIDEO_WEBM_EXTENSIONS.includes(ext)) {
    return {
      category: 'video_webm',
      ext,
      description: 'WebM 视频'
    };
  }
  
  // Live2D JSONL（聚合模型）
  if (LIVE2D_JSONL_EXTENSIONS.includes(ext)) {
    return {
      category: 'live2d_jsonl',
      ext,
      description: 'Live2D JSONL 聚合模型'
    };
  }
  
  // Live2D JSON（单体模型）
  if (LIVE2D_JSON_EXTENSIONS.includes(ext)) {
    return {
      category: 'live2d_json',
      ext,
      description: 'Live2D JSON 模型'
    };
  }
  
  // 普通图片
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return {
      category: 'image',
      ext,
      description: '静态图片'
    };
  }
  
  // 未知类型
  return {
    category: 'unknown',
    ext,
    description: '未知类型'
  };
}

/**
 * 判断是否为图片类型（包括 GIF）
 * @param filePath 文件路径
 * @returns 是否为图片
 */
export function isImageType(filePath: string): boolean {
  const type = detectFileType(filePath);
  return type.category === 'image' || type.category === 'gif';
}

/**
 * 判断是否为 GIF
 * @param filePath 文件路径
 * @returns 是否为 GIF
 */
export function isGifType(filePath: string): boolean {
  return detectFileType(filePath).category === 'gif';
}

/**
 * 判断是否为 Live2D JSON 模型
 * @param filePath 文件路径
 * @returns 是否为 Live2D JSON
 */
export function isLive2DJsonType(filePath: string): boolean {
  return detectFileType(filePath).category === 'live2d_json';
}

/**
 * 判断是否为 Live2D JSONL 聚合模型
 * @param filePath 文件路径
 * @returns 是否为 Live2D JSONL
 */
export function isLive2DJsonlType(filePath: string): boolean {
  return detectFileType(filePath).category === 'live2d_jsonl';
}

/**
 * 判断是否为 WebM 视频
 * @param filePath 文件路径
 * @returns 是否为 WebM
 */
export function isWebmType(filePath: string): boolean {
  return detectFileType(filePath).category === 'video_webm';
}

/**
 * 判断是否为 Live2D 模型（JSON 或 JSONL）
 * @param filePath 文件路径
 * @returns 是否为 Live2D 模型
 */
export function isLive2DType(filePath: string): boolean {
  const type = detectFileType(filePath);
  return type.category === 'live2d_json' || type.category === 'live2d_jsonl';
}

/**
 * 获取文件的 MIME 类型
 * @param filePath 文件路径
 * @returns MIME 类型
 */
export function getMimeType(filePath: string): string {
  const ext = getFileExtension(filePath);
  
  const mimeMap: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'webm': 'video/webm',
    'json': 'application/json',
    'jsonl': 'application/x-ndjson',
  };
  
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 文件类型转换：FileCategory -> figureManager 的 FigureSourceType
 * @param category 文件类别
 * @returns figureManager 支持的类型
 */
export function convertToFigureSourceType(category: FileCategory): 'img' | 'gif' | 'video' | 'webm' | 'live2d' | 'jsonl' {
  switch (category) {
    case 'gif':
      return 'gif';
    case 'video_webm':
      return 'webm';
    case 'live2d_json':
      return 'live2d';
    case 'live2d_jsonl':
      return 'jsonl';
    case 'image':
    default:
      return 'img';
  }
}

