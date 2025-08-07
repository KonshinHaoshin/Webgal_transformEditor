import {TransformData} from "../types/transform.ts";

interface RotationPanelProps {
    transforms: TransformData[];
    selectedIndexes: number[];
    onChange: (index: number, newRotation: number) => void;
}

export default function RotationPanel({
                                          transforms,
                                          selectedIndexes,
                                          onChange,
                                      }: RotationPanelProps) {
    return (
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
                            if (!isNaN(val)) {
                                onChange(index, val);
                            }
                        }}
                        style={{ marginLeft: 10, width: 100 }}
                    />
                </div>
            ))}
        </div>
    );
}