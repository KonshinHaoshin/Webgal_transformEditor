export interface TransformData {
    type: 'setTransform' | 'changeFigure'| 'changeBg';
    target: string;
    duration: number;
    transform: {
        position: { x: number; y: number };
        scale: { x: number; y: number };
        [key: string]: any;
    };
    path?: string; // 对于 changeFigure，保存路径
    extraParams?: Record<string, string>; // 保存 motion / expression 等
}
