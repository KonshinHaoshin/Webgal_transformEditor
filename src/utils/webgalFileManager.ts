import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { getMimeType } from './fileTypeDetector';

export class WebGALFileManager {
    private gameFolder: string | null = null;
    private figureFiles: string[] = [];
    private backgroundFiles: string[] = [];
    private fileServerBaseUrl: string | null = null;

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

    async setGameFolder(folderPath: string): Promise<void> {
        this.gameFolder = folderPath;
        
        // 启动本地文件服务器
        try {
            const serverUrl = await invoke<string>('start_local_server', { basePath: folderPath });
            this.fileServerBaseUrl = serverUrl;
            console.log('✅ 本地文件服务器已启动:', serverUrl);
        } catch (error) {
            console.error('启动文件服务器失败:', error);
        }
        
        await this.scanFiles();
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
        
        // 查找匹配的文件（支持子目录路径）
        const found = this.figureFiles.find(f => 
            f === filename || 
            f.endsWith(filename) || 
            f.endsWith(`/${filename}`)
        );
        
        if (!found) {
            console.warn(`找不到立绘文件: ${filename}，可用文件列表:`, this.figureFiles);
            return null;
        }
        
        // Live2D 文件需要使用 HTTP URL
        const ext = found.split('.').pop()?.toLowerCase();
        if (ext === 'json' || ext === 'jsonl') {
            if (this.fileServerBaseUrl) {
                // 使用本地文件服务器 URL（服务器 base_path 是游戏目录，需要加上 game/figure 前缀）
                console.log('🔍 扫描到的文件路径:', found);
                console.log('🔍 游戏目录:', this.gameFolder);
                const httpUrl = `${this.fileServerBaseUrl}/game/figure/${found}`;
                console.log('✅ Live2D 文件使用 HTTP URL:', httpUrl);
                return httpUrl;
            } else {
                console.warn('⚠️ 文件服务器未启动，Live2D 可能无法加载');
                return null;
            }
        }
        
        return await this.getImageAsBlobUrl('figure', found);
    }

    async getBackgroundPath(filename: string): Promise<string | null> {
        if (!this.gameFolder) return null;
        
        // 查找匹配的文件（支持子目录路径）
        const found = this.backgroundFiles.find(f => 
            f === filename || 
            f.endsWith(filename) || 
            f.endsWith(`/${filename}`)
        );
        
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
            
            console.log('正在使用fs+Blob读取文件:', filePath);
            
            const fileData = await readFile(filePath);
            
            const blob = new Blob([fileData], { 
                type: this.getMimeTypeForFile(filename) 
            });
            
            const blobUrl = URL.createObjectURL(blob);
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

    parseChangeFigureCommand(command: string): string | null {
        const match = command.match(/changeFigure:\s*([^\s,]+)/i);
        return match ? match[1] : null;
    }

    parseChangeBackgroundCommand(command: string): string | null {
        const match = command.match(/changeBackground:\s*([^\s,]+)/i);
        return match ? match[1] : null;
    }
}

export const webgalFileManager = new WebGALFileManager();

