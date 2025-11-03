
import {TransformData} from "../types/transform.ts";
// 通用保留两位小数
export const roundToTwo = (num: number): number => {
    return Math.round(num * 100) / 100;
};

// 需要保留为整数的属性（颜色值等）
const INTEGER_KEYS = new Set(['colorRed', 'colorGreen', 'colorBlue', 'bevelRed', 'bevelGreen', 'bevelBlue', 'bevelRotation']);

// 递归保留两位小数（但某些属性保留为整数）
export const roundTransform = (obj: any): any => {
    if (typeof obj === 'number') {
        return roundToTwo(obj);
    } else if (typeof obj === 'object' && obj !== null) {
        const result: any = Array.isArray(obj) ? [] : {};
        for (const key in obj) {
            // 对于整数属性（如 colorRed, colorGreen, colorBlue, bevelRed, bevelGreen, bevelBlue, bevelRotation），直接取整
            if (INTEGER_KEYS.has(key) && typeof obj[key] === 'number') {
                result[key] = Math.round(obj[key]);
            } else {
                result[key] = roundTransform(obj[key]);
            }
        }
        return result;
    } else {
        return obj;
    }
};

// 导出脚本
export function exportScript(
    transforms: TransformData[],
    exportDuration: number,
    canvasWidth: number,
    canvasHeight: number,
    baseWidth: number,
    baseHeight: number,
    defaultEase?: string
): string {
    // 安全检查：如果 transforms 未定义或不是数组，返回空字符串
    if (!transforms || !Array.isArray(transforms)) {
        return '';
    }
    
    const scaleRatioX = baseWidth / canvasWidth;
    const scaleRatioY = baseHeight / canvasHeight;

    return transforms.map(obj => {
        // 如果是原始文本类型，直接返回原始文本
        if (obj.type === "rawText" && obj.rawText) {
            return obj.rawText;
        }

        // 构建导出用的 transform 对象，确保保留所有属性（包括滤镜参数）
        const transform = {
            ...obj.transform,
            position: {
                x: obj.transform.position.x * scaleRatioX,
                y: obj.transform.position.y * scaleRatioY,
            },
            // 确保 scale 值不被修改，保持原始的 x 和 y 值
            scale: obj.transform.scale || { x: 1, y: 1 }
            // 其他所有属性（brightness, contrast, saturation, gamma, colorRed, colorGreen, colorBlue 等）
            // 都通过 ...obj.transform 被保留
        };
        const roundedTransform = roundTransform(transform);
        const transformJson = JSON.stringify(roundedTransform);

        if (obj.type === "setTransform") {
            // 只有当 obj.ease 有值且不是空字符串时才添加 ease 参数
            // 如果 obj.ease 是 undefined，表示原始值没有 ease 参数，不使用 defaultEase
            // 如果 obj.ease 是空字符串，表示应该使用 defaultEase（如果有的话）
            let easeParam = "";
            if (obj.ease !== undefined && obj.ease !== "") {
                // obj.ease 有值且不是空字符串，使用它
                easeParam = ` -ease=${obj.ease}`;
            } else if (obj.ease === "" && defaultEase && defaultEase !== "default") {
                // obj.ease 是空字符串，且 defaultEase 存在，使用 defaultEase
                easeParam = ` -ease=${defaultEase}`;
            }
            // 如果 obj.ease 是 undefined，不使用 ease 参数（保持原始状态）
            return `setTransform:${transformJson} -target=${obj.target} -duration=${exportDuration}${easeParam} -next;`;
        }

        if (obj.type === "changeFigure") {
            const transform = {
                ...obj.transform,
                position: {
                    x: obj.transform.position.x * scaleRatioX,
                    y: obj.transform.position.y * scaleRatioY,
                },
                // 确保 scale 值不被修改，保持原始的 x 和 y 值
                scale: obj.transform.scale || { x: 1, y: 1 }
            };
            const roundedTransform = roundTransform(transform);
            const transformJson = JSON.stringify(roundedTransform);

            // extras：无值参数输出成 "-k"，有值参数输出 "-k=v"
            const extras = Object.entries(obj.extraParams || {})
                .map(([k, v]) => (v === "" || v === undefined) ? ` -${k}` : ` -${k}=${v}`)
                .join("");

            const presetFlag = obj.presetPosition && obj.presetPosition !== 'center' ? ` -${obj.presetPosition}` : '';
            return `changeFigure:${obj.path} -id=${obj.target} -transform=${transformJson}${extras}${presetFlag};`;
        }
        if (obj.type=="changeBg")
        {
            const extras = Object.entries(obj.extraParams || {})
                .map(([k, v]) => `-${k}=${v}`).join(" ");
            return `changeBg:${obj.path} -transform=${transformJson} ${extras};`;
        }

        return "";
    }).join("\n");
}

