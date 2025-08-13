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
                                    <option value="easeInOut">easeInOut</option>
                                    <option value="easeIn">easeIn</option>
                                    <option value="easeOut">easeOut</option>
                                    <option value="circInOut">circInOut</option>
                                    <option value="circIn">circIn</option>
                                    <option value="circOut">circOut</option>
                                    <option value="backInOut">backInOut</option>
                                    <option value="backIn">backIn</option>
                                    <option value="backOut">backOut</option>
                                    <option value="bounceInOut">bounceInOut</option>
                                    <option value="bounceIn">bounceIn</option>
                                    <option value="bounceOut">bounceOut</option>
                                    <option value="linear">linear</option>
                                    <option value="anticipate">anticipate</option>
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
                                    step="0.01"
                                    min="0.1"
                                    max="10"
                                    value={scaleX}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val >= 0.1 && val <= 10) {
                                            onChangeScale(index, 'x', val);
                                        }
                                    }}
                                    style={{ width: 110, marginLeft: 6 }}
                                />
                            </label>

                            {/* y scale 输入 */}
                            <label>
                                y scale:
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    max="10"
                                    value={scaleY}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val >= 0.1 && val <= 10) {
                                            onChangeScale(index, 'y', val);
                                        }
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
                                    backgroundColor: "#f0f0f0",
                                    border: "1px solid #ccc",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    fontSize: "12px"
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
