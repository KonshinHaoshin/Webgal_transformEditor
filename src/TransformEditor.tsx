import React, { useEffect, useRef, useState } from "react";
import './transform-editor.css';

interface TransformData {
    type: 'setTransform' | 'changeFigure';
    target: string;
    duration: number;
    transform: {
        position: { x: number; y: number };
        scale: { x: number; y: number };
        [key: string]: any;
    };
    path?: string; // 对于 changeFigure，保存路径
    extraParams?: Record<string, string>; // 保存 motion / expression 等
}


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
        const isDev = import.meta.env.MODE === 'development';

        const model = new Image();
        model.src = isDev
            ? '/assets/model.png'
            : window.api.getAssetPath('model.png');
        model.onload = () => setModelImg(model);

        const bg = new Image();
        bg.src = isDev
            ? '/assets/bg.png'
            : window.api.getAssetPath('bg.png');
        bg.onload = () => setBgImg(bg);
    }, []);


    const parseScript = (script: string): TransformData[] => {
        const lines = script.split(";").map(line => line.trim()).filter(Boolean);

        return lines.map((line) => {
            const [command, ...rest] = line.split(" -");

            if (command.startsWith("setTransform:")) {
                const jsonStr = command.replace("setTransform:", "").trim();
                const params = Object.fromEntries(rest.map(s => s.split("=").map(v => v.trim())));

                const json = JSON.parse(jsonStr);
                const transform: any = {
                    ...json,
                    position: {
                        x: (json.position?.x ?? 0) * scaleX,
                        y: (json.position?.y ?? 0) * scaleY
                    },
                    scale: json.scale || { x: 1, y: 1 },
                };

                return {
                    type: "setTransform",
                    target: params.target,
                    duration: parseInt(params.duration || "500"),
                    transform
                };
            }

            if (command.startsWith("changeFigure:")) {
                const path = command.replace("changeFigure:", "").trim();

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
                        // 像 -next 这种无值参数
                        params[k] = "";
                    }
                }

                return {
                    type: "changeFigure",
                    path,
                    target: params.id || "unknown",
                    duration: 0,
                    transform,
                    extraParams: Object.fromEntries(
                        Object.entries(params).filter(([k]) => k !== "id" && k !== "transform")
                    )
                };
            }

            alert("⚠️ 不支持的指令格式：" + line);
            return {
                type: "setTransform",
                target: "invalid",
                duration: 0,
                transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } }
            };
        });
    };

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || !modelImg) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        ctx.strokeStyle = "#ccc";
        ctx.beginPath();
        ctx.moveTo(centerX - 5, centerY);
        ctx.lineTo(centerX + 5, centerY);
        ctx.moveTo(centerX, centerY - 5);
        ctx.lineTo(centerX, centerY + 5);
        ctx.stroke();

        if (transforms.length === 0) {
            ctx.fillStyle = "#aaa";
            ctx.fillText("No data loaded", centerX, centerY);
            return;
        }

        transforms.forEach((obj, index) => {
            const { x, y } = obj.transform.position;
            const scale = obj.transform.scale?.x || 1;
            const cx = centerX + x;
            const cy = centerY + y;

            const isBackground = obj.target === "bg-main";
            const imageToDraw = isBackground ? bgImg : modelImg;

            if (!imageToDraw) return;

            if (isBackground) {
                const w = imageToDraw.width * scale * scaleX;
                const h = imageToDraw.height * scale * scaleY;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(obj.transform.rotation || 0); // 弧度制旋转
                ctx.drawImage(imageToDraw, -w / 2, -h / 2, w, h);
                ctx.restore();

                if (selectedIndexes.includes(index)) {
                    ctx.strokeStyle = "#00f";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
                    ctx.lineWidth = 1;
                }

                ctx.fillStyle = "#000";
                ctx.fillText(obj.target, cx, cy - h / 2 - 10);
            }

            let w, h;
            if (obj.target === "bg-main" && bgImg) {
                const base = bgBaseScaleRef.current;
                w = bgImg.width * scaleX * obj.transform.scale.x * base.x;
                h = bgImg.height * scaleY * obj.transform.scale.y * base.y;
            } else {
                w = modelOriginalWidth * scaleX * scale;
                h = modelOriginalHeight * scaleY * scale;
            }


            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(obj.transform.rotation || 0);
            ctx.drawImage(imageToDraw, -w / 2, -h / 2, w, h);
            ctx.restore();

            if (selectedIndexes.includes(index)) {
                ctx.strokeStyle = "#00f";
                ctx.lineWidth = 2;
                ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
                ctx.lineWidth = 1;
            }

            ctx.fillStyle = "#000";
            ctx.fillText(obj.target, cx, cy - h / 2 - 10);
        });
    };


    const exportScript = (): string => {
        const scaleRatioX = baseWidth / canvasWidth;
        const scaleRatioY = baseHeight / canvasHeight;

        return transforms.map(obj => {
            const transform = {
                ...obj.transform,
                position: {
                    x: obj.transform.position.x * scaleRatioX,
                    y: obj.transform.position.y * scaleRatioY,
                }
            };
            const roundedTransform = roundTransform(transform);
            const transformJson = JSON.stringify(roundedTransform);

            if (obj.type === "setTransform") {
                return `setTransform:${transformJson} -target=${obj.target} -duration=${exportDuration} -next;`;
            }

            if (obj.type === "changeFigure") {
                const extras = Object.entries(obj.extraParams || {})
                    .map(([k, v]) => `-${k}=${v}`).join(" ");
                return `changeFigure:${obj.path} -id=${obj.target} -transform=${transformJson} ${extras};`;
            }

            return "";
        }).join("\n");
    };

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
        drawCanvas();
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
    // 通用保留两位小数函数
    const roundToTwo = (num: number): number => {
        return Math.round(num * 100) / 100;
    };

    const roundTransform = (obj: any): any => {
        if (typeof obj === 'number') {
            return roundToTwo(obj);
        } else if (typeof obj === 'object' && obj !== null) {
            const result: any = Array.isArray(obj) ? [] : {};
            for (const key in obj) {
                result[key] = roundTransform(obj[key]);
            }
            return result;
        } else {
            return obj;
        }
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
                const parsed = parseScript(input);
                if (parsed.length === 0) alert("⚠️ 没有解析到任何 setTransform 指令！");
                setTransforms(parsed);
                setAllSelected(false);
                setSelectedIndexes([]);
            }}>
                Load Script
            </button>
            <button onClick={() => {
                navigator.clipboard.writeText(exportScript());
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
            </div>
            {selectedIndexes.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <h3>Rotation（单位：弧度）</h3>
                    {selectedIndexes.map((index) => (
                        <div key={index} style={{ marginBottom: 6 }}>
                            <span>{transforms[index].target}</span>
                            <input
                                type="number"
                                step="0.01"
                                value={transforms[index].transform.rotation || 0}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setTransforms((prev) => {
                                        const copy = [...prev];
                                        copy[index].transform.rotation = val;
                                        return [...copy]; // ✅ 触发变更
                                    });
                                }}
                                style={{ marginLeft: 10, width: 100 }}
                            />
                        </div>
                    ))}
                </div>
            )}

            <h3>Output Script:</h3>
            <pre>{exportScript()}</pre>
        </div>
    );

}