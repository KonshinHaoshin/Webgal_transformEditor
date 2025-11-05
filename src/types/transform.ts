// 基础 TransformData 接口（不包含 next）
interface BaseTransformData {
    type: 'changeFigure' | 'changeBg' | 'rawText';
    target: string;
    duration: number;
    transform: {
        position?: { x: number; y: number };
        scale?: { x: number; y: number };
        rotation?: number;
        [key: string]: any;
    };
    path?: string; // 对于 changeFigure，保存路径
    //  TODO: 未来实现对表情和动作的支持
    extraParams?: Record<string, string>; // 保存 motion / expression 等
    // 仅changeFigure type会使用的类型
    presetPosition?: 'left' | 'center' | 'right';
    // 新增：动画缓动函数
    ease?: string;
    // 保存无法解析的原始文本
    rawText?: string;
}

// setTransform 类型，包含 next 参数
interface SetTransformData extends Omit<BaseTransformData, 'type'> {
    type: 'setTransform';
    // next 参数，只对 setTransform 生效
    next?: boolean;
}

// 联合类型：所有 TransformData 类型
export type TransformData = BaseTransformData | SetTransformData;
