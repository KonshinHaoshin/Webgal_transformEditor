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
    const [filterPresets, setFilterPresets] = useState<Record<string, any>>({});
    const [enableFilterPreset, setEnableFilterPreset] = useState(true); // 默认启用
    const [lastAppliedPresetKeys, setLastAppliedPresetKeys] = useState<string[]>([]);
    const [applyFilterToBg, setApplyFilterToBg] = useState(false); // 默认不向背景添加

    const canvasWidth = 2560;
    const canvasHeight = 1440;
    const baseWidth = 2560;
    const baseHeight = 1440;
    const scaleX = canvasWidth / baseWidth;
    const scaleY = canvasHeight / baseHeight;

    // 这玩意儿没什么用，但是我懒得删了
    const modelOriginalWidth = 741;
    const modelOriginalHeight = 1123;
    const scaleModel=1;
    const modelWidth=modelOriginalWidth*scaleModel;
    const modelHeight=modelOriginalHeight*scaleModel;

    function nextFigureName(list: TransformData[]) {
        let max = 0;
        for (const t of list) {
            const m = /^figure(\d+)$/.exec(t.target);
            if (m) max = Math.max(max, parseInt(m[1], 10));
        }
        return `figure${max + 1}`;
    }

    useEffect(() => {
        // const isDev = import.meta.env.MODE === 'development';

        const model = new Image();
        model.src = './assets/sakiko_girlfriend.png'; // 恭喜你发现了私货！
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

    useEffect(() => {
        fetch("/filter-presets.json")
            .then(res => res.json())
            .then(data => setFilterPresets(data))
            .catch(err => console.error("❌ Failed to load filter presets:", err));
    }, []);

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
            <p style={{
                backgroundColor: "#eef6ff",
                color: "#333",
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "14px",
                border: "1px solid #cde1f9",
                maxWidth: 780,
                margin: "10px auto"
            }}>
                💡 <strong>操作提示：</strong><br/>
                ・按住 <strong>Ctrl</strong> + 鼠标滚轮：缩放模型或背景<br/>
                ・按住 <strong>Alt</strong> + 拖动：旋转选中的对象<br/>
                ・按住 <strong>Shift</strong> + 点击：多选对象<br/>
                ・关注 <strong>东山燃灯寺</strong> 谢谢喵~

            </p>


            <textarea
                style={{ width: 1080, height: 100 }}
                placeholder="Paste your setTransform script here"
                value={input}

                onChange={(e) => setInput(e.target.value)}
            />
            <br />
            <button onClick={() => {
                const parsed = parseScript(input,scaleX,scaleY).map(t => {
                    const { __presetApplied, ...rest } = t as any;
                    return rest;
                });                if (parsed.length === 0) alert("⚠️ 没有解析到任何 setTransform 指令！");
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

            <button
                onClick={() => {
                    const name = nextFigureName(transforms);
                    const newItem: TransformData = {
                        type: 'setTransform',
                        target: name,
                        duration: 0,
                        transform: {
                            position: { x: 0, y: 0 },
                            scale: { x: 1, y: 1 },
                        },
                    };
                    // 如果你希望默认“居中预设位”，可以顺手加：
                    (newItem as any).presetPosition = 'center';

                    setTransforms(prev => {
                        const next = [...prev, newItem];
                        return next;
                    });

                    // 选中新加的这一行，方便直接拖
                    setSelectedIndexes([transforms.length]);

                    // 考虑要不要写会textarea
                    // const line = `setTransform:{"position":{"x":0,"y":0},"scale":{"x":1,"y":1}} -target=${name} -duration=0 -next;`;
                    // setInput(prev => (prev ? prev + '\n' : '') + line);
                }}
            >
                + Add setTransform
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
            <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <label>
                        <input
                            type="checkbox"
                            checked={enableFilterPreset}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setEnableFilterPreset(checked);

                                if (!checked) {
                                    // 只删除最近应用的 preset 字段
                                    setTransforms(prev =>
                                        prev.map(t => {
                                            const updated = { ...t.transform };
                                            lastAppliedPresetKeys.forEach(key => {
                                                if (key in updated) delete updated[key];
                                            });
                                            return { ...t, transform: updated };
                                        })
                                    );
                                    setLastAppliedPresetKeys([]);
                                }
                            }}
                        />
                        应用滤镜预设
                    </label>

                    <label>
                        <input
                            type="checkbox"
                            checked={applyFilterToBg}
                            onChange={() => setApplyFilterToBg(!applyFilterToBg)}
                        />
                        同时作用于背景
                    </label>
                </div>

                <label style={{ marginTop: 10, display: "block" }}>选择预设：</label>
                <select
                    onChange={(e) => {
                        const preset = filterPresets[e.target.value];
                        if (!preset) return;

                        if (!enableFilterPreset) {
                            alert("请先勾选“应用滤镜预设”再使用");
                            return;
                        }

                        const keys = Object.keys(preset);
                        setLastAppliedPresetKeys(keys);

                        setTransforms(prev =>
                            prev.map(t => {
                                if (t.target === "bg-main" && !applyFilterToBg) return t;
                                
                                // 创建新的transform对象，只保留位置、缩放、旋转等基础属性
                                const newTransform = {
                                    position: t.transform.position || { x: 0, y: 0 },
                                    scale: t.transform.scale || { x: 1, y: 1 },
                                    rotation: t.transform.rotation || 0,
                                };
                                
                                // 完全替换滤镜属性，而不是合并
                                return {
                                    ...t,
                                    transform: {
                                        ...newTransform,
                                        ...preset,
                                    }
                                };
                            })
                        );
                    }}
                    defaultValue=""
                >
                    <option value="" disabled>选择一个预设...</option>
                    {Object.keys(filterPresets).map((key) => (
                        <option key={key} value={key}>{key}</option>
                    ))}
                </select>
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
                    modelOriginalWidth={modelWidth}
                    modelOriginalHeight={modelHeight}
                    bgBaseScaleRef={bgBaseScaleRef}
                />

            </div>
            {selectedIndexes.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <RotationPanel
                        transforms={transforms}
                        selectedIndexes={selectedIndexes}
                        onChange={(index, newRotation) => {
                            setTransforms((prev) => {
                                const copy = [...prev];
                                copy[index] = {
                                    ...copy[index],
                                    transform: { ...copy[index].transform, rotation: newRotation },
                                };
                                return copy;
                            });
                        }}
                        onChangeTarget={(index, newTarget) => {
                            setTransforms((prev) => {
                                const copy = [...prev];
                                copy[index] = { ...copy[index], target: newTarget };
                                return copy;
                            });
                        }}
                        onChangeId={(index) => {
                            setTransforms((prev) => {
                                const copy = [...prev];
                                const t = { ...copy[index] };


                                // t.extraParams = { ...(t.extraParams || {}), id: newId };

                                copy[index] = t;
                                return copy;
                            });
                        }}
                    />
                </div>
            )}


            <h3>Output Script:</h3>
            <pre>{exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight)}</pre>
        </div>
    );

}