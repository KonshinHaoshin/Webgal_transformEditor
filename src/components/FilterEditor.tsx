import React, { useEffect, useMemo, useState } from "react";
import { TransformData } from "../types/transform";

type Props = {
  transforms: TransformData[];
  setTransforms: React.Dispatch<React.SetStateAction<TransformData[]>>;
  selectedIndexes: number[];
  applyFilterToBg: boolean;                 // 复用你已有的"同时作用于背景"开关
  setApplyFilterToBg: (v: boolean) => void; // 从父组件同步勾选框
};

type FilterKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "gamma"
  | "colorRed"
  | "colorGreen"
  | "colorBlue"
  | "bloom"
  | "bloomBrightness"
  | "bloomBlur"
  | "bloomThreshold"
  | "bevel"
  | "bevelThickness"
  | "bevelSoftness";

type Def = {
  key: FilterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
};

const FILTER_DEFS: Def[] = [
  { key: "brightness",      label: "Brightness",      min: 0,   max: 2,   step: 0.01, def: 1 },
  { key: "contrast",        label: "Contrast",        min: 0,   max: 2,   step: 0.01, def: 1 },
  { key: "saturation",      label: "Saturation",      min: 0,   max: 2,   step: 0.01, def: 1 },
  { key: "gamma",           label: "Gamma",           min: 0,   max: 3,   step: 0.01, def: 1 },
  { key: "colorRed",        label: "Color R",         min: 0,   max: 255, step: 1,    def: 255 },
  { key: "colorGreen",      label: "Color G",         min: 0,   max: 255, step: 1,    def: 255 },
  { key: "colorBlue",       label: "Color B",         min: 0,   max: 255, step: 1,    def: 255 },
  { key: "bloom",           label: "Bloom Strength",  min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: "bloomBrightness", label: "Bloom Bright.",   min: 0,   max: 2,   step: 0.01, def: 1 },
  { key: "bloomBlur",       label: "Bloom Blur",      min: 0,   max: 40,  step: 0.1,  def: 0 },
  { key: "bloomThreshold",  label: "Bloom Thresh.",   min: 0,   max: 2,   step: 0.01, def: 0 },
  { key: "bevel",           label: "Bevel",           min: 0,   max: 30,  step: 0.1,  def: 0 },
  { key: "bevelThickness",  label: "Bevel Thick.",    min: 0,   max: 50,  step: 0.1,  def: 0 },
  { key: "bevelSoftness",   label: "Bevel Soft.",     min: 0,   max: 30,  step: 0.1,  def: 0 },
];

const DEFAULTS: Record<FilterKey, number> = FILTER_DEFS.reduce((acc, d) => {
  acc[d.key] = d.def;
  return acc;
}, {} as Record<FilterKey, number>);

