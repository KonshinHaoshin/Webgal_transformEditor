import React, { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { TransformData } from "../types/transform";
import { PixiContainer } from "../containers/pixiContainer.ts";

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
}

export default function CanvasRenderer(props: Props) {
    const {
        canvasRef, transforms, modelImg, bgImg,
        selectedIndexes,
        baseWidth, baseHeight, canvasWidth, canvasHeight,
        modelOriginalWidth, modelOriginalHeight,
        // @ts-ignore
        bgBaseScaleRef, setTransforms, setSelectedIndexes
    } = props;

    const appRef = useRef<PIXI.Application | null>(null);
    const spriteMap = useRef<Record<string, PixiContainer>>({});
    const graphicsMapRef = useRef<Record<string, PIXI.Graphics>>({});

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




// ✅ 1️⃣ 初始化 Pixi 应用，只做一次
    useEffect(() => {
        if (!canvasRef.current || appRef.current) return;

        const app = new PIXI.Application({
            view: canvasRef.current,
            width: canvasWidth,
            height: canvasHeight,
            backgroundAlpha: 0,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

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

            for (let index = transforms.length - 1; index >= 0; index--) {
                const obj = transforms[index];
                const { x, y } = obj.transform.position;
                const scale = obj.transform.scale.x;
                const cx = centerX + x * scaleX;
                const cy = centerY + y * scaleY;

                let w = 0, h = 0;
                if (obj.target === "bg-main" && bgImg) {
                    w = bgImg.width * scale * scaleX;
                    h = bgImg.height * scale * scaleY;
                } else {
                    w = modelOriginalWidth * scaleX * scale;
                    h = modelOriginalHeight * scaleY * scale;
                }

                if (mx >= cx - w / 2 && mx <= cx + w / 2 && my >= cy - h / 2 && my <= cy + h / 2) {
                    const delta = e.deltaY < 0 ? 0.05 : -0.05;
                    const newScale = Math.max(0.1, scale + delta);
                    setTransforms(prev => {
                        const copy = [...prev];
                        copy[index].transform.scale.x = newScale;
                        copy[index].transform.scale.y = newScale;
                        return copy;
                    });
                    break;
                }
            }
        };

        canvas.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            canvas.removeEventListener("wheel", handleWheel);
        };
    }, [canvasRef.current, transforms, bgImg, modelImg]); // 👈 canvasRef.current 在这里作为依赖

    useEffect(() => {
        if (!appRef.current || !modelImg) return;

        const app = appRef.current;
        const stage = app.stage;
        stage.removeChildren();

        Object.values(graphicsMapRef.current).forEach(g => g.destroy());
        graphicsMapRef.current = {};
        spriteMap.current = {};

        transforms.forEach((t, index) => {
            const container = new PixiContainer();
            const isBg = t.target === "bg-main";
            const img = isBg ? bgImg : modelImg;
            if (!img) return;

            const sprite = PIXI.Sprite.from(img);

            sprite.interactive = true;
            const maskGraphics = new PIXI.Graphics();
            maskGraphics.beginFill(0xffffff);
            maskGraphics.drawRect(-sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
            maskGraphics.endFill();

            // 设置 hitArea
            sprite.hitArea = new PIXI.Rectangle(
                -sprite.width / 2,
                -sprite.height / 2,
                sprite.width,
                sprite.height
            );
            sprite.cursor = "pointer";

            let drawW = 0, drawH = 0;
            if (isBg && bgImg) {
                const imageRatio = bgImg.width / bgImg.height;
                const canvasRatio = canvasWidth / canvasHeight;
                let fitScale = canvasWidth / bgImg.width;
                if (canvasRatio < imageRatio) fitScale = canvasHeight / bgImg.height;
                const userScale = t.transform.scale.x ?? 1;
                drawW = bgImg.width * fitScale * userScale;
                drawH = bgImg.height * fitScale * userScale;
            } else {
                const scale = t.transform.scale.x ?? 1;
                drawW = modelOriginalWidth * scaleX * scale;
                drawH = modelOriginalHeight * scaleY * scale;
            }

            sprite.width = drawW;
            sprite.height = drawH;
            sprite.anchor.set(0.5);
            container.addChild(sprite);

            container.x = centerX + t.transform.position.x;
            container.y = centerY + t.transform.position.y;
            container.rotation = t.transform.rotation || 0;
            container.scale.set(1, 1);

            // 💡 设置滤镜字段（由 PixiContainer 实现）
            for (const key in t.transform) {
                if (["position", "scale", "rotation"].includes(key)) continue;
                if ((container as any)[key] !== undefined) {
                    (container as any)[key] = t.transform[key];
                }
            }

            // 🔁 角色名
            const nameText = new PIXI.Text(t.target, {
                fontSize: 64,
                fill: 0x000000,
                fontFamily: "Arial",
            });
            nameText.anchor.set(0.5);
            nameText.position.set(container.x, container.y - drawH / 2 - 10);
            stage.addChild(nameText);

            // 🧠 注册交互
            sprite
                .on("pointerdown", (e) => {
                    const original = e.data.originalEvent as PointerEvent; // 🟡 获取原始键盘状态
                    const isAlt = original?.altKey;
                    const isShift = original?.shiftKey;

                    const local = e.data.getLocalPosition(app.stage);
                    offsetRef.current = { x: local.x, y: local.y };
                    draggingRef.current = index;

                    // 保存初始位置
                    initialPositionsRef.current = {};
                    selectedIndexes.forEach(idx => {
                        initialPositionsRef.current[idx] = {
                            x: transforms[idx].transform.position.x,
                            y: transforms[idx].transform.position.y,
                        };
                    });

                    const cx = container.x;
                    const cy = container.y;

                    if (isAlt) {
                        // 🌀 旋转控制
                        rotatingRef.current = true;
                        rotationStartAngleRef.current = Math.atan2(local.y - cy, local.x - cx);
                        initialRotationRef.current = t.transform.rotation || 0;
                    } else {
                        // ✅ 多选或单选
                        if (isShift) {
                            setSelectedIndexes((prev) =>
                                prev.includes(index) ? prev : [...prev, index]
                            );
                        } else {
                            setSelectedIndexes([index]);
                        }
                    }
                })
                .on("pointerup", () => {
                    draggingRef.current = null;
                    rotatingRef.current = false;
                })
                .on("pointerupoutside", () => {
                    draggingRef.current = null;
                    rotatingRef.current = false;
                })
                .on("pointermove", (e) => {
                    const i = draggingRef.current;
                    if (i === null) return;

                    const local = e.data.getLocalPosition(app.stage);
                    if (rotatingRef.current) {
                        // 🌀 实时旋转
                        const cx = centerX + transforms[i].transform.position.x * scaleX;
                        const cy = centerY + transforms[i].transform.position.y * scaleY;
                        const angleNow = Math.atan2(local.y - cy, local.x - cx);
                        const delta = angleNow - rotationStartAngleRef.current;

                        setTransforms((prev) => {
                            const copy = [...prev];
                            copy[i].transform.rotation = initialRotationRef.current + delta;
                            return copy;
                        });
                    }   else {
                        const deltaX = local.x - offsetRef.current.x; // 正确计算增量
                        const deltaY = local.y - offsetRef.current.y;

                        setTransforms((prev) => {
                            const copy = [...prev];
                            selectedIndexes.forEach((idx) => {
                                const initialPos = initialPositionsRef.current[idx];
                                if (initialPos) {
                                    copy[idx].transform.position.x = initialPos.x + deltaX / scaleX;
                                    copy[idx].transform.position.y = initialPos.y + deltaY / scaleY;
                                }
                            });
                            return copy;
                        });
                    }
                });



            // 📏 蓝色边框
            if (selectedIndexes.includes(index)) {
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
            if (isBg) {
                stage.addChildAt(container, 0); // 背景始终最底层
            } else {
                stage.addChild(container);
            }        });
    }, [transforms, modelImg, bgImg, selectedIndexes]);

    return null;
}
