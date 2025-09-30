import React, { useState, useEffect } from 'react';
import { 
  getCurrentGameConfig, 
  getImageFilesInDirectory, 
  searchImageFiles,
  getImageMetadata,
  getFileInfo,
  loadWebGALImageAsBase64
} from '../utils/webgalPathResolver';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  extension: string | null;
  is_image: boolean;
}

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  file_size: number;
}

export default function FileBrowser() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(null);
  const [previewImage, setPreviewImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const gameConfig = getCurrentGameConfig();

  useEffect(() => {
    if (gameConfig) {
      setCurrentPath(gameConfig.figureFolder);
      loadDirectory(gameConfig.figureFolder);
    }
  }, [gameConfig]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const imageFiles = await getImageFilesInDirectory(path);
      setFiles(imageFiles);
      setCurrentPath(path);
    } catch (error) {
      console.error('加载目录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim() || !gameConfig) return;
    
    setLoading(true);
    try {
      const results = await searchImageFiles(gameConfig.figureFolder, searchTerm);
      setFiles(results);
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: FileInfo) => {
    setSelectedFile(file);
    
    if (file.is_image) {
      try {
        // 获取图片元数据
        const metadata = await getImageMetadata(file.name);
        setImageMetadata(metadata);
        
        // 加载图片预览
        const img = await loadWebGALImageAsBase64(file.name);
        setPreviewImage(img);
      } catch (error) {
        console.error('加载文件信息失败:', error);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!gameConfig) {
    return (
      <div className="file-browser">
        <div className="no-game-selected">
          <p>请先选择WebGAL游戏文件夹</p>
        </div>
      </div>
    );
  }

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <h3>文件浏览器</h3>
        <div className="current-path">
          <span>当前路径: {currentPath}</span>
        </div>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="搜索图片文件..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? '搜索中...' : '搜索'}
        </button>
        <button onClick={() => loadDirectory(gameConfig.figureFolder)}>
          显示全部
        </button>
      </div>

      <div className="file-browser-content">
        <div className="file-list">
          <h4>文件列表 ({files.length})</h4>
          {loading ? (
            <div className="loading">加载中...</div>
          ) : (
            <div className="files">
              {files.map((file, index) => (
                <div
                  key={index}
                  className={`file-item ${selectedFile?.path === file.path ? 'selected' : ''}`}
                  onClick={() => handleFileSelect(file)}
                >
                  <div className="file-name">{file.name}</div>
                  <div className="file-details">
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    {file.extension && (
                      <span className="file-extension">.{file.extension}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="file-details-panel">
          {selectedFile ? (
            <div className="selected-file-info">
              <h4>文件信息</h4>
              <div className="file-info">
                <p><strong>名称:</strong> {selectedFile.name}</p>
                <p><strong>路径:</strong> {selectedFile.path}</p>
                <p><strong>大小:</strong> {formatFileSize(selectedFile.size)}</p>
                <p><strong>类型:</strong> {selectedFile.is_image ? '图片文件' : '其他文件'}</p>
                {selectedFile.extension && (
                  <p><strong>扩展名:</strong> .{selectedFile.extension}</p>
                )}
              </div>

              {imageMetadata && (
                <div className="image-metadata">
                  <h5>图片元数据</h5>
                  <p><strong>尺寸:</strong> {imageMetadata.width} x {imageMetadata.height}</p>
                  <p><strong>格式:</strong> {imageMetadata.format}</p>
                  <p><strong>文件大小:</strong> {formatFileSize(imageMetadata.file_size)}</p>
                </div>
              )}

              {previewImage && (
                <div className="image-preview">
                  <h5>图片预览</h5>
                  <img 
                    src={previewImage.src} 
                    alt={selectedFile.name}
                    style={{ maxWidth: '200px', maxHeight: '200px' }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <p>选择一个文件查看详细信息</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}