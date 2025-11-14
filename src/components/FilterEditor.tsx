import React, { useEffect, useMemo, useState } from "react";
import { TransformData } from "../types/transform";
import { extractMotionsAndExpressions } from "../utils/jsonlParser";

type Props = {
  transforms: TransformData[];
  setTransforms: React.Dispatch<React.SetStateAction<TransformData[]>>;
  selectedIndexes: number[];
  applyFilterToBg: boolean;                 // 复用你已有的"同时作用于背景"开关
  setApplyFilterToBg: (v: boolean) => void; // 从父组件同步勾选框
  selectedGameFolder?: string | null;        // 游戏文件夹路径（用于加载 JSONL）
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
  | "bevelRotation"
  | "bevelSoftness"
  | "bevelRed"
  | "bevelGreen"
  | "bevelBlue";

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
  { key: "bevelRotation",   label: "Bevel Rotation",  min: 0,   max: 360, step: 1,    def: 0 },
  { key: "bevelSoftness",   label: "Bevel Soft.",     min: 0,   max: 30,  step: 0.1,  def: 0 },
  { key: "bevelRed",        label: "Bevel R",         min: 0,   max: 255, step: 1,    def: 255 },
  { key: "bevelGreen",      label: "Bevel G",         min: 0,   max: 255, step: 1,    def: 255 },
  { key: "bevelBlue",       label: "Bevel B",         min: 0,   max: 255, step: 1,    def: 255 },
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
  selectedGameFolder,
}: Props) {
  // 面板显示值（从当前选中或默认初始化）
  const [values, setValues] = useState<Record<FilterKey, number>>(DEFAULTS);
  
  // 选择应用范围 - 使用勾选ID的方式
  const [selectedFilterTargets, setSelectedFilterTargets] = useState<Set<string>>(new Set());

  // 预设管理相关状态
  const [allPresets, setAllPresets] = useState<Record<string, any>>({}); // 内置预设
  const [userPresets, setUserPresets] = useState<FilterPreset[]>([]); // 用户预设
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  
  // 位置预设相关状态
  const [builtinPositionPresets, setBuiltinPositionPresets] = useState<Record<string, any>>({});
  const [userPositionPresets, setUserPositionPresets] = useState<Record<string, any>>({});
  const [showPositionPresetModal, setShowPositionPresetModal] = useState(false);
  const [newPositionPresetName, setNewPositionPresetName] = useState("");
  
  // 合并内置预设和用户自定义预设
  const positionPresets = useMemo(() => {
    return { ...builtinPositionPresets, ...userPositionPresets };
  }, [builtinPositionPresets, userPositionPresets]);

  // Live2D motions 和 expressions 相关状态
  const [motionsMap, setMotionsMap] = useState<Map<string, string[]>>(new Map());
  const [expressionsMap, setExpressionsMap] = useState<Map<string, string[]>>(new Map());

  // 获取所有可用的target ID列表（用于勾选）
  const availableTargetIds = useMemo(() => {
    const targets = new Set<string>();
    let hasFigure = false;
    let hasBg = false;
    
    transforms.forEach(t => {
      if (t.type === 'changeFigure' || t.type === 'changeBg' || t.type === 'setTransform') {
        if (t.target) {
          targets.add(t.target);
          // 检查是否有立绘（figure*）
          if (t.target.startsWith('figure')) {
            hasFigure = true;
          }
          // 检查是否有背景
          if (t.target === 'bg-main') {
            hasBg = true;
          }
        }
      }
    });
    
    // 如果有立绘或背景，添加 stage-main 选项
    if (hasFigure || hasBg) {
      targets.add('stage-main');
    }
    
    return Array.from(targets).sort((a, b) => {
      // stage-main 排在最前面
      if (a === 'stage-main') return -1;
      if (b === 'stage-main') return 1;
      return a.localeCompare(b);
    });
  }, [transforms]);

  // 判断 target 是否应该被应用（支持 stage-main）
  const shouldApplyToTarget = useMemo(() => {
    return (target: string | undefined): boolean => {
      if (!target) return false;
      
      // 如果选择了 stage-main，应用到所有立绘和背景
      if (selectedFilterTargets.has('stage-main')) {
        return target.startsWith('figure') || target === 'bg-main';
      }
      
      // 否则只应用选中的 target
      return selectedFilterTargets.has(target);
    };
  }, [selectedFilterTargets]);

  // 首选"选中项的第一项"，否则使用第一个非背景项，否则就背景项
  const sourceTransform = useMemo(() => {
    // 如果勾选了特定的ID，优先使用第一个勾选的ID（排除 stage-main）
    if (selectedFilterTargets.size > 0) {
      const firstSelectedId = Array.from(selectedFilterTargets).find(id => id !== 'stage-main') || Array.from(selectedFilterTargets)[0];
      
      // 如果选择的是 stage-main，优先使用第一个立绘，否则使用背景
      if (firstSelectedId === 'stage-main') {
        const firstFigure = transforms.find(t => t.target && t.target.startsWith('figure'));
        if (firstFigure) return firstFigure.transform;
        const bg = transforms.find(t => t.target === 'bg-main');
        if (bg) return bg.transform;
      } else {
        const targetTransform = transforms.find(t => t.target === firstSelectedId);
        if (targetTransform) return targetTransform.transform;
      }
    }
    // 否则使用选中的索引
    if (selectedIndexes.length > 0) {
      const idx = selectedIndexes[0];
      return transforms[idx]?.transform;
    }
    const firstNonBg = transforms.find(t => t.target !== "bg-main");
    return firstNonBg?.transform ?? transforms.find(t => t.target === "bg-main")?.transform;
  }, [transforms, selectedIndexes, selectedFilterTargets]);

  // 获取当前编辑的目标名称
  const currentTargetName = useMemo(() => {
    // 如果勾选了特定的ID，显示第一个勾选的ID
    if (selectedFilterTargets.size > 0) {
      const firstSelectedId = Array.from(selectedFilterTargets)[0];
      return firstSelectedId;
    }
    // 否则使用选中的索引
    if (selectedIndexes.length > 0) {
      const idx = selectedIndexes[0];
      return transforms[idx]?.target || "未知目标";
    }
    const firstNonBg = transforms.find(t => t.target !== "bg-main");
    return firstNonBg?.target || "未选择目标";
  }, [transforms, selectedIndexes, selectedFilterTargets]);
  
  // 获取当前选中的目标列表（用于显示）
  const selectedTargetsDisplay = useMemo(() => {
    if (selectedFilterTargets.has('stage-main')) {
      const allTargets = availableTargetIds.filter(id => id !== 'stage-main' && (id.startsWith('figure') || id === 'bg-main'));
      return `stage-main (${allTargets.length} 个目标: ${allTargets.join(', ')})`;
    }
    return Array.from(selectedFilterTargets).join(', ');
  }, [selectedFilterTargets, availableTargetIds]);

  // 当 availableTargetIds 变化时，如果没有勾选任何ID，自动勾选所有ID（默认全部启用，但不包括 stage-main）
  useEffect(() => {
    if (availableTargetIds.length > 0 && selectedFilterTargets.size === 0) {
      // 默认勾选所有非 stage-main 的目标
      const defaultTargets = availableTargetIds.filter(id => id !== 'stage-main');
      if (defaultTargets.length > 0) {
        setSelectedFilterTargets(new Set(defaultTargets));
      }
    } else if (availableTargetIds.length === 0) {
      setSelectedFilterTargets(new Set());
    } else {
      // 移除已不存在的ID
      const validTargets = new Set<string>();
      selectedFilterTargets.forEach(id => {
        if (availableTargetIds.includes(id)) {
          validTargets.add(id);
        }
      });
      if (validTargets.size !== selectedFilterTargets.size) {
        setSelectedFilterTargets(validTargets);
      }
    }
  }, [availableTargetIds]);

  // 加载选中目标的 motions 和 expressions（仅对 changeFigure 且是 JSONL 文件）
  useEffect(() => {
    const loadMotionsAndExpressions = async () => {
      // 如果没有游戏文件夹，尝试从 webgalFileManager 获取
      let gameFolder = selectedGameFolder;
      if (!gameFolder) {
        try {
          const { webgalFileManager } = await import('../utils/webgalFileManager');
          gameFolder = webgalFileManager.getGameFolder();
        } catch (e) {
          console.warn('无法获取游戏文件夹:', e);
        }
      }

      if (!gameFolder) {
        console.warn('⚠️ 游戏文件夹未设置，无法加载 JSONL 文件');
        return;
      }

      const newMotionsMap = new Map(motionsMap);
      const newExpressionsMap = new Map(expressionsMap);

      // 遍历所有 changeFigure 类型的 transform
      for (const transform of transforms) {
        if (transform.type === 'changeFigure' && transform.path) {
          const isJsonl = transform.path.toLowerCase().endsWith('.jsonl');
          const isJson = transform.path.toLowerCase().endsWith('.json');
          if ((isJsonl || isJson) && !newMotionsMap.has(transform.path)) {
            console.log(`🔄 开始加载 ${isJsonl ? 'JSONL' : 'JSON'}: ${transform.path}`);
            console.log(`   游戏文件夹: ${gameFolder}`);
            try {
              // 传入 gameFolder 参数，确保后端能正确找到文件
              const { motions, expressions } = await extractMotionsAndExpressions(transform.path, gameFolder);
              console.log(`✅ 加载完成: ${transform.path} - ${motions.length} motions, ${expressions.length} expressions`);
              newMotionsMap.set(transform.path, motions);
              newExpressionsMap.set(transform.path, expressions);
            } catch (error) {
              console.error(`❌ 加载 motions/expressions 失败 (${transform.path}):`, error);
              // 即使失败也设置空数组，避免重复尝试
              newMotionsMap.set(transform.path, []);
              newExpressionsMap.set(transform.path, []);
            }
          }
        }
      }

      setMotionsMap(newMotionsMap);
      setExpressionsMap(newExpressionsMap);
    };

    loadMotionsAndExpressions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transforms, selectedGameFolder]);

  // 获取指定路径的 motions 和 expressions
  const getMotions = (path: string | undefined): string[] => {
    if (!path) return [];
    return motionsMap.get(path) || [];
  };

  const getExpressions = (path: string | undefined): string[] => {
    if (!path) return [];
    return expressionsMap.get(path) || [];
  };

  // 获取当前选中的 changeFigure 的路径（用于显示 motion 和 expression 选择器）
  // 只返回每个 target 的最后一个 changeFigure
  const currentChangeFigure = useMemo(() => {
    let targetToFind: string | null = null;

    // 如果勾选了特定的ID，优先使用第一个勾选的ID
    if (selectedFilterTargets.size > 0) {
      targetToFind = Array.from(selectedFilterTargets)[0];
    } else if (selectedIndexes.length > 0) {
      // 否则使用选中的索引对应的 target
      const idx = selectedIndexes[0];
      const t = transforms[idx];
      if (t && t.target) {
        targetToFind = t.target;
      }
    }

    if (targetToFind) {
      // 从后往前找该 target 的最后一个 changeFigure
      for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if (t.type === 'changeFigure' && t.target === targetToFind) {
          return t;
        }
      }
    }

    // 否则找第一个 target 的最后一个 changeFigure
    const firstTarget = transforms.find(t => t.type === 'changeFigure')?.target;
    if (firstTarget) {
      for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if (t.type === 'changeFigure' && t.target === firstTarget) {
          return t;
        }
      }
    }

    return undefined;
  }, [transforms, selectedIndexes, selectedFilterTargets]);

  // 更新 motion（只更新最后一个 changeFigure）
  const handleMotionChange = (motion: string) => {
    if (!currentChangeFigure) return;

    setTransforms((prev) => {
      // 找到该 target 的最后一个 changeFigure 的索引
      let lastChangeFigureIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const t = prev[i];
        if (t.type === 'changeFigure' && t.target === currentChangeFigure.target) {
          lastChangeFigureIndex = i;
          break;
        }
      }

      if (lastChangeFigureIndex === -1) return prev;

      // 只更新最后一个 changeFigure
      const newTransforms = [...prev];
      newTransforms[lastChangeFigureIndex] = {
        ...newTransforms[lastChangeFigureIndex],
        motion: motion || undefined
      };
      return newTransforms;
    });
  };

  // 更新 expression（只更新最后一个 changeFigure）
  const handleExpressionChange = (expression: string) => {
    if (!currentChangeFigure) return;

    setTransforms((prev) => {
      // 找到该 target 的最后一个 changeFigure 的索引
      let lastChangeFigureIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const t = prev[i];
        if (t.type === 'changeFigure' && t.target === currentChangeFigure.target) {
          lastChangeFigureIndex = i;
          break;
        }
      }

      if (lastChangeFigureIndex === -1) return prev;

      // 只更新最后一个 changeFigure
      const newTransforms = [...prev];
      newTransforms[lastChangeFigureIndex] = {
        ...newTransforms[lastChangeFigureIndex],
        expression: expression || undefined
      };
      return newTransforms;
    });
  };

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
    
    // 加载内置位置预设
    fetch("/position-presets.json")
      .then((res) => res.json())
      .then((data) => setBuiltinPositionPresets(data))
      .catch((err) => console.error("❌ Failed to load position presets:", err));
  }, []);

  // 加载用户自定义预设（滤镜）
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

  // 加载用户自定义位置预设
  useEffect(() => {
    const savedUserPositionPresets = localStorage.getItem("userPositionPresets");
    if (savedUserPositionPresets) {
      try {
        setUserPositionPresets(JSON.parse(savedUserPositionPresets));
      } catch (e) {
        console.error("Failed to parse saved user position presets:", e);
      }
    }
  }, []);

  // 保存用户预设到 localStorage
  const saveUserPresetsToStorage = (newUserPresets: FilterPreset[]) => {
    localStorage.setItem("userFilterPresets", JSON.stringify(newUserPresets));
  };

  // 保存用户位置预设到 localStorage
  const saveUserPositionPresetsToStorage = (newUserPositionPresets: Record<string, any>) => {
    localStorage.setItem("userPositionPresets", JSON.stringify(newUserPositionPresets));
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
      prev.map((t) => {
        // 使用 shouldApplyToTarget 判断是否应该应用（支持 stage-main）
        const shouldApply = shouldApplyToTarget(t.target);
        
        if (!shouldApply) return t;

        // 对于 setTransform，只更新滤镜参数，不写入 position、scale、rotation（除非它们已经存在）
        if (t.type === "setTransform") {
          const nextTransform = { ...t.transform };
          nextTransform[key] = num;
          return { ...t, transform: nextTransform };
        }

        // 对于 changeFigure/changeBg，正常更新
        const nextTransform = {
          ...t.transform,
          [key]: num
          // 所有其他滤镜参数（brightness, contrast, saturation, gamma, colorRed, colorGreen, colorBlue 等）
          // 都通过 ...t.transform 被保留，每次修改单个参数时不会丢失其他参数
        };
        return { ...t, transform: nextTransform };
      })
    );
  };

  // 一键重置为默认（实时写回）
  const resetAll = () => {
    setValues(DEFAULTS);
    
    setTransforms(prev =>
      prev.map((t) => {
        // 使用 shouldApplyToTarget 判断是否应该应用（支持 stage-main）
        const shouldApply = shouldApplyToTarget(t.target);
        
        if (!shouldApply) return t;

        // 确保所有滤镜参数都被写入 transform 对象
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
    if (!preset) {
      console.warn(`预设 "${presetName}" 不存在`);
      return;
    }

    // 检查是否为用户预设
    const isUserPreset = presetName.startsWith("[用户] ");
    // 安全地移除前缀 "[用户] "（注意：中文字符在 JS 中每个字符占 1 个位置）
    const actualPresetName = isUserPreset ? presetName.replace("[用户] ", "") : presetName;
    
    // 如果是用户预设，需要从 userPresets 中找到对应的完整信息（可选检查）
    if (isUserPreset) {
      const presetInfo = userPresets.find(p => p.name === actualPresetName);
      if (!presetInfo) {
        console.warn(`找不到用户预设 "${actualPresetName}" 的完整信息`);
        // 即使找不到完整信息，也继续加载预设值
      }
    }

    // 应用预设到面板
    setValues(preset);
    
    // 应用预设到 transforms - 彻底完全替换滤镜参数
    setTransforms(prev =>
      prev.map((t) => {
        // 使用 shouldApplyToTarget 判断是否应该应用（支持 stage-main）
        const shouldApply = shouldApplyToTarget(t.target);
        
        if (!shouldApply) return t;

        // 滤镜参数列表
        const filterKeys = [
          "brightness", "contrast", "saturation", "gamma",
          "colorRed", "colorGreen", "colorBlue",
          "bloom", "bloomBrightness", "bloomBlur", "bloomThreshold",
          "bevel", "bevelThickness", "bevelRotation", "bevelSoftness",
          "bevelRed", "bevelGreen", "bevelBlue"
        ];

        // 对于 setTransform，不应该写入滤镜参数！滤镜参数只在 changeFigure/changeBg 中
        if (t.type === "setTransform") {
          // 不更新 setTransform，直接返回（滤镜参数不应该写入 setTransform）
          return t;
        }

        // 对于 changeFigure/changeBg，彻底完全替换：只保留非滤镜属性（position, scale, rotation），完全替换所有滤镜参数
        const nextTransform: any = {
          // 保留基础属性
          position: t.transform.position || { x: 0, y: 0 },
          scale: t.transform.scale || { x: 1, y: 1 },
          rotation: t.transform.rotation !== undefined ? t.transform.rotation : 0,
        };

        // 完全替换所有滤镜参数（使用预设值或默认值）
        for (const key of filterKeys) {
          const filterKey = key as FilterKey;
          if (preset[filterKey] !== undefined) {
            // 使用预设值
            nextTransform[key] = preset[filterKey];
          } else {
            // 如果预设中没有定义，使用默认值
            nextTransform[key] = DEFAULTS[filterKey];
          }
        }

        return { ...t, transform: nextTransform };
      })
    );
    // 感觉不是很有必要弹窗
    // const displayName = isUserPreset ? actualPresetName : presetName;
    // alert(`预设 "${displayName}" 加载成功！`);
  };

  // 删除用户预设
  const deleteUserPreset = (presetName: string) => {
    if (!confirm(`确定要删除预设 "${presetName}" 吗？`)) return;

    const updatedUserPresets = userPresets.filter(p => p.name !== presetName);
    setUserPresets(updatedUserPresets);
    saveUserPresetsToStorage(updatedUserPresets);
    alert(`预设 "${presetName}" 已删除！`);
  };

  // 删除位置预设（只能删除用户自定义预设）
  const deletePositionPreset = (presetName: string) => {
    // 检查是否为内置预设
    if (builtinPositionPresets[presetName]) {
      alert("无法删除内置位置预设！");
      return;
    }
    
    if (!confirm(`确定要删除位置预设 "${presetName}" 吗？`)) return;

    const updatedUserPresets = { ...userPositionPresets };
    delete updatedUserPresets[presetName];
    setUserPositionPresets(updatedUserPresets);
    saveUserPositionPresetsToStorage(updatedUserPresets);
    
    alert(`位置预设 "${presetName}" 已删除！`);
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
          正在编辑: <strong>{selectedFilterTargets.size > 0 ? selectedTargetsDisplay : currentTargetName}</strong>
        </span>
      </div>

      {/* 应用范围选择 - 勾选ID方式 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ 
          display: "block", 
          fontSize: "14px", 
          fontWeight: "600", 
          marginBottom: "10px",
          color: "#374151"
        }}>
          应用范围：
        </label>
        <div style={{ 
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          border: "1px solid #ddd", 
          borderRadius: "4px", 
          padding: "10px",
          backgroundColor: "#f9f9f9"
        }}>
          {availableTargetIds.length === 0 ? (
            <div style={{ color: "#999", fontStyle: "italic" }}>暂无立绘或背景</div>
          ) : (
            availableTargetIds.map(target => {
              const transform = transforms.find(t => 
                (t.type === 'changeFigure' || t.type === 'changeBg') && t.target === target
              );
              const isBg = transform?.type === 'changeBg' || target === 'bg-main';
              const isStageMain = target === 'stage-main';
              
              return (
                <label 
                  key={target}
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFilterTargets.has(target)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedFilterTargets);
                      if (e.target.checked) {
                        // 如果勾选 stage-main，取消勾选所有其他目标（避免混淆）
                        if (isStageMain) {
                          newSelected.clear();
                          newSelected.add('stage-main');
                        } else {
                          // 如果勾选其他目标，取消勾选 stage-main（避免混淆）
                          newSelected.delete('stage-main');
                          newSelected.add(target);
                        }
                      } else {
                        newSelected.delete(target);
                      }
                      setSelectedFilterTargets(newSelected);
                    }}
                    style={{ marginRight: "6px", cursor: "pointer" }}
                  />
                  <span style={{ 
                    color: isStageMain ? "#9c27b0" : isBg ? "#e74c3c" : "#333",
                    fontWeight: isStageMain ? "bold" : isBg ? "bold" : "normal"
                  }}>
                    {target}{isStageMain ? " (所有立绘和背景)" : ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Live2D 动作和表情选择器 */}
      {(() => {
        // 检查是否有 JSONL 或 JSON 格式的 changeFigure
        const isJsonl = currentChangeFigure?.path?.toLowerCase().endsWith('.jsonl');
        const isJson = currentChangeFigure?.path?.toLowerCase().endsWith('.json');
        const motions = currentChangeFigure?.path ? getMotions(currentChangeFigure.path) : [];
        const expressions = currentChangeFigure?.path ? getExpressions(currentChangeFigure.path) : [];

        // 如果有 JSONL 或 JSON 文件，显示选择器（即使列表为空也显示，方便调试）
        if (currentChangeFigure && (isJsonl || isJson)) {
          return (
            <div style={{ marginBottom: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "600", color: "#374151" }}>
                Live2D 动作和表情
                {currentChangeFigure.target && (
                  <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: 8 }}>
                    (target: {currentChangeFigure.target})
                  </span>
                )}
              </h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "14px", minWidth: 60 }}>Motion:</span>
                  <select
                    value={currentChangeFigure.motion || ''}
                    onChange={(e) => handleMotionChange(e.target.value)}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      fontSize: "14px",
                      minWidth: 150
                    }}
                  >
                    <option value="">无动作</option>
                    {motions.length > 0 ? (
                      motions.map((motion) => (
                        <option key={motion} value={motion}>
                          {motion}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>加载中...</option>
                    )}
                  </select>
                  {motions.length > 0 && (
                    <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: 4 }}>
                      ({motions.length} 个动作)
                    </span>
                  )}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "14px", minWidth: 80 }}>Expression:</span>
                  <select
                    value={currentChangeFigure.expression || ''}
                    onChange={(e) => handleExpressionChange(e.target.value)}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      fontSize: "14px",
                      minWidth: 150
                    }}
                  >
                    <option value="">无表情</option>
                    {expressions.length > 0 ? (
                      expressions.map((expression) => (
                        <option key={expression} value={expression}>
                          {expression}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>加载中...</option>
                    )}
                  </select>
                  {expressions.length > 0 && (
                    <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: 4 }}>
                      ({expressions.length} 个表情)
                    </span>
                  )}
                </label>
              </div>
              {/* 调试信息 - 显示加载状态 */}
              {motions.length === 0 && expressions.length === 0 && (
                <div style={{ marginTop: 8, padding: 8, background: "#fef3c7", borderRadius: 4, fontSize: "11px", color: "#92400e" }}>
                  <div>⚠️ 正在加载 motions 和 expressions...</div>
                  <div style={{ marginTop: 4 }}>路径: {currentChangeFigure.path}</div>
                  <div>如果长时间未加载，请检查 {isJsonl ? 'JSONL' : 'JSON'} 文件格式是否正确</div>
                </div>
              )}
            </div>
          );
        }
        return null;
      })()}

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
            保存当前滤镜设置
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
            选择滤镜预设：
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
            aria-label="选择预设"
            title="选择预设"
          >
            <option value="">选择一个预设...</option>
            {Object.keys(getAllPresets).map(key => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        {/* 位置预设选择 */}
        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            marginBottom: "4px",
            color: "#374151"
          }}>
            位置预设：
          </label>
          <select
            onChange={(e) => {
              const presetName = e.target.value;
              if (!presetName) return;
              
              const preset = positionPresets[presetName];
              if (!preset) {
                console.warn(`位置预设 "${presetName}" 不存在`);
                return;
              }

              // 找到最新的 setTransform 或 changeFigure/changeBg 语句（优先选中的，否则找最后一个）
              setTransforms((prev) => {
                const copy = [...prev];
                
                // 如果有选中的项目，优先使用选中的 setTransform 或 changeFigure/changeBg
                let targetIndex = -1;
                let targetId = "";
                
                if (selectedIndexes.length > 0) {
                  // 从选中的项目中找到最新的 setTransform 或 changeFigure/changeBg
                  for (let i = selectedIndexes.length - 1; i >= 0; i--) {
                    const idx = selectedIndexes[i];
                    const item = copy[idx];
                    if (item && (item.type === 'setTransform' || item.type === 'changeFigure' || item.type === 'changeBg')) {
                      targetIndex = idx;
                      targetId = item.target;
                      break;
                    }
                  }
                }
                
                // 如果没有选中的，找到对应 changeFigure/changeBg 的 setTransform
                if (targetIndex === -1) {
                  // 先找到最新的 changeFigure 或 changeBg
                  for (let i = copy.length - 1; i >= 0; i--) {
                    const item = copy[i];
                    if (item && (item.type === 'changeFigure' || item.type === 'changeBg')) {
                      targetId = item.target;
                      // 优先使用 changeFigure/changeBg 本身
                      targetIndex = i;
                      // 如果没有 position 或 scale，再找对应的 setTransform
                      if (!item.transform.position && !item.transform.scale) {
                        for (let j = copy.length - 1; j >= 0; j--) {
                          const setTransform = copy[j];
                          if (setTransform && setTransform.type === 'setTransform' && setTransform.target === targetId) {
                            targetIndex = j;
                            break;
                          }
                        }
                      }
                      break;
                    }
                  }
                }
                
                // 如果还是找不到，使用最新的 setTransform 或 changeFigure/changeBg
                if (targetIndex === -1) {
                  // 优先找 changeFigure/changeBg
                  for (let i = copy.length - 1; i >= 0; i--) {
                    if (copy[i] && (copy[i].type === 'changeFigure' || copy[i].type === 'changeBg')) {
                      targetIndex = i;
                      targetId = copy[i].target;
                      break;
                    }
                  }
                  // 如果没找到 changeFigure/changeBg，再找 setTransform
                  if (targetIndex === -1) {
                    for (let i = copy.length - 1; i >= 0; i--) {
                      if (copy[i] && copy[i].type === 'setTransform') {
                        targetIndex = i;
                        targetId = copy[i].target;
                        break;
                      }
                    }
                  }
                }
                
                if (targetIndex === -1) {
                  alert("没有找到可应用位置预设的语句！");
                  return copy;
                }
                
                // 应用预设：部分替换 position 和 scale（只替换预设中提供的字段，保留原有值）
                const updatedTransform = { ...copy[targetIndex] };
                const newTransform: any = { ...updatedTransform.transform };
                
                // 部分替换 position（只替换预设中提供的字段）
                if (preset.position) {
                  // 确保 position 对象存在
                  if (!newTransform.position) {
                    newTransform.position = { x: 0, y: 0 };
                  }
                  // 只替换预设中提供的字段，保留原有值
                  if (preset.position.x !== undefined && preset.position.x !== null) {
                    newTransform.position.x = preset.position.x;
                  }
                  if (preset.position.y !== undefined && preset.position.y !== null) {
                    newTransform.position.y = preset.position.y;
                  }
                }
                
                // 部分替换 scale（只替换预设中提供的字段）
                if (preset.scale) {
                  // 确保 scale 对象存在
                  if (!newTransform.scale) {
                    newTransform.scale = { x: 1, y: 1 };
                  }
                  // 只替换预设中提供的字段，保留原有值
                  if (preset.scale.x !== undefined && preset.scale.x !== null) {
                    newTransform.scale.x = preset.scale.x;
                  }
                  if (preset.scale.y !== undefined && preset.scale.y !== null) {
                    newTransform.scale.y = preset.scale.y;
                  }
                }
                
                updatedTransform.transform = newTransform;
                copy[targetIndex] = updatedTransform;
                
                return copy;
              });
              
              // 重置选择框
              e.target.value = "";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "12px"
            }}
            aria-label="选择位置预设"
            title="选择位置预设"
            defaultValue=""
          >
            <option value="" disabled>
              选择一个位置预设...
            </option>
            {Object.keys(positionPresets).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              onClick={() => {
                // 获取当前选中项的 position 和 scale
                const targetIndex = selectedIndexes.length > 0 ? selectedIndexes[selectedIndexes.length - 1] : -1;
                if (targetIndex === -1) {
                  alert("请先选择一个 transform 项目！");
                  return;
                }
                
                const targetTransform = transforms[targetIndex];
                if (!targetTransform) {
                  alert("未找到选中的 transform！");
                  return;
                }
                
                // 提取 position 和 scale
                const position = targetTransform.transform.position;
                const scale = targetTransform.transform.scale;
                
                // 检查是否有 position 或 scale
                if (!position && !scale) {
                  alert("选中的 transform 没有 position 或 scale 信息！");
                  return;
                }
                
                // 打开保存预设的模态框
                setShowPositionPresetModal(true);
              }}
              style={{
                padding: "6px 12px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                flex: 1
              }}
            >
              保存当前位置为预设
            </button>
          </div>
          
          {/* 位置预设列表 */}
          {Object.keys(positionPresets).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                位置预设列表：
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Object.keys(positionPresets).map((presetName) => {
                  const isUserPreset = userPositionPresets[presetName];
                  return (
                    <div key={presetName} style={{
                      padding: "6px 10px",
                      background: "white",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "11px"
                    }}>
                      <span style={{ fontWeight: "500" }}>{presetName}</span>
                      {isUserPreset && (
                        <button
                          onClick={() => deletePositionPreset(presetName)}
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
                      )}
                      {!isUserPreset && (
                        <span style={{ color: "#9ca3af", fontSize: "9px" }}>内置</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 保存位置预设的模态框 */}
        {showPositionPresetModal && (
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
              <h3 style={{ margin: "0 0 16px 0", color: "#374151" }}>保存位置预设</h3>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#374151" }}>
                  预设名称 *
                </label>
                <input
                  type="text"
                  value={newPositionPresetName}
                  onChange={(e) => setNewPositionPresetName(e.target.value)}
                  placeholder="输入预设名称"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    fontSize: "14px"
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const targetIndex = selectedIndexes.length > 0 ? selectedIndexes[selectedIndexes.length - 1] : -1;
                      if (targetIndex === -1) return;
                      
                      const targetTransform = transforms[targetIndex];
                      if (!targetTransform) return;
                      
                      const position = targetTransform.transform.position;
                      const scale = targetTransform.transform.scale;
                      
                      // 构建预设数据（只包含 position 的 y 字段和 scale 的所有字段，格式与 position-presets.json 一致）
                      const presetData: any = {};
                      
                      // 只保存 position 的 y 字段（不保存 x 字段）
                      if (position && position.y !== undefined && position.y !== null) {
                        presetData.position = {
                          y: position.y
                        };
                      }
                      
                      // 保存 scale 的所有字段（x 和 y，如果存在且不是 null/undefined）
                      if (scale) {
                        presetData.scale = {};
                        if (scale.x !== undefined && scale.x !== null) {
                          presetData.scale.x = scale.x;
                        }
                        if (scale.y !== undefined && scale.y !== null) {
                          presetData.scale.y = scale.y;
                        }
                        // 如果 scale 对象为空，则不添加
                        if (Object.keys(presetData.scale).length === 0) {
                          delete presetData.scale;
                        }
                      }
                      
                      // 更新用户位置预设
                      const updatedUserPresets = {
                        ...userPositionPresets,
                        [newPositionPresetName.trim()]: presetData
                      };
                      setUserPositionPresets(updatedUserPresets);
                      saveUserPositionPresetsToStorage(updatedUserPresets);
                      
                      setShowPositionPresetModal(false);
                      setNewPositionPresetName("");
                      alert(`位置预设 "${newPositionPresetName.trim()}" 保存成功！`);
                    }
                  }}
                />
              </div>
              
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setShowPositionPresetModal(false);
                    setNewPositionPresetName("");
                  }}
                  style={{
                    padding: "8px 16px",
                    background: "#e5e7eb",
                    color: "#374151",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (!newPositionPresetName.trim()) {
                      alert("请输入预设名称！");
                      return;
                    }
                    
                    // 获取当前选中项的 position 和 scale
                    const targetIndex = selectedIndexes.length > 0 ? selectedIndexes[selectedIndexes.length - 1] : -1;
                    if (targetIndex === -1) {
                      alert("请先选择一个 transform 项目！");
                      return;
                    }
                    
                    const targetTransform = transforms[targetIndex];
                    if (!targetTransform) {
                      alert("未找到选中的 transform！");
                      return;
                    }
                    
                    const position = targetTransform.transform.position;
                    const scale = targetTransform.transform.scale;
                    
                    // 检查是否已存在同名预设（仅检查用户自定义预设，用户可以覆盖自己的预设）
                    if (userPositionPresets[newPositionPresetName.trim()]) {
                      if (!confirm(`位置预设 "${newPositionPresetName.trim()}" 已存在，是否覆盖？`)) {
                        return;
                      }
                    }
                    
                    const presetData: any = {};
                    
                    if (position && position.y !== undefined && position.y !== null) {
                      presetData.position = {
                        y: position.y
                      };
                    }
                    
                    if (scale) {
                      presetData.scale = {};
                      if (scale.x !== undefined && scale.x !== null) {
                        presetData.scale.x = scale.x;
                      }
                      if (scale.y !== undefined && scale.y !== null) {
                        presetData.scale.y = scale.y;
                      }
                      // 如果 scale 对象为空，则不添加
                      if (Object.keys(presetData.scale).length === 0) {
                        delete presetData.scale;
                      }
                    }
                    
                    // 更新用户位置预设
                    const updatedUserPresets = {
                      ...userPositionPresets,
                      [newPositionPresetName.trim()]: presetData
                    };
                    setUserPositionPresets(updatedUserPresets);
                    saveUserPositionPresetsToStorage(updatedUserPresets);
                    
                    setShowPositionPresetModal(false);
                    setNewPositionPresetName("");
                    alert(`位置预设 "${newPositionPresetName.trim()}" 保存成功！`);
                  }}
                  style={{
                    padding: "8px 16px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

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

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
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
        {FILTER_DEFS.map(def => {
          return (
            <div key={def.key} style={{ padding: 8, border: "1px solid #eee", borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label htmlFor={`input-${def.key}`}>{def.label}</label>
                <input
                  id={`input-${def.key}`}
                  type="number"
                  value={Number.isFinite(values[def.key]) ? values[def.key] : def.def}
                  onChange={(e) => {
                    // 文本输入时立即应用；兜底避免 NaN/undefined
                    const raw = parseFloat(e.target.value);
                    const v = Number.isFinite(raw) ? clamp(raw, def.min, def.max) : def.def;
                    applyKey(def.key, v);
                  }}
                  step={def.step}
                  min={def.min}
                  max={def.max}
                  style={{ width: 90 }}
                  aria-label={def.label}
                />
              </div>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={Number.isFinite(values[def.key]) ? values[def.key] : def.def}
                onInput={(e) => {
                  // 拖动时仅更新本地显示值，不触发渲染
                  const raw = parseFloat((e.target as HTMLInputElement).value);
                  const v = Number.isFinite(raw) ? clamp(raw, def.min, def.max) : def.def;
                  setValues(prev => ({ ...prev, [def.key]: v }));
                }}
                onMouseUp={(e) => {
                  // 鼠标松开时才应用到 transforms
                  const raw = parseFloat((e.target as HTMLInputElement).value);
                  const v = Number.isFinite(raw) ? clamp(raw, def.min, def.max) : def.def;
                  applyKey(def.key, v);
                }}
                onTouchEnd={(e) => {
                  const target = e.target as HTMLInputElement;
                  const raw = parseFloat(target.value);
                  const v = Number.isFinite(raw) ? clamp(raw, def.min, def.max) : def.def;
                  applyKey(def.key, v);
                }}
                style={{ width: "100%" }}
                aria-label={def.label}
              />
            </div>
          );
        })}
      </div>



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
