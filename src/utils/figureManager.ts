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

    // 注册 Live2D Ticker
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
    // 禁用角度自动控制，避免抖头
      if (model.internalModel?.angleXParamIndex !== undefined) model.internalModel.angleXParamIndex = 999;
      if (model.internalModel?.angleYParamIndex !== undefined) model.internalModel.angleYParamIndex = 999;
      if (model.internalModel?.angleZParamIndex !== undefined) model.internalModel.angleZParamIndex = 999;

      // 关闭自动眨眼（保留统一眨眼控制权）
      if (model.internalModel?.eyeBlink) {
        // @ts-ignore
        model.internalModel.eyeBlink.blinkInterval = 1000 * 60 * 60 * 24;
        // @ts-ignore
        model.internalModel.eyeBlink.nextBlinkTimeLeft = 1000 * 60 * 60 * 24;
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
private async loadJsonl(jsonlPath: string): Promise<{ model: any; width: number; height: number }> {
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

  // 解析路径前缀
  const jsonlBaseDir = jsonlPath.substring(0, jsonlPath.lastIndexOf('/') + 1);
  const resolvePath = (p: string) => {
    const normalized = String(p).replace(/^\.\//, '');
    if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('game/')) {
      return normalized;
    }
    return jsonlBaseDir + normalized;
  };

  // 收集每行模型配置
  interface ModelConfig {
    path: string;
    id?: string;
    x?: number;
    y?: number;
    xscale?: number;
    yscale?: number;
    bounds?: [number, number, number, number];
  }
  const modelConfigs: ModelConfig[] = [];

  // 末行汇总 import（PARAM_IMPORT）
  let paramImport: number | null = null;

  // 解析每行
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      
      // ✅ 跳过 motions/expressions 汇总行，但检查 import 参数
      if (obj?.motions || obj?.expressions) {
        if (obj?.import !== undefined) {
          paramImport = Number(obj.import);
          console.info('检测到汇总 import =', paramImport);
        }
        continue;
      }

      if (obj?.path) {
        const fullPath = resolvePath(obj.path);
        const cfg: ModelConfig = {
          path: fullPath,
          id: obj.id,
          x: typeof obj.x === 'number' ? obj.x : undefined,
          y: typeof obj.y === 'number' ? obj.y : undefined,
          xscale: typeof obj.xscale === 'number' ? obj.xscale : undefined,
          yscale: typeof obj.yscale === 'number' ? obj.yscale : undefined,
        };

        // 可选 bounds（如果 JSONL 行里有）
        if (Array.isArray(obj.bounds) && obj.bounds.length === 4) {
          cfg.bounds = [
            Number(obj.bounds[0]), 
            Number(obj.bounds[1]), 
            Number(obj.bounds[2]), 
            Number(obj.bounds[3])
          ];
        }

        modelConfigs.push(cfg);
      }
    } catch (e) {
      console.warn('JSONL 某行解析失败:', line);
    }
  }

  if (modelConfigs.length === 0) {
    throw new Error('No valid models in JSONL file');
  }

  // 创建容器将所有模型组合在一起
  const container = new PIXI.Container();
  const models: any[] = [];
  let maxWidth = 0;
  let maxHeight = 0;

  // 逐个加载模型并应用配置
  for (const cfg of modelConfigs) {
    const { path: modelPath, x, y, xscale, yscale, bounds } = cfg;

    try {
      const model = await this.live2DManager.Live2DModel.from(modelPath, {
        autoInteract: false,
        // 如果提供了 bounds，就覆盖
        overWriteBounds: bounds ? { 
          x0: bounds[0], 
          y0: bounds[1], 
          x1: bounds[2], 
          y1: bounds[3] 
        } : undefined,
      });

      if (!model) continue;

      // 先隐藏，等统一设置完再显示
      model.visible = false;

      // 设置 anchor 或 pivot 为中心
      if (model.anchor) {
        model.anchor.set(0.5);
      } else if (model.pivot) {
        model.pivot.set(model.width / 2, model.height / 2);
      }
      
      // 应用每行配置（注意 Live2D 的坐标系统，需要以容器中心为基准）
      // 模型的位置是相对于容器的，所以直接设置即可
      if (x !== undefined && typeof x === 'number') model.x = x;
      if (y !== undefined && typeof y === 'number') model.y = y;
      if (xscale !== undefined && typeof xscale === 'number') model.scale.x = xscale;
      if (yscale !== undefined && typeof yscale === 'number') model.scale.y = yscale;

      container.addChild(model);
      models.push(model);
      
      // 更新最大尺寸（考虑位置偏移）
      const modelRight = (model.x || 0) + model.width * Math.abs(model.scale.x || 1);
      const modelBottom = (model.y || 0) + model.height * Math.abs(model.scale.y || 1);
      
      maxWidth = Math.max(maxWidth, modelRight);
      maxHeight = Math.max(maxHeight, modelBottom);

      
      // 禁用角度自动控制，避免抖头
      if (model.internalModel?.angleXParamIndex !== undefined) model.internalModel.angleXParamIndex = 999;
      if (model.internalModel?.angleYParamIndex !== undefined) model.internalModel.angleYParamIndex = 999;
      if (model.internalModel?.angleZParamIndex !== undefined) model.internalModel.angleZParamIndex = 999;

      // 关闭自动眨眼（保留统一眨眼控制权）
      if (model.internalModel?.eyeBlink) {
        // @ts-ignore
        model.internalModel.eyeBlink.blinkInterval = 1000 * 60 * 60 * 24;
        // @ts-ignore
        model.internalModel.eyeBlink.nextBlinkTimeLeft = 1000 * 60 * 60 * 24;
      }

      if (paramImport !== null) {
        try {
          model.internalModel?.coreModel?.setParamFloat?.('PARAM_IMPORT', paramImport);
          console.info(`设置 PARAM_IMPORT=${paramImport}给模型: ${modelPath}`);
        } catch (e) {
          console.warn(`设置 PARAM_IMPORT 失败给模型: ${modelPath}`, e);
        }
      }

    } catch (err) {
      console.warn(`加载模型失败：${modelPath}`, err);
    }
  }

  if (models.length === 0) {
    throw new Error('All models failed to load');
  }



  // 统一显示所有模型
  for (const model of models) {
    model.visible = true;
  }

  return {
    model: container,
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
            const { model, width, height } = await this.loadJsonl(url);
            // JSONL 返回一个包含所有模型的容器
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
