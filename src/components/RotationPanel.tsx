import { TransformData } from "../types/transform";

interface RotationPanelProps {
    transforms: TransformData[];
    selectedIndexes: number[];
    onChange: (index: number, newRotation: number) => void;         // 兼容旧的
    onChangeTarget: (index: number, newTarget: string) => void;      // 新增
    onChangeId: (index: number, newId: string) => void;              // 新增
    onChangeEase: (index: number, newEase: string) => void;         // 新增：ease 设置
    onChangeScale: (index: number, axis: 'x' | 'y', newScale: number) => void; // 新增：scale 设置
}

export default function RotationPanel({
                                          transforms,
                                          selectedIndexes,
                                          onChange,
                                          onChangeTarget,
                                          onChangeEase,
                                          onChangeScale,
                                      }: RotationPanelProps) {
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
        </div>
    );
}
