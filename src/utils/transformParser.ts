
import {TransformData} from "../types/transform.ts";
// 通用保留两位小数
export const roundToTwo = (num: number): number => {
    return Math.round(num * 100) / 100;
};

// 递归保留两位小数
export const roundTransform = (obj: any): any => {
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

// 导出脚本
export function exportScript(
    transforms: TransformData[],
    exportDuration: number,
    canvasWidth: number,
    canvasHeight: number,
    baseWidth: number,
    baseHeight: number
): string {
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
            const transform = {
                ...obj.transform,
                position: {
                    x: obj.transform.position.x * scaleRatioX,
                    y: obj.transform.position.y * scaleRatioY,
                }
            };
            const roundedTransform = roundTransform(transform);
            const transformJson = JSON.stringify(roundedTransform);

            // extras：无值参数输出成 "-k"，有值参数输出 "-k=v"
            const extras = Object.entries(obj.extraParams || {})
                .map(([k, v]) => (v === "" || v === undefined) ? ` -${k}` : ` -${k}=${v}`)
                .join("");

            const presetFlag = obj.presetPosition && obj.presetPosition !== 'center' ? ` -${obj.presetPosition}` : '';
            return `changeFigure:${obj.path} -id=${obj.target} -transform=${transformJson}${extras}${presetFlag};`;
        }
        if (obj.type=="changeBg")
        {
            const extras = Object.entries(obj.extraParams || {})
                .map(([k, v]) => `-${k}=${v}`).join(" ");
            return `changeBg:${obj.path} -transform=${transformJson} ${extras};`;
        }

        return "";
    }).join("\n");
}

export function parseScript(script: string, scaleX: number, scaleY: number): TransformData[] {
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

            // 新增：预设位
            let presetPosition: 'left' | 'center' | 'right' | undefined;

            for (const part of rest) {
                const raw = part.trim();

                // 在 split(" -") 的前提下，"-left" 会变成 "left"
                if (raw === "left" || raw === "center" || raw === "right") {
                    presetPosition = raw as any;
                    continue;
                }

                const [k, v] = raw.split("=").map((s) => s?.trim());
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
                    } catch {
                        console.warn("❌ 解析 transform JSON 失败:", v);
                    }
                } else if (k && v) {
                    params[k] = v;
                } else if (k && !v) {
                    params[k] = "";
                }
            }

            if (!presetPosition) presetPosition = 'center';

            return {
                type: "changeFigure",
                path,
                target: params.id || "unknown",
                duration: 0,
                transform,
                presetPosition, // ✅ 记录预设位
                extraParams: Object.fromEntries(
                    Object.entries(params).filter(([k]) => k !== "id" && k !== "transform")
                )
            };
        }

        if (command.startsWith("changeBg:")) {
            const path = command.replace("changeBg:", "").trim();

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
                    params[k] = ""; // 支持 -next 等无值参数
                }
            }

            return {
                type: "changeBg",
                path,
                target: "bg-main",
                duration: 0,
                transform,
                extraParams: Object.fromEntries(
                    Object.entries(params).filter(([k]) => k !== "transform")
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
}