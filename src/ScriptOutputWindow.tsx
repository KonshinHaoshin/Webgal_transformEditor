import { useEffect, useState, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { TransformData } from './types/transform';
import { parseScript, applyFigureIDSystem } from './utils/transformParser';

export default function ScriptOutputWindow() {
  const [outputScriptLines, setOutputScriptLines] = useState<string[]>([]);
  const [transforms, setTransforms] = useState<TransformData[]>([]);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [selectedGameFolder, setSelectedGameFolder] = useState<string | null>(null);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set()); // 断点行索引集合
  const isReceivingUpdateRef = useRef(false); // 标记是否正在接收来自主窗口的更新
  const isInitializedRef = useRef(false); // 标记是否已经初始化（接收过第一次数据）

  // 调整 textarea 高度
  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // 监听来自主窗口的数据更新事件
  useEffect(() => {
    const setupListener = async () => {
      const unlistenUpdate = await listen<{
        outputScriptLines: string[];
        transforms: TransformData[];
        scaleX: number;
        scaleY: number;
        canvasWidth: number;
        canvasHeight: number;
        baseWidth: number;
        baseHeight: number;
        exportDuration: number;
        ease: string;
        selectedGameFolder: string | null;
      }>('script-output:update-data', (event) => {
        // 检查数据有效性
        if (event.payload && Array.isArray(event.payload.outputScriptLines)) {
          isReceivingUpdateRef.current = true; // 标记正在接收更新
          setOutputScriptLines(event.payload.outputScriptLines);
          setTransforms(event.payload.transforms || []);
          setScaleX(event.payload.scaleX || 1);
          setScaleY(event.payload.scaleY || 1);
          setSelectedGameFolder(event.payload.selectedGameFolder || null);
          isInitializedRef.current = true; // 标记已初始化
          // 重置标记
          setTimeout(() => {
            isReceivingUpdateRef.current = false;
          }, 100);
        } else {
          console.warn('接收到无效的更新数据:', event.payload);
        }
      });

      return unlistenUpdate;
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

  // 添加next按钮
  const [nextLines, setNextLines] = useState<Set<number>>(new Set());

  useEffect(() => {
    const linesWithNext = new Set<number>();
    outputScriptLines.forEach((line, index) => {
      // 检查每行末尾是否包含"next"
      const trimmedLine = line.trim();
      if (/\s-next(\s|;|$)/.test(trimmedLine) || trimmedLine.endsWith(' -next') || trimmedLine.endsWith(' -next;')) {
        linesWithNext.add(index);
      }
    });
    setNextLines(linesWithNext);
  }, [outputScriptLines]);

  const toggleNext = (index: number) => {
    const newLines = [...outputScriptLines];
    const line = newLines[index];
    const trimmedLine = line.trim();
    // 检查是否有next
    const hasNext = /\s-next(\s|;|$)/.test(trimmedLine) || trimmedLine.endsWith(' -next') || trimmedLine.endsWith(' -next;');
    if (hasNext) {
      {
        let newLine = trimmedLine.replace('-next', '');
        const endsWithSemicolon = newLine.endsWith(';');
        if (endsWithSemicolon) {
          newLine = newLine.slice(0, -1).trim();
        }
        if (endsWithSemicolon) {
          newLine += ';';
        }
        newLines[index] = newLine;
      }
    } else {
      //如果没有next
      let newLine = trimmedLine + ' -next';
      const endsWithSemicolon = newLine.endsWith(';');
      if (endsWithSemicolon) {
        newLine = newLine.slice(0, -1).trim();
      }
      if (endsWithSemicolon) {
        newLine += ';';
      }
      newLines[index] = newLine;
    }
    setOutputScriptLines(newLines);

    const newNextLines = new Set(nextLines);
    if (hasNext) {
      newNextLines.delete(index);
    } else {
      newNextLines.add(index);
    }
    setNextLines(newNextLines);


    handleOutputScriptChange(newLines.join('\n'));
  };

  // 处理 output script 编辑
  const handleOutputScriptChange = async (newScript: string) => {
    // 如果正在接收更新，不处理本地编辑
    if (isReceivingUpdateRef.current || !isInitializedRef.current) {
      return;
    }

    const lines = newScript.split('\n').filter(line => line.trim().length > 0);
    setOutputScriptLines(lines);
    
    // 解析并更新 transforms
    try {
      const parsed = parseScript(newScript, scaleX, scaleY).map((t) => {
        const { __presetApplied, ...rest } = t as any;
        return rest;
      });
      
      const merged = applyFigureIDSystem(parsed);
      
      // 注意：脚本输出窗口不负责加载图片，这应该由主窗口处理
      // 我们只需要通知主窗口 transforms 已更新
      
      setTransforms(merged);
      
      // 通知主窗口 transforms 已更新
      emit('script-output:transforms-changed', {
        transforms: merged
      }).catch(() => {
        // 忽略错误
      });
    } catch (error) {
      console.error("❌ 解析 output script 失败:", error);
    }
  };

  // 删除指定行
  const handleDeleteLine = (index: number) => {
    const newLines = outputScriptLines.filter((_, i) => i !== index);
    const newScript = newLines.join('\n');
    handleOutputScriptChange(newScript);
  };

  // 复制脚本
  const handleCopyScript = () => {
    const script = outputScriptLines.join('\n');
    navigator.clipboard.writeText(script);
    alert("Script copied!");
  };

  const handleCopySetTransformOnly = () => {
    const setTransformLines = outputScriptLines.filter((line) => line.trim().startsWith('setTransform'));
    if (setTransformLines.length === 0) {
      alert("没有setTransform行");
      return;
    }
    const setTransformScript = setTransformLines.join('\n');
    navigator.clipboard.writeText(setTransformScript);
  };

  // 切换断点状态
  const toggleBreakpoint = (index: number) => {
    const newBreakpoints = new Set(breakpoints);
    if (newBreakpoints.has(index)) {
      newBreakpoints.delete(index);
    } else {
      newBreakpoints.add(index);
    }
    setBreakpoints(newBreakpoints);

    // 通知主窗口断点已更新
    emit('script-output:breakpoints-changed', {
      breakpoints: Array.from(newBreakpoints)
    }).catch(() => {
      // 忽略错误
    });
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      overflow: 'auto',
      padding: '16px',
      backgroundColor: '#ffffff'
    }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
          📝 输出脚本
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleCopyScript}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            复制脚本
          </button>
          <button
            onClick={handleCopySetTransformOnly}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            title="只复制 setTransform 命令"
          >
            只复制setTransform语句
          </button>
        </div>
      </div>
      <div style={{ 
        border: '1px solid #ccc', 
        borderRadius: '4px', 
        padding: '10px', 
        backgroundColor: '#f9f9f9',
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto'
      }}>
        {outputScriptLines.length > 0 ? (
          outputScriptLines.map((line, index) => (
            <div 
              key={index} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '4px',
                padding: '4px',
                backgroundColor: '#fff',
                borderRadius: '3px',
                border: '1px solid #e0e0e0'
              }}
            >
              {/* 断点按钮 */}
              <button
                onClick={() => toggleBreakpoint(index)}
                style={{
                  marginRight: '8px',
                  padding: '4px 8px',
                  fontSize: '14px',
                  backgroundColor: breakpoints.has(index) ? '#ff6b6b' : '#e0e0e0',
                  color: breakpoints.has(index) ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  minWidth: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={breakpoints.has(index) ? "移除断点" : "设置断点"}
              >
                {breakpoints.has(index) ? '●' : '○'}
              </button>
              {/* Next 按钮 */}
              <button
                onClick={() => toggleNext(index)}
                style={{
                  marginRight: '8px',
                  padding: '2px 4px',
                  fontSize: '10px',
                  backgroundColor: nextLines.has(index) ? '#4caf50' : '#e0e0e0',
                  color: nextLines.has(index) ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  minWidth: '20px',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={nextLines.has(index) ? "移除 -next" : "添加 -next"}
              >
                {nextLines.has(index) ? '✓' : 'N'}
              </button>
              <textarea
                ref={(el) => adjustTextareaHeight(el)}
                value={line}
                onChange={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  adjustTextareaHeight(el);
                  const newLines = [...outputScriptLines];
                  newLines[index] = e.target.value;
                  // 仅更新本地行状态，不立即解析应用
                  setOutputScriptLines(newLines);
                }}
                style={{
                  flex: 1,
                  padding: '2px 4px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  height: 'auto',
                  minHeight: '20px',
                  lineHeight: '16px',
                  overflowY: 'hidden',
                  backgroundColor: breakpoints.has(index) ? '#fff3cd' : 'transparent',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}
                rows={1}
                placeholder={`脚本行 ${index + 1}`}
                aria-label={`脚本行 ${index + 1}`}
                onKeyDown={(e) => {
                  // Enter 提交；Shift+Enter 插入换行
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleOutputScriptChange(outputScriptLines.join('\n'));
                  } else if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    const newLines = [...outputScriptLines];
                    newLines[index] = (newLines[index] || '') + '\n';
                    setOutputScriptLines(newLines);
                  }
                }}
                onBlur={() => handleOutputScriptChange(outputScriptLines.join('\n'))}
              />
              <button
                onClick={() => handleDeleteLine(index)}
                style={{
                  marginLeft: '8px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: '#ff4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
                title="删除这一行"
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div style={{ color: '#999', fontStyle: 'italic' }}>暂无输出脚本</div>
        )}
      </div>
    </div>
  );
}

