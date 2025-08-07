import React, { useEffect, useRef, useState } from "react";
import './transform-editor.css';
import {TransformData} from "./types/transform.ts";
import {exportScript,parseScript} from "./utils/transformParser.ts";
import CanvasRenderer from "./components/CanvasRenderer.tsx";
import RotationPanel from "./components/RotationPanel";

export default function TransformEditor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [input, setInput] = useState("");
    const [transforms, setTransforms] = useState<TransformData[]>([]);
    const [dragging, setDragging] = useState<number | null>(null);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [modelImg, setModelImg] = useState<HTMLImageElement | null>(null);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [, setAllSelected] = useState(false);
    const [lockX, setLockX] = useState(false); // 锁定X轴
    const [lockY, setLockY] = useState(false); // 锁定Y轴
    const [exportDuration, setExportDuration] = useState(500); // 更改duration值
    const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null); // 背景图片
    const bgBaseScaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
    // 添加鼠标旋转
    const [rotating, setRotating] = useState(false);
    const [initialRotation, setInitialRotation] = useState(0);
    const [rotationStartAngle, setRotationStartAngle] = useState(0);

    const canvasWidth = 1600;
    const canvasHeight = 900;
    const baseWidth = 2560;
    const baseHeight = 1440;

    const scaleX = canvasWidth / baseWidth;
    const scaleY = canvasHeight / baseHeight;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    const modelOriginalWidth = 741;
    const modelOriginalHeight = 1123;

    useEffect(() => {
        // const isDev = import.meta.env.MODE === 'development';

        const model = new Image();
        model.src = './assets/model.png';
        model.onload = () => setModelImg(model);

        const bg = new Image();
        bg.src = './assets/bg.png';
        bg.onload = () => setBgImg(bg);
    }, []);


    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const { x: mx, y: my } = getCanvasMousePosition(e);

        for (let index = transforms.length - 1; index >= 0; index--) {
            const obj = transforms[index];
            const { x, y } = obj.transform.position;
            const scale = obj.transform.scale.x;
            const cx = centerX + x;
            const cy = centerY + y;

            let w, h;
            if (obj.target === "bg-main" && bgImg) {
                w = bgImg.width * scaleX * scale;
                h = bgImg.height * scaleY * scale;
            } else if (modelImg) {
                w = modelOriginalWidth * scaleX * scale;
                h = modelOriginalHeight * scaleY * scale;
            } else continue;

            if (mx >= cx - w / 2 && mx <= cx + w / 2 && my >= cy - h / 2 && my <= cy + h / 2) {
                setOffset({ x: mx, y: my });

                if (e.altKey) {
                    setRotating(true);
                    setDragging(index); // 记录正在旋转哪个 figure

                    // 记录初始角度
                    const dx = mx - cx;
                    const dy = my - cy;
                    const startAngle = Math.atan2(dy, dx);
                    setRotationStartAngle(startAngle);
                    setInitialRotation(transforms[index].transform.rotation || 0);
                } else {
                    setDragging(index);
                    if (e.shiftKey) {
                        setSelectedIndexes(prev => prev.includes(index) ? prev : [...prev, index]);
                    } else {
                        setSelectedIndexes([index]);
                    }
                }
                break;
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (dragging === null) return;
        const { x: mx, y: my } = getCanvasMousePosition(e);

        if (rotating) {
            const obj = transforms[dragging];
            const { x, y } = obj.transform.position;
            const cx = centerX + x;
            const cy = centerY + y;

            const dx = mx - cx;
            const dy = my - cy;
            const currentAngle = Math.atan2(dy, dx);

            const deltaAngle = currentAngle - rotationStartAngle;

            setTransforms((prev) => {
                const copy = [...prev];
                copy[dragging].transform.rotation = initialRotation + deltaAngle;
                return [...copy];
            });

            return;
        }


        // 加入判断
        const dx = lockX ? 0 : mx - offset.x;
        const dy = lockY ? 0 : my - offset.y;

        setTransforms((prev) => {
            const copy = [...prev];
            selectedIndexes.forEach((i) => {
                copy[i].transform.position.x += dx;
                copy[i].transform.position.y += dy;
            });
            return copy;
        });

        setOffset({ x: mx, y: my });
    };

    const handleMouseUp = () => {
        setDragging(null);
        setRotating(false);
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        // ✅ 如果没有按住 Ctrl 或 Alt，则允许滚动页面
        if (!e.ctrlKey && !e.altKey) return;

        e.preventDefault(); // ✅ 阻止默认滚动

        const { x: mx, y: my } = getCanvasMousePosition(e);

        for (let index = transforms.length - 1; index >= 0; index--) {
            const obj = transforms[index];
            const { x, y } = obj.transform.position;
            const scale = obj.transform.scale.x;
            const cx = centerX + x;
            const cy = centerY + y;

            let w = 0, h = 0;
            if (obj.target === "bg-main" && bgImg) {
                w = bgImg.width * obj.transform.scale.x * scaleX;
                h = bgImg.height * obj.transform.scale.y * scaleY;
            } else if (modelImg) {
                w = modelOriginalWidth * scaleX * scale;
                h = modelOriginalHeight * scaleY * scale;
            } else continue;

            if (mx >= cx - w / 2 && mx <= cx + w / 2 && my >= cy - h / 2 && my <= cy + h / 2) {
                const delta = e.deltaY < 0 ? 0.05 : -0.05;
                const newScale = Math.max(0.1, obj.transform.scale.x + delta);

                setTransforms((prev) => {
                    const copy = [...prev];
                    const targets = selectedIndexes.length > 0 ? selectedIndexes : [index];
                    targets.forEach((i) => {
                        copy[i].transform.scale.x = newScale;
                        copy[i].transform.scale.y = newScale;
                    });
                    return copy;
                });
                break;
            }
        }
    };



    useEffect(() => {
    }, [transforms, dragging, modelImg]);

    const getCanvasMousePosition = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    return (
        <div
            className="transform-editor-container"
            style={{
                maxHeight: "100vh",       // 限制为视口高度
                overflowY: "auto",        // 开启垂直滚动
                padding: "20px",          // 可选：边距
                boxSizing: "border-box"
            }}
        >
            <h2>EASTMOUNT WEBGAL TRANSFORM EDITOR</h2>

            <textarea
                style={{ width: 1080, height: 100 }}
                placeholder="Paste your setTransform script here"
                value={input}

                onChange={(e) => setInput(e.target.value)}
            />
            <br />
            <button onClick={() => {
                const parsed = parseScript(input, scaleX, scaleY);
                if (parsed.length === 0) alert("⚠️ 没有解析到任何 setTransform 指令！");
                setTransforms(parsed);
                setAllSelected(false);
                setSelectedIndexes([]);
            }}>
                Load Script
            </button>
            <button onClick={() => {
                const script = exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight);
                navigator.clipboard.writeText(script);
                alert("Script copied!");
            }}>
                Copy Output Script
            </button>
            <button onClick={() => {
                setSelectedIndexes(transforms.map((_, i) => i));
                setAllSelected(true);
            }}>
                Select All
            </button>
            <button onClick={() => {
                setSelectedIndexes([]);
                setAllSelected(false);
            }}>
                Deselect All
            </button>
            <div style={{ margin: "10px 0" }}>
                <label>
                    <input type="checkbox" checked={lockX} onChange={() => setLockX(!lockX)} />
                    Lock X
                </label>
                <label style={{ marginLeft: 10 }}>
                    <input type="checkbox" checked={lockY} onChange={() => setLockY(!lockY)} />
                    Lock Y
                </label>
                <label style={{ marginLeft: 20 }}>
                    Export Duration:
                    <input
                        type="number"
                        value={exportDuration}
                        onChange={(e) => setExportDuration(Number(e.target.value))}
                        style={{ width: 80, marginLeft: 5 }}
                    />
                </label>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <canvas
                    ref={canvasRef}
                    width={canvasWidth}
                    height={canvasHeight}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    style={{
                        width: "100%",
                        height: "auto",
                        maxHeight: 500,
                        border: "1px solid #ccc"

                    }}
                />
                <CanvasRenderer
                    canvasRef={canvasRef}
                    transforms={transforms}
                    modelImg={modelImg}
                    bgImg={bgImg}
                    selectedIndexes={selectedIndexes}
                    dragging={dragging}
                    baseWidth={baseWidth}
                    baseHeight={baseHeight}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    modelOriginalWidth={modelOriginalWidth}
                    modelOriginalHeight={modelOriginalHeight}
                    bgBaseScaleRef={bgBaseScaleRef}
                />

            </div>
            {selectedIndexes.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    {selectedIndexes.length > 0 && (
                        <RotationPanel
                            transforms={transforms}
                            selectedIndexes={selectedIndexes}
                            onChange={(index, newRotation) => {
                                setTransforms((prev) => {
                                    const copy = [...prev];
                                    copy[index].transform.rotation = newRotation;
                                    return copy;
                                });
                            }}
                        />
                    )}
                </div>
            )}

            <h3>Output Script:</h3>
            <pre>{exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight)}</pre>
        </div>
    );

}