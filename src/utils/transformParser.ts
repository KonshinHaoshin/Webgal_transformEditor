
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

    // 先找到所有在 stage-main 之前的 target
    const targetToLastChangeIndex = new Map<string, number>();
    for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        if ((t.type === 'changeFigure' || t.type === 'changeBg') && t.target) {
            targetToLastChangeIndex.set(t.target, i);
        }
    }
    
    // 找到每个 target 的最后一个 changeFigure/changeBg，用于计算叠加后的位置
    const targetToChangeFigure = new Map<string, TransformData>();
    for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if ((t.type === 'changeFigure' || t.type === 'changeBg') && t.target && !targetToChangeFigure.has(t.target)) {
            targetToChangeFigure.set(t.target, t);
        }
    }

    const result: string[] = [];
    
    for (let i = 0; i < transforms.length; i++) {
        const obj = transforms[i];
        
        // 如果是原始文本类型，直接返回原始文本
        if (obj.type === "rawText" && obj.rawText) {
            result.push(obj.rawText);
            continue;
        }

        // stage-main 保持原样，不展开
        if (obj.type === "setTransform" && obj.target === "stage-main") {
            // 直接导出 stage-main 格式，不展开
            // 应用缩放比例到 transform
            const transform: any = {};
            
            if (obj.transform.position !== undefined) {
                transform.position = {
                    x: obj.transform.position.x * scaleRatioX,
                    y: obj.transform.position.y * scaleRatioY,
                };
            }
            
            if (obj.transform.scale !== undefined) {
                transform.scale = obj.transform.scale;
            }
            
            if (obj.transform.rotation !== undefined) {
                transform.rotation = obj.transform.rotation;
            }
            
            // 添加所有其他属性（滤镜参数等）
            for (const key in obj.transform) {
                if (key !== 'position' && key !== 'scale' && key !== 'rotation') {
                    transform[key] = obj.transform[key];
                }
            }
            
            const roundedTransform = roundTransform(transform);
            const transformJson = JSON.stringify(roundedTransform);
            
            let easeParam = "";
            if (obj.ease !== undefined && obj.ease !== "") {
                easeParam = ` -ease=${obj.ease}`;
            } else if (obj.ease === "" && defaultEase && defaultEase !== "default") {
                easeParam = ` -ease=${defaultEase}`;
            }
            const nextParam = obj.next ? " -next" : "";
            result.push(`setTransform:${transformJson} -target=stage-main -duration=${exportDuration}${easeParam}${nextParam};`);
            continue;
        }

        // 构建导出用的 transform 对象，确保保留所有属性（包括滤镜参数）
        const transform: any = {};
        
        // 只在 position 存在时才添加 position
        if (obj.transform.position !== undefined) {
            transform.position = {
                x: obj.transform.position.x * scaleRatioX,
                y: obj.transform.position.y * scaleRatioY,
            };
        }
        
        // 只在 scale 存在时才添加 scale
        if (obj.transform.scale !== undefined) {
            transform.scale = obj.transform.scale;
        }
        
        // 只在 rotation 存在时才添加 rotation
        if (obj.transform.rotation !== undefined) {
            transform.rotation = obj.transform.rotation;
        }
        
        // 添加所有其他属性（滤镜参数等）
        for (const key in obj.transform) {
            if (key !== 'position' && key !== 'scale' && key !== 'rotation') {
                transform[key] = obj.transform[key];
            }
        }
        
        // 如果 transform 是空对象，导出一个空对象 {}
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
            // 如果 transform 是空对象，导出 setTransform:{} 格式
            // 如果 next 为 true，添加 -next 参数
            const nextParam = obj.next ? " -next" : "";
            result.push(`setTransform:${transformJson} -target=${obj.target} -duration=${exportDuration}${easeParam}${nextParam};`);
        }

        if (obj.type === "changeFigure") {
            const transform = {
                ...obj.transform,
                position: obj.transform.position ? {
                    x: obj.transform.position.x * scaleRatioX,
                    y: obj.transform.position.y * scaleRatioY,
                } : { x: 0, y: 0 },
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
            result.push(`changeFigure:${obj.path} -id=${obj.target} -transform=${transformJson}${extras}${presetFlag};`);
        }
        if (obj.type == "changeBg") {
            // 构建导出用的 transform 对象
            const transform: any = {};
            if (obj.transform.position !== undefined) {
                transform.position = {
                    x: obj.transform.position.x * scaleRatioX,
                    y: obj.transform.position.y * scaleRatioY,
                };
            }
            if (obj.transform.scale !== undefined) {
                transform.scale = obj.transform.scale;
            }
            if (obj.transform.rotation !== undefined) {
                transform.rotation = obj.transform.rotation;
            }
            // 添加所有其他属性（滤镜参数等）
            for (const key in obj.transform) {
                if (key !== 'position' && key !== 'scale' && key !== 'rotation') {
                    transform[key] = obj.transform[key];
                }
            }
            const roundedTransform = roundTransform(transform);
            const transformJson = JSON.stringify(roundedTransform);
            
            // extras：无值参数输出成 "-k"，有值参数输出 "-k=v"
            const extras = Object.entries(obj.extraParams || {})
                .map(([k, v]) => (v === "" || v === undefined) ? ` -${k}` : ` -${k}=${v}`)
                .join("");
            result.push(`changeBg:${obj.path} -transform=${transformJson}${extras};`);
        }
    }
    
    return result.join("\n");
}

