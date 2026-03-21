import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { getMimeType } from './fileTypeDetector';

export class WebGALFileManager {
    private gameFolder: string | null = null;
    private figureFiles: string[] = [];
    private backgroundFiles: string[] = [];
    private fileServerBaseUrl: string | null = null;
    private shouldLoadAssetIndex = true;
    private blobUrlCache: Map<string, string> = new Map();
    private resolvedFigurePathCache: Map<string, string> = new Map();
    private resolvedBackgroundPathCache: Map<string, string> = new Map();

    async selectGameFolder(): Promise<string | null> {
        try {
            const result = await open({
                directory: true,
                title: "选择WebGAL游戏文件夹",
                defaultPath: ""
            });
            
            if (result && typeof result === 'string') {
                this.gameFolder = result;
                await this.scanFiles();
                console.log('WebGAL文件夹已选择:', result);
                return result;
            }
        } catch (error) {
            console.error('选择文件夹失败:', error);
            throw error;
        }
        return null;
    }

    async setGameFolder(folderPath: string, shouldLoadAssetIndex: boolean = true): Promise<void> {
        const folderChanged = this.gameFolder !== folderPath;
        this.gameFolder = folderPath;
        this.shouldLoadAssetIndex = shouldLoadAssetIndex;

        if (folderChanged) {
            this.figureFiles = [];
            this.backgroundFiles = [];
            this.resolvedFigurePathCache.clear();
            this.resolvedBackgroundPathCache.clear();
            this.revokeAllBlobUrls();
        } else if (!this.shouldLoadAssetIndex) {
            this.figureFiles = [];
            this.backgroundFiles = [];
        }
        
        // 启动本地文件服务器
        try {
            const serverUrl = await invoke<string>('start_local_server', { basePath: folderPath });
            this.fileServerBaseUrl = serverUrl;
            console.log('✅ 本地文件服务器已启动:', serverUrl);
        } catch (error) {
            console.error('启动文件服务器失败:', error);
        }
        
        if (this.shouldLoadAssetIndex) {
            this.figureFiles = [];
            this.backgroundFiles = [];
            await this.scanFiles();
        }
    }

    private async scanFiles(): Promise<void> {
        if (!this.gameFolder) return;

        try {
            const figurePath = `${this.gameFolder}/game/figure`;
            const backgroundPath = `${this.gameFolder}/game/background`;

            console.log('正在递归扫描立绘文件夹:', figurePath);
            console.log('正在递归扫描背景文件夹:', backgroundPath);

            // 使用 Rust 后端进行递归扫描
            try {
                this.figureFiles = await invoke('scan_directory_recursive', { dirPath: figurePath }) as string[];
                console.log(`✅ 找到 ${this.figureFiles.length} 个立绘文件`);
                console.log('📋 前 5 个文件路径:', this.figureFiles.slice(0, 5));
            } catch (error) {
                console.warn('无法读取立绘文件夹:', error);
                this.figureFiles = [];
            }

            try {
                this.backgroundFiles = await invoke('scan_directory_recursive', { dirPath: backgroundPath }) as string[];
                console.log(`✅ 找到 ${this.backgroundFiles.length} 个背景文件`);
            } catch (error) {
                console.warn('无法读取背景文件夹:', error);
                this.backgroundFiles = [];
            }
        } catch (error) {
            console.error('扫描文件失败:', error);
            this.figureFiles = [];
            this.backgroundFiles = [];
        }
    }


    async getFigurePath(filename: string): Promise<string | null> {
        if (!this.gameFolder) return null;
        
        // 剥离查询参数以进行文件匹配
        const queryIndex = filename.indexOf('?');
        const cleanFilename = queryIndex !== -1 ? filename.substring(0, queryIndex) : filename;
        const queryParams = queryIndex !== -1 ? filename.substring(queryIndex) : '';
        
        // 查找匹配的文件（支持子目录路径）
        const found = await this.resolveAssetPath('figure', cleanFilename);
        
        if (!found) {
            console.warn(`找不到立绘文件: ${filename}，可用文件列表:`, this.figureFiles);
            return null;
        }
        
        // Live2D 或 Mano 文件需要使用 HTTP URL
        const ext = found.split('.').pop()?.toLowerCase();
        if (ext === 'json' || ext === 'jsonl') {
            if (this.fileServerBaseUrl) {
                // 使用本地文件服务器 URL
                const httpUrl = `${this.fileServerBaseUrl}/game/figure/${found}${queryParams}`;
                console.log('✅ 模型文件使用 HTTP URL:', httpUrl);
                return httpUrl;
            } else {
                console.warn('⚠️ 模型文件服务器未启动，模型可能无法加载');
                return null;
            }
        }
        
        return await this.getImageAsBlobUrl('figure', found);
    }

