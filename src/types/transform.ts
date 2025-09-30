export interface TransformData {
    type: 'setTransform' | 'changeFigure'| 'changeBg';
    target: string;
    duration: number;
    transform: {
        position: { x: number; y: number };
        scale: { x: number; y: number };
        [key: string]: any;
    };
    path?: string; // 对于 changeFigure 和 changeBg，保存路径
    extraParams?: Record<string, string>; // 保存 motion / expression 等
    // 仅changeFigure type会使用的类型
    presetPosition?: 'left' | 'center' | 'right';
    // 新增：动画缓动函数
    ease?: string;
}
