import { useEffect, useState, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import FilterEditor from './components/FilterEditor';
import { TransformData } from './types/transform';

export default function FilterEditorWindow() {
  const [transforms, setTransforms] = useState<TransformData[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [applyFilterToBg, setApplyFilterToBg] = useState(false);
  const [selectedGameFolder, setSelectedGameFolder] = useState<string | null>(null);
  const isReceivingUpdateRef = useRef(false); // 标记是否正在接收来自主窗口的更新
  const isInitializedRef = useRef(false); // 标记是否已经初始化（接收过第一次数据）

  useEffect(() => {
    // 监听来自主窗口的数据更新事件（全局事件）
    const setupListener = async () => {
      const unlistenUpdate = await listen<{
      return await listen<{
              transforms: TransformData[];
              selectedIndexes: number[];
              applyFilterToBg: boolean;
              selectedGameFolder?: string | null;
            }>('filter-editor:update-data', (event) => {
              // 检查数据有效性
              if (event.payload && Array.isArray(event.payload.transforms)) {
                isReceivingUpdateRef.current = true; // 标记正在接收更新
                setTransforms(event.payload.transforms);
                setSelectedIndexes(event.payload.selectedIndexes || []);
                setApplyFilterToBg(event.payload.applyFilterToBg || false);
                // 更新游戏文件夹路径（用于加载 JSONL）
                if (event.payload.selectedGameFolder !== undefined) {
                  setSelectedGameFolder(event.payload.selectedGameFolder);
                }
                isInitializedRef.current = true; // 标记已初始化
                // 重置标记
                setTimeout(() => {
                  isReceivingUpdateRef.current = false;
                }, 100);
              } else {
                console.warn('接收到无效的更新数据:', event.payload);
              }
            });

          isReceivingUpdateRef.current = true; // 标记正在接收更新
          setTransforms(event.payload.transforms);
          setSelectedIndexes(event.payload.selectedIndexes || []);
          setApplyFilterToBg(event.payload.applyFilterToBg || false);
          // 更新游戏文件夹路径（用于加载 JSONL）
          if (event.payload.selectedGameFolder !== undefined) {
            setSelectedGameFolder(event.payload.selectedGameFolder);
          }
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

  // 当 transforms 更新时（且不是来自主窗口的更新），通知主窗口
  useEffect(() => {
    // 如果正在接收更新或还未初始化，不发送事件
    if (isReceivingUpdateRef.current || !isInitializedRef.current) {
      return;
    }
    
    // 如果 transforms 是有效数组，发送更新
    if (Array.isArray(transforms)) {
      emit('filter-editor:transforms-changed', {
        transforms: transforms
      }).catch(() => {
      });
    }
  }, [transforms]);

  // 直接传递 setTransforms，不需要包装
  const handleTransformsChange = setTransforms;

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      overflow: 'auto',
      padding: '16px',
      backgroundColor: '#ffffff'
    }}>
      <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
        🎨 滤镜编辑器
      </h2>
      <FilterEditor
        transforms={transforms}
        setTransforms={handleTransformsChange}
        selectedIndexes={selectedIndexes}
        applyFilterToBg={applyFilterToBg}
        setApplyFilterToBg={setApplyFilterToBg}
        selectedGameFolder={selectedGameFolder}
      />
    </div>
  );
}
