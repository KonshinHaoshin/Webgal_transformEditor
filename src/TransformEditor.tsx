import { useEffect, useRef, useState } from "react";
import './transform-editor.css';
import {TransformData} from "./types/transform.ts";
import {exportScript,parseScript} from "./utils/transformParser.ts";
import CanvasRenderer from "./components/CanvasRenderer.tsx";
import RotationPanel from "./components/RotationPanel";

export default function TransformEditor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [input, setInput] = useState("");
    const [transforms, setTransforms] = useState<TransformData[]>([]);
    const [dragging] = useState<number | null>(null);
    const [modelImg, setModelImg] = useState<HTMLImageElement | null>(null);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [, setAllSelected] = useState(false);
    const [lockX, setLockX] = useState(false); // 锁定X轴
    const [lockY, setLockY] = useState(false); // 锁定Y轴
    const [exportDuration, setExportDuration] = useState(500); // 更改duration值
    const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null); // 背景图片
    const bgBaseScaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

    const canvasWidth = 2560;
    const canvasHeight = 1440;
    const baseWidth = 2560;
    const baseHeight = 1440;
    const scaleX = canvasWidth / baseWidth;
    const scaleY = canvasHeight / baseHeight;


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



    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (canvasWidth / rect.width);
            const my = (e.clientY - rect.top) * (canvasHeight / rect.height);

            const logicX = (mx - canvasWidth / 2) / scaleX;
            const logicY = (my - canvasHeight / 2) / scaleY;

            setMousePos({ x: logicX, y: logicY });
        };

        const handleLeave = () => setMousePos(null);

        canvas.addEventListener("mousemove", handleMove);
        canvas.addEventListener("mouseleave", handleLeave);

        return () => {
            canvas.removeEventListener("mousemove", handleMove);
            canvas.removeEventListener("mouseleave", handleLeave);
        };
    }, [canvasRef.current, canvasWidth, canvasHeight]);



    useEffect(() => {
    }, [transforms, dragging, modelImg]);



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
                    style={{
                        width: "100%",
                        height: "auto",
                        maxHeight: 450,
                        maxWidth: 800,
                        border: "1px solid red",
                        backgroundColor: "#f8f8f8"
                    }}
                />
                {mousePos && (
                    <div
                        style={{
                            position: "fixed", // 使用 fixed 确保浮在最上层
                            top: 10,
                            right: 10,
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            color: "#fff",
                            padding: "6px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            zIndex: 1000,
                            pointerEvents: "none",
                        }}
                    >
                        Mouse: (x: {mousePos.x.toFixed(1)}, y: {mousePos.y.toFixed(1)})
                    </div>
                )}
                <CanvasRenderer
                    canvasRef={canvasRef}
                    transforms={transforms}
                    setTransforms={setTransforms}
                    selectedIndexes={selectedIndexes}
                    setSelectedIndexes={setSelectedIndexes}
                    modelImg={modelImg}
                    bgImg={bgImg}
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