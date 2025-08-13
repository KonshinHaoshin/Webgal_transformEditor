import { TransformData } from "../types/transform";

interface RotationPanelProps {
    transforms: TransformData[];
    selectedIndexes: number[];
    onChange: (index: number, newRotation: number) => void;         // 兼容旧的
    onChangeTarget: (index: number, newTarget: string) => void;      // 新增
    onChangeId: (index: number, newId: string) => void;              // 新增
    onChangeEase: (index: number, newEase: string) => void;         // 新增：ease 设置
}

export default function RotationPanel({
                                          transforms,
                                          selectedIndexes,
                                          onChange,
                                          onChangeTarget,
                                          onChangeEase,
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
        </div>
    );
}
