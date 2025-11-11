import React, { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { TransformData } from "../types/transform";
import { PixiContainer } from "../containers/pixiContainer.ts";
import { GuideLineType } from "../types/guideLines";
import { figureManager } from "../utils/figureManager";
import { OverlayBlendFilter } from "../filters/OverlayBlendFilter.ts";

interface Props {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    transforms: TransformData[];
    modelImg: HTMLImageElement | null;
    bgImg: HTMLImageElement | null;
    selectedIndexes: number[];
    baseWidth: number;
    baseHeight: number;
    canvasWidth: number;
    canvasHeight: number;
    modelOriginalWidth: number;
    modelOriginalHeight: number;
    bgBaseScaleRef: React.MutableRefObject<{ x: number; y: number }>;
    setTransforms: React.Dispatch<React.SetStateAction<TransformData[]>>;
    setSelectedIndexes: React.Dispatch<React.SetStateAction<number[]>>;
    lockX: boolean;
    lockY: boolean;
    guideLineType?: GuideLineType;
    overlayMode?: "none" | "color" | "luminosity"; // 观察层模式
    enabledTargets?: Set<string>; // 启用的target列表
    enabledTargetsArray?: string[]; // 启用的target列表（数组形式，用于触发重新渲染）
    showSelectionBox?: boolean; // 是否显示蓝色框选框
    showTargetId?: boolean; // 是否显示角色ID
    animationStateRef?: React.MutableRefObject<Map<string, any> | null>; // 动画状态 ref（用于性能优化）
    breakpoints?: Set<number>; // 断点行索引集合
    fullOutputScriptLines?: string[]; // 完整的输出脚本行（不受断点影响）
    outputScriptLines?: string[]; // 当前的输出脚本行
}

export default function CanvasRenderer(props: Props) {
    const {
        canvasRef, transforms, modelImg, bgImg,
        selectedIndexes,
        baseWidth, baseHeight, canvasWidth, canvasHeight,
        modelOriginalWidth, modelOriginalHeight,
        // @ts-ignore
        bgBaseScaleRef, setTransforms, setSelectedIndexes, lockX, lockY,
        guideLineType = 'none',
        overlayMode = 'none',
        enabledTargets = new Set(),
        enabledTargetsArray = [],
        showSelectionBox = true,
        showTargetId = true,
        animationStateRef,
        breakpoints = new Set()
        // fullOutputScriptLines 和 outputScriptLines 暂时未使用，但保留在 Props 接口中以便将来使用
    } = props;

    const appRef = useRef<PIXI.Application | null>(null);
    const spriteMap = useRef<Record<string, PixiContainer>>({});
    const graphicsMapRef = useRef<Record<string, PIXI.Graphics>>({});
    const overlayRef = useRef<{ container: PIXI.Container; filter: OverlayBlendFilter } | null>(null);

    const scaleX = canvasWidth / baseWidth;
    const scaleY = canvasHeight / baseHeight;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    const draggingRef = useRef<number | null>(null);
    const rotatingRef = useRef(false);
    const offsetRef = useRef({ x: 0, y: 0 });
    const rotationStartAngleRef = useRef(0);
    const initialRotationRef = useRef<Record<number, number>>({}); // 存储每个对象的初始旋转角度
    const initialPositionsRef = useRef<Record<number, { x: number; y: number }>>({});
    const rotationCenterRef = useRef<{ x: number; y: number } | null>(null); // 旋转中心点
    const altKeyPressedRef = useRef(false); // 全局Alt键状态
    const shiftKeyPressedRef = useRef(false); // 全局Shift键状态
    const rotatingIndicesRef = useRef<number[]>([]); // 存储要旋转的对象索引（用于闭包中访问）

// 约定：优先 t.presetPosition，其次 extraParams.preset，默认 'center'
    function getPreset(t: TransformData): 'left'|'center'|'right' {
        // @ts-ignore
        return (t as any).presetPosition || (t as any).extraParams?.preset || 'center';
    }

    // 辅助函数：从后往前查找最后一个 setTransform（针对某个 target）
    function findLastSetTransform(transforms: TransformData[], target: string): number {
        for (let i = transforms.length - 1; i >= 0; i--) {
            if (transforms[i].type === "setTransform" && transforms[i].target === target) {
                return i;
            }
        }
        return -1;
    }

    // 辅助函数：查找某个 target 在断点之前的所有 setTransform 索引
    function findAllSetTransformsBeforeBreakpoint(transforms: TransformData[], target: string, hasBreakpoint: boolean): number[] {
        const indices: number[] = [];
        if (hasBreakpoint) {
            // 如果有断点，transforms 中所有的 setTransform 都应该被更新（因为它们都在断点之前）
            for (let i = 0; i < transforms.length; i++) {
                if (transforms[i].type === "setTransform" && transforms[i].target === target) {
                    indices.push(i);
                }
            }
        } else {
            // 如果没有断点，只更新最后一个
            const lastIdx = findLastSetTransform(transforms, target);
            if (lastIdx !== -1) {
                indices.push(lastIdx);
            }
        }
        return indices;
    }


    // 全局键盘状态监听（用于检测Alt和Shift键）
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 检测Alt键（包括左Alt和右Alt）
            if (e.key === 'Alt' || e.key === 'AltLeft' || e.key === 'AltRight' || e.altKey) {
                altKeyPressedRef.current = true;
            }
            // 检测Shift键（包括左Shift和右Shift）
            if (e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight' || e.shiftKey) {
                shiftKeyPressedRef.current = true;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            // 检测Alt键释放
            if (e.key === 'Alt' || e.key === 'AltLeft' || e.key === 'AltRight') {
                // 只有当altKey属性为false时才认为Alt键完全释放
                // 因为可能还有另一个Alt键被按下
                if (!e.altKey) {
                    altKeyPressedRef.current = false;
                }
            } else if (!e.altKey) {
                // 如果其他键被释放，但altKey为false，说明所有Alt键都已释放
                altKeyPressedRef.current = false;
            }

            // 检测Shift键释放
            if (e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight') {
                if (!e.shiftKey) {
                    shiftKeyPressedRef.current = false;
                }
            } else if (!e.shiftKey) {
                shiftKeyPressedRef.current = false;
            }
        };

        // 也监听blur事件，当窗口失去焦点时重置键盘状态
        const handleBlur = () => {
            altKeyPressedRef.current = false;
            shiftKeyPressedRef.current = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    useEffect(() => {
        if (!canvasRef.current) return;

        if (!appRef.current) {
            // 首次初始化
            const app = new PIXI.Application({
                view: canvasRef.current,
                width: canvasWidth,
                height: canvasHeight,
                backgroundAlpha: 0,
                resolution: 1, // 固定分辨率，无视屏幕缩放
                autoDensity: false, // 禁用自动密度调整，无视屏幕缩放
            });

            // 确保 stage 可以接收全局事件，用于拖拽
            app.stage.interactive = true;
            app.stage.hitArea = new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight);

            appRef.current = app;
        } else {
            // 更新画幅尺寸
            appRef.current.renderer.resize(canvasWidth, canvasHeight);
            appRef.current.stage.hitArea = new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight);
        }
    }, [canvasWidth, canvasHeight]); // 👈 当画幅改变时，更新 Pixi 应用尺寸

// ✅ 2️⃣ 独立 wheel 缩放事件绑定，等 canvas 真正挂载后再绑定
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            // 只处理Ctrl+滚轮（缩放）或Alt+滚轮（旋转）
            if (!e.ctrlKey && !e.altKey) return;

            // 如果观察层启用，阻止所有交互
            if (overlayMode !== "none") {
                return;
            }

            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (canvasWidth / rect.width);
            const my = (e.clientY - rect.top) * (canvasHeight / rect.height);

            // Alt+滚轮：旋转功能
            if (e.altKey && !e.ctrlKey) {
                // 计算旋转增量（弧度）
                // 向上滚动（deltaY < 0）：逆时针旋转（增加角度）
                // 向下滚动（deltaY > 0）：顺时针旋转（减少角度）
                // 根据滚轮速度调整旋转增量，使旋转更平滑
                const rotationSpeed = 0.05; // 基础旋转速度（弧度）
                const rotationDelta = e.deltaY < 0 ? rotationSpeed : -rotationSpeed;

                const hasBreakpoint = breakpoints.size > 0;

                // 检查是否点击到了某个对象
                let hitObject = false;
                let hitObjectIndex = -1;

                for (let index = transforms.length - 1; index >= 0; index--) {
                    const obj = transforms[index];
                    if (obj.type === 'setTransform' || obj.type === 'rawText') {
                        continue;
                    }
                    if (!obj.transform.position || !obj.transform.scale) {
                        continue;
                    }

                    // 获取对象的位置和尺寸
                    const setTransformMap = new Map<string, TransformData>();
                    for (let i = transforms.length - 1; i >= 0; i--) {
                        const t = transforms[i];
                        if (t.type === "setTransform" && t.target && !setTransformMap.has(t.target)) {
                            setTransformMap.set(t.target, t);
                        }
                    }

                    const setTransform = setTransformMap.get(obj.target);
                    const transformToUse = setTransform ? setTransform.transform : obj.transform;
                    const { x, y } = transformToUse.position || { x: 0, y: 0 };
                    const scale = transformToUse.scale?.x || 1;
                    const isBg = obj.target === 'bg-main';

                    let baseX = canvasWidth / 2, baseY = canvasHeight / 2;
                    if (!isBg && modelImg) {
                        const imgW = modelImg.width, imgH = modelImg.height;
                        const fitScale = Math.min(canvasWidth / imgW, canvasHeight / imgH);
                        const preset = getPreset(obj as any);
                        const targetWNoUser = imgW * fitScale;
                        const targetHNoUser = imgH * fitScale;
                        baseY = canvasHeight / 2 + (targetHNoUser < canvasHeight ? (canvasHeight - targetHNoUser) / 2 : 0);
                        baseX = preset === 'left' ? targetWNoUser / 2 :
                            preset === 'right' ? canvasWidth - targetWNoUser / 2 :
                                canvasWidth / 2;
                    }
                    const cx = baseX + x * scaleX;
                    const cy = baseY + y * scaleY;

                    let w = 0, h = 0;
                    if (obj.target === "bg-main" && bgImg) {
                        w = bgImg.width * scale * scaleX;
                        h = bgImg.height * scale * scaleY;
                    } else {
                        w = modelOriginalWidth * scaleX * scale;
                        h = modelOriginalHeight * scaleY * scale;
                    }

                    if (mx >= cx - w / 2 && mx <= cx + w / 2 && my >= cy - h / 2 && my <= cy + h / 2) {
                        hitObject = true;
                        hitObjectIndex = index;
                        break;
                    }
                }

                // 旋转处理
                // 优先旋转选中的对象，如果没有选中对象但鼠标在对象上，则旋转该对象
                const indicesToRotate = selectedIndexes.length > 0 ? selectedIndexes : (hitObject && hitObjectIndex >= 0 ? [hitObjectIndex] : []);

                if (indicesToRotate.length > 0) {
                    setTransforms(prev => {
                        const copy = [...prev];

                        indicesToRotate.forEach((idx) => {
                            const targetTransform = prev[idx];
                            if (!targetTransform) return;

                            const setTransformIndices = findAllSetTransformsBeforeBreakpoint(copy, targetTransform.target, hasBreakpoint);

                            if (setTransformIndices.length > 0) {
                                // 更新所有相关的 setTransform 的 rotation
                                setTransformIndices.forEach((setTransformIdx) => {
                                    if (copy[setTransformIdx].transform.rotation === undefined) {
                                        copy[setTransformIdx].transform.rotation = 0;
                                    }
                                    const currentRotation = copy[setTransformIdx].transform.rotation || 0;
                                    const newRotation = currentRotation + rotationDelta;
                                    copy[setTransformIdx].transform.rotation = newRotation;
                                });
                            } else {
                                // 如果没有 setTransform，直接更新 changeFigure/changeBg 的 rotation
                                if (copy[idx].transform.rotation === undefined) {
                                    copy[idx].transform.rotation = 0;
                                }
                                copy[idx].transform.rotation = (copy[idx].transform.rotation || 0) + rotationDelta;

                                // 同时也要创建一个 setTransform 来保存旋转值（如果需要）
                                // 这里我们只更新现有的 transform，不创建新的 setTransform
                            }
                        });

                        return copy;
                    });
                }

                return; // Alt+滚轮处理完成，退出
            }

            // Ctrl+滚轮：缩放功能（原有逻辑）
            if (e.ctrlKey && !e.altKey) {
                // 计算缩放增量
                const delta = e.deltaY < 0 ? 0.05 : -0.05;

                // 检查是否点击到了某个对象
                let hitObject = false;
                for (let index = transforms.length - 1; index >= 0; index--) {
                    const obj = transforms[index];
                    // 跳过 setTransform，因为它们不应该直接响应滚轮事件
                    if (obj.type === 'setTransform' || obj.type === 'rawText') {
                        continue;
                    }
                    if (!obj.transform.position || !obj.transform.scale) {
                        continue;
                    }
                    const { x, y } = obj.transform.position;
                    const scale = obj.transform.scale.x;
                    const isBg = obj.target === 'bg-main';

                    let baseX = canvasWidth / 2, baseY = canvasHeight / 2;
                    if (!isBg && modelImg) {
                        const imgW = modelImg.width, imgH = modelImg.height;
                        const fitScale = Math.min(canvasWidth / imgW, canvasHeight / imgH);
                        const preset = getPreset(obj as any);
                        const targetWNoUser = imgW * fitScale;
                        const targetHNoUser = imgH * fitScale;
                        baseY = canvasHeight / 2 + (targetHNoUser < canvasHeight ? (canvasHeight - targetHNoUser) / 2 : 0);
                        baseX = preset === 'left' ? targetWNoUser / 2 :
                            preset === 'right' ? canvasWidth - targetWNoUser / 2 :
                                canvasWidth / 2;
                    }
                    const cx = baseX + x * scaleX;
                    const cy = baseY + y * scaleY;

                    let w = 0, h = 0;
                    if (obj.target === "bg-main" && bgImg) {
                        w = bgImg.width * scale * scaleX;
                        h = bgImg.height * scale * scaleY;
                    } else {
                        w = modelOriginalWidth * scaleX * scale;
                        h = modelOriginalHeight * scaleY * scale;
                    }

                    if (mx >= cx - w / 2 && mx <= cx + w / 2 && my >= cy - h / 2 && my <= cy + h / 2) {
                        hitObject = true;

                        // 如果有选中的对象，只缩放选中的对象（严格只缩放 selectedIndexes 中的项目，不包括背景）
                        if (selectedIndexes.length > 0) {
                            setTransforms(prev => {
                                const copy = [...prev];
                                // 严格只缩放 selectedIndexes 中的对象，不缩放其他任何对象（包括背景）
                                selectedIndexes.forEach(selectedIndex => {
                                    const selectedObj = copy[selectedIndex];
                                    if (selectedObj) {
                                        // 如果选中的是 setTransform，直接缩放它
                                        // 如果选中的是 changeFigure/changeBg，也需要缩放它（可能需要同时缩放对应的 setTransform）
                                        const currentScale = selectedObj.transform.scale?.x || 1;
                                        const newScale = Math.max(0.1, currentScale + delta);
                                        if (!copy[selectedIndex].transform.scale) {
                                            copy[selectedIndex].transform.scale = { x: 1, y: 1 };
                                        }
                                        copy[selectedIndex].transform.scale.x = newScale;
                                        copy[selectedIndex].transform.scale.y = newScale;

                                        // 如果选中的是 changeFigure/changeBg，也需要更新对应的 setTransform（如果有）
                                        if ((selectedObj.type === 'changeFigure' || selectedObj.type === 'changeBg')) {
                                            const setTransformIdx = findLastSetTransform(copy, selectedObj.target);
                                            if (setTransformIdx !== -1) {
                                                // 如果 scale 不存在，先创建它
                                                if (!copy[setTransformIdx].transform.scale) {
                                                    copy[setTransformIdx].transform.scale = { x: 1, y: 1 };
                                                }
                                                copy[setTransformIdx].transform.scale.x = newScale;
                                                copy[setTransformIdx].transform.scale.y = newScale;
                                            }
                                        }
                                    }
                                });
                                return copy;
                            });
                            // 找到选中的对象后就退出，不再处理其他对象
                            break;
                        } else {
                            // 如果没有选中的对象，只缩放当前鼠标下的对象
                            const newScale = Math.max(0.1, scale + delta);
                            setTransforms(prev => {
                                const copy = [...prev];
                                if (!copy[index].transform.scale) {
                                    copy[index].transform.scale = { x: 1, y: 1 };
                                }
                                const scaleObj = copy[index].transform.scale;
                                if (scaleObj) {
                                    scaleObj.x = newScale;
                                    scaleObj.y = newScale;
                                }
                                // 如果这是 changeFigure/changeBg，也需要更新对应的 setTransform（如果有）
                                if ((obj.type === 'changeFigure' || obj.type === 'changeBg')) {
                                    const setTransformIdx = findLastSetTransform(copy, obj.target);
                                    if (setTransformIdx !== -1) {
                                        // 如果 scale 不存在，先创建它
                                        if (!copy[setTransformIdx].transform.scale) {
                                            copy[setTransformIdx].transform.scale = { x: 1, y: 1 };
                                        }
                                        copy[setTransformIdx].transform.scale.x = newScale;
                                        copy[setTransformIdx].transform.scale.y = newScale;
                                    }
                                }
                                return copy;
                            });
                            break;
                        }
                    }
                }

                // 如果没有点击到任何对象，但有选中的对象，则只缩放所有选中的对象（严格只缩放 selectedIndexes 中的对象）
                if (!hitObject && selectedIndexes.length > 0) {
                    setTransforms(prev => {
                        const copy = [...prev];
                        // 严格只缩放 selectedIndexes 中的对象
                        selectedIndexes.forEach(selectedIndex => {
                            const selectedObj = copy[selectedIndex];
                            if (selectedObj) {
                                const currentScale = selectedObj.transform.scale?.x || 1;
                                const newScale = Math.max(0.1, currentScale + delta);
                                if (!copy[selectedIndex].transform.scale) {
                                    copy[selectedIndex].transform.scale = { x: 1, y: 1 };
                                }
                                copy[selectedIndex].transform.scale.x = newScale;
                                copy[selectedIndex].transform.scale.y = newScale;

                                // 如果选中的是 changeFigure/changeBg，也需要更新对应的 setTransform（如果有）
                                if ((selectedObj.type === 'changeFigure' || selectedObj.type === 'changeBg')) {
                                    const setTransformIdx = findLastSetTransform(copy, selectedObj.target);
                                    if (setTransformIdx !== -1) {
                                        // 如果 scale 不存在，先创建它
                                        if (!copy[setTransformIdx].transform.scale) {
                                            copy[setTransformIdx].transform.scale = { x: 1, y: 1 };
                                        }
                                        copy[setTransformIdx].transform.scale.x = newScale;
                                        copy[setTransformIdx].transform.scale.y = newScale;
                                    }
                                }
                            }
                        });
                        return copy;
                    });
                }
            }
        };

        canvas.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            canvas.removeEventListener("wheel", handleWheel);
        };
    }, [canvasRef.current, transforms, bgImg, modelImg, selectedIndexes, overlayMode, breakpoints, canvasWidth, canvasHeight, scaleX, scaleY, modelOriginalWidth, modelOriginalHeight, setTransforms]); // 👈 包含所有依赖项

    useEffect(() => {
        if (!appRef.current) return;

        const app = appRef.current;
        const stage = app.stage;
        
        // 保存当前的辅助线
        const existingGuideLines = stage.children.find(child => (child as any).isGuideLines);
        
        stage.removeChildren();

        Object.values(graphicsMapRef.current).forEach(g => g.destroy());
        graphicsMapRef.current = {};
        spriteMap.current = {};

        // 构建 target 到 setTransform 的映射（使用最后一个 setTransform）
        // 从后往前遍历，确保保存的是最后一个 setTransform
        const setTransformMap = new Map<string, TransformData>();
        for (let i = transforms.length - 1; i >= 0; i--) {
            const t = transforms[i];
            if (t.type === "setTransform" && t.target && !setTransformMap.has(t.target)) {
                setTransformMap.set(t.target, t);
            }
        }

        // 构建 target 到 changeFigure/changeBg 的映射（使用最后一个 changeFigure/changeBg）
        // 从后往前遍历，确保保存的是最后一个 changeFigure/changeBg
        const changeFigureMap = new Map<string, TransformData>();
        for (let i = transforms.length - 1; i >= 0; i--) {
            const t = transforms[i];
            if ((t.type === "changeFigure" || t.type === "changeBg") && t.target && !changeFigureMap.has(t.target)) {
                changeFigureMap.set(t.target, t);
            }
        }

        // 获取所有需要渲染的 targets（每个 target 只渲染一次，使用最后一个 changeFigure/changeBg）
        const renderedTargets = new Set<string>();
        const targetsToRender: TransformData[] = [];

        // 从后往前遍历，找到每个 target 的最后一个 changeFigure/changeBg
        for (let i = transforms.length - 1; i >= 0; i--) {
            const t = transforms[i];
            if ((t.type === "changeFigure" || t.type === "changeBg") && t.target && !renderedTargets.has(t.target)) {
                renderedTargets.add(t.target);
                targetsToRender.unshift(t); // 保持顺序，但只保留最后一个
            }
        }

        targetsToRender.forEach((t, index) => {
            // 跳过 rawText 类型，不渲染任何内容
            if (t.type === "rawText") {
                return;
            }

            const container = new PixiContainer();
            const isBg = t.target === "bg-main";
            
            // 获取该 target 的最后一个 changeFigure/changeBg（从 map 中获取）
            const lastChangeFigure = changeFigureMap.get(t.target);
            if (!lastChangeFigure) {
                return; // 如果没有找到对应的 changeFigure/changeBg，跳过
            }

            // 获取该 target 的最后一个 setTransform（如果有）
            const setTransform = setTransformMap.get(t.target);

            // 合并 transform：优先使用最后一个 setTransform，缺失的参数从最后一个 changeFigure/changeBg 继承
            const filterKeys = [
                "brightness", "contrast", "saturation", "gamma",
                "colorRed", "colorGreen", "colorBlue",
                "bloom", "bloomBrightness", "bloomBlur", "bloomThreshold",
                "bevel", "bevelThickness", "bevelRotation", "bevelSoftness",
                "bevelRed", "bevelGreen", "bevelBlue"
            ];

            // 先使用最后一个 changeFigure/changeBg 的 transform（包含滤镜参数）
            let transformToUse: any = {
                ...lastChangeFigure.transform,
            };

            // 如果有 setTransform，优先使用 setTransform 的 position、scale、rotation（如果存在）
            if (setTransform && setTransform.transform) {
                // 从 setTransform 继承 position（如果存在）
                if (setTransform.transform.position !== undefined) {
                    transformToUse.position = { ...setTransform.transform.position };
                } else if (lastChangeFigure.transform.position !== undefined) {
                    // 如果 setTransform 没有 position，从 changeFigure 继承
                    transformToUse.position = { ...lastChangeFigure.transform.position };
                }

                // 从 setTransform 继承 scale（如果存在）
                if (setTransform.transform.scale !== undefined) {
                    transformToUse.scale = { ...setTransform.transform.scale };
                } else if (lastChangeFigure.transform.scale !== undefined) {
                    // 如果 setTransform 没有 scale，从 changeFigure 继承
                    transformToUse.scale = { ...lastChangeFigure.transform.scale };
                }

                // 从 setTransform 继承 rotation（如果存在）
                if (setTransform.transform.rotation !== undefined) {
                    transformToUse.rotation = setTransform.transform.rotation;
                } else if (lastChangeFigure.transform.rotation !== undefined) {
                    // 如果 setTransform 没有 rotation，从 changeFigure 继承
                    transformToUse.rotation = lastChangeFigure.transform.rotation;
                }
            }

            // 确保滤镜参数始终从 changeFigure/changeBg 中获取
            for (const key of filterKeys) {
                if (lastChangeFigure.transform[key] !== undefined) {
                    transformToUse[key] = lastChangeFigure.transform[key];
                }
            }
            
            // 获取立绘或背景
            let displayObject: PIXI.DisplayObject | null = null;
            let imgWidth = 0;
            let imgHeight = 0;

            if (isBg) {
                // 背景
                if (bgImg) {
                    displayObject = PIXI.Sprite.from(bgImg);
                    imgWidth = bgImg.width;
                    imgHeight = bgImg.height;
                }
            } else {
                // 立绘：优先从 figureManager 获取
                const figure = figureManager.getFigure(t.target);
                if (figure) {
                    // 使用 figureManager 的数据
                    displayObject = figure.displayObject;
                    imgWidth = figure.width;
                    imgHeight = figure.height;

                    // 如果是 GIF 或 Live2D，需要设置一些特殊属性
                    if (figure.sourceType === 'gif') {
                        // GIF 对象已经初始化，但需要设置缩放
                        (displayObject as any).anchor?.set(0.5);
                    }
                } else if (modelImg) {
                    // 回退到默认 modelImg（但如果是 Live2D json/jsonl，则避免回退以防闪烁）
                    const isLive2DRef = t.type === 'changeFigure' && typeof (t as any).path === 'string' && (
                        (t as any).path.endsWith('.json') || (t as any).path.endsWith('.jsonl')
                    );
                    if (!isLive2DRef) {
                        displayObject = PIXI.Sprite.from(modelImg);
                        imgWidth = modelImg.width;
                        imgHeight = modelImg.height;
                    }
                }
            }
            
            if (!displayObject) return;

            // 对于 Live2D 模型，需要创建包装容器
            let sprite: any;
            const figure = figureManager.getFigure(t.target);
            
            if (figure?.sourceType === 'live2d' || figure?.sourceType === 'jsonl') {
                // Live2D 模型：使用 Container 包装以确保事件能正确传递
                const wrapper = new PIXI.Container();
                wrapper.addChild(displayObject);
                
                // 设置交互属性
                wrapper.interactive = true;
                wrapper.buttonMode = false;
                wrapper.cursor = "pointer";
                
                // 设置 hitArea（相对于容器中心）
                wrapper.hitArea = new PIXI.Rectangle(
                    -imgWidth / 2,
                    -imgHeight / 2,
                    imgWidth,
                    imgHeight
                );
                
                // 将 Live2D 模型放置在容器中心
                displayObject.x = 0;
                displayObject.y = 0;
                
                // 设置 pivot 点为中心（在设置尺寸之前）
                wrapper.pivot.set(0, 0);
                
                // 设置容器的尺寸（用于后续的缩放计算）
                (wrapper as any).width = imgWidth;
                (wrapper as any).height = imgHeight;
                
                sprite = wrapper;
            } else {
                // 普通图片或 GIF
                sprite = displayObject as PIXI.Sprite;
                sprite.interactive = true;
                sprite.cursor = "pointer";
                // 注意：hitArea 和 mask 将在计算完 drawW/drawH 后再设置，以确保使用正确的尺寸
            }

            // —— 等比缩放 + 预设位（对 bg 与 非 bg 分开）——
            let drawW = 0, drawH = 0;
            let baseX = centerX; // addFigure 的"基线 X"
            let baseY = centerY; // addFigure 的"基线 Y"

            if (isBg && bgImg) {
                // 背景：铺满画布（cover）
                // 使用 cover 模式：保证背景图片完全覆盖画布，可能会超出画布范围
                const imageRatio = bgImg.width / bgImg.height;
                const canvasRatio = canvasWidth / canvasHeight;
                
                // 计算铺满画布所需的缩放比例
                // 如果画布比图片宽，按宽度铺满；如果画布比图片高，按高度铺满
                let fitScale = canvasWidth / bgImg.width;
                if (canvasRatio < imageRatio) {
                    // 画布比图片窄（高度方向），按高度铺满
                    fitScale = canvasHeight / bgImg.height;
                }

                // drawW/drawH 使用 fitScale 计算基础尺寸
                // 背景的基础尺寸应该保证铺满画布
                drawW = bgImg.width * fitScale;
                drawH = bgImg.height * fitScale;

                // BG 永远居中
                baseX = canvasWidth / 2;
                baseY = canvasHeight / 2;
                
                // 背景的 scale 通过 container.scale 应用，和立绘一样
                // 不再修改 sprite 的宽度和高度
            } else {
                // 立绘：按 addFigure 等比适配（contain）
                // 使用实际渲染的图片尺寸
                const imgW = imgWidth || 1;
                const imgH = imgHeight || 1;

                const fitScale = Math.min(canvasWidth / imgW, canvasHeight / imgH);
                
                // drawW/drawH 只使用 fitScale，用户缩放通过 container.scale 应用
                drawW = imgW * fitScale;
                drawH = imgH * fitScale;

                // 垂直基线（与 addFigure 一致）
                // 先以画布中线为基准，如果适配后的高度没有铺满，则把基线下移 (stageH - targetH)/2
                baseY = canvasHeight / 2;
                const targetHNoUser = imgH * fitScale; // 不含用户缩放的原始适配高度（对基线判断用）
                if (targetHNoUser < canvasHeight) {
                    baseY = canvasHeight / 2 + (canvasHeight - targetHNoUser) / 2;
                }

                // 水平预设位（使用最后一个 changeFigure 的预设位置）
                const preset = getPreset(lastChangeFigure); // 'left' | 'center' | 'right'
                const targetWNoUser = imgW * fitScale; // 不含用户缩放的原始适配宽度（基线用）
                if (preset === 'center') baseX = canvasWidth / 2;
                if (preset === 'left')   baseX = targetWNoUser / 2;
                if (preset === 'right')  baseX = canvasWidth - targetWNoUser / 2;
            }

            // 应用尺寸
            sprite.width = drawW;
            sprite.height = drawH;
            
            // 对于普通图片和 GIF，设置 anchor 和 hitArea（使用实际的渲染尺寸）
            if (figure?.sourceType !== 'live2d' && figure?.sourceType !== 'jsonl') {
                sprite.anchor?.set(0.5);
                
                // 在设置完尺寸后，设置 hitArea（使用实际的渲染尺寸 drawW 和 drawH）
                sprite.hitArea = new PIXI.Rectangle(
                    -drawW / 2,
                    -drawH / 2,
                    drawW,
                    drawH
                );
                
                // 如果需要 mask，也使用正确的尺寸
                if (sprite.mask) {
                    const maskGraphics = sprite.mask as PIXI.Graphics;
                    maskGraphics.clear();
                    maskGraphics.beginFill(0xffffff);
                    maskGraphics.drawRect(-drawW / 2, -drawH / 2, drawW, drawH);
                    maskGraphics.endFill();
                }
            }
            
            container.addChild(sprite);

            // 保存 baseX 和 baseY，用于动画更新时计算位置
            (container as any)._baseX = baseX;
            (container as any)._baseY = baseY;
            (container as any)._isBg = isBg;

            const px = (transformToUse.position?.x ?? 0) * scaleX;
            const py = (transformToUse.position?.y ?? 0) * scaleY;

            container.x = baseX + px;
            container.y = baseY + py;
            container.rotation = transformToUse.rotation || 0;
            // 背景和立绘都使用 container.scale 来应用缩放
            container.scale.set(transformToUse.scale?.x || 1, transformToUse.scale?.y || 1);


            // 💡 设置滤镜字段（由 PixiContainer 实现）
            for (const key in transformToUse) {
                if (["position", "scale", "rotation"].includes(key)) continue;
                if ((container as any)[key] !== undefined) {
                    (container as any)[key] = transformToUse[key];
                }
            }

            // 🔁 角色名（可选显示）
            if (showTargetId) {
                const nameText = new PIXI.Text(t.target, {
                    fontSize: 64,
                    fill: 0x000000,
                    fontFamily: "Arial",
                });
                nameText.anchor.set(0.5);
                nameText.position.set(container.x, container.y - drawH / 2 - 10);
                stage.addChild(nameText);
            }

            // 🧠 注册交互（只有启用的target才能交互）
            const isTargetEnabled = enabledTargets.has(t.target);
            
            if (!isTargetEnabled) {
                // 如果target未启用，完全禁用交互，让事件能够穿透
                sprite.interactive = false;
                sprite.hitArea = null;

                // 使用 eventMode 来完全禁用事件（PIXI.js v6+）
                if ('eventMode' in sprite) {
                    (sprite as any).eventMode = 'none';
                }

                // 对于 Container（Live2D wrapper），需要禁用子元素的交互
                if (sprite instanceof PIXI.Container) {
                    sprite.interactiveChildren = false;
                    // 确保容器本身也不拦截事件
                    (sprite as any).buttonMode = false;
                    (sprite as any).cursor = "default";
                    // 对于容器内的子元素，也要禁用交互
                    sprite.children.forEach((child: any) => {
                        if (child) {
                            child.interactive = false;
                            if ('eventMode' in child) {
                                child.eventMode = 'none';
                            }
                        }
                    });
                }
                // 对于普通 Sprite，也需要清除 cursor
                if (sprite instanceof PIXI.Sprite) {
                    sprite.cursor = "default";
                }
                // 不注册任何事件监听器，让事件完全穿透
            } else {
                // target 已启用，正常设置交互
                sprite.interactive = true;

                // 确保 eventMode 设置为正确的值（PIXI.js v6+）
                if ('eventMode' in sprite) {
                    (sprite as any).eventMode = 'static';
                }

                // 注册事件监听器
                sprite
                    .on("pointerdown", (e: any) => {
                    
                        // 🟡 获取原始键盘状态 - 尝试多种方法以确保可靠性
                        const original = e.data.originalEvent as PointerEvent | MouseEvent;
                        let isAlt = false;
                        let isShift = false;

                        // 优先从事件中获取（最准确，因为是实时状态）
                        if (original) {
                            isAlt = original.altKey || false;
                            isShift = original.shiftKey || false;
                        }

                        // 如果事件中没有，使用全局键盘状态作为备选
                        if (!isAlt) {
                            isAlt = altKeyPressedRef.current;
                        }
                        if (!isShift) {
                            isShift = shiftKeyPressedRef.current;
                        }

                        // 如果观察层启用，阻止所有交互（这是设计特性）
                        if (overlayMode !== "none") {
                            return;
                        }

                        // 调试信息（可以在控制台查看）
                        if (isAlt) {
                            console.log('🔄 Alt键按下，准备旋转', { index, selectedIndexes: selectedIndexes.length });
                        }

                    const local = e.data.getLocalPosition(app.stage);
                    offsetRef.current = { x: local.x, y: local.y };
                    draggingRef.current = index;

                    // 保存初始位置（使用 setTransform 的 transform，如果有的话）
                    initialPositionsRef.current = {};
                        const indicesToUpdate = selectedIndexes.length > 0 ? selectedIndexes : [index];
                        indicesToUpdate.forEach(idx => {
                        const targetTransform = transforms[idx];
                            if (targetTransform) {
                            // 查找对应的最后一个 setTransform
                            const setTransformIdx = findLastSetTransform(transforms, targetTransform.target);
                            const setTransform = setTransformIdx !== -1 ? transforms[setTransformIdx] : null;
                            const transformToUse = setTransform ? setTransform.transform : targetTransform.transform;
                            initialPositionsRef.current[idx] = {
                                x: transformToUse.position?.x ?? 0,
                                y: transformToUse.position?.y ?? 0,
                            };
                        }
                    });

                    const cx = container.x;
                    const cy = container.y;

                    // 获取当前渲染时使用的 transform（用于旋转控制）
                    const setTransformForCurrent = setTransformMap.get(t.target);
                    const currentTransform = setTransformForCurrent ? setTransformForCurrent.transform : transformToUse;

                        // 始终初始化旋转中心点（即使不是旋转模式，也预先设置，以便在移动过程中切换）
                        const indicesForRotation = selectedIndexes.length > 0 ? [...selectedIndexes] : [index];
                        const firstIdx = indicesForRotation[0];
                        const firstTransform = transforms[firstIdx];
                        if (firstTransform) {
                            const firstContainer = spriteMap.current[firstTransform.target];
                            if (firstContainer) {
                                rotationCenterRef.current = { x: firstContainer.x, y: firstContainer.y };
                                rotationStartAngleRef.current = Math.atan2(local.y - firstContainer.y, local.x - firstContainer.x);
                            } else {
                                rotationCenterRef.current = { x: cx, y: cy };
                                rotationStartAngleRef.current = Math.atan2(local.y - cy, local.x - cx);
                            }
                        }

                    if (isAlt) {
                        // 🌀 旋转控制
                        rotatingRef.current = true;
                        // 确定要旋转的对象索引（优先使用选中的对象，否则使用当前点击的对象）
                        const indicesToRotate = indicesForRotation;
                        // 保存到ref中，以便在闭包中使用
                        rotatingIndicesRef.current = indicesToRotate;

                        // 如果没有选中的对象，先选中当前点击的对象（用于UI显示）
                        if (selectedIndexes.length === 0) {
                            setSelectedIndexes([index]);
                        }

                        // 记录所有要旋转的对象的初始旋转角度
                        initialRotationRef.current = {};
                        indicesToRotate.forEach((idx) => {
                            const targetTransform = transforms[idx];
                            if (targetTransform) {
                                const setTransformIdx = findLastSetTransform(transforms, targetTransform.target);
                                const setTransform = setTransformIdx !== -1 ? transforms[setTransformIdx] : null;
                                const transformToUseForRot = setTransform ? setTransform.transform : targetTransform.transform;
                                initialRotationRef.current[idx] = transformToUseForRot.rotation || 0;
                            }
                        });

                        console.log('🔄 Alt键按下，进入旋转模式', {
                            index,
                            selectedCount: selectedIndexes.length,
                            rotatingIndices: rotatingIndicesRef.current,
                            rotationCenter: rotationCenterRef.current
                        });
                    } else {
                        // ✅ 多选或单选（只在未选中时更新选中状态）
                        rotatingRef.current = false;
                        rotatingIndicesRef.current = [];
                        initialRotationRef.current = {};
                        if (isShift) {
                            setSelectedIndexes((prev) =>
                                prev.includes(index) ? prev : [...prev, index]
                            );
                        } else if (!selectedIndexes.includes(index)) {
                            // 如果已经选中，不重新设置，保持拖拽
                            setSelectedIndexes([index]);
                        }
                    }

                    // 绑定全局事件到 stage，确保鼠标移出 sprite 后仍能拖拽
                    const handleGlobalMove = (e: any) => {
                        const i = draggingRef.current;
                        if (i === null) return;

                        const localPos = e.data.getLocalPosition(app.stage);

                        // 检查Alt键是否仍然按下（在移动过程中也要检查）
                        const original = (e.data.originalEvent as PointerEvent) || (e.data.originalEvent as MouseEvent);
                        const isAltStillPressed = original?.altKey !== undefined ? original.altKey : altKeyPressedRef.current;

                        // 如果Alt键被释放，切换到拖拽模式
                        if (rotatingRef.current && !isAltStillPressed) {
                            rotatingRef.current = false;
                            rotatingIndicesRef.current = [];
                            console.log('🔄 Alt键释放，切换到拖拽模式');
                        }

                        // 如果Alt键在移动过程中被按下，切换到旋转模式
                        if (!rotatingRef.current && isAltStillPressed && rotationCenterRef.current) {
                            rotatingRef.current = true;
                            // 使用当前选中的对象或当前拖拽的对象
                            if (rotatingIndicesRef.current.length === 0) {
                                // 从最新的selectedIndexes获取（通过setTransforms的prev参数）
                                // 但这里我们使用ref来存储，避免闭包问题
                                rotatingIndicesRef.current = selectedIndexes.length > 0 ? [...selectedIndexes] : (i !== null ? [i] : []);
                                // 重新计算旋转中心点和初始角度（因为对象可能已经移动了）
                                if (rotatingIndicesRef.current.length > 0 && i !== null) {
                                    const firstIdx = rotatingIndicesRef.current[0];
                                    const firstTransform = transforms[firstIdx];
                                    if (firstTransform) {
                                        const firstContainer = spriteMap.current[firstTransform.target];
                                        if (firstContainer) {
                                            rotationCenterRef.current = { x: firstContainer.x, y: firstContainer.y };
                                            rotationStartAngleRef.current = Math.atan2(localPos.y - firstContainer.y, localPos.x - firstContainer.x);
                                            // 记录初始旋转角度
                                            initialRotationRef.current = {};
                                            rotatingIndicesRef.current.forEach((idx) => {
                                                const targetTransform = transforms[idx];
                                                if (targetTransform) {
                                                    const setTransformIdx = findLastSetTransform(transforms, targetTransform.target);
                                                    const setTransform = setTransformIdx !== -1 ? transforms[setTransformIdx] : null;
                                                    const transformToUseForRot = setTransform ? setTransform.transform : targetTransform.transform;
                                                    initialRotationRef.current[idx] = transformToUseForRot.rotation || 0;
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                            console.log('🔄 Alt键在移动中按下，切换到旋转模式', { indices: rotatingIndicesRef.current });
                        }

                        if (rotatingRef.current && rotationCenterRef.current) {
                        // 🌀 实时旋转 - 应用到所有要旋转的对象
                            const hasBreakpoint = breakpoints.size > 0;
                            // 使用ref中存储的索引，而不是state（避免闭包问题）
                            const indicesToRotate = rotatingIndicesRef.current.length > 0 ? rotatingIndicesRef.current : (i !== null ? [i] : []);

                            if (indicesToRotate.length === 0) {
                                console.warn('⚠️ 没有要旋转的对象');
                                return;
                            }

                            // 计算当前鼠标位置相对于旋转中心的角度
                            const center = rotationCenterRef.current;
                            const angleNow = Math.atan2(localPos.y - center.y, localPos.x - center.x);
                            const deltaAngle = angleNow - rotationStartAngleRef.current;

                            setTransforms((prev) => {
                                const copy = [...prev];
                                // 对所有要旋转的对象应用相同的旋转增量
                                indicesToRotate.forEach((idx) => {
                                    const targetTransform = prev[idx];
                                    if (!targetTransform) return;

                                    const setTransformIndices = findAllSetTransformsBeforeBreakpoint(copy, targetTransform.target, hasBreakpoint);
                                    if (setTransformIndices.length > 0) {
                                        // 获取该对象的初始旋转角度
                                        const initialRot = initialRotationRef.current[idx];
                                        if (initialRot !== undefined) {
                                            const newRotation = initialRot + deltaAngle;

                                            // 更新所有相关的 setTransform 的 rotation
                                            setTransformIndices.forEach((setTransformIdx) => {
                                                if (copy[setTransformIdx].transform.rotation === undefined) {
                                                    copy[setTransformIdx].transform.rotation = 0;
                                                }
                                                copy[setTransformIdx].transform.rotation = newRotation;
                                            });
                                        }
                                    } else {
                                        // 如果没有 setTransform，直接更新 changeFigure/changeBg 的 rotation
                                        const initialRot = initialRotationRef.current[idx];
                                        if (initialRot !== undefined) {
                                            if (copy[idx].transform.rotation === undefined) {
                                                copy[idx].transform.rotation = 0;
                                            }
                                            copy[idx].transform.rotation = initialRot + deltaAngle;
                                        }
                                    }
                                });
                                return copy;
                            });
                        } else {
                            // 拖拽逻辑
                            const deltaX = localPos.x - offsetRef.current.x;
                            const deltaY = localPos.y - offsetRef.current.y;

                            // 检查是否有断点
                            const hasBreakpoint = breakpoints.size > 0;

                            setTransforms((prev) => {
                                const copy = [...prev];
                                // 使用要拖拽的对象索引（如果有选中的对象，使用选中的对象；否则使用当前拖拽的对象）
                                // 注意：这里也需要使用ref来避免闭包问题，但由于拖拽逻辑比较复杂，我们先使用selectedIndexes
                                // 如果selectedIndexes为空，使用当前拖拽的对象
                                const indicesToDrag = selectedIndexes.length > 0 ? selectedIndexes : (i !== null ? [i] : []);

                                indicesToDrag.forEach((idx) => {
                                    const initialPos = initialPositionsRef.current[idx];
                                    if (initialPos) {
                                        const targetTransform = prev[idx];
                                        if (!targetTransform) return;

                                        // 查找该 target 在断点之前的所有 setTransform（如果有断点）
                                        // 或者只查找最后一个 setTransform（如果没有断点）
                                        const setTransformIndices = findAllSetTransformsBeforeBreakpoint(copy, targetTransform.target, hasBreakpoint);

                                        if (setTransformIndices.length > 0) {
                                            // 更新所有相关的 setTransform 的 position
                                            setTransformIndices.forEach((setTransformIdx) => {
                                                // 更新 setTransform 的 position（如果不存在则创建）
                                                if (!copy[setTransformIdx].transform.position) {
                                                    copy[setTransformIdx].transform.position = { x: 0, y: 0 };
                                                }
                                                if (!lockX) {
                                                    copy[setTransformIdx].transform.position.x = initialPos.x + deltaX / scaleX;
                                                }
                                                if (!lockY) {
                                                    copy[setTransformIdx].transform.position.y = initialPos.y + deltaY / scaleY;
                                                }
                                            });
                                        } else {
                                            // 如果没有 setTransform，使用原来的逻辑（不应该发生，但保险起见）
                                            if (!copy[idx].transform.position) {
                                                copy[idx].transform.position = { x: 0, y: 0 };
                                            }
                                            if (!lockX) {
                                                copy[idx].transform.position.x = initialPos.x + deltaX / scaleX;
                                            }
                                            if (!lockY) {
                                                copy[idx].transform.position.y = initialPos.y + deltaY / scaleY;
                                            }
                                        }
                                    }
                                });
                                return copy;
                            });
                        }
                    };

                    const handleGlobalUp = () => {
                        draggingRef.current = null;
                        rotatingRef.current = false;
                        rotatingIndicesRef.current = [];
                        rotationCenterRef.current = null;
                        stage.off("pointermove", handleGlobalMove);
                        stage.off("pointerup", handleGlobalUp);
                        stage.off("pointerupoutside", handleGlobalUp);
                    };

                    // 绑定全局事件
                    stage.on("pointermove", handleGlobalMove);
                    stage.on("pointerup", handleGlobalUp);
                    stage.on("pointerupoutside", handleGlobalUp);
                });
            }

            // 📏 蓝色边框（可选显示）
            // 如果启用了显示蓝色框选框，则所有模型都显示蓝色框
            if (showSelectionBox) {
                const g = new PIXI.Graphics();
                // 选中的对象使用更粗的线条和更亮的颜色，未选中的对象使用较细的线条
                const isSelected = selectedIndexes.includes(index);
                g.lineStyle(isSelected ? 3 : 2, isSelected ? 0x0000ff : 0x4169e1); // 选中：蓝色粗线，未选中：较淡蓝色细线
                g.drawRect(-drawW / 2, -drawH / 2, drawW, drawH);
                g.endFill();
                g.position.set(container.x, container.y);
                g.rotation = container.rotation;
                g.pivot.set(0, 0);
                stage.addChild(g);
                graphicsMapRef.current[t.target] = g;
            }

            spriteMap.current[t.target] = container;
            // 直接添加到stage，保持对象可交互
            if (isBg) {
                stage.addChildAt(container, 0); // 背景始终最底层
            } else {
                stage.addChild(container);
            }
        });
        
        // 🎨 观察层：保持原始对象在stage上，在它们之上添加观察层
        if (overlayMode !== "none") {
            // 移除旧的观察层
            if (overlayRef.current) {
                const oldOverlay = stage.children.find(child => (child as any).isOverlay);
                if (oldOverlay) {
                    stage.removeChild(oldOverlay);
                    oldOverlay.destroy();
                }
                overlayRef.current = null;
            }
            
            // 将所有场景内容渲染到RenderTexture（用于Filter计算）
            // 创建一个临时容器，保持位置为(0,0)以确保正确的坐标系统
            const tempSceneContainer = new PIXI.Container();
            tempSceneContainer.position.set(0, 0);
            
            // 收集所有需要渲染的对象（排除观察层、辅助线和文本标签）
            const childrenToRender: PIXI.DisplayObject[] = [];
            const childOrderMap = new Map<PIXI.DisplayObject, number>();
            
            stage.children.forEach((child, index) => {
                // 只收集实际的场景对象（Container类型，且在spriteMap中）
                if (!(child as any).isOverlay && 
                    !(child as any).isGuideLines && 
                    !(child instanceof PIXI.Text) &&
                    !Object.values(graphicsMapRef.current).includes(child as any)) {
                    childrenToRender.push(child);
                    childOrderMap.set(child, index);
                }
            });
            
            // 保存每个对象的原始父容器引用
            const originalParents = new Map<PIXI.DisplayObject, PIXI.Container | null>();
            childrenToRender.forEach(child => {
                originalParents.set(child, child.parent as PIXI.Container | null);
            });
            
            // 临时将对象移动到临时容器（PIXI对象不能同时属于两个父容器）
            childrenToRender.forEach(child => {
                tempSceneContainer.addChild(child);
            });
            
            // 渲染到RenderTexture，明确指定完整的canvas区域和固定的分辨率
            const sceneTexture = app.renderer.generateTexture(tempSceneContainer, {
                scaleMode: PIXI.SCALE_MODES.LINEAR,
                resolution: 1, // 固定分辨率，无视屏幕缩放
                region: new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight),
            });
            
            // 将对象移回stage（保持原来的顺序）
            childrenToRender.sort((a, b) => {
                const orderA = childOrderMap.get(a) ?? 0;
                const orderB = childOrderMap.get(b) ?? 0;
                return orderA - orderB;
            });
            
            childrenToRender.forEach(child => {
                stage.addChild(child);
            });
            
            // 清理临时容器
            tempSceneContainer.removeChildren();
            
            // 创建中性灰观察层Sprite
            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#808080'; // RGB(128, 128, 128) - 中性灰
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
            
            const overlayTexture = PIXI.Texture.from(canvas);
            const overlaySprite = new PIXI.Sprite(overlayTexture);
            overlaySprite.width = canvasWidth;
            overlaySprite.height = canvasHeight;
            
            // 设置观察层可交互，阻止事件穿透到下层，禁止拖动
            overlaySprite.interactive = true;
            overlaySprite.buttonMode = false;
            overlaySprite.hitArea = new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight); // 覆盖整个画布
            overlaySprite.cursor = "default"; // 默认光标样式
            
            // 创建和应用混合模式 Filter（传入场景纹理）
            const blendFilter = new OverlayBlendFilter(overlayMode, sceneTexture);
            overlaySprite.filters = [blendFilter as any];
            
            (overlaySprite as any).isOverlay = true;
            overlayRef.current = { 
                container: overlaySprite as any, 
                filter: blendFilter,
            };
            // 观察层添加到最上层
            // 由于设置了interactive=true和hitArea，事件不会穿透，从而禁止拖动
            stage.addChild(overlaySprite);
        } else {
            // 移除观察层（如果存在）
            if (overlayRef.current) {
                const existingOverlay = stage.children.find(child => (child as any).isOverlay);
                if (existingOverlay) {
                    stage.removeChild(existingOverlay);
                    existingOverlay.destroy();
                }
                overlayRef.current = null;
            }
        }
        
        // 重新添加辅助线（如果存在）
        if (existingGuideLines) {
            stage.addChild(existingGuideLines);
        }
    }, [transforms, modelImg, bgImg, selectedIndexes, lockX, lockY, overlayMode, canvasWidth, canvasHeight, enabledTargets, enabledTargetsArray, showSelectionBox, showTargetId]);

    // 独立的辅助线渲染逻辑
    useEffect(() => {
        if (!appRef.current) return;

        const app = appRef.current;
        const stage = app.stage;
        
        // 移除旧的辅助线
        const existingGuideLines = stage.children.find(child => (child as any).isGuideLines);
        if (existingGuideLines) {
            stage.removeChild(existingGuideLines);
            existingGuideLines.destroy();
        }

        if (guideLineType === 'none') return;

        const graphics = new PIXI.Graphics();
        (graphics as any).isGuideLines = true; // 标记为辅助线
        graphics.lineStyle(3, 0xff0000, 1.0); // 红色粗线条，更显眼

        switch (guideLineType) {
            case 'rule-of-thirds':
                drawGuideLines(graphics, 'rule-of-thirds', canvasWidth, canvasHeight);
                break;
            case 'center-cross':
                drawGuideLines(graphics, 'center-cross', canvasWidth, canvasHeight);
                break;
            case 'diagonal':
                drawGuideLines(graphics, 'diagonal', canvasWidth, canvasHeight);
                break;
            case 'golden-ratio':
                drawGuideLines(graphics, 'golden-ratio', canvasWidth, canvasHeight);
                break;
        }

        // 确保线条被绘制
        graphics.lineStyle(0); // 结束线条绘制

        // 将辅助线添加到最顶层
        stage.addChild(graphics);

        return () => {
            const guideLines = stage.children.find(child => (child as any).isGuideLines);
            if (guideLines) {
                stage.removeChild(guideLines);
                guideLines.destroy();
            }
        };
    }, [guideLineType, canvasWidth, canvasHeight]);

    // 独立的动画更新循环
    useEffect(() => {
        if (!animationStateRef || !appRef.current) return;
        
        let animationFrameId: number;
        
        const updateAnimation = () => {
            const animationState = animationStateRef.current;
            if (!animationState) {
                // 没有动画状态，继续循环等待
                animationFrameId = requestAnimationFrame(updateAnimation);
                return;
            }
            
            // 遍历所有动画状态，直接更新 Pixi 对象
            animationState.forEach((transform, target) => {
                const container = spriteMap.current[target];
                if (!container) {
                    // 调试：如果容器不存在，打印警告
                    if (target === 'bg-main') {
                        console.log(`🎬 ⚠️ 动画更新 bg-main: 容器不存在`);
                    }
                    return;
                }
                
                const baseX = (container as any)._baseX ?? canvasWidth / 2;
                const baseY = (container as any)._baseY ?? canvasHeight / 2;
                
                // 更新 position
                if (transform.position) {
                    const px = (transform.position.x ?? 0) * scaleX;
                    const py = (transform.position.y ?? 0) * scaleY;
                    container.x = baseX + px;
                    container.y = baseY + py;
                }
                
                // 更新 rotation
                if (transform.rotation !== undefined) {
                    container.rotation = transform.rotation ?? 0;
                }
                
                // 更新 scale（背景和立绘都使用 container.scale）
                // 确保 scale 总是被更新，即使 transform.scale 不存在
                if (transform.scale) {
                    const newScaleX = transform.scale.x ?? 1;
                    const newScaleY = transform.scale.y ?? 1;
                    // 强制更新 scale（即使值相同，也调用 set 以确保更新）
                    container.scale.set(newScaleX, newScaleY);
                    // 调试：打印背景的 scale 更新
                    if (target === 'bg-main') {
                        console.log(`🎬 动画更新 bg-main scale: ${JSON.stringify(transform.scale)}, container.scale: (${container.scale.x}, ${container.scale.y}), newScale: (${newScaleX}, ${newScaleY})`);
                    }
                } else {
                    // 如果没有 scale，设置为默认值
                    container.scale.set(1, 1);
                    if (target === 'bg-main') {
                        console.log(`🎬 ⚠️ 动画更新 bg-main: transform.scale 不存在，使用默认值 (1, 1)`);
                        console.log(`🎬   transform 内容: ${JSON.stringify(transform)}`);
                    }
                }
                
                // 更新滤镜（如果存在）
                for (const key in transform) {
                    if (["position", "scale", "rotation"].includes(key)) continue;
                    if ((container as any)[key] !== undefined) {
                        (container as any)[key] = transform[key];
                    }
                }
            });
            
            // 继续下一帧
            animationFrameId = requestAnimationFrame(updateAnimation);
        };
        
        // 启动动画循环
        animationFrameId = requestAnimationFrame(updateAnimation);
        
        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [animationStateRef, canvasWidth, canvasHeight, scaleX, scaleY]);

    return null;
}

// 辅助线绘制函数
function drawGuideLines(graphics: PIXI.Graphics, type: string, width: number, height: number) {
    switch (type) {
        case 'rule-of-thirds':
            const thirdWidth = width / 3;
            const thirdHeight = height / 3;
            // 垂直线
            graphics.moveTo(thirdWidth, 0);
            graphics.lineTo(thirdWidth, height);
            graphics.moveTo(thirdWidth * 2, 0);
            graphics.lineTo(thirdWidth * 2, height);
            // 水平线
            graphics.moveTo(0, thirdHeight);
            graphics.lineTo(width, thirdHeight);
            graphics.moveTo(0, thirdHeight * 2);
            graphics.lineTo(width, thirdHeight * 2);
            break;
        case 'center-cross':
            const centerX = width / 2;
            const centerY = height / 2;
            // 垂直线
            graphics.moveTo(centerX, 0);
            graphics.lineTo(centerX, height);
            // 水平线
            graphics.moveTo(0, centerY);
            graphics.lineTo(width, centerY);
            break;
        case 'diagonal':
            // 主对角线
            graphics.moveTo(0, 0);
            graphics.lineTo(width, height);
            // 副对角线
            graphics.moveTo(width, 0);
            graphics.lineTo(0, height);
            break;
        case 'golden-ratio':
            const goldenRatio = 1.618;
            const ratio = 1 / goldenRatio; // 约等于 0.618
            // 水平黄金比例线
            const goldenHeight = height * ratio;
            graphics.moveTo(0, goldenHeight);
            graphics.lineTo(width, goldenHeight);
            // 垂直黄金比例线
            const goldenWidth = width * ratio;
            graphics.moveTo(goldenWidth, 0);
            graphics.lineTo(goldenWidth, height);
            // 反向黄金比例线
            const reverseHeight = height * (1 - ratio);
            graphics.moveTo(0, reverseHeight);
            graphics.lineTo(width, reverseHeight);
            const reverseWidth = width * (1 - ratio);
            graphics.moveTo(reverseWidth, 0);
            graphics.lineTo(reverseWidth, height);
            break;
    }
}
