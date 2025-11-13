import { TransformData } from "../types/transform";
import { useState, useEffect } from "react";
import { extractMotionsAndExpressions } from "../utils/jsonlParser";

interface RotationPanelProps {
    transforms: TransformData[];
    selectedIndexes: number[];
    onChange: (index: number, newRotation: number) => void;         // 兼容旧的
    onChangeTarget: (index: number, newTarget: string) => void;      // 新增
    onChangeId: (index: number, newId: string) => void;              // 新增
    onChangeEase: (index: number, newEase: string) => void;         // 新增：ease 设置
    onChangeScale: (index: number, axis: 'x' | 'y', newScale: number) => void; // 新增：scale 设置
    onChangeMotion?: (index: number, newMotion: string) => void;   // 新增：motion 设置
    onChangeExpression?: (index: number, newExpression: string) => void; // 新增：expression 设置
}

export default function RotationPanel({
                                          transforms,
                                          selectedIndexes,
                                          onChange,
                                          onChangeTarget,
                                          onChangeEase,
                                          onChangeScale,
                                          onChangeMotion,
                                          onChangeExpression,
                                      }: RotationPanelProps) {
    // 存储每个 changeFigure 的 motions 和 expressions 列表
    const [motionsMap, setMotionsMap] = useState<Map<string, string[]>>(new Map());
    const [expressionsMap, setExpressionsMap] = useState<Map<string, string[]>>(new Map());

    // 当选中项变化时，加载对应的 motions 和 expressions
    useEffect(() => {
        const loadMotionsAndExpressions = async () => {
            const newMotionsMap = new Map(motionsMap);
            const newExpressionsMap = new Map(expressionsMap);

            for (const index of selectedIndexes) {
                const t = transforms[index];
                if (t.type === 'changeFigure' && t.path) {
                    // 检查是否是 JSONL 文件
                    const isJsonl = t.path.toLowerCase().endsWith('.jsonl');
                    if (isJsonl && !newMotionsMap.has(t.path)) {
                        try {
                            const { motions, expressions } = await extractMotionsAndExpressions(t.path);
                            newMotionsMap.set(t.path, motions);
                            newExpressionsMap.set(t.path, expressions);
                        } catch (error) {
                            console.warn(`加载 motions/expressions 失败 (${t.path}):`, error);
                            newMotionsMap.set(t.path, []);
                            newExpressionsMap.set(t.path, []);
                        }
                    }
                }
            }

            setMotionsMap(newMotionsMap);
            setExpressionsMap(newExpressionsMap);
        };

        loadMotionsAndExpressions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIndexes, transforms]);

    const getMotions = (path: string | undefined): string[] => {
        if (!path) return [];
        return motionsMap.get(path) || [];
    };

    const getExpressions = (path: string | undefined): string[] => {
        if (!path) return [];
        return expressionsMap.get(path) || [];
    };
    return (
        <div style={{ marginTop: 20 }}>
            <h3>Rotation（单位：弧度）</h3>

            {selectedIndexes.map((index) => {
                const t = transforms[index];
                // 安全检查：如果索引无效或 transform 不存在，跳过渲染
                if (!t || !t.transform) {
                    return null;
                }
                const rotation = t.transform.rotation || 0;

                return (
                    <div key={index} style={{ marginBottom: 10, padding: "8px 10px", border: "1px solid #eee", borderRadius: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            {/* target 可编辑 */}
                            <label>
                                target:
                                <input
                                    type="text"
                                    value={t.target}
                                    onChange={(e) => onChangeTarget(index, e.target.value)}
                                    style={{ width: 180, marginLeft: 6 }}
                                />
                            </label>

                            {/* rotation 原有输入 */}
                            <label>
                                rotation:
                                <input
                                    type="number"
                                    step="0.01"
                                    value={rotation}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) onChange(index, val);
                                    }}
                                    style={{ width: 110, marginLeft: 6 }}
                                />
                            </label>

                            {/* ease 选择器 */}
                            <label>
                                ease:
                                <select
                                    value={t.ease || "default"}
                                    onChange={(e) => onChangeEase(index, e.target.value === "default" ? "" : e.target.value)}
                                    style={{ marginLeft: 6 }}
                                >
                                    <option value="default">使用全局设置</option>
                                    <option value="easeInOut">默认</option>
                                    <option value="easeIn">缓入</option>
                                    <option value="easeOut">缓出</option>
                                    <option value="circInOut">圆形缓入缓出</option>
                                    <option value="circIn">圆形缓入</option>
                                    <option value="circOut">圆形缓出</option>
                                    <option value="backInOut">起止回弹</option>
                                    <option value="backIn">起点回弹</option>
                                    <option value="backOut">终点回弹</option>
                                    <option value="bounceInOut">起止弹跳</option>
                                    <option value="bounceIn">起点弹跳</option>
                                    <option value="bounceOut">终点弹跳</option>
                                    <option value="linear">线性</option>
                                    <option value="anticipate">预先反向</option>
                                </select>
                            </label>


                        </div>
                    </div>
                );
            })}

            {/* 新增 Scale 栏 */}
            <h3 style={{ marginTop: 30 }}>Scale（缩放比例）</h3>
            
            {selectedIndexes.map((index) => {
                const t = transforms[index];
                // 安全检查：如果索引无效或 transform 不存在，跳过渲染
                if (!t || !t.transform) {
                    return null;
                }
                const scaleX = t.transform.scale?.x || 1;
                const scaleY = t.transform.scale?.y || 1;

                return (
                    <div key={`scale-${index}`} style={{ marginBottom: 10, padding: "8px 10px", border: "1px solid #eee", borderRadius: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            {/* target 显示（只读） */}
                            <label>
                                target:
                                <span style={{ marginLeft: 6, fontWeight: "bold", color: "#333" }}>
                                    {t.target}
                                </span>
                            </label>

                            {/* x scale 输入 */}
                            <label>
                            x scale:
                            <input
                                type="number"
                                step="any"               
                                value={scaleX}
                                onChange={(e) => {
                                const val = Number(e.target.value);
                                if (!Number.isNaN(val)) onChangeScale(index, 'x', val); // 只避免 NaN
                                }}
                                style={{ width: 110, marginLeft: 6 }}
                            />
                            </label>

                            <label>
                            y scale:
                            <input
                                type="number"
                                step="any"
                                value={scaleY}
                                onChange={(e) => {
                                const val = Number(e.target.value);
                                if (!Number.isNaN(val)) onChangeScale(index, 'y', val);
                                }}
                                style={{ width: 110, marginLeft: 6 }}
                            />
                            </label>

                            {/* 重置按钮 */}
                            <button
                                onClick={() => {
                                    onChangeScale(index, 'x', 1);
                                    onChangeScale(index, 'y', 1);
                                }}
                                style={{
                                    padding: "4px 8px",
                                    backgroundColor: "#3b82f6",
                                    color: "white",
                                    border: "1px solid #2563eb",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: "500"
                                }}
                            >
                                重置为 1:1
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* Live2D Motion 和 Expression 选择器（仅对 changeFigure 类型显示） */}
            {selectedIndexes.some(idx => transforms[idx]?.type === 'changeFigure') && (
                <>
                    <h3 style={{ marginTop: 30 }}>Live2D 动作和表情</h3>
                    
                    {selectedIndexes.map((index) => {
                        const t = transforms[index];
                        if (t.type !== 'changeFigure') return null;

                        const isJsonl = t.path?.toLowerCase().endsWith('.jsonl');
                        const motions = isJsonl ? getMotions(t.path) : [];
                        const expressions = isJsonl ? getExpressions(t.path) : [];
                        const currentMotion = t.motion || '';
                        const currentExpression = t.expression || '';

                        return (
                            <div key={`live2d-${index}`} style={{ marginBottom: 10, padding: "8px 10px", border: "1px solid #eee", borderRadius: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    {/* target 显示（只读） */}
                                    <label>
                                        target:
                                        <span style={{ marginLeft: 6, fontWeight: "bold", color: "#333" }}>
                                            {t.target}
                                        </span>
                                    </label>

                                    {/* Motion 选择器 */}
                                    {isJsonl && onChangeMotion && (
                                        <label>
                                            Motion:
                                            <select
                                                value={currentMotion}
                                                onChange={(e) => onChangeMotion(index, e.target.value)}
                                                style={{ marginLeft: 6, minWidth: 150 }}
                                            >
                                                <option value="">无动作</option>
                                                {motions.map((motion) => (
                                                    <option key={motion} value={motion}>
                                                        {motion}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}

                                    {/* Expression 选择器 */}
                                    {isJsonl && onChangeExpression && (
                                        <label>
                                            Expression:
                                            <select
                                                value={currentExpression}
                                                onChange={(e) => onChangeExpression(index, e.target.value)}
                                                style={{ marginLeft: 6, minWidth: 150 }}
                                            >
                                                <option value="">无表情</option>
                                                {expressions.map((expression) => (
                                                    <option key={expression} value={expression}>
                                                        {expression}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}

                                    {!isJsonl && (
                                        <span style={{ color: "#999", fontSize: "12px" }}>
                                            （仅 JSONL 文件支持动作和表情选择）
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
