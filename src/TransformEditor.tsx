import { useEffect, useRef, useState } from "react";
import "./transform-editor.css";
import { TransformData } from "./types/transform.ts";
import { exportScript, parseScript, applyFigureIDSystem, buildAnimationSequence } from "./utils/transformParser.ts";
import CanvasRenderer from "./components/CanvasRenderer.tsx";
import RotationPanel from "./components/RotationPanel";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { GuideLineType } from "./types/guideLines";
import WebGALMode from "./components/WebGALMode";
import { webgalFileManager } from "./utils/webgalFileManager";
import { figureManager } from "./utils/figureManager";


export default function TransformEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [input, setInput] = useState("");
  const [transforms, setTransforms] = useState<TransformData[]>([]);
  const [modelImg, setModelImg] = useState<HTMLImageElement | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  
  // 包装 setSelectedIndexes，过滤掉未启用的target
  const setSelectedIndexesFiltered = (indexes: number[] | ((prev: number[]) => number[])) => {
    setSelectedIndexes(prev => {
      const newIndexes = typeof indexes === 'function' ? indexes(prev) : indexes;
      // 如果启用了target过滤，则只保留启用的target
      if (enabledTargets.size > 0) {
        return newIndexes.filter(idx => {
          const t = transforms[idx];
          // 安全监测，确保t.target不为空
          if (!t || !t.target) return false;
          return enabledTargets.has(t.target);
        });
      }
      return newIndexes.filter(idx => {
        const t = transforms[idx];
        // 安全监测，确保t.target不为空
        if (!t || !t.target) return false;
        return true;
      });
    });
  };
  const [, setAllSelected] = useState(false);
  const [lockX, setLockX] = useState(false);
  const [lockY, setLockY] = useState(false);
  const [exportDuration, setExportDuration] = useState(500);
  const [ease, setEase] = useState<string>("easeInOut");
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const bgBaseScaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [filterPresets, setFilterPresets] = useState<Record<string, any>>({});
  const [enableFilterPreset, setEnableFilterPreset] = useState(true);
  const [lastAppliedPresetKeys, setLastAppliedPresetKeys] = useState<string[]>([]);
  const [applyFilterToBg, setApplyFilterToBg] = useState(false);
  
  const [guideLineType, setGuideLineType] = useState<GuideLineType>('none');
  // 观察层模式："none" | "color" | "luminosity"
  const [overlayMode, setOverlayMode] = useState<"none" | "color" | "luminosity">("none");
  // 启用的立绘和背景列表（Set<target>）
  const [enabledTargets, setEnabledTargets] = useState<Set<string>>(new Set());
  // 是否显示蓝色框选框
  const [showSelectionBox, setShowSelectionBox] = useState(true);
  // 是否显示角色ID
  const [showTargetId, setShowTargetId] = useState(true);
  // MyGO!!!!! 3.0 模式
  const [mygo3Mode, setMygo3Mode] = useState(false);
  
  // 画幅比选择（高度固定为1440）
  type AspectRatio = '16:9' | '21:9' | '1.85:1' | '16:10' | '4:3' | 'custom';
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [customWidth, setCustomWidth] = useState<number>(2560);
  
  // 根据画幅比和固定高度计算宽度
  const calculateWidth = (ratio: AspectRatio, custom: number = 2560): number => {
    const height = 1440;
    switch (ratio) {
      case '16:9':
        return 2560; // 16/9 * 1440 = 2560
      case '21:9':
        return Math.round((21 / 9) * height); // 21:9
      case '1.85:1':
        return Math.round(1.85 * height); // 1.85:1
      case '16:10':
        return Math.round((16 / 10) * height); // 16:10
      case '4:3':
        return Math.round((4 / 3) * height); // 4:3
      case 'custom':
        return custom;
      default:
        return 2560;
    }
  };
  
  const canvasHeight = 1440;
  const baseHeight = 1440;
  const canvasWidth = calculateWidth(aspectRatio, customWidth);
  const baseWidth = canvasWidth;
  
  // 自适应 textarea 高度
  // 动画播放相关状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationStartTime, setAnimationStartTime] = useState<number | null>(null);
  const [animationData, setAnimationData] = useState<any[]>([]);
  // 保存原始的 setTransform 状态（用于动画结束后恢复）
  const originalSetTransformsRef = useRef<Map<string, TransformData>>(new Map());
  // 保存原始的 outputScriptLines 字符串（用于避免精度损失）
  const originalOutputScriptLinesRef = useRef<string[]>([]);
  // 标记是否正在播放动画（用于防止 outputScriptLines 更新）
  const isAnimatingRef = useRef(false);
  // 标记是否刚刚从动画恢复（用于防止恢复后的 outputScriptLines 被覆盖）
  const justRestoredFromAnimationRef = useRef(false);
  // 动画状态 ref（用于优化性能，不触发 React 重新渲染）
  const animationStateRef = useRef<Map<string, any> | null>(null);
  // 动画帧计数器（用于减少 React state 更新频率）
  const animationFrameCounterRef = useRef(0);

  // WebGAL 模式相关状态
  const [selectedGameFolder, setSelectedGameFolder] = useState<string | null>(null);
  const [availableFigures, setAvailableFigures] = useState<string[]>([]);
  const [availableBackgrounds, setAvailableBackgrounds] = useState<string[]>([]);

  // 可编辑的 output script
  const [outputScriptLines, setOutputScriptLines] = useState<string[]>([]);
  // 保存完整的 outputScriptLines（不受断点影响）
  const fullOutputScriptLinesRef = useRef<string[]>([]);
  // 断点行索引集合
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  // 标记是否正在处理断点更新（防止循环更新）
  const isProcessingBreakpointRef = useRef(false);

  const scaleX = canvasWidth / baseWidth;
  const scaleY = canvasHeight / baseHeight;

  const modelOriginalWidth = 741;
  const modelOriginalHeight = 1123;
  const scaleModel = 1;
  const modelWidth = modelOriginalWidth * scaleModel;
  const modelHeight = modelOriginalHeight * scaleModel;

  function nextFigureName(list: TransformData[]) {
    let max = 0;
    for (const t of list) {
      const m = /^figure(\d+)$/.exec(t.target);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `figure${max + 1}`;
  }

  // WebGAL 模式处理函数
  const handleGameFolderSelect = async (folderPath: string | null) => {
    if (folderPath === null) {
      // 取消选择
      setSelectedGameFolder(null);
      setAvailableFigures([]);
      setAvailableBackgrounds([]);
      // 可以在这里清理 webgalFileManager 的状态，如果有相关方法的话
      return;
    }
    
    setSelectedGameFolder(folderPath);
    await webgalFileManager.setGameFolder(folderPath);
    
    setTimeout(() => {
      setAvailableFigures(webgalFileManager.getFigureFiles());
      setAvailableBackgrounds(webgalFileManager.getBackgroundFiles());
    }, 500);
  };

  const handleFileSelect = async (type: 'figure' | 'background', filename: string) => {
    // 获取文件路径（可能是 blob URL 或 HTTP URL）
    const fileUrl = await webgalFileManager[type === 'figure' ? 'getFigurePath' : 'getBackgroundPath'](filename);
    if (!fileUrl) {
      console.warn(`无法获取文件路径: ${filename}`);
      return;
    }

    // 确定完整文件路径（用于脚本导出）
    let filePath = filename;
    if (type === 'figure') {
      const fullPath = availableFigures.find(f => f === filename || f.endsWith(`/${filename}`) || f.endsWith(filename));
      if (fullPath) {
        filePath = fullPath;
      }
    } else {
      const fullPath = availableBackgrounds.find(f => f === filename || f.endsWith(`/${filename}`) || f.endsWith(filename));
      if (fullPath) {
        filePath = fullPath;
      }
    }

    // 检测文件类型（检查扩展名）
    const ext = filePath.split('.').pop()?.toLowerCase();
    const isJsonOrJsonl = ext === 'json' || ext === 'jsonl';
    const isMano = filePath.toLowerCase().includes('.char.json') || filePath.includes('type=webgal_mano');

    if (type === 'figure') {
      // 生成新的 figure id
      const figureId = nextFigureName(transforms);

      if (isJsonOrJsonl) {
        // 如果是 Mano 文件，自动添加参数
        let finalPath = filePath;
        // 如果是 .char.json 或者是满足 Mano 结构的 JSON
        // 自动添加 type=webgal_mano
        if (isMano && !finalPath.includes('type=webgal_mano')) {
          finalPath = `${finalPath}?type=webgal_mano`;
        }

        // Live2D 或 Mano 模型：等待加载完成后再添加 transform
        console.log(`✅ 准备加载模型: ${filename} (Mano: ${isMano})`);
        
        try {
          // 先加载模型
          await figureManager.addFigure(figureId, fileUrl, finalPath);
          console.log(`✅ 模型加载成功: ${filename}`);
          
          // 加载完成后再添加到 transforms
          setTransforms(prev => {
            const newChangeFigure: TransformData = {
              type: "changeFigure",
              path: finalPath,
              target: figureId,
              duration: 0,
              transform: {
                position: { x: 0, y: 0 },
                scale: { x: 1, y: 1 }
              },
              presetPosition: 'center',
              extraParams: {}
            };
            const newTransforms = [...prev, newChangeFigure];
            setSelectedIndexes([prev.length]);
            return newTransforms;
          });
        } catch (error) {
          console.error(`❌ 模型加载失败: ${filename}`, error);
          alert(`模型加载失败: ${error}`);
        }
      } else {
        // 普通图片：也通过 figureManager 加载，不设置全局 modelImg
        const img = new Image();
        img.onload = async () => {
          console.log(`✅ 已加载立绘: ${filename}`);
          
          try {
            // 使用 figureManager 加载图片
            await figureManager.addFigure(figureId, fileUrl, filePath);
            
            // 加载完成后再添加到 transforms
            setTransforms(prev => {
              const newChangeFigure: TransformData = {
                type: "changeFigure",
                path: filePath,
                target: figureId,
                duration: 0,
                transform: {
                  position: { x: 0, y: 0 },
                  scale: { x: 1, y: 1 }
                },
                presetPosition: 'center',
                extraParams: {}
              };
              const newTransforms = [...prev, newChangeFigure];
              setSelectedIndexes([prev.length]);
              return newTransforms;
            });
          } catch (error) {
            console.error(`❌ 图片加载到 figureManager 失败: ${filename}`, error);
            // 即使失败也添加 transform，让渲染器回退到其他方式
            setTransforms(prev => {
              const newChangeFigure: TransformData = {
                type: "changeFigure",
                path: filePath,
                target: figureId,
                duration: 0,
                transform: {
                  position: { x: 0, y: 0 },
                  scale: { x: 1, y: 1 }
                },
                presetPosition: 'center',
                extraParams: {}
              };
              const newTransforms = [...prev, newChangeFigure];
              setSelectedIndexes([prev.length]);
              return newTransforms;
            });
          }
        };
        img.onerror = () => {
          console.error(`❌ 图片加载失败: ${filename}`);
        };
        img.src = fileUrl;
      }
    } else {
      // 背景文件（通常不会是 json/jsonl，但为了安全也检查一下）
      if (isJsonOrJsonl) {
        console.warn(`⚠️ 背景文件不支持 Live2D 格式: ${filename}`);
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        setBgImg(img);
        console.log(`✅ 已加载背景: ${filename}`);
        
        // 添加到 transforms 数组
        setTransforms(prev => {
          const newChangeBg: TransformData = {
            type: "changeBg",
            path: filePath,
            target: "bg-main",
            duration: 0,
            transform: {
              position: { x: 0, y: 0 },
              scale: { x: 1, y: 1 }
            },
            extraParams: {}
          };
          const newTransforms = [...prev, newChangeBg];
          setSelectedIndexes([prev.length]);
          return newTransforms;
        });
      };
      img.onerror = () => {
        console.error(`❌ 背景图片加载失败: ${filename}`);
      };
      img.src = fileUrl;
    }
  };

  const parseAndLoadImages = async (script: string) => {
    if (!selectedGameFolder) return;

    const lines = script.split(";").map(line => line.trim()).filter(Boolean);
    
    for (const line of lines) {
      const figureMatch = line.match(/changeFigure:\s*([^\s,]+)/i);
      if (figureMatch) {
        const filename = figureMatch[1];
        console.log(`🔍 检测到 changeFigure 命令: ${filename}`);
        
        // 解析 target (id)
        const idMatch = line.match(/-id=([^\s,]+)/i);
        const targetKey = idMatch ? idMatch[1] : filename;
        
        const blobUrl = await webgalFileManager.getFigurePath(filename);
        if (blobUrl) {
          // 传入原始文件路径以正确识别文件类型
          const figure = await figureManager.addFigure(targetKey, blobUrl, filename);
          if (figure) {
            // 对于普通图片，设置 modelImg
            if (figure.rawImage && !modelImg) {
              setModelImg(figure.rawImage);
            }
            console.log(`✅ 自动加载立绘: ${filename} -> ${targetKey} (${figure.sourceType})`);
          }
        } else {
          console.warn(`⚠️ 找不到立绘文件: ${filename}`);
        }
      }

      const bgMatch = line.match(/changeBackground:\s*([^\s,]+)/i) || line.match(/changeBg:\s*([^\s,]+)/i);
      if (bgMatch) {
        const filename = bgMatch[1];
        console.log(`🔍 检测到背景切换命令: ${filename}`);
        const blobUrl = await webgalFileManager.getBackgroundPath(filename);
        if (blobUrl) {
          const img = new Image();
          img.onload = () => {
            setBgImg(img);
            console.log(`✅ 自动加载背景: ${filename}`);
          };
          img.src = blobUrl;
        } else {
          console.warn(`⚠️ 找不到背景文件: ${filename}`);
        }
      }
    }
  };

  // 真正的动画播放功能
  const playAnimation = () => {
    // 使用当前 transforms（包含所有已添加的 changeFigure 和 setTransform）
    // applyFigureIDSystem 现在不合并 setTransform，所以 transforms 应该同时包含两者
    if (transforms.length === 0) {
      alert("请先添加一些变换后再播放动画");
      return;
    }

    // 标记开始动画播放
    isAnimatingRef.current = true;
    
    // 保存原始的 outputScriptLines（用于避免精度损失）
    // 如果有断点，优先使用 fullOutputScriptLinesRef 保存的完整脚本
    if (breakpoints.size > 0 && fullOutputScriptLinesRef.current.length > 0) {
      originalOutputScriptLinesRef.current = [...fullOutputScriptLinesRef.current];
    } else {
      originalOutputScriptLinesRef.current = [...outputScriptLines];
    }
    
    // 在构建动画序列之前，先保存原始的 setTransform 状态（用于动画结束后恢复）
    // 直接从 outputScriptLines 提取原始值，避免重复缩放
    originalSetTransformsRef.current.clear();
    
    // 如果 outputScriptLines 存在，从中提取原始的 setTransform 值
    // outputScriptLines 中的值是逻辑坐标（通过 exportScript 转换的），需要转换为画布坐标
    if (outputScriptLines.length > 0) {
      outputScriptLines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('setTransform:')) {
          try {
            // 提取 JSON 字符串
            const jsonStr = trimmed.replace('setTransform:', '').split(' -')[0].trim();
            const json = JSON.parse(jsonStr);
            
            // 提取参数
            const paramStr = trimmed.replace('setTransform:' + jsonStr, '').trim();
            const params: Record<string, string> = {};
            paramStr.split(' -').forEach(part => {
              if (part.includes('=')) {
                const [k, v] = part.split('=').map(s => s.trim());
                params[k] = v;
              } else if (part.trim()) {
                params[part.trim()] = '';
              }
            });
            
            const target = params.target;
            if (target) {
              const transform: any = {
                ...json
              };
              
              if (json.position) {
                // outputScriptLines 中的值是逻辑坐标（通过 exportScript 转换的）
                // exportScript: 画布坐标 * (baseWidth/canvasWidth) = 逻辑坐标
                // 恢复时需要：逻辑坐标 / (baseWidth/canvasWidth) = 画布坐标
                // 即：逻辑坐标 * (canvasWidth/baseWidth) = 逻辑坐标 / scaleRatio = 画布坐标
                // scaleRatio = baseWidth / canvasWidth，所以：画布坐标 = 逻辑坐标 / scaleRatio = 逻辑坐标 * (canvasWidth/baseWidth)
                const scaleRatioX = baseWidth / canvasWidth;
                const scaleRatioY = baseHeight / canvasHeight;
                transform.position = {
                  x: json.position.x !== undefined && json.position.x !== null ? json.position.x / scaleRatioX : 0,
                  y: json.position.y !== undefined && json.position.y !== null ? json.position.y / scaleRatioY : 0
                };
              }
              
              // scale 不需要转换，直接使用
              if (!transform.scale) {
                transform.scale = { x: 1, y: 1 };
              }
              
              const originalState: TransformData = {
                type: 'setTransform',
                target: target,
                duration: parseInt(params.duration || '500'),
                transform: transform,
                ease: params.ease
              };
              
              originalSetTransformsRef.current.set(target, originalState);
              console.log(`🎬 保存原始 setTransform [${target}] (从 outputScriptLines):`, {
                transform,
                ease: originalState.ease,
                duration: originalState.duration,
                position: transform.position
              });
            }
          } catch (e) {
            console.warn('解析 outputScriptLines 中的 setTransform 失败:', e);
          }
        }
      });
    }
    
    // 如果从 outputScriptLines 没有找到，则从当前 transforms 中获取（向后兼容）
    if (originalSetTransformsRef.current.size === 0) {
      transforms.forEach(t => {
        if (t.type === 'setTransform' && t.target && !originalSetTransformsRef.current.has(t.target)) {
          // 深拷贝保存原始状态
          const originalState = JSON.parse(JSON.stringify(t));
          originalSetTransformsRef.current.set(t.target, originalState);
          console.log(`🎬 保存原始 setTransform [${t.target}] (从 transforms):`, originalState.transform);
        }
      });
    }

    // 创建临时的 transforms 数组，直接使用原始 transforms 的深拷贝
    // 不需要从 originalSetTransformsRef 恢复，因为 transforms 本身就是原始值
    const transformsForAnimation = transforms.map(t => {
      // 深拷贝所有 transform 对象，确保每个都是独立的
      return JSON.parse(JSON.stringify(t));
    });


    // 建立 outputScriptLines 到 transforms 的映射（每行脚本对应哪个 transform 索引）
    // 通过解析每行脚本来建立映射
    const transformIndexToScriptLineIndex = new Map<number, number>();
    if (outputScriptLines.length > 0) {
      outputScriptLines.forEach((line, scriptLineIndex) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('setTransform:')) {
          // 解析这一行，找到对应的 transform
          try {
            const jsonStr = trimmed.replace('setTransform:', '').split(' -')[0].trim();
            const json = JSON.parse(jsonStr);
            const paramStr = trimmed.replace('setTransform:' + jsonStr, '').trim();
            const params: Record<string, string> = {};
            paramStr.split(' -').forEach(part => {
              if (part.includes('=')) {
                const [k, v] = part.split('=').map(s => s.trim());
                params[k] = v;
              } else if (part.trim()) {
                params[part.trim()] = '';
              }
            });
            const target = params.target;

            // 在 transforms 中找到匹配的 setTransform
            if (target) {
              const transformIndex = transformsForAnimation.findIndex(t =>
                t.type === 'setTransform' &&
                t.target === target &&
                t.transform.position?.x === json.position?.x &&
                t.transform.position?.y === json.position?.y
              );
              if (transformIndex !== -1) {
                transformIndexToScriptLineIndex.set(transformIndex, scriptLineIndex);
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      });
    }

    // 使用新的动画序列构建函数
    // 使用包含原始值的 transforms 来构建动画序列
    console.log("🎬 构建动画序列，使用原始值的 transforms:", transformsForAnimation);
    const animationSequence = buildAnimationSequence(transformsForAnimation, transformIndexToScriptLineIndex);
    console.log("🎬 动画序列结果:", animationSequence);
    
    if (animationSequence.length === 0) {
      // 调试信息：显示 transforms 中实际包含的类型
      const hasChangeFigure = transformsForAnimation.some(t => t.type === 'changeFigure');
      const hasSetTransform = transformsForAnimation.some(t => t.type === 'setTransform');
      console.error("⚠️ 无法找到动画序列:", {
        transformsLength: transformsForAnimation.length,
        hasChangeFigure,
        hasSetTransform,
        transforms: transformsForAnimation.map(t => ({ type: t.type, target: t.target }))
      });
      // 清除动画标记
      isAnimatingRef.current = false;
      alert("⚠️ 没有找到任何可播放的动画序列（需要 changeFigure 和 setTransform 组合）");
      return;
    }

    // 在开始播放前，将 transforms 重置为初始状态（changeFigure/changeBg 的状态）
    // 找到每个 target 的初始 changeFigure/changeBg 状态
    const initialFigureStates = new Map<string, TransformData>();
    for (const transform of transforms) {
      if (transform.type === 'changeFigure' || transform.type === 'changeBg') {
        const figureID = transform.target;
        if (figureID && !initialFigureStates.has(figureID)) {
          initialFigureStates.set(figureID, { ...transform });
        }
      }
    }

    // 更新 transforms 为初始状态（changeFigure 的状态，不带动画）
    // 注意：现在需要更新 setTransform，而不是 changeFigure
    setTransforms(prev => {
      const newTransforms = [...prev];
      // 更新已有的 transform，保留其他属性但重置 transform
      initialFigureStates.forEach((initialState, figureID) => {
        // 查找对应的 setTransform（如果有）
        const setTransformIndex = newTransforms.findIndex(
          t => t.type === "setTransform" && t.target === figureID
        );
        
        if (setTransformIndex !== -1) {
          // 更新 setTransform 的 transform 为初始状态（changeFigure 的状态）
          newTransforms[setTransformIndex] = {
            ...newTransforms[setTransformIndex],
            transform: JSON.parse(JSON.stringify(initialState.transform))
          };
        } else {
          // 如果没有 setTransform，查找 changeFigure/changeBg（向后兼容）
          const changeIndex = newTransforms.findIndex(
            t => (t.type === "changeFigure" || t.type === "changeBg") && t.target === figureID
          );
          if (changeIndex !== -1) {
            newTransforms[changeIndex] = {
              ...newTransforms[changeIndex],
              transform: JSON.parse(JSON.stringify(initialState.transform))
            };
          }
        }
      });
      return newTransforms;
    });

    // 设置动画数据
    setAnimationData(animationSequence);
    
    // 使用 requestAnimationFrame 确保初始状态渲染完成后再开始动画计时
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPlaying(true);
        setAnimationStartTime(Date.now());
        console.log("🎬 开始播放动画:", animationSequence);
      });
    });
  };

  // 停止动画
  const stopAnimation = () => {
    setIsPlaying(false);
    setAnimationStartTime(null);
    setAnimationData([]);
    
    // 恢复原始的 setTransform 状态
    setTransforms(prev => {
      const newTransforms = [...prev];
      originalSetTransformsRef.current.forEach((originalSetTransform, target) => {
        const setTransformIndex = newTransforms.findIndex(
          t => t.type === "setTransform" && t.target === target
        );
        if (setTransformIndex !== -1) {
          // 恢复原始的 setTransform 状态
          newTransforms[setTransformIndex] = JSON.parse(JSON.stringify(originalSetTransform));
        }
      });
      return newTransforms;
    });
    
    // 恢复原始的 outputScriptLines（避免精度损失）
    // 如果有断点，优先使用 fullOutputScriptLinesRef 保存的完整脚本
    if (breakpoints.size > 0 && fullOutputScriptLinesRef.current.length > 0) {
      setOutputScriptLines([...fullOutputScriptLinesRef.current]);
      console.log(`⏹️ 恢复完整脚本（断点模式）`);
    } else if (originalOutputScriptLinesRef.current.length > 0) {
      setOutputScriptLines([...originalOutputScriptLinesRef.current]);
      console.log(`⏹️ 恢复原始 outputScriptLines (避免精度损失)`);
    }
    // 标记刚刚从动画恢复，让 useEffect 跳过下一次更新
    justRestoredFromAnimationRef.current = true;
    
    // 清空保存的原始状态
    originalSetTransformsRef.current.clear();
    originalOutputScriptLinesRef.current = [];
    // 清除动画标记，允许 outputScriptLines 更新
    isAnimatingRef.current = false;
    console.log("⏹️ 动画已停止");
  };

  // 缓动函数实现 - 完全匹配 popmotion
  const easeFunctions = {
    easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeIn: (t: number) => t * t,
    easeOut: (t: number) => t * (2 - t),
    circInOut: (t: number) => t < 0.5 ? 0.5 * (1 - Math.cos(Math.PI * t)) : 0.5 * (1 + Math.cos(Math.PI * (t - 1))),
    circIn: (t: number) => 1 - Math.sqrt(1 - t * t),
    circOut: (t: number) => Math.sqrt(1 - (t - 1) * (t - 1)),
    backInOut: (t: number) => t < 0.5 ? 0.5 * (2 * t * t * (3.5949095 * t - 2.5949095)) : 0.5 * (2 * (t - 1) * (t - 1) * (3.5949095 * (t - 1) + 2.5949095) + 1),
    backIn: (t: number) => t * t * (2.5949095 * t - 1.5949095),
    backOut: (t: number) => (t - 1) * (t - 1) * (2.5949095 * (t - 1) + 1.5949095) + 1,
    bounceInOut: (t: number) => {
      if (t < 0.5) return 0.5 * (1 - easeFunctions.bounceOut(1 - 2 * t));
      return 0.5 * easeFunctions.bounceOut(2 * t - 1) + 0.5;
    },
    bounceIn: (t: number) => 1 - easeFunctions.bounceOut(1 - t),
    bounceOut: (t: number) => {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
      if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    },
    linear: (t: number) => t,
    anticipate: (t: number) => t * t * (2.70158 * t - 1.70158)
  };

  // 计算当前动画状态
  const getCurrentAnimationState = () => {
    if (!isPlaying || !animationStartTime || animationData.length === 0) {
      return null;
    }

    const currentTime = Date.now() - animationStartTime;
    const maxEndTime = Math.max(...animationData.map(a => a.endTime));
    
    if (currentTime >= maxEndTime) {
      // 动画结束（但不在这里设置 isPlaying(false)，让动画循环处理）
      // 返回 null 表示动画结束，动画循环会处理恢复逻辑
      return null;
    }

    // 按 target 分组，每组取最新的有效动画状态
    const targetStates = new Map<string, any>();
    
    // 先找到每个 target 的第一个动画的 startState 作为初始状态（changeFigure 的状态）
    const initialStates = new Map<string, any>();
    for (const animation of animationData) {
      const { target, startState } = animation;
      if (!initialStates.has(target)) {
        // 深拷贝初始状态
        initialStates.set(target, JSON.parse(JSON.stringify(startState)));
      }
    }
    
    // 首先，将所有 figure 设置为初始状态（changeFigure 的状态，不带动画）
    initialStates.forEach((initialState, target) => {
      targetStates.set(target, {
        target,
        transform: JSON.parse(JSON.stringify(initialState))
      });
    });
    
    // 然后，计算每个动画的当前状态（覆盖初始状态）
    for (const animation of animationData) {
      const { target, startState, endState, startTime, endTime, ease } = animation;
      
      // 如果动画还没开始，保持初始状态（已经在上面设置了）
      if (currentTime < startTime) {
        // 不需要做任何事，初始状态已经在上面设置了
        continue;
      }
      // 如果当前时间在这个动画的时间范围内
      else if (currentTime >= startTime && currentTime <= endTime) {
        const duration = endTime - startTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
       
               // 应用缓动函数 - 确保 ease 值有效
        let easedProgress = progress;
        if (ease && ease !== "" && easeFunctions[ease as keyof typeof easeFunctions]) {
          // 使用 transform 自己的 ease
          easedProgress = easeFunctions[ease as keyof typeof easeFunctions](progress);
        } else {
          // 使用全局 ease
          if (easeFunctions[ease as keyof typeof easeFunctions]) {
            easedProgress = easeFunctions[ease as keyof typeof easeFunctions](progress);
          }
        }
      
        // 确保 startState 和 endState 都有必需的属性
        const startPosition = startState.position || { x: 0, y: 0 };
        const endPosition = endState.position || { x: 0, y: 0 };
        const startScale = startState.scale || { x: 1, y: 1 };
        const endScale = endState.scale || { x: 1, y: 1 };

        // 调试：打印 scale 信息
        if (target === 'bg-main') {
          console.log(`🎬 动画插值 target=${target}: progress=${easedProgress.toFixed(3)}`);
          console.log(`🎬   startScale: ${JSON.stringify(startScale)}, endScale: ${JSON.stringify(endScale)}`);
        }

        // 插值计算当前位置
        const currentPosition = {
          x: startPosition.x + (endPosition.x - startPosition.x) * easedProgress,
          y: startPosition.y + (endPosition.y - startPosition.y) * easedProgress
        };
        
        // 插值计算当前缩放
        const currentScale = {
          x: startScale.x + (endScale.x - startScale.x) * easedProgress,
          y: startScale.y + (endScale.y - startScale.y) * easedProgress
        };
        
        // 调试：打印计算结果
        if (target === 'bg-main') {
          console.log(`🎬   计算出的 currentScale: ${JSON.stringify(currentScale)}`);
        }

        // 插值计算当前旋转
        const currentRotation = (startState.rotation || 0) + ((endState.rotation || 0) - (startState.rotation || 0)) * easedProgress;
        
        // 合并所有滤镜效果
        const currentTransform: any = {
          position: currentPosition,
          scale: currentScale,
          rotation: currentRotation
        };
        
        // 复制所有其他属性（滤镜等）
        for (const key in endState) {
          if (key !== 'position' && key !== 'scale' && key !== 'rotation' && endState[key] !== undefined) {
            const startValue = startState[key] !== undefined ? startState[key] : 0;
            currentTransform[key] = startValue + (endState[key] - startValue) * easedProgress;
          }
        }
        
        // 存储或更新该 target 的状态（如果有多个动画，取最新的）
        targetStates.set(target, {
          target,
          transform: currentTransform
        });
      } else if (currentTime > endTime) {
        // 动画已结束，保持结束状态
        // 深拷贝 endState 以确保所有属性都被保留（包括合并后的 scale 等）
        const currentTransform = JSON.parse(JSON.stringify(endState));
        
        // 确保 position 和 scale 是对象
        if (!currentTransform.position) {
          currentTransform.position = { x: 0, y: 0 };
        }
        if (!currentTransform.scale) {
          currentTransform.scale = { x: 1, y: 1 };
        }
        if (currentTransform.rotation === undefined) {
          currentTransform.rotation = 0;
        }
        
        targetStates.set(target, {
          target,
          transform: currentTransform
        });
      }
    }
    
    // 返回所有 target 的状态数组
    return Array.from(targetStates.values());
  };

  // 更新滤镜编辑器窗口的数据（使用全局事件）
  const updateFilterEditorWindow = async () => {
    try {
      await emit('filter-editor:update-data', {
        transforms,
        selectedIndexes,
        applyFilterToBg,
        selectedGameFolder: selectedGameFolder || webgalFileManager.getGameFolder() || null
      });
    } catch (error) {
      console.error('更新滤镜编辑器窗口失败:', error);
    }
  };

  // 更新脚本输出窗口的数据（使用全局事件）
  const updateScriptOutputWindow = async () => {
    try {
      // 优先使用完整的脚本行（fullOutputScriptLinesRef），如果没有则使用 outputScriptLines
      let linesToSend = fullOutputScriptLinesRef.current.length > 0
        ? fullOutputScriptLinesRef.current
        : outputScriptLines;

      // 如果还是为空，则从 transforms 生成
      if (linesToSend.length === 0 && Array.isArray(transforms) && transforms.length > 0) {
        const script = exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease);
        linesToSend = script.split('\n').filter(line => line.trim().length > 0);
        fullOutputScriptLinesRef.current = linesToSend; // 保存完整脚本
      }

      await emit('script-output:update-data', {
        outputScriptLines: linesToSend,
        transforms,
        scaleX,
        scaleY,
        canvasWidth,
        canvasHeight,
        baseWidth,
        baseHeight,
        exportDuration,
        ease,
        selectedGameFolder
      });

      // 同时发送选中的索引
      await emit('script-output:selected-indexes-updated', {
        selectedIndexes: selectedIndexes
      });
    } catch (error) {
      console.error('更新脚本输出窗口失败:', error);
    }
  };

  // 监听来自滤镜编辑器窗口的 transforms 更新
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<{ transforms: TransformData[] }>(
        'filter-editor:transforms-changed',
        (event) => {
          // 安全检查：确保 transforms 是数组
          if (event.payload && Array.isArray(event.payload.transforms)) {
            setTransforms(event.payload.transforms);
          } else {
            console.warn('接收到无效的 transforms 数据:', event.payload);
          }
        }
      );
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;
    setupListener().then(fn => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // 监听来自脚本输出窗口的 transforms 更新
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<{ transforms: TransformData[] }>(
        'script-output:transforms-changed',
        async (event) => {
          // 安全检查：确保 transforms 是数组
          if (event.payload && Array.isArray(event.payload.transforms)) {
            // 如果启用了 WebGAL 模式，需要重新加载图片
            // 注意：脚本输出窗口已经解析了脚本，但我们需要确保图片被正确加载
            // 这里我们直接设置 transforms，因为脚本输出窗口已经处理了解析
            setTransforms(event.payload.transforms);
            // 清理无效的 selectedIndexes（索引超出新数组范围）
            setSelectedIndexes(prev => {
              const newTransformsLength = event.payload.transforms.length;
              return prev.filter(index => index >= 0 && index < newTransformsLength);
            });
          } else {
            console.warn('接收到无效的 transforms 数据:', event.payload);
          }
        }
      );
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;
    setupListener().then(fn => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // 监听来自脚本输出窗口的断点更新
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<{ breakpoints: number[] }>(
        'script-output:breakpoints-changed',
        async (event) => {
          // 防止重复处理
          if (isProcessingBreakpointRef.current) {
            return;
          }

          // 安全检查：确保 breakpoints 是数组
          if (event.payload && Array.isArray(event.payload.breakpoints)) {
            isProcessingBreakpointRef.current = true;

            try {
              const newBreakpoints = new Set(event.payload.breakpoints);
              setBreakpoints(newBreakpoints);

              // 使用完整的脚本行（保存的完整脚本或当前的 outputScriptLines）
              const fullScriptLines = fullOutputScriptLinesRef.current.length > 0
                ? fullOutputScriptLinesRef.current
                : outputScriptLines;

              // 如果有断点，重新解析脚本但只到第一个断点行为止
              if (newBreakpoints.size > 0 && fullScriptLines.length > 0) {
                // 找到最小的断点索引（第一个断点）
                const minBreakpointIndex = Math.min(...Array.from(newBreakpoints));

                // 只解析到断点行为止的脚本
                const scriptToBreakpoint = fullScriptLines.slice(0, minBreakpointIndex + 1).join('\n');

                try {
                  // 先确保 fullOutputScriptLinesRef 保存了完整脚本（在更新 transforms 之前）
                  fullOutputScriptLinesRef.current = fullScriptLines;
                  setOutputScriptLines(fullScriptLines);

                  // 解析脚本
                  const parsed = parseScript(scriptToBreakpoint, scaleX, scaleY).map((t) => {
                    const { __presetApplied, ...rest } = t as any;
                    return rest;
                  });

                  // 应用 figureID 系统
                  const merged = applyFigureIDSystem(parsed);

                  // 如果启用了 WebGAL 模式，自动加载图片
                  if (selectedGameFolder && scriptToBreakpoint.trim()) {
                    await parseAndLoadImages(scriptToBreakpoint);
                  }

                  // 更新 transforms（只包含断点之前的内容）
                  setTransforms(merged);

                  // 手动更新脚本输出窗口，确保发送完整脚本
                  setTimeout(() => {
                    updateScriptOutputWindow();
                  }, 50);

                  console.log(`🛑 应用断点: 只显示到脚本行 ${minBreakpointIndex + 1} 为止`);
                } catch (error) {
                  console.error("❌ 解析断点脚本失败:", error);
                }
              } else if (newBreakpoints.size === 0) {
                // 如果没有断点，恢复完整的脚本
                if (fullScriptLines.length > 0) {
                  const fullScript = fullScriptLines.join('\n');
                  try {
                    // 先确保 fullOutputScriptLinesRef 保存了完整脚本
                    fullOutputScriptLinesRef.current = fullScriptLines;
                    setOutputScriptLines(fullScriptLines);

                    const parsed = parseScript(fullScript, scaleX, scaleY).map((t) => {
                      const { __presetApplied, ...rest } = t as any;
                      return rest;
                    });

                    const merged = applyFigureIDSystem(parsed);

                    if (selectedGameFolder && fullScript.trim()) {
                      await parseAndLoadImages(fullScript);
                    }

                    setTransforms(merged);

                    // 手动更新脚本输出窗口，确保发送完整脚本
                    setTimeout(() => {
                      updateScriptOutputWindow();
                    }, 50);

                    console.log(`▶️ 移除断点: 恢复完整脚本`);
                  } catch (error) {
                    console.error("❌ 解析完整脚本失败:", error);
                  }
                }
              }
            } finally {
              // 延迟重置标记，确保所有更新完成
              setTimeout(() => {
                isProcessingBreakpointRef.current = false;
              }, 100);
            }
          } else {
            console.warn('接收到无效的断点数据:', event.payload);
          }
        }
      );
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;
    setupListener().then(fn => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [scaleX, scaleY, selectedGameFolder]); // 移除 outputScriptLines 依赖，避免循环

  // 当 outputScriptLines 或相关参数更新时，更新脚本输出窗口
  useEffect(() => {
    // 如果正在处理断点更新，跳过
    if (isProcessingBreakpointRef.current) {
      return;
    }
    // 只有在 transforms 是有效数组时才更新
    if (Array.isArray(transforms)) {
      updateScriptOutputWindow();
    }
  }, [outputScriptLines, transforms, scaleX, scaleY, canvasWidth, canvasHeight, baseWidth, baseHeight, exportDuration, ease, selectedGameFolder, selectedIndexes]);

  // 当 transforms、selectedIndexes 或 applyFilterToBg 变化时，更新滤镜编辑器窗口
  useEffect(() => {
    // 只有在 transforms 是有效数组时才更新
    if (Array.isArray(transforms)) {
      updateFilterEditorWindow();
    }
  }, [transforms, selectedIndexes, applyFilterToBg]);

  // 在不开启webgal模式或没有对应文件的情况下的默认图片
  useEffect(() => {
    const model = new Image();
    model.src = "./assets/sakiko_girlfriend.png"; // 私货
    model.onload = () => setModelImg(model);

    const bg = new Image();
    bg.src = "./assets/bg.png";
    bg.onload = () => setBgImg(bg);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvasWidth / rect.width);
      const my = (e.clientY - rect.top) * (canvasHeight / rect.height);
      const logicX = (mx - canvasWidth / 2) / scaleX;
      const logicY = (my - canvasHeight / 2) / scaleY;
      setMousePos({ x: logicX, y: logicY });
    };
    const handleLeave = () => setMousePos(null);

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseleave", handleLeave);
    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
    };
  }, [canvasRef.current, canvasWidth, canvasHeight]);

  // 动画循环
  useEffect(() => {
    if (!isPlaying) return;

    const animationLoop = () => {
      const currentState = getCurrentAnimationState();
      if (currentState && Array.isArray(currentState)) {
        // 优化性能：使用 ref 存储动画状态，避免触发 React 重新渲染
        // 将动画状态转换为 Map 格式，便于快速查找
        const stateMap = new Map<string, any>();
        currentState.forEach((animState: any) => {
          stateMap.set(animState.target, animState.transform);
        });
        animationStateRef.current = stateMap;
        
        // 减少更新频率：只在关键帧更新 React state（每 3 帧更新一次，约 20fps）
        // 但动画状态 ref 仍然每帧更新，保证动画流畅
        if (!animationFrameCounterRef.current) {
          animationFrameCounterRef.current = 0;
        }
        animationFrameCounterRef.current++;
                
        // 继续动画循环
        requestAnimationFrame(animationLoop);
      } else if (currentState === null) {
        // 先恢复 setTransform，再设置 isPlaying(false)，确保 outputScriptLines 同步时使用恢复后的值
        setTransforms(prev => {
          const newTransforms = [...prev];
          originalSetTransformsRef.current.forEach((originalSetTransform, target) => {
            const setTransformIndex = newTransforms.findIndex(
              t => t.type === "setTransform" && t.target === target
            );
            if (setTransformIndex !== -1) {
              // 恢复原始的 setTransform 状态
              const restored = JSON.parse(JSON.stringify(originalSetTransform));
              newTransforms[setTransformIndex] = restored;
            }
          });
          return newTransforms;
        });
        
        // 标记刚刚从动画恢复，让 useEffect 跳过更新（必须在恢复之前设置）
        justRestoredFromAnimationRef.current = true;
        
        // 清除动画状态 ref（先清除，避免动画循环继续更新）
        animationStateRef.current = null;
        animationFrameCounterRef.current = 0;
        
        // 设置状态（但保持 justRestoredFromAnimationRef 为 true，防止 useEffect 覆盖）
        setIsPlaying(false);
        setAnimationStartTime(null);
        isAnimatingRef.current = false;
        
        // 使用 setTimeout 确保 transforms 恢复完成后再重新生成 outputScriptLines
        setTimeout(() => {
          // 使用函数式更新，确保使用最新的 transforms 值（恢复后的值）
          setTransforms(currentTransforms => {
            // 验证恢复后的 setTransform 是否正确
            console.log('🔍 验证恢复后的 transforms:', currentTransforms.filter(t => t.type === 'setTransform').map(t => ({
              target: t.target,
              position: t.transform.position
            })));
            
            // 如果有断点，优先使用 fullOutputScriptLinesRef 保存的完整脚本
            if (breakpoints.size > 0 && fullOutputScriptLinesRef.current.length > 0) {
              setOutputScriptLines([...fullOutputScriptLinesRef.current]);
              console.log(`🎬 恢复完整脚本（断点模式）`);
            } else {
              // 基于恢复后的 transforms 重新生成 outputScriptLines
              const script = exportScript(currentTransforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease);
              const lines = script.split('\n').filter(line => line.trim().length > 0);
              setOutputScriptLines(lines);
              fullOutputScriptLinesRef.current = lines; // 保存完整脚本
              console.log(`🎬 基于恢复后的 transforms 重新生成 outputScriptLines`);
            }
            
            // 清空保存的原始状态（在重新生成 outputScriptLines 后再清空）
            originalSetTransformsRef.current.clear();
            originalOutputScriptLinesRef.current = [];
            
            // 手动更新脚本输出窗口，确保发送完整脚本（如果有断点）
            if (breakpoints.size > 0) {
              setTimeout(() => {
                updateScriptOutputWindow();
              }, 50);
            }

            // 再延迟一次，确保 outputScriptLines 更新完成后再允许 useEffect 正常更新
            setTimeout(() => {
              justRestoredFromAnimationRef.current = false;
            }, 100);
            
            // 返回当前值，不修改 transforms
            return currentTransforms;
          });
        }, 50);
        
        return;
      } else {
        // 继续循环等待动画开始
        requestAnimationFrame(animationLoop);
      }
    };

    requestAnimationFrame(animationLoop);
  }, [isPlaying, animationData, animationStartTime]);

  useEffect(() => {
    fetch("/filter-presets.json")
      .then((res) => res.json())
      .then((data) => setFilterPresets(data))
      .catch((err) => console.error("❌ Failed to load filter presets:", err));
  }, []);

  // 当 transforms 更新时，自动将所有新的 target 添加到 enabledTargets（默认全部启用）
  // 使用 useRef 来存储上一次的 targets 集合，避免不必要的更新
  const prevTargetsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (transforms.length > 0) {
      const targets = new Set<string>();
      transforms.forEach(t => {
        if (t.type === 'changeFigure' || t.type === 'changeBg') {
          targets.add(t.target);
        }
      });
      
      // 比较 targets 集合是否有变化（使用字符串集合比较）
      const currentTargetsStr = Array.from(targets).sort().join(',');
      const prevTargetsStr = Array.from(prevTargetsRef.current).sort().join(',');
      
      // 如果 targets 集合没有变化（只是 transforms 数组引用改变了），不更新 enabledTargets
      if (currentTargetsStr === prevTargetsStr) {
        return;
      }
      
      // 更新 ref
      prevTargetsRef.current = new Set(targets);
      
      // 如果当前 enabledTargets 为空，或者有新的 target 出现，自动添加到 enabledTargets
      const currentTargets = Array.from(enabledTargets);
      const allTargets = Array.from(targets);
      const newTargets = allTargets.filter(t => !enabledTargets.has(t));
      const removedTargets = currentTargets.filter(t => !targets.has(t));
      
      // 只在以下情况更新：
      // 1. 第一次加载（enabledTargets 为空）- 全部启用
      // 2. 有新的 target 出现 - 只添加新的 target，保留现有的选择
      // 3. 有 target 被移除 - 从 enabledTargets 中移除不存在的 target
      if (currentTargets.length === 0) {
        // 第一次加载，全部启用
        setEnabledTargets(new Set(allTargets));
      } else if (newTargets.length > 0 || removedTargets.length > 0) {
        // 有新 target 出现或旧 target 被移除，只更新变化的部分，保留其他选择
        const updatedTargets = new Set(enabledTargets);
        newTargets.forEach(target => updatedTargets.add(target));
        removedTargets.forEach(target => updatedTargets.delete(target));
        setEnabledTargets(updatedTargets);
      }
    } else {
      // 如果 transforms 为空，清空 enabledTargets
      if (enabledTargets.size > 0) {
        setEnabledTargets(new Set());
      }
      prevTargetsRef.current = new Set();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transforms]);

  // 同步 transforms 到 outputScript
  // 注意：动画播放时，不更新 outputScript，保持原始代码不变
  useEffect(() => {
    // 如果正在处理断点更新，跳过
    if (isProcessingBreakpointRef.current) {
      return;
    }
    // 双重检查：既检查 isPlaying 状态，也检查 ref 标记
    if (isPlaying || isAnimatingRef.current) {
      // 动画播放时，不更新 outputScript
      return;
    }
    // 如果刚刚从动画恢复，跳过这次更新，避免覆盖恢复的 outputScriptLines
    if (justRestoredFromAnimationRef.current) {
      // 不立即设置为 false，保持为 true 直到下一次真正需要更新
      // 这样可以避免恢复后的多次 useEffect 触发
      // 但在最后一次确认后，需要允许更新以确保 transforms 和 outputScriptLines 同步
      return;
    }
    // 如果有断点，需要更新完整脚本（fullOutputScriptLinesRef）
    // 但保持 outputScriptLines 不变（只显示到断点位置）
    if (breakpoints.size > 0) {
      if (Array.isArray(transforms) && fullOutputScriptLinesRef.current.length > 0) {
        try {
          // 从 transforms 重新生成脚本（只包含断点之前的内容）
          const script = exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease);
          const lines = script.split('\n').filter(line => line.trim().length > 0);
          
          // 更新完整脚本：将断点之前的部分替换为新生成的脚本，保留断点之后的部分
          const minBreakpointIndex = Math.min(...Array.from(breakpoints));
          const newFullScriptLines = [...fullOutputScriptLinesRef.current];
          // 替换断点之前的部分
          newFullScriptLines.splice(0, minBreakpointIndex + 1, ...lines);
          fullOutputScriptLinesRef.current = newFullScriptLines;
          
          // 更新 outputScriptLines（只显示到断点位置）
          setOutputScriptLines(newFullScriptLines.slice(0, minBreakpointIndex + 1));
        } catch (error) {
          console.error("❌ 同步 transforms 到 outputScript 失败:", error);
        }
      }
      return;
    }
    if (Array.isArray(transforms)) {
      try {
        const script = exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease);
        const lines = script.split('\n').filter(line => line.trim().length > 0);
        setOutputScriptLines(lines);
        fullOutputScriptLinesRef.current = lines; // 保存完整脚本
      } catch (error) {
        console.error("❌ 同步 transforms 到 outputScript 失败:", error);
      }
    }
  }, [transforms, exportDuration, ease, canvasWidth, canvasHeight, baseWidth, baseHeight, isPlaying, breakpoints]);

  // 注意：output script 的编辑处理由 ScriptOutputWindow 组件通过事件系统处理
  // 脚本输出窗口会发送 'script-output:transforms-changed' 事件，主窗口监听该事件并更新 transforms






  return (
    <div
      className="transform-editor-container"
      style={{ maxHeight: "100vh", overflowY: "auto", boxSizing: "border-box", margin: "0 auto" }}
    >
      <h2>EASTMOUNT WEBGAL TRANSFORM EDITOR</h2>

      {/* 画幅比选择 */}
      <div style={{ 
        marginBottom: "16px", 
        padding: "12px", 
        backgroundColor: "#f9f9f9", 
        borderRadius: "6px",
        border: "1px solid #ddd",
        maxWidth: 780,
        marginLeft: "auto",
        marginRight: "auto"
      }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "nowrap" }}>
          <label style={{ 
            fontSize: "14px", 
            fontWeight: "600", 
            color: "#374151",
            whiteSpace: "nowrap"
          }}>
            画幅比选择：
          </label>
          <select
            value={aspectRatio}
            onChange={(e) => {
              const ratio = e.target.value as AspectRatio;
              setAspectRatio(ratio);
              if (ratio !== 'custom') {
                // 切换到预设画幅比时，自动计算宽度
                const width = calculateWidth(ratio);
                setCustomWidth(width);
              }
            }}
            aria-label="选择画幅比"
            title="选择画幅比"
            style={{
              padding: "6px 12px",
              fontSize: "14px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              backgroundColor: "#ffffff",
              cursor: "pointer"
            }}
          >
            <option value="16:9">16:9 (2560×1440)</option>
            <option value="21:9">21:9 (3360×1440)</option>
            <option value="1.85:1">1.85:1 (2664×1440)</option>
            <option value="16:10">16:10 (2304×1440)</option>
            <option value="4:3">4:3 (1920×1440)</option>
            <option value="custom">自定义</option>
          </select>
          
          {aspectRatio === 'custom' && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "14px", color: "#374151" }}>宽度：</label>
              <input
                type="number"
                value={customWidth}
                onChange={(e) => {
                  const width = parseInt(e.target.value) || 2560;
                  setCustomWidth(width);
                }}
                min={100}
                max={10000}
                step={1}
                aria-label="自定义宽度"
                title="自定义宽度"
                placeholder="宽度"
                style={{
                  padding: "4px 8px",
                  fontSize: "14px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  width: "120px"
                }}
              />
              <span style={{ fontSize: "14px", color: "#666" }}>× 1440</span>
            </div>
          )}
          
          <span style={{ fontSize: "14px", color: "#666", whiteSpace: "nowrap" }}>
            当前画幅：{canvasWidth} × {canvasHeight}
          </span>
        </div>
      </div>

      <p
        style={{
          backgroundColor: "#eef6ff",
          color: "#333",
          padding: "10px 14px",
          borderRadius: "6px",
          fontSize: "14px",
          border: "1px solid #cde1f9",
          maxWidth: 780,
          margin: "10px auto",
        }}
      >
        💡 <strong>操作提示：</strong>
        <br />・Ctrl + 滚轮：缩放模型/背景 ・Alt + 拖动：旋转选中对象 ・Shift + 点击：多选对象
        <br /> ・如何更改webgal的画幅比，能可以根据b站视频教程更改
        <br />・关注 B站<strong>东山燃灯寺</strong> 谢谢喵~
      </p>

      <textarea
        style={{ width: 1080, height: 100 }}
        placeholder="Paste your setTransform script here"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <br />
      <WebGALMode
        onFolderSelect={handleGameFolderSelect}
        onFileSelect={handleFileSelect}
        selectedFolder={selectedGameFolder}
        availableFigures={availableFigures}
        availableBackgrounds={availableBackgrounds}
      />
      <br />
             <button
        onClick={async () => {
          const parsed = parseScript(input, scaleX, scaleY).map((t) => {
            const { __presetApplied, ...rest } = t as any;
            return rest;
          });
          
          // 应用 figureID 系统：合并相同 figureID 的状态
          const merged = applyFigureIDSystem(parsed);
          
          if (merged.length === 0) alert("⚠️ 没有解析到任何指令！");
          
                      // 检测导入的脚本中的 ease 值，并更新全局设置
           const setTransformItems = merged.filter(t => t.type === 'setTransform');
           if (setTransformItems.length > 0) {
             // 如果存在 setTransform，使用第一个的 ease 值作为全局默认值
             const firstEase = setTransformItems[0].ease;
             if (firstEase && firstEase !== "") {
               setEase(firstEase);
               console.log(`🎯 检测到导入脚本的 ease 值: ${firstEase}，已更新全局设置`);
             }
           }
          
          // 如果启用了 WebGAL 模式，自动加载图片
          if (selectedGameFolder) {
            await parseAndLoadImages(input);
          }
          
          // 保存合并后的 transforms（用于渲染）
          setTransforms(merged);
           setAllSelected(false);
           setSelectedIndexes([]);

          // 立即生成 outputScriptLines（确保窗口打开时有数据）
          const script = exportScript(merged, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease);
          const lines = script.split('\n').filter(line => line.trim().length > 0);
          setOutputScriptLines(lines);
          fullOutputScriptLinesRef.current = lines; // 保存完整脚本

         }}
       >
         Load Script
       </button>
      {/* <button
        onClick={() => {
          const script = exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight);
          navigator.clipboard.writeText(script);
          alert("Script copied!");
        }}
      >
        Copy Output Script
      </button> */}
      <button
        onClick={() => {
          setSelectedIndexes(transforms.map((_, i) => i));
          setAllSelected(true);
        }}
      >
        Select All
      </button>
      <button
        onClick={() => {
          setSelectedIndexes([]);
          setAllSelected(false);
        }}
      >
        Deselect All
      </button>
      <button
        onClick={() => {
          const name = nextFigureName(transforms);

          // 查找该 target 最近的 changeFigure 或 setTransform（从后往前找）
          let inheritedTransform: any = {};
          for (let i = transforms.length - 1; i >= 0; i--) {
            const t = transforms[i];
            if ((t.type === "changeFigure" || t.type === "setTransform") && t.target === name) {
              // 找到最近的，继承其 transform 值
              if (t.transform) {
                if (t.transform.position) {
                  inheritedTransform.position = { ...t.transform.position };
                }
                if (t.transform.scale) {
                  inheritedTransform.scale = { ...t.transform.scale };
                }
                if (t.transform.rotation !== undefined) {
                  inheritedTransform.rotation = t.transform.rotation;
                }
              }
              break; // 找到最近的，退出循环
            }
          }

          // 如果没有找到任何值，使用默认值
          if (Object.keys(inheritedTransform).length === 0) {
            inheritedTransform.position = { x: 0, y: 0 };
            inheritedTransform.scale = { x: 1, y: 1 };
          }

          const newItem: TransformData = {
            type: "setTransform",
            target: name,
            duration: 0,
            transform: inheritedTransform,
            next: true, // 默认启用 next
          };
          (newItem as any).presetPosition = "center";
          setTransforms((prev) => [...prev, newItem]);
          setSelectedIndexes([transforms.length]);
        }}
      >
        + Add setTransform
      </button>
      <button
        onClick={() => {
          // 收集所有需要添加 setTransform 的 targets
          const targetsToAdd = new Set<string>();
          
          // 找到所有立绘（changeFigure 类型）
          transforms.forEach((t) => {
            if (t.type === "changeFigure" && t.target) {
              targetsToAdd.add(t.target);
            }
          });
          
          // 检查是否有背景（changeBg 类型或 target === "bg-main"）
          const hasBackground = transforms.some(
            (t) => t.type === "changeBg" || (t.target === "bg-main")
          );
          if (hasBackground) {
            targetsToAdd.add("bg-main");
          }
          
          // 给所有targets添加setTransform
          const targetsWithoutSetTransform = Array.from(targetsToAdd);
          
          // 为每个 target 创建新的 setTransform，继承最近的 changeFigure 或 setTransform
          const newItems: TransformData[] = targetsWithoutSetTransform.map((target) => {
            // 从后往前查找该 target 最近的 changeFigure 或 setTransform（对于背景还包括 changeBg）
            let inheritedTransform: any = {};

            for (let i = transforms.length - 1; i >= 0; i--) {
              const t = transforms[i];
              // 对于普通 figure，查找 changeFigure 或 setTransform
              // 对于背景，查找 changeBg 或 setTransform（target === "bg-main"）
              const isMatch = target === "bg-main"
                ? ((t.type === "changeBg" || t.type === "setTransform") && t.target === "bg-main")
                : ((t.type === "changeFigure" || t.type === "setTransform") && t.target === target);

              if (isMatch) {
                // 找到最近的，继承其 transform 值
                if (t.transform) {
                  if (t.transform.position) {
                    inheritedTransform.position = { ...t.transform.position };
                  }
                  if (t.transform.scale) {
                    inheritedTransform.scale = { ...t.transform.scale };
                  }
                  if (t.transform.rotation !== undefined) {
                    inheritedTransform.rotation = t.transform.rotation;
                  }
                }
                break; // 找到最近的，退出循环
              }
            }

            const newItem: TransformData = {
              type: "setTransform",
              target: target,
              duration: 0,
              transform: inheritedTransform,
              next: true, // 默认启用 next
            };
            if (target !== "bg-main") {
              (newItem as any).presetPosition = "center";
            }
            return newItem;
          });
          
          // 添加到 transforms
          setTransforms((prev) => [...prev, ...newItems]);
          
          // 选中新添加的项目
          const newIndexes = Array.from(
            { length: newItems.length },
            (_, i) => transforms.length + i
          );
          setSelectedIndexes(newIndexes);
        }}
      >
        + Add All setTransform
      </button>

      <div style={{ margin: "10px 0" }}>
        <label>
          <input type="checkbox" checked={lockX} onChange={() => setLockX(!lockX)} />
          Lock X
        </label>
        <label style={{ marginLeft: 10 }}>
          <input type="checkbox" checked={lockY} onChange={() => setLockY(!lockY)} />
          Lock Y
        </label>
        <label style={{ marginLeft: 20 }}>
          Export Duration:
          <input
            type="number"
            value={exportDuration}
            onChange={(e) => setExportDuration(Number(e.target.value))}
            style={{ width: 80, marginLeft: 5 }}
          />
        </label>
                 <label style={{ marginLeft: 20 }}>
           Ease:
           <select
             value={ease}
             onChange={(e) => {
               const newEase = e.target.value;
               setEase(newEase);
               
               // 同步更新所有没有设置ease的transform对象
               setTransforms((prev) => {
                 return prev.map((transform) => {
                   if (!transform.ease || transform.ease === "" || transform.ease === "default") {
                     return { ...transform, ease: newEase };
                   }
                   return transform;
                 });
               });
             }}
             style={{ marginLeft: 5 }}
             aria-label="选择缓动函数"
           >
             <option value="default">默认</option>
             <option value="easeInOut">缓入缓出</option>
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
         
         <label style={{ marginLeft: 20 }}>
           观察层:
           <select
             value={overlayMode}
             onChange={(e) => setOverlayMode(e.target.value as "none" | "color" | "luminosity")}
             style={{ marginLeft: 5 }}
             aria-label="选择观察层模式"
           >
             <option value="none">无</option>
             <option value="color">颜色</option>
             <option value="luminosity">明度</option>
           </select>
         </label>
         
         <label style={{ marginLeft: 20 }}>
           辅助线:
           <select
             value={guideLineType}
             onChange={(e) => setGuideLineType(e.target.value as GuideLineType)}
             style={{ marginLeft: 5 }}
             aria-label="选择辅助线类型"
           >
             <option value="none">无辅助线</option>
             <option value="rule-of-thirds">三分法</option>
             <option value="center-cross">中心十字</option>
             <option value="diagonal">对角线</option>
             <option value="golden-ratio">黄金比例</option>
           </select>
         </label>
      </div>

      <div style={{ marginTop: 20 }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <label>
            <input
              type="checkbox"
              checked={enableFilterPreset}
              onChange={(e) => {
                const checked = e.target.checked;
                setEnableFilterPreset(checked);
                if (!checked) {
                  setTransforms((prev) =>
                    prev.map((t) => {
                      const updated = { ...t.transform };
                      lastAppliedPresetKeys.forEach((key) => {
                        if (key in updated) delete updated[key];
                      });
                      return { ...t, transform: updated };
                    })
                  );
                  setLastAppliedPresetKeys([]);
                }
              }}
            />
            应用滤镜预设
          </label>

          <label>
            <input type="checkbox" checked={applyFilterToBg} onChange={() => setApplyFilterToBg(!applyFilterToBg)} />
            同时作用于背景
          </label>

          

                     {/* 内嵌悬浮面板（不变暗） */}
           <button 
             onClick={async () => {
               try {
                 await invoke('open_filter_editor_window');
                 // 窗口打开后，发送初始数据
                 setTimeout(() => {
                   updateFilterEditorWindow();
                 }, 500);
               } catch (error) {
                 console.error('打开滤镜编辑器窗口失败:', error);
               }
             }}
           >
             打开滤镜编辑器
           </button>
          <button
            onClick={async () => {
              try {
                await invoke('open_script_output_window');
                // 窗口打开后，发送初始数据
                setTimeout(() => {
                  updateScriptOutputWindow();
                }, 500);
              } catch (error) {
                console.error('打开脚本输出窗口失败:', error);
              }
            }}
          >
            打开脚本输出窗口
          </button>
           
                       

            {/* 播放/停止动画按钮 */}
            {!isPlaying ? (
              <button 
                onClick={playAnimation}
                style={{
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                ▶️ 播放动画
              </button>
            ) : (
              <button 
                onClick={stopAnimation}
                style={{
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                ⏹️ 停止动画
              </button>
            )}
        </div>

        <label style={{ marginTop: 10, display: "block" }}>选择预设：</label>
        <select
          aria-label="选择滤镜预设"
          onChange={(e) => {
            const preset = filterPresets[e.target.value];
            if (!preset) return;
            if (!enableFilterPreset) {
              alert("请先勾选“应用滤镜预设”再使用");
              return;
            }
            const keys = Object.keys(preset);
            setLastAppliedPresetKeys(keys);
            setTransforms((prev) =>
              prev.map((t) => {
                if (t.target === "bg-main" && !applyFilterToBg) return t;
                const newTransform = {
                  position: t.transform.position || { x: 0, y: 0 },
                  scale: t.transform.scale || { x: 1, y: 1 },
                  rotation: t.transform.rotation || 0,
                };
                return { ...t, transform: { ...newTransform, ...preset } };
              })
            );
          }}
          defaultValue=""
        >
          <option value="" disabled>
            选择一个预设...
          </option>
          {Object.keys(filterPresets).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        
        {/* 显示选项控制 */}
        <div style={{ marginTop: 20, display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showSelectionBox}
              onChange={(e) => setShowSelectionBox(e.target.checked)}
              style={{ marginRight: "8px", cursor: "pointer" }}
            />
            <span style={{ fontWeight: "bold", color: "#333" }}>
              显示蓝色框选框
            </span>
          </label>
          
          <label style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showTargetId}
              onChange={(e) => setShowTargetId(e.target.checked)}
              style={{ marginRight: "8px", cursor: "pointer" }}
            />
            <span style={{ fontWeight: "bold", color: "#333" }}>
              显示角色id
            </span>
          </label>
        
        <label style={{ display: "flex", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={mygo3Mode}
            onChange={(e) => setMygo3Mode(e.target.checked)}
            style={{ marginRight: "8px", cursor: "pointer" }}
          />
          <span style={{ fontWeight: "bold", color: "#b91c1c" }}>
            MyGO!!!!! 3.0 模式
          </span>
        </label>
        </div>
        
        {/* 立绘和背景启用列表 */}
        <div style={{ marginTop: 20 }}>
          <label style={{ display: "block", marginBottom: 10, fontWeight: "bold", color: "#333" }}>
            启用立绘和背景：
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
            {(() => {
              // 提取所有立绘和背景的 target
              const targets = new Set<string>();
              transforms.forEach(t => {
                if (t.type === 'changeFigure' || t.type === 'changeBg') {
                  targets.add(t.target);
                }
              });
              
              if (targets.size === 0) {
                return <div style={{ color: "#999", fontStyle: "italic" }}>暂无立绘或背景</div>;
              }
              
              return Array.from(targets).map(target => {
                const transform = transforms.find(t => 
                  (t.type === 'changeFigure' || t.type === 'changeBg') && t.target === target
                );
                const isBg = transform?.type === 'changeBg' || target === 'bg-main';
                
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
                      checked={enabledTargets.has(target)}
                      onChange={(e) => {
                        const newEnabled = new Set(enabledTargets);
                        if (e.target.checked) {
                          newEnabled.add(target);
                        } else {
                          newEnabled.delete(target);
                          // 如果取消勾选，同时取消选中该target的项目
                          setSelectedIndexesFiltered(prev => {
                            return prev.filter(idx => {
                              const t = transforms[idx];
                              return t.target !== target;
                            });
                          });
                        }
                        // 创建新的 Set 对象以触发 React 重新渲染
                        setEnabledTargets(new Set(newEnabled));
                      }}
                      style={{ marginRight: "6px", cursor: "pointer" }}
                    />
                    <span style={{ 
                      color: isBg ? "#e74c3c" : "#333",
                      fontWeight: isBg ? "bold" : "normal"
                    }}>
                      {target}
                    </span>
                  </label>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 20, position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{
            width: "100%",
            height: "auto",
            maxHeight: 450,
            maxWidth: 800,
            border: "1px solid red",
            backgroundColor: "#f8f8f8",
          }}
        />
        
        
        {mousePos && (
          <div
            style={{
              position: "fixed",
              top: 10,
              left: 10,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              color: "#fff",
              padding: "6px 10px",
              borderRadius: 4,
              fontSize: 12,
              zIndex: 1000,
              pointerEvents: "none",
            }}
          >
            Mouse: (x: {mousePos.x.toFixed(1)}, y: {mousePos.y.toFixed(1)})
          </div>
        )}
        <CanvasRenderer
          animationStateRef={animationStateRef}
          canvasRef={canvasRef}
          transforms={transforms}
          setTransforms={setTransforms}
          selectedIndexes={selectedIndexes}
          setSelectedIndexes={setSelectedIndexesFiltered}
          modelImg={modelImg}
          bgImg={bgImg}
          baseWidth={baseWidth}
          baseHeight={baseHeight}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          modelOriginalWidth={modelWidth}
          modelOriginalHeight={modelHeight}
          bgBaseScaleRef={bgBaseScaleRef}
          lockX={lockX}
          lockY={lockY}
          guideLineType={guideLineType}
          overlayMode={overlayMode}
          enabledTargets={enabledTargets}
          enabledTargetsArray={Array.from(enabledTargets)}
          showSelectionBox={showSelectionBox}
          showTargetId={showTargetId}
          mygo3Mode={mygo3Mode}
          breakpoints={breakpoints}
          fullOutputScriptLines={fullOutputScriptLinesRef.current}
          outputScriptLines={outputScriptLines}
        />
      </div>

      {selectedIndexes.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <RotationPanel
            transforms={transforms}
            selectedIndexes={selectedIndexes}
            onChange={(index, newRotation) => {
              setTransforms((prev) => {
                const copy = [...prev];
                copy[index] = { ...copy[index], transform: { ...copy[index].transform, rotation: newRotation } };
                return copy;
              });
            }}
            onChangeTarget={(index, newTarget) => {
              setTransforms((prev) => {
                const copy = [...prev];
                copy[index] = { ...copy[index], target: newTarget };
                return copy;
              });
            }}
            onChangeEase={(index, newEase) => {
              setTransforms((prev) => {
                const copy = [...prev];
                copy[index] = { ...copy[index], ease: newEase };
                return copy;
              });
            }}
            onChangeScale={(index, axis, newScale) => {
              setTransforms((prev) => {
                const copy = [...prev];
                const transform = copy[index];
                if (!transform) return copy;
                if (!transform.transform.scale) {
                  transform.transform.scale = { x: 1, y: 1 };
                }
                if (axis === 'x') {
                  transform.transform.scale.x = newScale;
                } else {
                  transform.transform.scale.y = newScale;
                }
                return copy;
              });
            }}
            onChangeMotion={(index, newMotion) => {
              setTransforms((prev) => {
                const copy = [...prev];
                const transform = copy[index];
                if (!transform) return copy;
                // 检查是否是 Mano 文件
                const isMano = transform.path?.includes('type=webgal_mano');
                if (isMano) {
                  // Mano 文件：将 pose 保存到 extraParams.pose
                  const extraParams = { ...transform.extraParams };
                  if (newMotion) {
                    extraParams.pose = newMotion;
                  } else {
                    delete extraParams.pose;
                  }
                  copy[index] = { ...transform, extraParams };
                } else {
                  // Live2D 文件：保存到 motion
                  copy[index] = { ...transform, motion: newMotion || undefined };
                }
                return copy;
              });
            }}
            onChangeExpression={(index, newExpression) => {
              setTransforms((prev) => {
                const copy = [...prev];
                copy[index] = { ...copy[index], expression: newExpression || undefined };
                return copy;
              });
            }}
            onChangeId={() => {}}
          />

        </div>
      )}
    </div>
  );
}