/**
 * 构建动画序列
 * 从原始的 transforms 中，为每个 figureID 构建从 changeFigure 到 setTransform 的动画序列
 */
export function buildAnimationSequence(transforms: TransformData[], transformIndexToScriptLineIndex?: Map<number, number>): Array<{
    target: string;
    duration: number;
    ease: string;
    startState: any;
    endState: any;
    startTime: number;
    endTime: number;
    scriptLineIndex?: number; // 对应的脚本行索引（用于断点）
}> {
    const animationSequence: Array<{
        target: string;
        duration: number;
        ease: string;
        startState: any;
        endState: any;
        startTime: number;
        endTime: number;
        scriptLineIndex?: number;
    }> = [];
    
    // Map<figureID, { changeFigure, setTransforms[] }>
    const figureAnimations = new Map<string, {
        changeFigure?: TransformData;
        setTransforms: TransformData[];
    }>();
    
    // changeFigure 不再处理 motion/expression，不再需要收集
    
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
    
    // 收集所有 figure 和背景的 ID（用于展开 stage-main）
    const allFigureIds = new Set<string>();
    for (const transform of transforms) {
        if (transform.type === 'changeFigure' || transform.type === 'changeBg') {
            if (transform.target) {
                allFigureIds.add(transform.target);
            }
        }
    }
    
    // 按顺序提取所有 setTransform（保持原始顺序）
    // 使用深拷贝确保每个 transform 对象都是独立的
    const allSetTransforms: TransformData[] = [];
    const allSetTransformsOriginalIndex: number[] = []; // 记录每个 setTransform 在 transforms 中的原始索引
    
    // 首先，找到每个 target 的最后一个 changeFigure/changeBg 的索引
    const targetToLastChangeIndex = new Map<string, number>();
    for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        if ((t.type === 'changeFigure' || t.type === 'changeBg') && t.target) {
            targetToLastChangeIndex.set(t.target, i);
        }
    }
    
    // 找到每个 target 的最后一个 changeFigure/changeBg，用于计算叠加后的位置
    const targetToChangeFigure = new Map<string, TransformData>();
    for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if ((t.type === 'changeFigure' || t.type === 'changeBg') && t.target && !targetToChangeFigure.has(t.target)) {
            targetToChangeFigure.set(t.target, t);
        }
    }
    
    for (let i = 0; i < transforms.length; i++) {
        const transform = transforms[i];
        if (transform.type === 'setTransform') {
            // 如果 target 是 stage-main，只展开到在它之前的 target，并叠加 transform
            if (transform.target === "stage-main") {
                // 只展开到在该 stage-main 之前出现的 target
                for (const [target, lastChangeIndex] of targetToLastChangeIndex.entries()) {
                    // 如果该 target 的最后一个 changeFigure/changeBg 在这个 stage-main 之前
                    if (lastChangeIndex < i) {
                        const changeFigure = targetToChangeFigure.get(target);
                        if (!changeFigure) continue;
                        
                        // 获取该 target 的当前 transform（从 changeFigure）
                        let currentTransform: any = {
                            ...changeFigure.transform,
                            position: changeFigure.transform.position || { x: 0, y: 0 },
                            scale: changeFigure.transform.scale || { x: 1, y: 1 },
                            rotation: changeFigure.transform.rotation || 0
                        };
                        
                        // 检查是否有该 target 的普通 setTransform（在 stage-main 之前）
                        for (let j = i - 1; j >= 0; j--) {
                            const prevTransform = transforms[j];
                            if (prevTransform.type === 'setTransform' && prevTransform.target === target) {
                                // 使用该 setTransform 的 transform
                                if (prevTransform.transform.position !== undefined) {
                                    currentTransform.position = { ...prevTransform.transform.position };
                                }
                                if (prevTransform.transform.scale !== undefined) {
                                    currentTransform.scale = { ...prevTransform.transform.scale };
                                }
                                if (prevTransform.transform.rotation !== undefined) {
                                    currentTransform.rotation = prevTransform.transform.rotation;
                                }
                                break;
                            }
                        }
                        
                        // 将 stage-main 的 transform 叠加到当前 transform
                        const finalTransform: any = {
                            position: {
                                x: (currentTransform.position.x || 0) + (transform.transform.position?.x || 0),
                                y: (currentTransform.position.y || 0) + (transform.transform.position?.y || 0)
                            },
                            scale: {
                                x: (currentTransform.scale.x || 1) * (transform.transform.scale?.x || 1),
                                y: (currentTransform.scale.y || 1) * (transform.transform.scale?.y || 1)
                            },
                            rotation: (currentTransform.rotation || 0) + (transform.transform.rotation || 0)
                        };
                        
                        console.log(`🎬 stage-main 展开: target=${target}`);
                        console.log(`🎬   当前 transform: position=${JSON.stringify(currentTransform.position)}, scale=${JSON.stringify(currentTransform.scale)}`);
                        console.log(`🎬   stage-main 偏移: position=${JSON.stringify(transform.transform.position)}, scale=${JSON.stringify(transform.transform.scale)}`);
                        console.log(`🎬   最终 transform: position=${JSON.stringify(finalTransform.position)}, scale=${JSON.stringify(finalTransform.scale)}`);
                        
                        const expandedTransform: TransformData = {
                            ...transform,
                            target: target,
                            transform: finalTransform
                        };
                        allSetTransforms.push(expandedTransform);
                        allSetTransformsOriginalIndex.push(i); // 使用相同的原始索引
                    }
                }
            } else {
                // 深拷贝 transform 对象，确保每个 setTransform 都有独立的 transform 对象
                allSetTransforms.push(JSON.parse(JSON.stringify(transform)));
                allSetTransformsOriginalIndex.push(i); // 记录原始索引
            }
        }
    }
    
    // 调试：打印 allSetTransforms 的内容
    console.log(`🎬 allSetTransforms 内容:`);
    allSetTransforms.forEach((st, idx) => {
        console.log(`🎬   索引 ${idx}: target=${st.target}, position=${JSON.stringify(st.transform.position)}`);
    });
    
    // 跟踪每个 target 的当前状态
    const targetStates = new Map<string, any>();
    
    // 初始化每个 target 的起始状态（从 changeFigure/changeBg）
    figureAnimations.forEach((anim, figureID) => {
        if (anim.changeFigure) {
            const initialState = JSON.parse(JSON.stringify(anim.changeFigure.transform));
            // 确保初始状态有所有必需的属性
            if (!initialState.position) {
                initialState.position = { x: 0, y: 0 };
            }
            if (!initialState.scale) {
                initialState.scale = { x: 1, y: 1 };
            }
            targetStates.set(figureID, initialState);
            console.log(`🎬 初始化 target=${figureID} 的起始状态: position=${JSON.stringify(initialState.position)}, scale=${JSON.stringify(initialState.scale)}`);
        }
    });
    
    // 首先，找出所有通过 next 连接的连续序列，并找出每个 target 在序列中的最后一个 setTransform
    // Map<target, 该 target 在每个连续序列中最后一个 setTransform 的索引数组>
    // 注意：每个 target 可能在多个序列中，所以需要记录每个序列中的最后一个索引
    const targetToLastIndexInSequence = new Map<string, number[]>();
    
    // 遍历所有 setTransform，找出连续序列（跨批次）
    let seqStart = 0;
    while (seqStart < allSetTransforms.length) {
        // 收集当前连续序列（通过 next 连接，可能跨多个批次）
        const sequence: TransformData[] = [];
        let k = seqStart;
        
        // 添加序列的第一个
        sequence.push(allSetTransforms[k]);
        k++;
        
        // 如果前一个有 next，继续收集（包括后续批次的）
        while (k < allSetTransforms.length) {
            const prevTransform = allSetTransforms[k - 1];
            if (prevTransform.type === 'setTransform' && 'next' in prevTransform && prevTransform.next) {
                sequence.push(allSetTransforms[k]);
                k++;
            } else {
                break;
            }
        }
        
        // 在连续序列中，对于每个 target，找出最后一个 setTransform 的索引
        // 注意：只有当序列中有多个元素（通过 -next 连接）时，才记录最后一个索引
        // 如果序列只有一个元素（没有 -next 连接），不记录，让每个都正常播放
        if (sequence.length > 1) {
            // 序列中有多个元素（通过 -next 连接），记录每个 target 在当前序列中的最后一个索引
            // 对于每个 target，找出它在当前序列中的最后一个索引
            const targetToLastInThisSequence = new Map<string, number>();
            for (let m = sequence.length - 1; m >= 0; m--) {
                const setTransform = sequence[m];
                const target = setTransform.target;
                if (target && !targetToLastInThisSequence.has(target)) {
                    // 计算在整个 allSetTransforms 中的索引
                    const globalIndex = seqStart + m;
                    // 验证索引是否正确：检查索引是否在范围内，并且 target 匹配
                    if (globalIndex < allSetTransforms.length && 
                        allSetTransforms[globalIndex].target === setTransform.target) {
                        targetToLastInThisSequence.set(target, globalIndex);
                    }
                }
            }
            
            // 将当前序列中每个 target 的最后一个索引添加到全局记录中
            for (const [target, lastIndex] of targetToLastInThisSequence) {
                const existingIndices = targetToLastIndexInSequence.get(target) || [];
                existingIndices.push(lastIndex);
                targetToLastIndexInSequence.set(target, existingIndices);
                console.log(`🎬 预处理: target=${target} 在连续序列（${sequence.length}个元素）中的最后一个索引=${lastIndex}, position=${JSON.stringify(sequence[lastIndex - seqStart].transform.position)}`);
            }
        } else {
            // 序列只有一个元素（没有 -next 连接），不记录，让每个都正常播放
            console.log(`🎬 预处理: 序列只有一个元素（没有 -next 连接），不记录最后一个索引，让每个都正常播放`);
        }
        
        // 移动到下一个序列（如果最后一个没有 next，下一个序列从这里开始）
        // 否则，移动到连续序列的末尾
        seqStart = k;
    }
    
    // changeFigure 不再处理 motion/expression，直接跳过
    
    // 按顺序处理每个 setTransform
    let currentTime = 0;
    let i = 0;
    
    while (i < allSetTransforms.length) {
        // 收集当前时间点要同时播放的 setTransform
        // 第一个 setTransform 总是要播放
        // 如果第一个有 next，第二个也同时播放
        // 如果第二个也有 next，第三个也同时播放，以此类推
        const concurrentSetTransforms: TransformData[] = [];
        let j = i;
        
        // 添加当前要播放的 setTransform（第一个）
        concurrentSetTransforms.push(allSetTransforms[j]);
        j++;
        
        // 如果前一个 setTransform 有 next，继续收集下一个（同时播放）
        while (j < allSetTransforms.length) {
            const prevTransform = allSetTransforms[j - 1];
            // 只有 setTransform 类型才有 next 属性
            if (prevTransform.type === 'setTransform' && 'next' in prevTransform && prevTransform.next) {
                concurrentSetTransforms.push(allSetTransforms[j]);
                j++;
            } else {
                break;
            }
        }
        
        // 对于同一个 target 的多个同时播放的 setTransform，只保留最后一个
        // 从后往前遍历，确保最后一个 setTransform 会覆盖前面的
        const targetToLastSetTransform = new Map<string, TransformData>();
        for (let k = concurrentSetTransforms.length - 1; k >= 0; k--) {
            const setTransform = concurrentSetTransforms[k];
            const target = setTransform.target;
            if (target && !targetToLastSetTransform.has(target)) {
                // 从后往前遍历，第一次遇到的（即最后一个）会被保留
                targetToLastSetTransform.set(target, setTransform);
            }
        }
        
        // 过滤：只保留那些在连续序列中是最后一个的 setTransform
        // 如果某个 target 在连续序列中有更后面的 setTransform，跳过当前批次的这个 target
        const finalTargetToSetTransform = new Map<string, TransformData>();
        for (const [target, setTransform] of targetToLastSetTransform) {
            const lastIndicesInSequences = targetToLastIndexInSequence.get(target);
            // 找到 setTransform 在当前批次中的索引
            // 由于使用了深拷贝，不能使用对象引用比较，需要通过 target 和 position 来匹配
            let currentIndex = -1;
            for (let idx = i; idx < j; idx++) {
                const candidate = allSetTransforms[idx];
                if (candidate.target === setTransform.target && 
                    candidate.transform.position?.x === setTransform.transform.position?.x &&
                    candidate.transform.position?.y === setTransform.transform.position?.y) {
                    currentIndex = idx;
                    break;
                }
            }
            
            console.log(`🎬 检查 target=${target}: currentIndex=${currentIndex}, lastIndicesInSequences=${lastIndicesInSequences ? JSON.stringify(lastIndicesInSequences) : 'undefined'}`);
            
            // 逻辑：
            // 1. 如果 lastIndicesInSequences === undefined：不在任何连续序列中，正常播放每一个
            // 2. 如果 currentIndex 在 lastIndicesInSequences 中：在某个连续序列中且是最后一个，播放
            // 3. 如果 currentIndex 不在 lastIndicesInSequences 中，但存在更大的索引：在连续序列中但不是最后一个，跳过
            // 4. 如果 currentIndex 不在 lastIndicesInSequences 中，且没有更大的索引：不在连续序列中，正常播放
            
            if (lastIndicesInSequences === undefined || lastIndicesInSequences.length === 0) {
                // 不在任何连续序列中（没有通过 -next 连接的后续 setTransform），正常播放每一个
                console.log(`🎬   ✅ 不在连续序列中，正常播放`);
                finalTargetToSetTransform.set(target, setTransform);
            } else {
                // 检查当前索引是否在当前批次范围内的某个序列的最后一个索引
                // 找到包含当前索引的序列的最后一个索引
                let isLastInCurrentSequence = false;
                let lastIndexInCurrentSequence = -1;
                
                // 遍历所有序列的最后一个索引，找到在当前批次范围内的
                for (const lastIndex of lastIndicesInSequences) {
                    // 如果最后一个索引在当前批次范围内，说明当前索引属于这个序列
                    if (lastIndex >= i && lastIndex < j) {
                        // 检查当前索引是否就是这个序列的最后一个索引
                        if (currentIndex === lastIndex) {
                            isLastInCurrentSequence = true;
                            lastIndexInCurrentSequence = lastIndex;
                            break;
                        } else if (currentIndex < lastIndex) {
                            // 当前索引在这个序列中，但不是最后一个
                            lastIndexInCurrentSequence = lastIndex;
                        }
                    }
                }
                
                if (isLastInCurrentSequence) {
                    // 在当前序列中且是最后一个，播放
                    const lastTransform = allSetTransforms[lastIndexInCurrentSequence];
                    console.log(`🎬   ✅ 这是当前序列中的最后一个，创建动画`);
                    console.log(`🎬   从 allSetTransforms[${lastIndexInCurrentSequence}] 获取 transform`);
                    console.log(`🎬   实际获取的 transform: target=${lastTransform.target}, position=${JSON.stringify(lastTransform.transform.position)}`);
                    finalTargetToSetTransform.set(target, lastTransform);
                } else if (lastIndexInCurrentSequence !== -1 && currentIndex < lastIndexInCurrentSequence) {
                    // 在当前序列中但不是最后一个，跳过
                    console.log(`🎬   ❌ 跳过（在当前序列中但不是最后一个，currentIndex=${currentIndex} < lastIndexInCurrentSequence=${lastIndexInCurrentSequence}）`);
                } else {
                    // 不在当前批次范围内的序列中，正常播放
                    console.log(`🎬   ✅ 不在当前批次的序列中，正常播放`);
                    finalTargetToSetTransform.set(target, setTransform);
                }
            }
        }
        
        console.log(`🎬 批次 ${i}: 收集到 ${concurrentSetTransforms.length} 个同时播放的 setTransform`);
        console.log(`🎬 批次 ${i}: 索引范围 [${i}, ${j})，包含的 setTransform:`);
        for (let idx = i; idx < j; idx++) {
            const st = allSetTransforms[idx];
            const next = st.type === 'setTransform' && 'next' in st ? st.next : false;
            console.log(`🎬   索引 ${idx}: target=${st.target}, position=${JSON.stringify(st.transform.position)}, next=${next}`);
        }
        console.log(`🎬 批次 ${i}: 去重后 ${finalTargetToSetTransform.size} 个 target（跳过中间动画）`);
        for (const [target, st] of finalTargetToSetTransform) {
            console.log(`🎬    target=${target}, position=${JSON.stringify(st.transform.position)}, scale=${JSON.stringify(st.transform.scale)}`);
        }
        
        // 为每个 target 创建动画（只使用最后一个 setTransform）
        for (const [target, setTransform] of finalTargetToSetTransform) {
            // 获取当前状态
            const currentState = targetStates.get(target) || { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } };
            
            // 结束状态：直接使用 setTransform 的 transform
            const endState = JSON.parse(JSON.stringify(setTransform.transform));
            
            // 调试：打印原始 endState 和 setTransform.transform
            console.log(`🎬   原始 endState: ${JSON.stringify(endState)}`);
            console.log(`🎬   setTransform.transform: ${JSON.stringify(setTransform.transform)}`);
            
            // 确保 endState 有所有必需的属性
            if (!endState.position) {
                endState.position = currentState.position || { x: 0, y: 0 };
            }
            // 确保 scale 被正确设置：如果 endState 有 scale，使用它；否则从 currentState 继承
            if (!endState.scale || typeof endState.scale !== 'object' || endState.scale.x === undefined || endState.scale.y === undefined) {
                // 如果 endState.scale 不存在或格式不正确，从 currentState 继承
                if (currentState.scale && typeof currentState.scale === 'object') {
                    endState.scale = { ...currentState.scale };
                    console.log(`🎬   ⚠️ endState.scale 格式不正确，从 currentState 继承: ${JSON.stringify(endState.scale)}`);
                } else {
                    endState.scale = { x: 1, y: 1 };
                    console.log(`🎬   ⚠️ endState.scale 不存在，使用默认值: ${JSON.stringify(endState.scale)}`);
                }
            } else {
                console.log(`🎬   ✅ endState.scale 已正确设置: ${JSON.stringify(endState.scale)}`);
            }
            
            const duration = setTransform.duration || 500;
            const ease = setTransform.ease || 'easeInOut';
            
            console.log(`🎬 创建动画序列项: target=${target}`);
            console.log(`🎬    startState: ${JSON.stringify(currentState)}`);
            console.log(`🎬    endState: ${JSON.stringify(endState)}`);
            console.log(`🎬    duration: ${duration}, startTime: ${currentTime}, endTime: ${currentTime + duration}`);
            
            // 获取对应的脚本行索引（用于断点）
            let scriptLineIndex: number | undefined;
            if (transformIndexToScriptLineIndex) {
                // 找到当前 setTransform 在 allSetTransforms 中的索引
                const setTransformIndexInAll = allSetTransforms.findIndex(st => st === setTransform);
                if (setTransformIndexInAll !== -1) {
                    // 获取在 transforms 中的原始索引
                    const originalTransformIndex = allSetTransformsOriginalIndex[setTransformIndexInAll];
                    // 根据映射找到脚本行索引
                    scriptLineIndex = transformIndexToScriptLineIndex.get(originalTransformIndex);
                }
            }
            
            // 创建动画序列项
            animationSequence.push({
                target: target,
                duration,
                ease,
                startState: JSON.parse(JSON.stringify(currentState)),
                endState: JSON.parse(JSON.stringify(endState)),
                startTime: currentTime,
                endTime: currentTime + duration,
                scriptLineIndex
            });
            
            // 更新该 target 的状态为结束状态
            targetStates.set(target, JSON.parse(JSON.stringify(endState)));
        }
        
        // 对于跳过的 target（在连续序列中但不是最后一个），不更新状态
        // 让最后一个 transform 使用原始状态作为起始状态，直接跳到最终状态
        // 这样就不会播放中间动画了
        for (const setTransform of concurrentSetTransforms) {
            const target = setTransform.target;
            if (target && !finalTargetToSetTransform.has(target)) {
                // 这个 target 在当前批次被跳过，不更新状态，让最后的 transform 使用原始状态
                console.log(`🎬 跳过中间动画，不更新状态: target=${target}, position=${JSON.stringify(setTransform.transform.position)}`);
            }
        }
        
        // 更新当前时间：使用当前批次中最长的 duration
        const durations = Array.from(finalTargetToSetTransform.values()).map(st => st.duration || 500);
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 500;
        const batchEndTime = currentTime + maxDuration;
        console.log(`🎬 批次 ${i}: 时间范围 [${currentTime}, ${batchEndTime})，duration=${maxDuration}`);
        currentTime = batchEndTime;
        
        // 移动到下一批：如果最后一个 setTransform 没有 next，则下一批从这里开始
        // 如果最后一个有 next，则下一批从下一个开始
        console.log(`🎬 批次 ${i} 结束，移动到下一批，从索引 ${j} 开始，下一批的开始时间=${currentTime}`);
        i = j;
    }
    
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
    
    // 收集所有 figure 和背景的 ID（用于展开 stage-main）
    const allFigureIds = new Set<string>();
    for (const transform of transforms) {
        if (transform.type === 'changeFigure' || transform.type === 'changeBg') {
            if (transform.target) {
                allFigureIds.add(transform.target);
            }
        }
    }
    
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
            // 注意：stage-main 保持原始格式，不在解析时展开，只在渲染时展开
            result.push(transform);
        } else {
            // changeFigure：保持原始状态，不合并 setTransform 的 transform
            // 注意：允许同一个 figureID 有多个 changeFigure（因为可能有不同的 motion/expression）
            const figureID = transform.target;
            if (figureID && figureID !== 'bg-main') {
                // 直接添加所有 changeFigure，不进行去重
                // 因为每个 changeFigure 可能代表不同的状态（不同的 motion/expression）
                result.push(transform);
            }
        }
    }
    
    // 注意：不再需要添加那些在原始序列中从未出现过的 figure
    // 因为我们已经保留了所有的 changeFigure，包括它们的 motion 和 expression
    
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
            // 解析参数，支持 -next 等无值参数
            const params: Record<string, string> = {};
            for (const part of rest) {
                const [k, v] = part.split("=").map((s) => s?.trim());
                if (k && v) {
                    params[k] = v;
                } else if (k && !v) {
                    // 支持 -next 等无值参数
                    params[k] = "";
                }
            }

            const json = JSON.parse(jsonStr);
            const target = params.target;
            
            // 获取当前 target 的状态（如果存在）
            const currentState = targetStates.get(target) || {
                position: { x: 0, y: 0 }
            };
            
            // 增量合并 transform：只更新提供的字段，未提供的字段继承当前状态
            const transform: any = { ...currentState };
            
            // 处理 position：如果 JSON 中有 position，只更新提供的 x 或 y
            if (json.position !== undefined) {
                transform.position = {
                    x: json.position.x !== undefined ? (json.position.x * scaleX) : (currentState.position?.x ?? 0),
                    y: json.position.y !== undefined ? (json.position.y * scaleY) : (currentState.position?.y ?? 0)
                };
            }
            
            // 处理 scale：如果 JSON 中有 scale，只更新提供的 x 或 y；如果没有提供，不预设 scale
            if (json.scale !== undefined) {
                transform.scale = {
                    x: json.scale.x !== undefined ? json.scale.x : (currentState.scale?.x ?? undefined),
                    y: json.scale.y !== undefined ? json.scale.y : (currentState.scale?.y ?? undefined)
                };
                // 如果 scale 的两个值都是 undefined，移除 scale 属性
                if (transform.scale.x === undefined && transform.scale.y === undefined) {
                    delete transform.scale;
                } else if (transform.scale.x === undefined) {
                    transform.scale.x = currentState.scale?.x;
                } else if (transform.scale.y === undefined) {
                    transform.scale.y = currentState.scale?.y;
                }
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

            // 更新 target 的状态（使用深拷贝，避免引用问题）
            // 注意：对于 stage-main，我们不更新 targetStates，因为它在执行时才会展开
            if (target !== "stage-main") {
                targetStates.set(target, JSON.parse(JSON.stringify(transform)));
            }

            // 解析 next 参数：如果存在 -next 参数（无论是否有值），next 为 true
            const next = "next" in params;

            // 返回时也使用深拷贝，确保每个 setTransform 都有独立的 transform 对象
            // 对于 stage-main，保持原始格式，在执行时展开
            return {
                type: "setTransform",
                target: target,
                duration: parseInt(params.duration || "500"),
                transform: JSON.parse(JSON.stringify(transform)),
                ease: params.ease,
                next: next
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