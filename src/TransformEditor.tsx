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
  const [originalTransforms, setOriginalTransforms] = useState<TransformData[]>([]); // 保存原始未合并的 transforms 用于动画
  const [dragging] = useState<number | null>(null);
  const [modelImg, setModelImg] = useState<HTMLImageElement | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
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
  
  // 动画播放相关状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationStartTime, setAnimationStartTime] = useState<number | null>(null);
  const [animationData, setAnimationData] = useState<any[]>([]);

  // WebGAL 模式相关状态
  const [selectedGameFolder, setSelectedGameFolder] = useState<string | null>(null);
  const [availableFigures, setAvailableFigures] = useState<string[]>([]);
  const [availableBackgrounds, setAvailableBackgrounds] = useState<string[]>([]);

  const canvasWidth = 2560;
  const canvasHeight = 1440;
  const baseWidth = 2560;
  const baseHeight = 1440;
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
    const blobUrl = await webgalFileManager[type === 'figure' ? 'getFigurePath' : 'getBackgroundPath'](filename);
    if (blobUrl) {
      const img = new Image();
      img.onload = () => {
        if (type === 'figure') {
          setModelImg(img);
          console.log(`✅ 已加载立绘: ${filename}`);
        } else {
          setBgImg(img);
          console.log(`✅ 已加载背景: ${filename}`);
        }
      };
      img.src = blobUrl;
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
    // 使用原始 transforms（未合并的）来构建动画序列
    const rawTransforms = originalTransforms.length > 0 ? originalTransforms : transforms;
    
    if (rawTransforms.length === 0) {
      alert("请先添加一些变换后再播放动画");
      return;
    }

    // 使用新的动画序列构建函数
    const animationSequence = buildAnimationSequence(rawTransforms);
    
    if (animationSequence.length === 0) {
      alert("⚠️ 没有找到任何可播放的动画序列（需要 changeFigure 和 setTransform 组合）");
      return;
    }

    // 在开始播放前，将 transforms 重置为初始状态（changeFigure 的状态）
    // 找到每个 target 的初始 changeFigure 状态
    const initialFigureStates = new Map<string, TransformData>();
    for (const transform of rawTransforms) {
      if (transform.type === 'changeFigure') {
        const figureID = transform.target;
        if (figureID && !initialFigureStates.has(figureID)) {
          initialFigureStates.set(figureID, { ...transform });
        }
      }
    }

    // 更新 transforms 为初始状态（changeFigure 的状态，不带动画）
    setTransforms(prev => {
      const newTransforms = [...prev];
      // 更新已有的 transform，保留其他属性但重置 transform
      initialFigureStates.forEach((initialState, figureID) => {
        const index = newTransforms.findIndex(t => t.target === figureID);
        if (index !== -1) {
          // 保留原有的所有属性，但将 transform 重置为初始状态
          newTransforms[index] = {
            ...newTransforms[index],
            transform: JSON.parse(JSON.stringify(initialState.transform))
          };
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
      // 动画结束
      setIsPlaying(false);
      setAnimationStartTime(null);
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
      
        // 插值计算当前位置
        const currentPosition = {
          x: startState.position.x + (endState.position.x - startState.position.x) * easedProgress,
          y: startState.position.y + (endState.position.y - startState.position.y) * easedProgress
        };
        
        // 插值计算当前缩放
        const currentScale = {
          x: startState.scale.x + (endState.scale.x - startState.scale.x) * easedProgress,
          y: startState.scale.y + (endState.scale.y - startState.scale.y) * easedProgress
        };
        
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
        applyFilterToBg
      });
    } catch (error) {
      console.error('更新滤镜编辑器窗口失败:', error);
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

  useEffect(() => {}, [transforms, dragging, modelImg]);

  // 动画循环
  useEffect(() => {
    if (!isPlaying) return;

    const animationLoop = () => {
      const currentState = getCurrentAnimationState();
      if (currentState && Array.isArray(currentState)) {
        // 更新 transforms 以显示当前动画状态
        setTransforms(prev => {
          const newTransforms = [...prev];
          currentState.forEach((animState: any) => {
            const index = newTransforms.findIndex(t => t.target === animState.target);
            if (index !== -1) {
              newTransforms[index] = {
                ...newTransforms[index],
                transform: JSON.parse(JSON.stringify(animState.transform))
              };
            }
          });
          return newTransforms;
        });
        
        // 继续动画循环
        requestAnimationFrame(animationLoop);
      } else if (currentState === null) {
        // 动画结束，不再继续循环
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





  return (
    <div
      className="transform-editor-container"
      style={{ maxHeight: "100vh", overflowY: "auto", padding: "20px", boxSizing: "border-box" }}
    >
      <h2>EASTMOUNT WEBGAL TRANSFORM EDITOR</h2>

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
        <br />・Ctrl + 滚轮：缩放模型/背景
        <br />・Alt + 拖动：旋转选中对象
        <br />・Shift + 点击：多选对象
        <br />・关注 <strong>东山燃灯寺</strong> 谢谢喵~
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
          
          // 保存原始 transforms（用于动画）和合并后的 transforms（用于渲染）
          setOriginalTransforms(parsed);
          setTransforms(merged);
           setAllSelected(false);
           setSelectedIndexes([]);
         }}
       >
         Load Script
       </button>
      <button
        onClick={() => {
          const script = exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight);
          navigator.clipboard.writeText(script);
          alert("Script copied!");
        }}
      >
        Copy Output Script
      </button>
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
          const newItem: TransformData = {
            type: "setTransform",
            target: name,
            duration: 0,
            transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
          };
          (newItem as any).presetPosition = "center";
          setTransforms((prev) => [...prev, newItem]);
          setSelectedIndexes([transforms.length]);
        }}
      >
        + Add setTransform
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
           辅助线:
           <select
             value={guideLineType}
             onChange={(e) => setGuideLineType(e.target.value as GuideLineType)}
             style={{ marginLeft: 5 }}
           >
             <option value="none">无辅助线</option>
             <option value="grid-3x3">九宫格</option>
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
          canvasRef={canvasRef}
          transforms={transforms}
          setTransforms={setTransforms}
          selectedIndexes={selectedIndexes}
          setSelectedIndexes={setSelectedIndexes}
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
                if (!copy[index].transform.scale) {
                  copy[index].transform.scale = { x: 1, y: 1 };
                }
                if (axis === 'x') {
                  copy[index].transform.scale.x = newScale;
                } else {
                  copy[index].transform.scale.y = newScale;
                }
                return copy;
              });
            }}
            onChangeId={() => {}}
          />

        </div>
      )}

             <h3>Output Script:</h3>
       <pre>{Array.isArray(transforms) ? exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease) : ''}</pre>
    </div>
  );
}
