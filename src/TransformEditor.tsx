import { useEffect, useRef, useState } from "react";
import "./transform-editor.css";
import { TransformData } from "./types/transform.ts";
import { exportScript, parseScript } from "./utils/transformParser.ts";
import CanvasRenderer from "./components/CanvasRenderer.tsx";
import RotationPanel from "./components/RotationPanel";
import Modal from "./components/Modal";
import FilterEditor from "./components/FilterEditor";
import { GuideLineType } from "./types/guideLines";


export default function TransformEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [input, setInput] = useState("");
  const [transforms, setTransforms] = useState<TransformData[]>([]);
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
  const [openFilterModal, setOpenFilterModal] = useState(false);
  const [guideLineType, setGuideLineType] = useState<GuideLineType>('none');
  
  // 动画播放相关状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationStartTime, setAnimationStartTime] = useState<number | null>(null);
  const [animationData, setAnimationData] = useState<any[]>([]);

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



  // 真正的动画播放功能
  const playAnimation = () => {
    if (transforms.length === 0) {
      alert("请先添加一些变换后再播放动画");
      return;
    }

    // 过滤出所有的 setTransform 项目
    const setTransformItems = transforms.filter(t => t.type === 'setTransform');
    
    if (setTransformItems.length === 0) {
      alert("⚠️ 没有找到任何 setTransform 指令，无法播放动画");
      return;
    }

    // 默认起始状态
    const defaultState = {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 }
    };

    // 修复 playAnimation 函数中的 ease 处理逻辑
    const newAnimationData = setTransformItems.map((transform) => {
      const target = transform.target;
      const duration = exportDuration;
      // 如果 transform 有自己的 ease，使用它；否则使用全局 ease
      let ease = transform.ease;
      if (!ease || ease === "" || ease === "default") {
        ease = ""; // 空字符串表示使用全局设置
      }
      
      return {
        target,
        duration,
        ease,
        startState: defaultState,
        endState: transform.transform,
        startTime: 0,
        endTime: duration
      };
    });

    // 设置动画数据并开始播放
    setAnimationData(newAnimationData);
    setIsPlaying(true);
    setAnimationStartTime(Date.now());
    
    console.log("🎬 开始播放动画:", newAnimationData);
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
    const maxDuration = Math.max(...animationData.map(a => a.duration));
    
    if (currentTime >= maxDuration) {
      // 动画结束
      setIsPlaying(false);
      setAnimationStartTime(null);
      return null;
    }

         // 计算每个目标的当前状态
     return animationData.map(animation => {
       const { target, startState, endState, duration, ease } = animation;
       const elapsed = Math.min(currentTime, duration);
       const progress = elapsed / duration;
       
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
      const currentRotation = startState.rotation + (endState.rotation - startState.rotation) * easedProgress;
      
      // 插值计算滤镜效果
      const currentFilters: any = {};
      if (endState.brightness !== undefined) {
        currentFilters.brightness = endState.brightness; 
      }
      if (endState.contrast !== undefined) {
        currentFilters.contrast = endState.contrast; 
      }
      if (endState.saturation !== undefined) {
        currentFilters.saturation = endState.saturation; 
      }
      if (endState.gamma !== undefined) {
        currentFilters.gamma = endState.gamma; 
      }
      if (endState.colorRed !== undefined) {
        currentFilters.colorRed = endState.colorRed; 
      }
      if (endState.colorGreen !== undefined) {
        currentFilters.colorGreen = endState.colorGreen; 
      }
      if (endState.colorBlue !== undefined) {
        currentFilters.colorBlue = endState.colorBlue; 
      }
      if (endState.bloom !== undefined) {
        currentFilters.bloom = endState.bloom; 
      }
      if (endState.bloomBrightness !== undefined) {
        currentFilters.bloomBrightness = endState.bloomBrightness; 
      }
      if (endState.bloomBlur !== undefined) {
        currentFilters.bloomBlur = endState.bloomBlur; 
      }
      if (endState.bevel !== undefined) {
        currentFilters.bevel = endState.bevel; 
      }
      if (endState.bevelThickness !== undefined) {
        currentFilters.bevelThickness = endState.bevelThickness; 
      }
      if (endState.bevelRotation !== undefined) {
        currentFilters.bevelRotation = endState.bevelRotation; 
      }
      if (endState.bevelRed !== undefined) {
        currentFilters.bevelRed = endState.bevelRed; 
      }
      if (endState.bevelGreen !== undefined) {
        currentFilters.bevelGreen = endState.bevelGreen; 
      }
      if (endState.bevelBlue !== undefined) {
        currentFilters.bevelBlue = endState.bevelBlue; 
      }

      return {
        target,
        transform: {
          position: currentPosition,
          scale: currentScale,
          rotation: currentRotation,
          ...currentFilters
        }
      };
    });
  };

  useEffect(() => {
    const model = new Image();
    model.src = "./assets/sakiko_girlfriend.png";
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
      if (currentState) {
        // 更新 transforms 以显示当前动画状态
        setTransforms(prev => {
          const newTransforms = [...prev];
          currentState.forEach(animState => {
            const index = newTransforms.findIndex(t => t.target === animState.target);
            if (index !== -1) {
              newTransforms[index] = {
                ...newTransforms[index],
                transform: animState.transform
              };
            }
          });
          return newTransforms;
        });
        
        // 继续动画循环
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
             <button
         onClick={() => {
           const parsed = parseScript(input, scaleX, scaleY).map((t) => {
             const { __presetApplied, ...rest } = t as any;
             return rest;
           });
           if (parsed.length === 0) alert("⚠️ 没有解析到任何 setTransform 指令！");
           
                       // 检测导入的脚本中的 ease 值，并更新全局设置
            const setTransformItems = parsed.filter(t => t.type === 'setTransform');
            if (setTransformItems.length > 0) {
              // 如果存在 setTransform，使用第一个的 ease 值作为全局默认值
              const firstEase = setTransformItems[0].ease;
              if (firstEase && firstEase !== "") {
                setEase(firstEase);
                console.log(`🎯 检测到导入脚本的 ease 值: ${firstEase}，已更新全局设置`);
              }
            }
           
           setTransforms(parsed);
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
           <button onClick={() => setOpenFilterModal(true)}>打开滤镜编辑器</button>
           
                       

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

          {/* 内嵌悬浮滤镜编辑器（不会让主编辑器变暗） */}
          <Modal
            isOpen={openFilterModal}
            onClose={() => setOpenFilterModal(false)}
            title="滤镜编辑器"
            width={500}
            variant="floating"
            draggable
            resizable
            disableBackdrop
            mountToBody
            initialPosition={{ x: 96, y: 96 }}
          >
            <FilterEditor
              transforms={transforms}
              setTransforms={setTransforms}
              selectedIndexes={selectedIndexes}
              applyFilterToBg={applyFilterToBg}
              setApplyFilterToBg={setApplyFilterToBg}
            />
          </Modal>
        </div>
      )}

             <h3>Output Script:</h3>
       <pre>{exportScript(transforms, exportDuration, canvasWidth, canvasHeight, baseWidth, baseHeight, ease === "default" ? undefined : ease)}</pre>
    </div>
  );
}