/**
 * 构建动画序列
 * 从原始的 transforms 中，为每个 figureID 构建从 changeFigure 到 setTransform 的动画序列
 */
export function buildAnimationSequence(transforms: TransformData[]): Array<{
    target: string;
    duration: number;
    ease: string;
    startState: any;
    endState: any;
    startTime: number;
    endTime: number;
}> {
    const animationSequence: Array<{
        target: string;
        duration: number;
        ease: string;
        startState: any;
        endState: any;
        startTime: number;
        endTime: number;
    }> = [];
    
    // Map<figureID, { changeFigure, setTransforms[] }>
    const figureAnimations = new Map<string, {
        changeFigure?: TransformData;
        setTransforms: TransformData[];
    }>();
    
    // 收集每个 figureID 的所有相关命令（包括背景）
    for (const transform of transforms) {
        if (transform.type === 'rawText') {
            continue;
        }
        
        const figureID = transform.target;
        if (!figureID) {
            continue;
        }
        
        // 支持背景（bg-main）和立绘
        if (!figureAnimations.has(figureID)) {
            figureAnimations.set(figureID, { 
                changeFigure: undefined,
                setTransforms: [] 
            });
        }
        
        const anim = figureAnimations.get(figureID)!;
        
        if (transform.type === 'changeFigure') {
            anim.changeFigure = transform;
        } else if (transform.type === 'changeBg') {
            // 将 changeBg 作为 changeFigure 处理（用于背景动画）
            anim.changeFigure = transform;
        } else if (transform.type === 'setTransform') {
            anim.setTransforms.push(transform);
        }
    }
    
    // 为每个 figureID 构建动画（包括背景）
    // 所有动画同时开始（从 time 0 开始）
    figureAnimations.forEach((anim, figureID) => {
        if (!anim.changeFigure && anim.setTransforms.length === 0) {
            // 没有 changeFigure/changeBg 且没有 setTransform，跳过
            return;
        }
        
        // 起始状态：如果有 changeFigure/changeBg，使用它的 transform；否则使用第一个 setTransform 的 transform
        let currentState: any;
        if (anim.changeFigure) {
            currentState = JSON.parse(JSON.stringify(anim.changeFigure.transform));
        } else if (anim.setTransforms.length > 0) {
            // 如果没有 changeFigure/changeBg，使用第一个 setTransform 作为起始状态
            currentState = JSON.parse(JSON.stringify(anim.setTransforms[0].transform));
        } else {
            return; // 不应该到达这里
        }
        
        // 处理每个 setTransform，所有都从 time 0 开始（同时播放）
        for (const setTransform of anim.setTransforms) {
            // 结束状态：直接使用 setTransform 的 transform（已经是绝对位置）
            // 不需要合并，因为 setTransform 的 transform 已经是最终状态
            const endState = JSON.parse(JSON.stringify(setTransform.transform));
            
            // 确保 endState 有所有必需的属性
            if (!endState.position) {
                endState.position = currentState.position || { x: 0, y: 0 };
            }
            if (!endState.scale) {
                endState.scale = currentState.scale || { x: 1, y: 1 };
            }
            
            const duration = setTransform.duration || 500;
            const ease = setTransform.ease || 'easeInOut';
            
            // 深拷贝状态以确保所有属性都被正确保留
            // 所有动画都从 time 0 开始，实现同时播放
            animationSequence.push({
                target: figureID,
                duration,
                ease,
                startState: JSON.parse(JSON.stringify(currentState)),
                endState: JSON.parse(JSON.stringify(endState)),
                startTime: 0, // 所有动画同时开始
                endTime: duration // 结束时间是持续时间
            });
            
            // 更新当前状态为结束状态（用于同一个 figure 的下一个 setTransform 的起始状态）
            // 注意：同一个 figure 的多个 setTransform 会共享同一个起始状态（changeFigure 的状态）
            currentState = endState;
        }
    });
    
    return animationSequence;
}

/**
 * 深度合并 transform 对象
 * 对于嵌套对象（如 position, scale），合并属性；对于其他属性，替换
 */
function mergeTransform(base: any, update: any): any {
    const result = { ...base };
    
    for (const key in update) {
        if (update[key] !== undefined && update[key] !== null) {
            // 对于 position 和 scale 这样的对象，需要合并属性
            if (key === 'position' || key === 'scale') {
                result[key] = {
                    ...(result[key] || {}),
                    ...update[key]
                };
            } else {
                // 其他属性直接替换
                result[key] = update[key];
            }
        }
    }
    
    return result;
}

