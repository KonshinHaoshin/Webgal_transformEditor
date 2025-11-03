export type PresetPos = "left" | "center" | "right";

export interface AddFigureParams {
    key: string;                            // 立绘 key（写到 target）
    // 舞台尺寸（== 你的 canvasWidth/Height）
    stageWidth: number;
    stageHeight: number;

    // 编辑器的“基准分辨率”（== baseWidth/baseHeight）
    baseWidth: number;
    baseHeight: number;

    // 立绘原图尺寸（建议从 Image.naturalWidth/Height 取；如果和 modelOriginal 不同也能兼容）
    imageWidth: number;
    imageHeight: number;

    // “模型逻辑尺寸”（== modelOriginalWidth/Height；影响 scale 求解）
    modelOriginalWidth: number;
    modelOriginalHeight: number;

    preset?: PresetPos;                     // left/center/right
    duration?: number;                      // 导出的 duration
    zIndex?: number;                        // 可写入 extraParams（如果你想）
}

/**
 * 产出一条 TransformData（与现有渲染完美兼容）
 * - position：以画布中心为原点（你的 CanvasRenderer 采用的坐标）
 * - scale：按照你当前 draw 公式反推，保证视觉宽高 == WebGAL 策略
 */
export function addFigureTransform(p: AddFigureParams) {
    const {
        key,
        stageWidth, stageHeight,
        baseWidth, baseHeight,
        imageWidth, imageHeight,
        // @ts-ignore
        modelOriginalWidth, modelOriginalHeight,
        preset = "center",
        duration = 500,
    } = p;

    // === 1) WebGAL 同款等比缩放以完整显示 ===
    const fitScale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
    const targetW = imageWidth * fitScale;
    const targetH = imageHeight * fitScale;

    // === 2) 计算“基准位”（落地 + 预设水平位置）===
    let baseY = stageHeight / 2;
    if (targetH < stageHeight) {
        // 小于舞台高时，下沿贴地（与 WebGAL 一致）
        baseY = stageHeight / 2 + (stageHeight - targetH) / 2;
    }

    let baseX = stageWidth / 2;
    if (preset === "left")  baseX = targetW / 2;
    if (preset === "right") baseX = stageWidth - targetW / 2;

    // === 3) 你的 CanvasRenderer 的 position 是“以画布中心为原点”的逻辑坐标 ===
    const logicX = baseX - stageWidth / 2;
    const logicY = baseY - stageHeight / 2;

    // === 4) 反推你渲染公式里的 scale ===
    // 你的绘制宽： drawW = modelOriginalWidth * (canvasWidth/baseWidth) * scale
    // 需要让 drawW == targetW
    // => scale = targetW / (modelOriginalWidth * (stageWidth/baseWidth))
    const scaleX = stageWidth / baseWidth;
    // @ts-ignore
    const scaleY = stageHeight / baseHeight;
    // 这里你的渲染横纵都乘用了相同 scale，所以取任一轴即可
    const solvedScale = targetW / (modelOriginalWidth * scaleX);

    const transform: any = {
        type: "setTransform" as const,
        target: key,
        duration,
        transform: {
            position: { x: logicX, y: logicY },
            rotation: 0,
        },
        // 你有需要也可以把 zIndex 之类塞进 extraParams
        extraParams: {} as Record<string, string>,
    };
    
    // 不预设 scale，让用户手动设置或从 changeFigure 继承

    return transform;
}