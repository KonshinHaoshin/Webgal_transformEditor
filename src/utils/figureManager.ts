import { AnimatedGIF } from '@pixi/gif';
import * as PIXI from 'pixi.js';
import { detectFileType, convertToFigureSourceType } from './fileTypeDetector';

// 立绘文件类型
export type FigureSourceType = 'img' | 'gif' | 'video' | 'webm' | 'live2d' | 'jsonl';

// PIXI 显示对象（可以是图片、GIF、Live2D 等）
export type FigureDisplayObject = PIXI.Sprite | AnimatedGIF | any; // any for Live2D models

// 立绘对象接口
export interface IFigureObject {
  key: string; // 对应 transform 的 target
  sourceUrl: string; // 原始文件路径
  sourceType: FigureSourceType;
  displayObject?: FigureDisplayObject; // PIXI 显示对象
  width: number; // 立绘宽度
  height: number; // 立绘高度
  rawImage?: HTMLImageElement; // 仅用于普通图片（向后兼容）
}

// Live2D 管理器接口
interface Live2DManager {
  Live2DModel: {
    from: (path: string, options?: any) => Promise<any>;
  };
  isAvailable: boolean;
}

// 立绘管理器
export class FigureManager {
  private figures: Map<string, IFigureObject> = new Map();
  private loadingPromises: Map<string, Promise<IFigureObject | null>> = new Map();
  private live2DManager: Live2DManager | null = null;

  constructor() {
    // 初始化 Live2D 管理器
    this.initLive2D();
  }

  // 初始化 Live2D
  private async initLive2D() {
    try {
      const { Live2DModel } = await import('pixi-live2d-display');
      this.live2DManager = {
        Live2DModel: Live2DModel as any,
        isAvailable: true
      };
      console.log('✅ Live2D 管理器已初始化');
    } catch (error) {
      console.warn('⚠️ Live2D 不可用:', error);
      this.live2DManager = {
        Live2DModel: { from: async () => null },
        isAvailable: false
      };
    }
  }

  // 判断文件类型（使用新的类型检测器）
  private determineSourceType(filePath: string): FigureSourceType {
    const fileType = detectFileType(filePath);
    return convertToFigureSourceType(fileType.category);
  }

  // 加载普通图片
  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  // 加载 GIF
  private async loadGif(url: string): Promise<{ gif: AnimatedGIF; width: number; height: number }> {
    try {
      const buffer = await fetch(url).then((res) => res.arrayBuffer());
      const gif = await AnimatedGIF.fromBuffer(buffer);
      
      return {
        gif,
        width: gif.width,
        height: gif.height
      };
    } catch (error) {
      throw new Error(`Failed to load GIF: ${url}`);
    }
  }

  // 加载 Live2D 模型（JSON）
  private async loadLive2D(jsonPath: string): Promise<{ model: any; width: number; height: number }> {
    if (!this.live2DManager?.isAvailable) {
      throw new Error('Live2D is not available');
    }

    // 直接使用传入的路径（现在应该是 HTTP URL）
    let finalPath = jsonPath;
    console.log('加载 Live2D 模型:', finalPath);

    // 注册 Live2D Ticker（必须）
    const { Live2DModel } = await import('pixi-live2d-display');
    Live2DModel.registerTicker(PIXI.Ticker);

    const model = await this.live2DManager.Live2DModel.from(finalPath, {
      autoInteract: false,
      overWriteBounds: {
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 1,
      },
    });

    if (!model) {
      throw new Error('Failed to load Live2D model');
    }

    // 设置 Live2D 模型的 anchor 或 pivot 为中心
    if (model.anchor) {
      model.anchor.set(0.5);
    } else if (model.pivot) {
      model.pivot.set(model.width / 2, model.height / 2);
    }

    // 强制启用交互（防止内部设置禁用它）
    model.interactive = true;
    model.buttonMode = false;

    return {
      model,
      width: model.width,
      height: model.height
    };
  }

