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
    dragging: number | null;
    baseWidth: number;
    baseHeight: number;
    canvasWidth: number;
    canvasHeight: number;
    modelOriginalWidth: number;
    modelOriginalHeight: number;
    bgBaseScaleRef: React.MutableRefObject<{ x: number; y: number }>;
    appRef: React.MutableRefObject<PIXI.Application | null>;
}

export default function CanvasRenderer(props: Props) {
    const {
        canvasRef, transforms, modelImg, bgImg,
        selectedIndexes,
        canvasWidth, canvasHeight,
        modelOriginalWidth, modelOriginalHeight,
        // @ts-ignore
        bgBaseScaleRef
    } = props;

    const appRef = useRef<PIXI.Application | null>(null);
    const spriteMap = useRef<Record<string, PixiContainer>>({}); // target -> PixiContainer

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    const graphicsMapRef = useRef<Record<string, PIXI.Graphics>>({});

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
    }, []);

    useEffect(() => {
        if (!appRef.current || !modelImg) return;

        const app = appRef.current;
        const stage = app.stage;
        stage.removeChildren();

        Object.values(graphicsMapRef.current).forEach(g => g.destroy());
        graphicsMapRef.current = {};

        spriteMap.current = {};

        // @ts-ignore
        transforms.forEach((t, index) => {
            const container = new PixiContainer();

            const isBg = t.target === "bg-main";
            const img = isBg ? bgImg : modelImg;
            if (!img) return;

            const sprite = PIXI.Sprite.from(img);

            // @ts-ignore
            const scale = t.transform.scale?.x ?? 1;

            let drawW = 0, drawH = 0;
            if (isBg && bgImg) {
                const imageRatio = bgImg.width / bgImg.height;
                const canvasRatio = canvasWidth / canvasHeight;
                let fitScale = canvasWidth / bgImg.width;
                if (canvasRatio < imageRatio) {
                    fitScale = canvasHeight / bgImg.height;
                }
                const userScale = t.transform.scale.x ?? 1;

                drawW = bgImg.width * fitScale * userScale;
                drawH = bgImg.height * fitScale * userScale;
            } else {
                const scale = t.transform.scale.x ?? 1;
                drawW = modelOriginalWidth  * scale;
                drawH = modelOriginalHeight  * scale;
            }



            sprite.width = drawW;
            sprite.height = drawH;
            sprite.anchor.set(0.5);

            container.x = centerX + t.transform.position.x ;
            container.y = centerY + t.transform.position.y ;

            console.log(`🖼️ Render ${t.target} at (${container.x.toFixed(1)}, ${container.y.toFixed(1)}) with size: ${drawW.toFixed(1)} x ${drawH.toFixed(1)}, rotation: ${(t.transform.rotation ?? 0).toFixed(3)} rad`);

            // 👇 添加角色名文本
            const nameText = new PIXI.Text(t.target, {
                fontSize: 16,
                fill: 0x000000,
                align: 'center',
                fontFamily: 'Arial',
            });

            nameText.anchor.set(0.5);
            nameText.position.set(
                container.x,
                container.y - drawH / 2 - 10
            );

            // ✅ 添加到 stage 而非 container
            stage.addChild(nameText);

            container.rotation = t.transform.rotation || 0;
            container.scale.set(1, 1); // 不再缩放容器，直接改 sprite 大小
            container.addChild(sprite);

            // ✅ 应用滤镜参数
            for (const key in t.transform) {
                if (["position", "scale", "rotation"].includes(key)) continue;
                if ((container as any)[key] !== undefined) {
                    (container as any)[key] = t.transform[key];
                }
            }

            stage.addChild(container);

            if (selectedIndexes.includes(index)) {
                const g = new PIXI.Graphics();
                g.lineStyle(2, 0x0000ff); // 蓝色边框
                g.drawRect(-drawW / 2, -drawH / 2, drawW, drawH);
                g.endFill();
                g.position.set(container.x, container.y);
                g.rotation = container.rotation;
                g.pivot.set(0, 0);

                // 使蓝框在 container 上层
                stage.addChild(g);
                graphicsMapRef.current[t.target] = g;
            }

            spriteMap.current[t.target] = container;
        });
    }, [transforms, modelImg, bgImg]);

    return null;
}
