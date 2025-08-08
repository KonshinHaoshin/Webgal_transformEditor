import { TransformData } from "../types/transform";

interface RotationPanelProps {
    transforms: TransformData[];
    selectedIndexes: number[];
    onChange: (index: number, newRotation: number) => void;         // 兼容旧的
    onChangeTarget: (index: number, newTarget: string) => void;      // 新增
    onChangeId: (index: number, newId: string) => void;              // 新增
}

export default function RotationPanel({
                                          transforms,
                                          selectedIndexes,
                                          onChange,
                                          onChangeTarget,
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
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