/**
 * 应用 figureID 系统
 * 相同 figureID 的多个命令会被合并，只显示最终状态
 * 保持 rawText 和 changeBg 的原始顺序
 * 注意：setTransform 不会被合并到 changeFigure，而是保留为独立命令（用于渲染时的状态计算）
 */
export function applyFigureIDSystem(transforms: TransformData[]): TransformData[] {
    // Map<figureID, TransformData> - 存储每个 figure 的最终状态（用于渲染）
    const figureStates = new Map<string, TransformData>();
    const result: TransformData[] = [];
    
    // 第一次遍历：处理所有 figure 相关的命令，计算最终状态（用于渲染）
    for (const transform of transforms) {
        // rawText 和 changeBg 跳过，后面再处理
        if (transform.type === 'rawText' || transform.type === 'changeBg') {
            continue;
        }
        
        const figureID = transform.target;
        if (!figureID || figureID === 'bg-main') {
            // 忽略无效的 target 或背景
            continue;
        }
        
        if (transform.type === 'changeFigure') {
            // changeFigure：设置/更新该 figure 的状态（完全替换）
            figureStates.set(figureID, { ...transform });
        } else if (transform.type === 'setTransform') {
            // setTransform：合并该 figure 的 transform（用于渲染时的状态计算）
            const existingState = figureStates.get(figureID);
            if (existingState) {
                // 合并 transform（深度合并 position 和 scale，其他属性替换）
                const mergedTransform = mergeTransform(
                    existingState.transform,
                    transform.transform
                );
                figureStates.set(figureID, {
                    ...existingState,
                    transform: mergedTransform
                });
            } else {
                // 如果 figure 不存在，创建一个基于 setTransform 的状态
                // 但缺少 path，所以可能需要警告
                console.warn(`⚠️ setTransform 针对不存在的 figureID: ${figureID}，将创建不完整的状态`);
                // 创建一个临时的 changeFigure 状态
                figureStates.set(figureID, {
                    ...transform,
                    type: 'changeFigure' as const,
                    path: '', // 缺少路径
                    presetPosition: 'center'
                });
            }
        }
    }
    
    // 第二次遍历：保持原始顺序，插入所有命令
    // changeFigure 保持原始状态（不合并 setTransform），setTransform 保留为独立命令
    for (const transform of transforms) {
        if (transform.type === 'rawText' || transform.type === 'changeBg') {
            // rawText 和 changeBg 保持原位置
            result.push(transform);
        } else if (transform.type === 'setTransform') {
            // setTransform：保留为独立命令，不合并
            result.push(transform);
        } else {
            // changeFigure：保持原始状态，不合并 setTransform 的 transform
            const figureID = transform.target;
            if (figureID && figureID !== 'bg-main') {
                // 检查是否已经添加过该 figureID 的 changeFigure
                const alreadyAdded = result.some(
                    (t) => t.type === 'changeFigure' && t.target === figureID
                );
                if (!alreadyAdded) {
                    // 保持原始 changeFigure 状态，不合并 setTransform
                    result.push(transform);
                }
            }
        }
    }
    
    // 添加那些在原始序列中从未出现过的 figure（不应该发生，但保险起见）
    figureStates.forEach((state, figureID) => {
        const alreadyAdded = result.some(
            (t) => t.type === 'changeFigure' && t.target === figureID
        );
        if (!alreadyAdded) {
            result.push(state);
        }
    });
    
    return result;
}