    async getBackgroundPath(filename: string): Promise<string | null> {
        if (!this.gameFolder) return null;
        
        // 剥离查询参数以进行文件匹配
        const queryIndex = filename.indexOf('?');
        const cleanFilename = queryIndex !== -1 ? filename.substring(0, queryIndex) : filename;

        const found = await this.resolveAssetPath('background', cleanFilename);
        
        if (!found) {
            console.warn(`找不到背景文件: ${filename}，可用文件列表:`, this.backgroundFiles);
            return null;
        }
        
        return await this.getImageAsBlobUrl('background', found);
    }

    private async getImageAsBlobUrl(type: 'figure' | 'background', filename: string): Promise<string | null> {
        try {
            const folderPath = type === 'figure' ? 'figure' : 'background';
            const filePath = `${this.gameFolder}/game/${folderPath}/${filename}`;

            const cachedBlobUrl = this.blobUrlCache.get(filePath);
            if (cachedBlobUrl) {
                return cachedBlobUrl;
            }
            
            console.log('正在使用fs+Blob读取文件:', filePath);
            
            const fileData = await readFile(filePath);
            
            const blob = new Blob([fileData], { 
                type: this.getMimeTypeForFile(filename) 
            });
            
            const blobUrl = URL.createObjectURL(blob);
            this.blobUrlCache.set(filePath, blobUrl);
            console.log('成功创建Blob URL:', blobUrl);
            
            return blobUrl;
        } catch (error) {
            console.error(`使用fs+Blob读取${type}文件失败:`, error);
            return null;
        }
    }

    private getMimeTypeForFile(filename: string): string {
        // 使用新的文件类型检测器
        return getMimeType(filename);
    }

    getFigureFiles(): string[] {
        return [...this.figureFiles];
    }

    getBackgroundFiles(): string[] {
        return [...this.backgroundFiles];
    }

    getGameFolder(): string | null {
        return this.gameFolder;
    }

    getShouldLoadAssetIndex(): boolean {
        return this.shouldLoadAssetIndex;
    }

    // 公开 gameFolder 属性供其他模块访问
    get gameFolderPath(): string | null {
        return this.gameFolder;
    }

    parseChangeFigureCommand(command: string): string | null {
        const match = command.match(/changeFigure:\s*([^\s,]+)/i);
        return match ? match[1] : null;
    }

    parseChangeBackgroundCommand(command: string): string | null {
        const match = command.match(/changeBackground:\s*([^\s,]+)/i);
        return match ? match[1] : null;
    }

    dispose(): void {
        this.gameFolder = null;
        this.figureFiles = [];
        this.backgroundFiles = [];
        this.fileServerBaseUrl = null;
        this.shouldLoadAssetIndex = true;
        this.resolvedFigurePathCache.clear();
        this.resolvedBackgroundPathCache.clear();
        this.revokeAllBlobUrls();
    }

    private async resolveAssetPath(type: 'figure' | 'background', filename: string): Promise<string | null> {
        if (!this.gameFolder) {
            return null;
        }

        const normalizedFilename = filename.replace(/\\/g, '/');
        const fileList = type === 'figure' ? this.figureFiles : this.backgroundFiles;
        const cache = type === 'figure' ? this.resolvedFigurePathCache : this.resolvedBackgroundPathCache;

        const cachedResolvedPath = cache.get(normalizedFilename);
        if (cachedResolvedPath) {
            return cachedResolvedPath;
        }

        const foundInIndex = fileList.find(f =>
            f === normalizedFilename ||
            f.endsWith(normalizedFilename) ||
            f.endsWith(`/${normalizedFilename}`)
        );
        if (foundInIndex) {
            cache.set(normalizedFilename, foundInIndex);
            return foundInIndex;
        }

        const folderPath = `${this.gameFolder}/game/${type}`;
        try {
            const found = await invoke<string | null>('find_file_recursive', {
                dirPath: folderPath,
                target: normalizedFilename
            });

            if (found) {
                cache.set(normalizedFilename, found);
                if (!fileList.includes(found)) {
                    fileList.push(found);
                }
                return found;
            }
        } catch (error) {
            console.warn(`按需查找${type}文件失败:`, error);
        }

        return null;
    }

    private revokeAllBlobUrls(): void {
        for (const blobUrl of this.blobUrlCache.values()) {
            URL.revokeObjectURL(blobUrl);
        }
        this.blobUrlCache.clear();
    }
}

export const webgalFileManager = new WebGALFileManager();

