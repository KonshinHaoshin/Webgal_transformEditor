import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

export interface WebGALGameConfig {
  gameFolder: string;
  figureFolder: string;
}

// 全局存储当前选择的游戏文件夹配置
let currentGameConfig: WebGALGameConfig | null = null;

/**
 * 选择WebGAL游戏文件夹
 */
export async function selectWebGALGameFolder(): Promise<WebGALGameConfig | null> {
  try {
    const selectedPath = await open({
      directory: true,
      title: '选择WebGAL游戏文件夹',
      multiple: false,
    });

    if (!selectedPath || typeof selectedPath !== 'string') {
      return null;
    }

    // 检查是否是有效的WebGAL游戏文件夹
    const gameFolder = selectedPath;
    const figureFolder = `${gameFolder}/game/figure`;
    
    // 使用自定义命令检查figure文件夹是否存在
    const figureExists = await invoke<boolean>('file_exists', { filePath: figureFolder });
    if (!figureExists) {
      console.error(`❌ 选择的文件夹不是有效的WebGAL游戏文件夹！\n缺少 game/figure 目录`);
      return null;
    }

    const config: WebGALGameConfig = {
      gameFolder,
      figureFolder,
    };

    currentGameConfig = config;
    console.log('🎮 WebGAL游戏文件夹已选择:', config);
    return config;
  } catch (error) {
    console.error('❌ 选择游戏文件夹失败:', error);
    return null;
  }
}

/**
 * 获取当前选择的游戏配置
 */
export function getCurrentGameConfig(): WebGALGameConfig | null {
  return currentGameConfig;
}

/**
 * 解析changeFigure或changeBg的路径
 * 如果路径是相对路径，则从游戏文件夹的figure目录中查找
 * 如果路径是绝对路径，则直接使用
 */
export async function resolveWebGALPath(originalPath: string): Promise<string> {
  if (!currentGameConfig) {
    console.warn('⚠️ 未选择WebGAL游戏文件夹，使用原始路径:', originalPath);
    return originalPath;
  }

  // 如果路径已经是绝对路径，直接返回
  if (originalPath.includes(':') || originalPath.startsWith('/')) {
    return originalPath;
  }

  // 相对路径，从游戏文件夹的figure目录中查找
  const resolvedPath = `${currentGameConfig.figureFolder}/${originalPath}`;
  
  // 使用自定义命令检查文件是否存在
  try {
    const fileExists = await invoke<boolean>('file_exists', { filePath: resolvedPath });
    if (fileExists) {
      console.log('✅ 找到WebGAL资源文件:', resolvedPath);
      return resolvedPath;
    } else {
      console.warn('⚠️ WebGAL资源文件不存在:', resolvedPath);
      return originalPath; // 如果文件不存在，返回原始路径
    }
  } catch (error) {
    console.error('❌ 检查文件存在性失败:', error);
    return originalPath;
  }
}

/**
 * 清除当前游戏配置
 */
export function clearGameConfig(): void {
  currentGameConfig = null;
  console.log('🗑️ WebGAL游戏配置已清除');
}

/**
 * 获取游戏文件夹的显示名称
 */
export function getGameFolderDisplayName(): string {
  if (!currentGameConfig) {
    return '未选择';
  }
  
  // 提取文件夹名称
  const parts = currentGameConfig.gameFolder.split(/[/\\]/);
  return parts[parts.length - 1] || currentGameConfig.gameFolder;
}

/**
 * 加载图片文件
 */
export async function loadImageFromPath(imagePath: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    console.log('🖼️ WebGAL 开始加载图片:', imagePath);
    const img = new Image();
    img.onload = () => {
      console.log('✅ WebGAL 图片加载成功:', imagePath, '尺寸:', img.width, 'x', img.height);
      resolve(img);
    };
    img.onerror = (error) => {
      console.error('❌ WebGAL 图片加载失败:', imagePath, '错误:', error);
      resolve(null);
    };
    // 在 Tauri 应用中，本地文件路径需要使用 file:// 协议
    let srcPath = imagePath;
    if (!imagePath.startsWith('http') && !imagePath.startsWith('file://')) {
      srcPath = `file://${imagePath}`;
    }
    console.log('🔗 WebGAL 设置图片源:', srcPath);
    img.src = srcPath;
  });
}

/**
 * 根据 WebGAL 路径加载图片
 */
export async function loadWebGALImage(originalPath: string): Promise<HTMLImageElement | null> {
  const resolvedPath = await resolveWebGALPath(originalPath);
  return await loadImageFromPath(resolvedPath);
}

/**
 * 使用 Tauri 命令读取图片为 base64
 */
