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
        showTargetId = true
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
    const initialRotationRef = useRef(0);
    const initialPositionsRef = useRef<Record<number, { x: number; y: number }>>({});

// 约定：优先 t.presetPosition，其次 extraParams.preset，默认 'center'
    function getPreset(t: TransformData): 'left'|'center'|'right' {
        // @ts-ignore
        return (t as any).presetPosition || (t as any).extraParams?.preset || 'center';
    }


// ✅ 1️⃣ 初始化 Pixi 应用，只做一次
    useEffect(() => {
        if (!canvasRef.current || appRef.current) return;

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
    }, []); // 👈 注意只初始化一次 Pixi

// ✅ 2️⃣ 独立 wheel 缩放事件绑定，等 canvas 真正挂载后再绑定
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.altKey) return;
            console.log('🌀 Wheel!', e.ctrlKey, e.altKey, e.deltaY);
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (canvasWidth / rect.width);
            const my = (e.clientY - rect.top) * (canvasHeight / rect.height);

            // 计算缩放增量
            const delta = e.deltaY < 0 ? 0.05 : -0.05;

            // 检查是否点击到了某个对象
            // 注意：只检查 changeFigure 和 changeBg，不检查 setTransform
            let hitObject = false;
            for (let index = transforms.length - 1; index >= 0; index--) {
                const obj = transforms[index];
                // 跳过 setTransform，因为它们不应该直接响应滚轮事件
                if (obj.type === 'setTransform' || obj.type === 'rawText') {
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
                                    copy[selectedIndex].transform.scale.x = newScale;
                                    copy[selectedIndex].transform.scale.y = newScale;
                                    
                                    // 如果选中的是 changeFigure/changeBg，也需要更新对应的 setTransform（如果有）
                                    if ((selectedObj.type === 'changeFigure' || selectedObj.type === 'changeBg')) {
                                        const setTransformIdx = copy.findIndex(
                                            t => t.type === 'setTransform' && t.target === selectedObj.target
                                        );
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
                            copy[index].transform.scale.x = newScale;
                            copy[index].transform.scale.y = newScale;
                            // 如果这是 changeFigure/changeBg，也需要更新对应的 setTransform（如果有）
                            if ((obj.type === 'changeFigure' || obj.type === 'changeBg')) {
                                const setTransformIdx = copy.findIndex(
                                    t => t.type === 'setTransform' && t.target === obj.target
                                );
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
                            copy[selectedIndex].transform.scale.x = newScale;
                            copy[selectedIndex].transform.scale.y = newScale;
                            
                            // 如果选中的是 changeFigure/changeBg，也需要更新对应的 setTransform（如果有）
                            if ((selectedObj.type === 'changeFigure' || selectedObj.type === 'changeBg')) {
                                const setTransformIdx = copy.findIndex(
                                    t => t.type === 'setTransform' && t.target === selectedObj.target
                                );
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
        };

        canvas.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            canvas.removeEventListener("wheel", handleWheel);
        };
    }, [canvasRef.current, transforms, bgImg, modelImg]); // 👈 canvasRef.current 在这里作为依赖

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
        const setTransformMap = new Map<string, TransformData>();
        transforms.forEach((t) => {
            if (t.type === "setTransform" && t.target) {
                setTransformMap.set(t.target, t);
            }
        });

        transforms.forEach((t, index) => {
            // 跳过 rawText 类型，不渲染任何内容
            if (t.type === "rawText") {
                return;
            }
            
            // 跳过 setTransform 类型，它们不应该单独渲染（只用于状态计算和导出）
            if (t.type === "setTransform") {
                return;
            }
            
            const container = new PixiContainer();
            const isBg = t.target === "bg-main";
            
            // 对于立绘和背景，查找对应的 setTransform（如果有的话）
            let transformToUse = t.transform;
            if (t.type === "changeFigure" || t.type === "changeBg") {
                const setTransform = setTransformMap.get(t.target);
                if (setTransform) {
                    // 合并 setTransform 和 changeFigure/changeBg 的 transform
                    // 使用 setTransform 的 position, scale, rotation
                    // 但如果 setTransform 中缺少滤镜参数，从 changeFigure/changeBg 中继承
                    const filterKeys = [
                        "brightness", "contrast", "saturation", "gamma",
                        "colorRed", "colorGreen", "colorBlue",
                        "bloom", "bloomBrightness", "bloomBlur", "bloomThreshold",
                        "bevel", "bevelThickness", "bevelRotation", "bevelSoftness",
                        "bevelRed", "bevelGreen", "bevelBlue"
                    ];
                    
                    // 合并 transform：只使用 setTransform 中的 position、scale、rotation
                    // 滤镜参数始终从 changeFigure/changeBg 中获取，不从 setTransform 中获取
                    transformToUse = {
                        ...t.transform, // 先使用 changeFigure/changeBg 的 transform（包含滤镜参数）
                    };
                    
                    // 只从 setTransform 中提取 position、scale、rotation（如果存在）
                    if (setTransform.transform.position !== undefined) {
                        transformToUse.position = setTransform.transform.position;
                    }
                    if (setTransform.transform.scale !== undefined) {
                        transformToUse.scale = setTransform.transform.scale;
                    }
                    if (setTransform.transform.rotation !== undefined) {
                        transformToUse.rotation = setTransform.transform.rotation;
                    }
                    
                    // 确保滤镜参数不会被 setTransform 覆盖（setTransform 不应该包含滤镜参数）
                    for (const key of filterKeys) {
                        if (setTransform.transform[key] !== undefined) {
                            // 如果 setTransform 中意外包含了滤镜参数，忽略它，使用 changeFigure/changeBg 的值
                            if (t.transform[key] !== undefined) {
                                transformToUse[key] = t.transform[key];
                            }
                        }
                    }
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
                // 背景：铺满画布（cover），保持你原有逻辑
                const imageRatio = bgImg.width / bgImg.height;
                const canvasRatio = canvasWidth / canvasHeight;
                let fitScale = canvasWidth / bgImg.width;
                if (canvasRatio < imageRatio) fitScale = canvasHeight / bgImg.height;

                // drawW/drawH 只使用 fitScale，用户缩放通过 container.scale 应用
                drawW = bgImg.width * fitScale;
                drawH = bgImg.height * fitScale;

                // BG 永远居中
                baseX = canvasWidth / 2;
                baseY = canvasHeight / 2;
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

                // 水平预设位
                const preset = getPreset(t); // 'left' | 'center' | 'right'
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


            const px = (transformToUse.position?.x ?? 0) * scaleX;
            const py = (transformToUse.position?.y ?? 0) * scaleY;

            container.x = baseX + px;
            container.y = baseY + py;
            container.rotation = transformToUse.rotation || 0;
            // ✅ 正确应用 scale 值，x 和 y 轴独立
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
            const isTargetEnabled = enabledTargets.has(t.target) || enabledTargets.size === 0;
            
            if (!isTargetEnabled) {
                // 如果target未启用，禁用交互
                sprite.interactive = false;
            } else {
                sprite.interactive = true;
            }
            
            sprite
                .on("pointerdown", (e: any) => {
                    // 检查target是否启用
                    if (!enabledTargets.has(t.target) && enabledTargets.size > 0) {
                        return; // 未启用的target不允许交互
                    }
                    
                    const original = e.data.originalEvent as PointerEvent; // 🟡 获取原始键盘状态
                    const isAlt = original?.altKey;
                    const isShift = original?.shiftKey;

                    const local = e.data.getLocalPosition(app.stage);
                    offsetRef.current = { x: local.x, y: local.y };
                    draggingRef.current = index;

                    // 保存初始位置（使用 setTransform 的 transform，如果有的话）
                    initialPositionsRef.current = {};
                    selectedIndexes.forEach(idx => {
                        const targetTransform = transforms[idx];
                        // 查找对应的 setTransform
                        const setTransform = transforms.find(
                            (tr) => tr.type === "setTransform" && tr.target === targetTransform.target
                        );
                        const transformToUse = setTransform ? setTransform.transform : targetTransform.transform;
                        initialPositionsRef.current[idx] = {
                            x: transformToUse.position?.x ?? 0,
                            y: transformToUse.position?.y ?? 0,
                        };
                    });

                    const cx = container.x;
                    const cy = container.y;

                    // 获取当前渲染时使用的 transform（用于旋转控制）
                    const setTransformForCurrent = setTransformMap.get(t.target);
                    const currentTransform = setTransformForCurrent ? setTransformForCurrent.transform : transformToUse;

                    if (isAlt) {
                        // 🌀 旋转控制
                        rotatingRef.current = true;
                        rotationStartAngleRef.current = Math.atan2(local.y - cy, local.x - cx);
                        // 使用当前渲染时使用的 transform
                        initialRotationRef.current = currentTransform.rotation || 0;
                    } else {
                        // ✅ 多选或单选（只在未选中时更新选中状态）
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
                        if (rotatingRef.current) {
                            // 🌀 实时旋转
                            const currentTransform = transforms[i];
                            // 查找对应的 setTransform（如果有）
                            const setTransformIdx = transforms.findIndex(
                                (tr) => tr.type === "setTransform" && tr.target === currentTransform.target
                            );
                            
                            if (setTransformIdx !== -1) {
                                // 更新 setTransform 的 rotation
                                setTransforms((prev) => {
                                    const copy = [...prev];
                                    // 使用 setTransform 的 transform 来计算位置（用于旋转中心）
                                    const setTransform = copy[setTransformIdx];
                                    const cx = centerX + (setTransform.transform.position?.x ?? 0) * scaleX;
                                    const cy = centerY + (setTransform.transform.position?.y ?? 0) * scaleY;
                                    const angleNow = Math.atan2(localPos.y - cy, localPos.x - cx);
                                    const delta = angleNow - rotationStartAngleRef.current;
                                    copy[setTransformIdx].transform.rotation = initialRotationRef.current + delta;
                                    return copy;
                                });
                            } else {
                                // 如果没有 setTransform，使用原来的逻辑（不应该发生，但保险起见）
                                const cx = centerX + transforms[i].transform.position.x * scaleX;
                                const cy = centerY + transforms[i].transform.position.y * scaleY;
                                const angleNow = Math.atan2(localPos.y - cy, localPos.x - cx);
                                const delta = angleNow - rotationStartAngleRef.current;

                                setTransforms((prev) => {
                                    const copy = [...prev];
                                    copy[i].transform.rotation = initialRotationRef.current + delta;
                                    return copy;
                                });
                            }
                        } else {
                            const deltaX = localPos.x - offsetRef.current.x;
                            const deltaY = localPos.y - offsetRef.current.y;

                            setTransforms((prev) => {
                                const copy = [...prev];
                                selectedIndexes.forEach((idx) => {
                                    const initialPos = initialPositionsRef.current[idx];
                                    if (initialPos) {
                                        const targetTransform = prev[idx];
                                        // 查找对应的 setTransform（如果有）
                                        const setTransformIdx = copy.findIndex(
                                            (tr) => tr.type === "setTransform" && tr.target === targetTransform.target
                                        );
                                        
                                        if (setTransformIdx !== -1) {
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
                                        } else {
                                            // 如果没有 setTransform，使用原来的逻辑（不应该发生，但保险起见）
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
                        stage.off("pointermove", handleGlobalMove);
                        stage.off("pointerup", handleGlobalUp);
                        stage.off("pointerupoutside", handleGlobalUp);
                    };

                    // 绑定全局事件
                    stage.on("pointermove", handleGlobalMove);
                    stage.on("pointerup", handleGlobalUp);
                    stage.on("pointerupoutside", handleGlobalUp);
                });

            // 📏 蓝色边框（可选显示）
            if (showSelectionBox && selectedIndexes.includes(index)) {
                const g = new PIXI.Graphics();
                g.lineStyle(2, 0x0000ff);
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
        // 这样即使有观察层，原始对象仍然可以接收鼠标事件
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
            case 'grid-3x3':
                drawGuideLines(graphics, 'grid-3x3', canvasWidth, canvasHeight);
                break;
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

    return null;
}

// 辅助线绘制函数
function drawGuideLines(graphics: PIXI.Graphics, type: string, width: number, height: number) {
    switch (type) {
        case 'grid-3x3':
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
