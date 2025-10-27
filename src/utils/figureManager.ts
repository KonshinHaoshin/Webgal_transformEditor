
// 立绘文件类型
export type FigureSourceType = 'img' | 'gif' | 'video' | 'webm';

// 立绘对象接口
export interface IFigureObject {
  key: string; // 对应 transform 的 target
  sourceUrl: string; // 原始文件路径
  sourceType: FigureSourceType;
  rawImage: HTMLImageElement; // 原始图片对象（用于获取宽高信息）
}

// 立绘管理器
export class FigureManager {
  private figures: Map<string, IFigureObject> = new Map();
  private loadingPromises: Map<string, Promise<IFigureObject | null>> = new Map();


  // 获取文件扩展名
  private getExtName(url: string): string {
    return url.split('.').pop()?.toLowerCase() || 'png';
  }

  // 判断文件类型
  private determineSourceType(url: string): FigureSourceType {
    const ext = this.getExtName(url);
    
    if (['gif'].includes(ext)) return 'gif';
    if (['webm', 'mp4', 'ogv'].includes(ext)) return 'video';
    
    return 'img'; // 默认图片
  }

  // 加载图片
  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  // 添加或更新立绘
  async addFigure(key: string, url: string): Promise<IFigureObject | null> {
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

    const sourceType = this.determineSourceType(url);
    
    // 创建加载promise
    const loadPromise = (async () => {
      try {
        // 目前只支持图片类型，其他类型暂按图片处理
        const rawImage = await this.loadImage(url);
        
        const figure: IFigureObject = {
          key,
          sourceUrl: url,
          sourceType,
          rawImage
        };

        this.figures.set(key, figure);
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
    this.figures.delete(key);
  }

  // 移除所有立绘
  removeAllFigures(): void {
    this.figures.clear();
  }


  // 检查文件是否存在
  hasFigure(key: string): boolean {
    return this.figures.has(key);
  }
}

// 导出单例
export const figureManager = new FigureManager();

