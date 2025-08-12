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

// 预设类型定义
type FilterPreset = {
  name: string;
  values: Record<FilterKey, number>;
  createdAt: string;
  description?: string;
  isUserPreset?: boolean; // 标识是否为用户自定义预设
};

export default function FilterEditor({
  transforms,
  setTransforms,
  selectedIndexes,
  applyFilterToBg,
  setApplyFilterToBg,
}: Props) {
  // 面板显示值（从当前选中或默认初始化）
  const [values, setValues] = useState<Record<FilterKey, number>>(DEFAULTS);
  
  // 选择应用范围
  const [applyScope, setApplyScope] = useState<"selected" | "allFigures" | "allFiguresAndBg">("selected");

  // 预设管理相关状态
  const [allPresets, setAllPresets] = useState<Record<string, any>>({}); // 内置预设
  const [userPresets, setUserPresets] = useState<FilterPreset[]>([]); // 用户预设
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");

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

  // 加载内置预设
  useEffect(() => {
    fetch("/filter-presets.json")
      .then((res) => res.json())
      .then((data) => setAllPresets(data))
      .catch((err) => console.error("❌ Failed to load filter presets:", err));
  }, []);

  // 加载用户自定义预设
  useEffect(() => {
    const savedUserPresets = localStorage.getItem("userFilterPresets");
    if (savedUserPresets) {
      try {
        setUserPresets(JSON.parse(savedUserPresets));
      } catch (e) {
        console.error("Failed to parse saved user presets:", e);
      }
    }
  }, []);

  // 保存用户预设到 localStorage
  const saveUserPresetsToStorage = (newUserPresets: FilterPreset[]) => {
    localStorage.setItem("userFilterPresets", JSON.stringify(newUserPresets));
  };

  // 获取所有预设（内置 + 用户自定义）
  const getAllPresets = useMemo(() => {
    const combined: Record<string, any> = { ...allPresets };
    
    // 添加用户预设，使用特殊前缀避免冲突
    userPresets.forEach(preset => {
      combined[`[用户] ${preset.name}`] = preset.values;
    });
    
    return combined;
  }, [allPresets, userPresets]);

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

  // 新增：保存当前设置为预设
  const saveCurrentAsPreset = () => {
    if (!newPresetName.trim()) {
      alert("请输入预设名称！");
      return;
    }

    // 检查是否已存在同名预设
    if (userPresets.some(p => p.name === newPresetName.trim())) {
      if (!confirm(`预设 "${newPresetName}" 已存在，是否覆盖？`)) {
        return;
      }
      // 删除旧预设
      const filteredPresets = userPresets.filter(p => p.name !== newPresetName.trim());
      setUserPresets(filteredPresets);
    }

    const newPreset: FilterPreset = {
      name: newPresetName.trim(),
      values: { ...values },
      createdAt: new Date().toISOString(),
      description: newPresetDescription.trim() || undefined,
      isUserPreset: true,
    };

    const updatedUserPresets = [...userPresets, newPreset];
    setUserPresets(updatedUserPresets);
    saveUserPresetsToStorage(updatedUserPresets);

    // 重置表单
    setNewPresetName("");
    setNewPresetDescription("");
    setShowPresetModal(false);

    alert(`预设 "${newPreset.name}" 保存成功！`);
  };

  // 加载预设（支持内置预设和用户预设）
  const loadPreset = (presetName: string) => {
    const preset = getAllPresets[presetName];
    if (!preset) return;

    // 检查是否为用户预设
    const isUserPreset = presetName.startsWith("[用户] ");
    const actualPresetName = isUserPreset ? presetName.substring(4) : presetName;
    
    // 如果是用户预设，需要从 userPresets 中找到对应的完整信息
    if (isUserPreset) {
      const presetInfo = userPresets.find(p => p.name === actualPresetName);
      if (!presetInfo) return; // 如果找不到用户预设信息，直接返回
    }

    // 应用预设到面板
    setValues(preset);
    
    // 应用预设到 transforms
    setTransforms(prev =>
      prev.map((t, i) => {
        let shouldApply = false;
        
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

        const nextTransform = { ...t.transform, ...preset };
        return { ...t, transform: nextTransform };
      })
    );

    const displayName = isUserPreset ? actualPresetName : presetName;
    alert(`预设 "${displayName}" 加载成功！`);
  };

  // 删除用户预设
  const deleteUserPreset = (presetName: string) => {
    if (!confirm(`确定要删除预设 "${presetName}" 吗？`)) return;

    const updatedUserPresets = userPresets.filter(p => p.name !== presetName);
    setUserPresets(updatedUserPresets);
    saveUserPresetsToStorage(updatedUserPresets);
    alert(`预设 "${presetName}" 已删除！`);
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

      {/* 预设管理区域 */}
      <div style={{ 
        marginBottom: 16, 
        padding: "12px", 
        background: "#f8fafc", 
        borderRadius: 6, 
        border: "1px solid #e2e8f0" 
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: "14px", color: "#374151" }}>💾 预设管理</h4>
          <button 
            onClick={() => setShowPresetModal(true)}
            style={{
              padding: "6px 12px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            保存当前设置
          </button>
        </div>

        {/* 预设选择下拉框 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            marginBottom: "4px",
            color: "#374151"
          }}>
            选择预设：
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => {
              setSelectedPreset(e.target.value);
              if (e.target.value) {
                loadPreset(e.target.value);
              }
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "12px"
            }}
          >
            <option value="">选择一个预设...</option>
            {Object.keys(getAllPresets).map(key => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        {/* 用户预设列表 */}
        {userPresets.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
              用户自定义预设：
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {userPresets.map(preset => (
                <div key={preset.name} style={{
                  padding: "6px 10px",
                  background: "white",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px"
                }}>
                  <span style={{ fontWeight: "500" }}>{preset.name}</span>
                  {preset.description && (
                    <span style={{ color: "#6b7280", fontSize: "10px" }}>
                      ({preset.description})
                    </span>
                  )}
                  <button
                    onClick={() => loadPreset(`[用户] ${preset.name}`)}
                    style={{
                      padding: "2px 4px",
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "9px"
                    }}
                  >
                    加载
                  </button>
                  <button
                    onClick={() => deleteUserPreset(preset.name)}
                    style={{
                      padding: "2px 4px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "9px"
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {userPresets.length === 0 && (
          <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>
            暂无用户自定义预设，调整好参数后可以点击"保存当前设置"来创建预设
          </p>
        )}
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

      {/* 保存预设的模态框 */}
      {showPresetModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000
        }}>
          <div style={{
            background: "white",
            padding: "24px",
            borderRadius: "8px",
            minWidth: "400px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h3 style={{ margin: "0 0 16px 0", color: "#374151" }}>保存滤镜预设</h3>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#374151" }}>
                预设名称 *
              </label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="输入预设名称"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "14px"
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#374151" }}>
                描述（可选）
              </label>
              <textarea
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                placeholder="描述这个预设的效果..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "14px",
                  minHeight: "60px",
                  resize: "vertical"
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowPresetModal(false)}
                style={{
                  padding: "8px 16px",
                  background: "#6b7280",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                取消
              </button>
              <button
                onClick={saveCurrentAsPreset}
                style={{
                  padding: "8px 16px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                保存预设
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
