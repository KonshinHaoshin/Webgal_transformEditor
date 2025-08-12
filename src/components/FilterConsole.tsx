import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { TransformData } from "../types/transform";
import "./FilterConsole.css";

interface FilterConsoleProps {
  transforms: TransformData[];
  selectedIndexes: number[];
  onFilterChange: (index: number, filterName: string, value: number) => void;
  onClose: () => void;
}
export default function FilterConsole({
// @ts-ignore
  transforms,
  selectedIndexes,
  onFilterChange,
  onClose,
}: FilterConsoleProps) {
  // 初始停靠在右上角，注意：用 fixed 定位到视口，不受父容器 overflow 影响
  const [position, setPosition] = useState({ x: window.innerWidth - 370, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const clampToViewport = useCallback((x: number, y: number) => {
    const PAD = 20;       // 离边缘一点点
    const W = 340;        // 面板宽度(和 CSS 保持一致)
    // @ts-ignore
    const H = 520;        // 面板大致高度（便于限制，实际不会卡死）
    const minX = -300;
    const minY = -100;
    const maxX = Math.max(minX, window.innerWidth - W + PAD);
    const maxY = Math.max(minY, window.innerHeight - 60);
    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      setPosition(clampToViewport(newX, newY));
    };
    const onUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, dragOffset, clampToViewport]);

  useEffect(() => {
    const onResize = () => {
      setPosition(p => clampToViewport(p.x, p.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToViewport]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    // 只允许在标题栏拖动，避免和内容交互冲突
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const body = (
    <div
      className={`filter-console ${isDragging ? "dragging" : ""}`}
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="滤镜编辑器"
    >
      <div className="filter-console-header" onMouseDown={onHeaderMouseDown}>
        <div className="drag-handle" title="拖拽移动">⋮⋮</div>
        <h3 className="title">🎨 滤镜编辑器</h3>
        <button className="close-btn" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className="filter-console-subtitle">
        已选择 {selectedIndexes.length} 个对象
      </div>

      <div className="filter-console-body">
        {/* 在这里放你的控制项；演示：brightness 一个滑条 */}
        <div className="filter-control">
          <label>Brightness</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              // 对所有选中的对象生效；若无选中，可自行改为对全部对象生效
              selectedIndexes.forEach(idx => onFilterChange(idx, "brightness", v));
            }}
          />
        </div>

        {/* 继续添加其它控制项：contrast/saturation/gamma/... */}
        {/* 你也可以把之前的 FilterEditor 的网格控件搬过来复用 */}
      </div>
    </div>
  );

  // 关键：Portal 到 document.body，且不渲染任何遮罩 -> 不会让运镜编辑器变暗
  return createPortal(body, document.body);
}