export async function loadWebGALImageAsBase64(originalPath: string): Promise<HTMLImageElement | null> {
  const resolvedPath = await resolveWebGALPath(originalPath);
  
  try {
    console.log('🔄 使用 Tauri 命令读取图片:', resolvedPath);
    const base64Data = await invoke<string>('read_image_as_base64', { filePath: resolvedPath });
    console.log('✅ 图片读取成功，转换为 base64');
    
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('✅ Base64 图片加载成功:', resolvedPath, '尺寸:', img.width, 'x', img.height);
        resolve(img);
      };
      img.onerror = (error) => {
        console.error('❌ Base64 图片加载失败:', resolvedPath, '错误:', error);
        resolve(null);
      };
      img.src = base64Data;
    });
  } catch (error) {
    console.error('❌ Tauri 命令读取图片失败:', error);
    return null;
  }
}

/**
 * 获取图片元数据
 */
export async function getImageMetadata(imagePath: string): Promise<{ width: number; height: number; format: string; file_size: number } | null> {
  try {
    const resolvedPath = await resolveWebGALPath(imagePath);
    const metadata = await invoke<{ width: number; height: number; format: string; file_size: number }>('get_image_metadata', { filePath: resolvedPath });
    console.log('📊 图片元数据:', metadata);
    return metadata;
  } catch (error) {
    console.error('❌ 获取图片元数据失败:', error);
    return null;
  }
}

/**
 * 获取文件详细信息
 */
export async function getFileInfo(filePath: string): Promise<{ name: string; path: string; size: number; is_directory: boolean; extension: string | null; is_image: boolean } | null> {
  try {
    const resolvedPath = await resolveWebGALPath(filePath);
    const fileInfo = await invoke<{ name: string; path: string; size: number; is_directory: boolean; extension: string | null; is_image: boolean }>('get_file_info', { filePath: resolvedPath });
    console.log('📁 文件信息:', fileInfo);
    return fileInfo;
  } catch (error) {
    console.error('❌ 获取文件信息失败:', error);
    return null;
  }
}

/**
 * 获取目录下的所有图片文件
 */
export async function getImageFilesInDirectory(dirPath: string): Promise<Array<{ name: string; path: string; size: number; is_directory: boolean; extension: string | null; is_image: boolean }>> {
  try {
    const resolvedPath = await resolveWebGALPath(dirPath);
    const imageFiles = await invoke<Array<{ name: string; path: string; size: number; is_directory: boolean; extension: string | null; is_image: boolean }>>('get_image_files_in_directory', { dirPath: resolvedPath });
    console.log('🖼️ 目录中的图片文件:', imageFiles);
    return imageFiles;
  } catch (error) {
    console.error('❌ 获取目录图片文件失败:', error);
    return [];
  }
}

/**
 * 搜索图片文件
 */
export async function searchImageFiles(dirPath: string, pattern: string): Promise<Array<{ name: string; path: string; size: number; is_directory: boolean; extension: string | null; is_image: boolean }>> {
  try {
    const resolvedPath = await resolveWebGALPath(dirPath);
    const matchingFiles = await invoke<Array<{ name: string; path: string; size: number; is_directory: boolean; extension: string | null; is_image: boolean }>>('search_image_files', { 
      dirPath: resolvedPath, 
      pattern 
    });
    console.log('🔍 搜索结果:', matchingFiles);
    return matchingFiles;
  } catch (error) {
    console.error('❌ 搜索图片文件失败:', error);
    return [];
  }
}

/**
 * 批量检查文件是否存在
 */
export async function batchFileExists(filePaths: string[]): Promise<boolean[]> {
  try {
    const results = await invoke<boolean[]>('batch_file_exists', { filePaths });
    console.log('✅ 批量文件存在性检查完成:', results);
    return results;
  } catch (error) {
    console.error('❌ 批量文件存在性检查失败:', error);
    return filePaths.map(() => false);
  }
}

/**
 * 解析背景图片路径
 */
export async function resolveWebGALBackgroundPath(originalPath: string): Promise<string> {
  if (!currentGameConfig) {
    console.warn('⚠️ 未选择WebGAL游戏文件夹，使用原始路径:', originalPath);
    return originalPath;
  }

  // 如果路径已经是绝对路径，直接返回
  if (originalPath.includes(':') || originalPath.startsWith('/')) {
    return originalPath;
  }

  // 相对路径，从游戏文件夹的background目录中查找
  const backgroundFolder = `${currentGameConfig.gameFolder}/game/background`;
  const resolvedPath = `${backgroundFolder}/${originalPath}`;
  
  // 使用自定义命令检查文件是否存在
  try {
    const fileExists = await invoke<boolean>('file_exists', { filePath: resolvedPath });
    if (fileExists) {
      console.log('✅ 找到WebGAL背景文件:', resolvedPath);
      return resolvedPath;
    } else {
      console.warn('⚠️ WebGAL背景文件不存在:', resolvedPath);
      return originalPath; // 如果文件不存在，返回原始路径
    }
  } catch (error) {
    console.error('❌ 检查背景文件存在性失败:', error);
    return originalPath;
  }
}

/**
 * 根据 WebGAL 路径加载背景图片
 */
export async function loadWebGALBackgroundImage(originalPath: string): Promise<HTMLImageElement | null> {
  const resolvedPath = await resolveWebGALBackgroundPath(originalPath);
  return await loadImageFromPath(resolvedPath);
}