export function parseScript(script: string, scaleX: number, scaleY: number): TransformData[] {
    // 先按换行符分割，以保留原始行的结构
    const rawLines = script.split(/\r?\n/);
    const lines: string[] = [];
    
    for (const rawLine of rawLines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        
        // 如果行末尾有分号，移除分号后尝试解析
        // 如果行中没有分号或移除分号后仍无法解析，将整行作为原始文本处理
        if (trimmed.endsWith(';')) {
            // 移除末尾分号，尝试解析
            const withoutSemicolon = trimmed.slice(0, -1).trim();
            lines.push(withoutSemicolon);
        } else {
            // 没有分号的行（可能是对话文本等），直接添加
            lines.push(trimmed);
        }
    }

    // 维护每个 target 的当前 transform 状态，用于增量更新
    const targetStates = new Map<string, any>();

    return lines.map((line) => {
        const [command, ...rest] = line.split(" -");

        if (command.startsWith("setTransform:")) {
            const jsonStr = command.replace("setTransform:", "").trim();
            const params = Object.fromEntries(rest.map(s => s.split("=").map(v => v.trim())));

            const json = JSON.parse(jsonStr);
            const target = params.target;
            
            // 获取当前 target 的状态（如果存在）
            const currentState = targetStates.get(target) || {
                position: { x: 0, y: 0 },
                scale: { x: 1, y: 1 }
            };
            
            // 增量合并 transform：只更新提供的字段，未提供的字段继承当前状态
            const transform: any = { ...currentState };
            
            // 处理 position：如果 JSON 中有 position，只更新提供的 x 或 y
            if (json.position !== undefined) {
                transform.position = {
                    x: json.position.x !== undefined ? (json.position.x * scaleX) : currentState.position?.x ?? 0,
                    y: json.position.y !== undefined ? (json.position.y * scaleY) : currentState.position?.y ?? 0
                };
            }
            
            // 处理 scale：如果 JSON 中有 scale，只更新提供的 x 或 y
            if (json.scale !== undefined) {
                transform.scale = {
                    x: json.scale.x !== undefined ? json.scale.x : (currentState.scale?.x ?? 1),
                    y: json.scale.y !== undefined ? json.scale.y : (currentState.scale?.y ?? 1)
                };
            }
            
            // 对于 rotation，如果存在则更新，否则保持当前值
            if (json.rotation !== undefined) {
                transform.rotation = json.rotation;
            }
            
            // 其他所有属性：如果 JSON 中有则更新，否则保持当前值
            for (const key in json) {
                if (key !== 'position' && key !== 'scale' && key !== 'rotation') {
                    transform[key] = json[key];
                }
            }

            // 更新 target 的状态
            targetStates.set(target, transform);

            return {
                type: "setTransform",
                target: target,
                duration: parseInt(params.duration || "500"),
                transform,
                ease: params.ease
            };
        }

        if (command.startsWith("changeFigure:")) {
            const path = command.replace("changeFigure:", "").trim();

            const params: Record<string, string> = {};
            let transform: any = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } };

            // 新增：预设位
            let presetPosition: 'left' | 'center' | 'right' | undefined;

            for (const part of rest) {
                const raw = part.trim();

                // 在 split(" -") 的前提下，"-left" 会变成 "left"
                if (raw === "left" || raw === "center" || raw === "right") {
                    presetPosition = raw as any;
                    continue;
                }

                const [k, v] = raw.split("=").map((s) => s?.trim());
                if (k === "transform") {
                    try {
                        const json = JSON.parse(v);
                        transform = {
                            ...json,
                            position: {
                                x: (json.position?.x ?? 0) * scaleX,
                                y: (json.position?.y ?? 0) * scaleY
                            },
                            scale: json.scale || { x: 1, y: 1 },
                        };
                    } catch {
                        console.warn("❌ 解析 transform JSON 失败:", v);
                    }
                } else if (k && v) {
                    params[k] = v;
                } else if (k && !v) {
                    params[k] = "";
                }
            }

            if (!presetPosition) presetPosition = 'center';

            const target = params.id || "unknown";
            
            // 更新 target 的状态为 changeFigure 的 transform
            targetStates.set(target, transform);

            return {
                type: "changeFigure",
                path,
                target: target,
                duration: 0,
                transform,
                presetPosition, // ✅ 记录预设位
                extraParams: Object.fromEntries(
                    Object.entries(params).filter(([k]) => k !== "id" && k !== "transform")
                )
            };
        }

        if (command.startsWith("changeBg:")) {
            const path = command.replace("changeBg:", "").trim();

            const params: Record<string, string> = {};
            let transform: any = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } };

            for (const part of rest) {
                const [k, v] = part.split("=").map((s) => s?.trim());
                if (k === "transform") {
                    try {
                        const json = JSON.parse(v);
                        transform = {
                            ...json,
                            position: {
                                x: (json.position?.x ?? 0) * scaleX,
                                y: (json.position?.y ?? 0) * scaleY
                            },
                            scale: json.scale || { x: 1, y: 1 },
                        };
                    } catch (err) {
                        console.warn("❌ 解析 transform JSON 失败:", v);
                    }
                } else if (k && v) {
                    params[k] = v;
                } else if (k && !v) {
                    params[k] = ""; // 支持 -next 等无值参数
                }
            }

            // 更新背景的状态
            targetStates.set("bg-main", transform);

            return {
                type: "changeBg",
                path,
                target: "bg-main",
                duration: 0,
                transform,
                extraParams: Object.fromEntries(
                    Object.entries(params).filter(([k]) => k !== "transform")
                )
            };
        }

        // 无法解析的行，保存为原始文本
        return {
            type: "rawText",
            target: "",
            duration: 0,
            transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
            rawText: line // 保存原始行文本
        };
    });
}