export default function FilterEditor({
  transforms,
  setTransforms,
  selectedIndexes,
  applyFilterToBg,
  setApplyFilterToBg,
}: Props) {
  // 面板显示值（从当前选中或默认初始化）
  const [values, setValues] = useState<Record<FilterKey, number>>(DEFAULTS);
  
  // 新增：选择应用范围
  const [applyScope, setApplyScope] = useState<"selected" | "allFigures" | "allFiguresAndBg">("selected");

  // 首选"选中项的第一项"，否则使用第一个非背景项，否则就背景项
  const sourceTransform = useMemo(() => {
    if (selectedIndexes.length > 0) {
      const idx = selectedIndexes[0];
      return transforms[idx]?.transform;
    }
    const firstNonBg = transforms.find(t => t.target !== "bg-main");
    return firstNonBg?.transform ?? transforms.find(t => t.target === "bg-main")?.transform;
  }, [transforms, selectedIndexes]);

  // 获取当前编辑的目标名称
  const currentTargetName = useMemo(() => {
    if (selectedIndexes.length > 0) {
      const idx = selectedIndexes[0];
      return transforms[idx]?.target || "未知目标";
    }
    const firstNonBg = transforms.find(t => t.target !== "bg-main");
    return firstNonBg?.target || "未选择目标";
  }, [transforms, selectedIndexes]);

  // 当选择变化或 transforms 变化时，同步面板显示值（保留缺失字段的默认值）
  useEffect(() => {
    if (!sourceTransform) return;
    const next: Record<FilterKey, number> = { ...DEFAULTS };
    (Object.keys(DEFAULTS) as FilterKey[]).forEach(k => {
      const v = sourceTransform[k];
      if (typeof v === "number" && !Number.isNaN(v)) next[k] = v;
    });
    setValues(next);
  }, [sourceTransform]);

  // 应用某个键的变更：实时写回 transforms
  const applyKey = (key: FilterKey, num: number) => {
    setValues(prev => ({ ...prev, [key]: num }));
    setTransforms(prev =>
      prev.map((t, i) => {
        let shouldApply = false;
        
        // 根据应用范围决定是否应用
        switch (applyScope) {
          case "selected":
            // 只对选中的对象生效
            shouldApply = selectedIndexes.includes(i);
            break;
          case "allFigures":
            // 对所有立绘生效（不包括背景）
            shouldApply = t.target !== "bg-main";
            break;
          case "allFiguresAndBg":
            // 对所有立绘和背景生效
            shouldApply = true;
            break;
        }
        
        if (!shouldApply) return t;

        // 写回到 transform
        const nextTransform = { ...t.transform, [key]: num };
        return { ...t, transform: nextTransform };
      })
    );
  };

  // 一键重置为默认（实时写回）
  const resetAll = () => {
    setValues(DEFAULTS);
    setTransforms(prev =>
      prev.map((t, i) => {
        let shouldApply = false;
        
        // 根据应用范围决定是否应用
        switch (applyScope) {
          case "selected":
            shouldApply = selectedIndexes.includes(i);
            break;
          case "allFigures":
            shouldApply = t.target !== "bg-main";
            break;
          case "allFiguresAndBg":
            shouldApply = true;
            break;
        }
        
        if (!shouldApply) return t;

        const out = { ...t.transform };
        (Object.keys(DEFAULTS) as FilterKey[]).forEach(k => {
          out[k] = DEFAULTS[k];
        });
        return { ...t, transform: out };
      })
    );
  };

  // 从当前"源对象"拉取一次（如果你手动改了其它对象）
  const syncFromSelection = () => {
    if (!sourceTransform) return;
    const pulled: Record<FilterKey, number> = { ...DEFAULTS };
    (Object.keys(DEFAULTS) as FilterKey[]).forEach(k => {
      const v = sourceTransform[k];
      if (typeof v === "number" && !Number.isNaN(v)) pulled[k] = v;
    });
    setValues(pulled);
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      {/* 显示当前编辑的目标名称 */}
      <div style={{ 
        marginBottom: 16, 
        padding: "8px 12px", 
        background: "#e3f2fd", 
        borderRadius: 6, 
        border: "1px solid #2196f3",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
        <span style={{ fontSize: "14px", fontWeight: "600", color: "#1976d2" }}>🎯</span>
        <span style={{ fontSize: "14px", color: "#1976d2" }}>
          正在编辑: <strong>{currentTargetName}</strong>
        </span>
      </div>

      {/* 应用范围选择 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ 
          display: "block", 
          fontSize: "14px", 
          fontWeight: "600", 
          marginBottom: "8px",
          color: "#374151"
        }}>
          应用范围：
        </label>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <input
              type="radio"
              name="applyScope"
              value="selected"
              checked={applyScope === "selected"}
              onChange={(e) => setApplyScope(e.target.value as any)}
            />
            <span>仅选中对象 ({selectedIndexes.length} 个)</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <input
              type="radio"
              name="applyScope"
              value="allFigures"
              checked={applyScope === "allFigures"}
              onChange={(e) => setApplyScope(e.target.value as any)}
            />
            <span>所有立绘</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <input
              type="radio"
              name="applyScope"
              value="allFiguresAndBg"
              checked={applyScope === "allFiguresAndBg"}
              onChange={(e) => setApplyScope(e.target.value as any)}
            />
            <span>所有立绘 + 背景</span>
          </label>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Filter Editor</h3>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={applyFilterToBg}
            onChange={(e) => setApplyFilterToBg(e.target.checked)}
          />
          也作用于背景 (bg-main)
        </label>
        <button onClick={syncFromSelection}>从当前对象同步</button>
        <button onClick={resetAll}>重置默认</button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          maxWidth: 860,
        }}
      >
        {FILTER_DEFS.map(def => (
          <div key={def.key} style={{ padding: 8, border: "1px solid #eee", borderRadius: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label>{def.label}</label>
              <input
                type="number"
                value={values[def.key]}
                onChange={(e) => {
                  const v = clamp(parseFloat(e.target.value), def.min, def.max);
                  applyKey(def.key, Number.isFinite(v) ? v : def.def);
                }}
                step={def.step}
                min={def.min}
                max={def.max}
                style={{ width: 90 }}
              />
            </div>
            <input
              type="range"
              min={def.min}
              max={def.max}
              step={def.step}
              value={values[def.key]}
              onChange={(e) => applyKey(def.key, parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
        提示：选择应用范围后，滤镜效果将应用到相应的对象上。勾选"也作用于背景"才会改动 bg-main。
      </p>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