  // 加载 JSONL 聚合模型
  private async loadJsonl(jsonlPath: string): Promise<{ models: any[]; width: number; height: number }> {
    if (!this.live2DManager?.isAvailable) {
      throw new Error('Live2D is not available');
    }

    // 注册 Live2D Ticker（必须）
    const { Live2DModel } = await import('pixi-live2d-display');
    Live2DModel.registerTicker(PIXI.Ticker);

    // 读取 JSONL 文件
    const response = await fetch(jsonlPath);
    const text = await response.text();
    const lines = text.split('\n').filter(Boolean);

    const models: any[] = [];
    let maxWidth = 0;
    let maxHeight = 0;

    const jsonlBaseDir = jsonlPath.substring(0, jsonlPath.lastIndexOf('/') + 1);
    const resolvePath = (p: string) => {
      const normalized = String(p).replace(/^\.\//, '');
      if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('game/')) {
        return normalized;
      }
      return jsonlBaseDir + normalized;
    };

    // 解析每行
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        
        // 跳过 motions/expressions 汇总行
        if (obj?.motions || obj?.expressions) {
          continue;
        }

        if (obj?.path) {
          const fullPath = resolvePath(obj.path);
          const model = await this.live2DManager.Live2DModel.from(fullPath, {
            autoInteract: false,
          });

          if (model) {
            models.push(model);
            maxWidth = Math.max(maxWidth, model.width);
            maxHeight = Math.max(maxHeight, model.height);
          }
        }
      } catch (e) {
        console.warn('JSONL 某行解析失败:', line);
      }
    }

    if (models.length === 0) {
      throw new Error('No valid models in JSONL file');
    }

    return {
      models,
      width: maxWidth,
      height: maxHeight
    };
  }

  // 添加或更新立绘
  async addFigure(key: string, url: string, originalPath?: string): Promise<IFigureObject | null> {
    // 如果已存在，先删除旧的
    if (this.figures.has(key)) {
      this.removeFigure(key);
    }

    // 如果正在加载中，等待加载完成
    if (this.loadingPromises.has(url)) {
      const promise = this.loadingPromises.get(url)!;
      const existingFig = await promise;
      if (!existingFig) return null;
      // 创建新实例
      const newFig: IFigureObject = {
        ...existingFig,
        key
      };
      this.figures.set(key, newFig);
      return newFig;
    }

    // 使用原始路径来确定文件类型（因为 Blob URL 没有扩展名）
    const pathToCheck = originalPath || url;
    const sourceType = this.determineSourceType(pathToCheck);
    console.log(`📝 检测文件类型: ${pathToCheck} -> ${sourceType}`);
    
    // 创建加载promise
    const loadPromise = (async () => {
      try {
        let figure: IFigureObject;

        switch (sourceType) {
          case 'gif': {
            const { gif, width, height } = await this.loadGif(url);
            figure = {
              key,
              sourceUrl: url,
              sourceType,
              displayObject: gif,
              width,
              height
            };
            break;
          }

          case 'live2d': {
            const { model, width, height } = await this.loadLive2D(url);
            figure = {
              key,
              sourceUrl: url,
              sourceType,
              displayObject: model,
              width,
              height
            };
            break;
          }

          case 'jsonl': {
            const { models, width, height } = await this.loadJsonl(url);
            // JSONL 返回多个模型，这里暂存第一个（实际渲染时可能需要特殊处理）
            figure = {
              key,
              sourceUrl: url,
              sourceType,
              displayObject: models[0], // 暂时只存储第一个
              width,
              height
            };
            // 将其他模型存储到特殊字段
            (figure as any).allModels = models;
            break;
          }

          default: {
            // 图片或视频
            const img = await this.loadImage(url);
            figure = {
              key,
              sourceUrl: url,
              sourceType,
              displayObject: PIXI.Sprite.from(img),
              rawImage: img,
              width: img.width,
              height: img.height
            };
            break;
          }
        }

        this.figures.set(key, figure);
        console.log(`✅ 已加载立绘: ${key} (${sourceType})`);
        return figure;
      } catch (error) {
        console.error(`加载立绘失败 (${url}):`, error);
        return null;
      } finally {
        this.loadingPromises.delete(url);
      }
    })();

    this.loadingPromises.set(url, loadPromise);
    return await loadPromise;
  }

  // 获取立绘
  getFigure(key: string): IFigureObject | undefined {
    return this.figures.get(key);
  }

  // 获取所有立绘
  getAllFigures(): IFigureObject[] {
    return Array.from(this.figures.values());
  }

  // 移除立绘
  removeFigure(key: string): void {
    const figure = this.figures.get(key);
    if (figure) {
      // 清理显示对象
      if (figure.displayObject) {
        try {
          figure.displayObject.destroy?.();
        } catch (e) {
          console.warn('清理显示对象失败:', e);
        }
      }
    }
    this.figures.delete(key);
  }

  // 移除所有立绘
  removeAllFigures(): void {
    this.figures.forEach((_, key) => this.removeFigure(key));
    this.figures.clear();
  }

  // 检查文件是否存在
  hasFigure(key: string): boolean {
    return this.figures.has(key);
  }

  // 检查 Live2D 是否可用
  isLive2DAvailable(): boolean {
    return this.live2DManager?.isAvailable || false;
  }
}

// 导出单例
export const figureManager = new FigureManager();
