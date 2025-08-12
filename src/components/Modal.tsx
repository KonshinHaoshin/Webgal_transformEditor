import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number | string;
  height?: number | string;
  variant?: "modal" | "floating";
  draggable?: boolean;
  resizable?: boolean;
  disableBackdrop?: boolean;
  mountToBody?: boolean;
  initialPosition?: { x: number; y: number };
  children: React.ReactNode;
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  width = 800,
  height,
  variant = "modal",
  draggable = false,
  resizable = false,
  disableBackdrop = false,
  mountToBody = false,
  initialPosition = { x: 80, y: 80 },
  children,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>(initialPosition);
  const [scale, setScale] = useState(1);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ dx: 0, dy: 0 });
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ width: 0, height: 0, x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen) return;
    if (variant === "floating") {
      const vw = window.innerWidth;
      const w = typeof width === "number" ? width : 800;
      setPos((p) => ({
        x: Math.min(Math.max(p.x, 8), Math.max(8, vw - (Number(w) || 800) - 8)),
        y: Math.max(p.y, 8),
      }));
    }
  }, [isOpen, variant, width]);

  // 添加滚轮缩放支持
  useEffect(() => {
    if (!isOpen || !resizable) return;
    
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
      }
    };
    
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [isOpen, resizable]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) {
        e.preventDefault();
        const { dx, dy } = offsetRef.current;
        let x = e.clientX - dx;
        let y = e.clientY - dy;
        const vw = window.innerWidth;
        const w = typeof width === "number" ? width : 800;
        x = Math.min(Math.max(x, - (Number(w) || 800) + 80), vw - 40);
        y = Math.min(Math.max(y, -200), window.innerHeight - 40);
        setPos({ x, y });
      }
      
      if (resizingRef.current) {
        e.preventDefault();
        const { width: startWidth, height: startHeight, x: startX, y: startY } = resizeStartRef.current;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        const newWidth = Math.max(300, startWidth + deltaX);
        const newHeight = Math.max(400, startHeight + deltaY);
        
        // 更新位置以保持右下角固定
        const newX = startX - (newWidth - startWidth);
        const newY = startY - (newHeight - startHeight);
        
        setPos({ x: newX, y: newY });
        // 这里我们通过 transform: scale 来实现缩放效果
        const newScale = Math.min(newWidth / (typeof width === "number" ? width : 800), newHeight / (typeof height === "number" ? height : 600));
        setScale(Math.max(0.5, Math.min(2, newScale)));
      }
    };
    
    const onUp = () => {
      draggingRef.current = false;
      resizingRef.current = false;
    };
    
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width, height]);

  if (!isOpen) return null;

  const shell = (
    <>
      {variant === "modal" && !disableBackdrop && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9998 }}
        />
      )}
      <div
        style={
          variant === "floating"
            ? {
                position: "fixed",
                left: pos.x,
                top: pos.y,
                width,
                height,
                zIndex: 9999,
                boxShadow: "0 12px 32px rgba(0,0,0,.22)",
                background: "#fff",
                borderRadius: 10,
                overflow: "hidden",
              }
            : {
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={
            variant === "floating"
              ? { width: "100%", height: "100%", display: "flex", flexDirection: "column" }
              : {
                  width,
                  maxHeight: "84vh",
                  background: "#fff",
                  borderRadius: 10,
                  boxShadow: "0 12px 32px rgba(0,0,0,.22)",
                  overflow: "hidden",
                  pointerEvents: "auto",
                }
          }
          role="dialog"
          aria-modal={variant === "modal" && !disableBackdrop ? true : false}
        >
          <div
            onMouseDown={(e) => {
              if (!(variant === "floating" && draggable)) return;
              if (e.button !== 0) return;
              draggingRef.current = true;
              offsetRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
            }}
            style={{
              userSelect: "none",
              cursor: variant === "floating" && draggable ? "move" : "default",
              background: "#0b65ff",
              color: "#fff",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span>{title ?? "Panel"}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {resizable && (
                <>
                  <button
                    onClick={() => setScale(Math.max(0.5, scale - 0.1))}
                    style={{ all: "unset", cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.18)", fontSize: "12px" }}
                    title="缩小"
                  >
                    −
                  </button>
                  <button
                    onClick={() => setScale(1)}
                    style={{ all: "unset", cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.18)", fontSize: "12px" }}
                    title="重置缩放"
                  >
                    {Math.round(scale * 100)}%
                  </button>
                  <button
                    onClick={() => setScale(Math.min(2, scale + 0.1))}
                    style={{ all: "unset", cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.18)", fontSize: "12px" }}
                    title="放大"
                  >
                    +
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                style={{ all: "unset", cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.18)" }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <div 
            style={{ 
              padding: 12, 
              overflow: "auto", 
              maxHeight: "70vh",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: `${100 / scale}%`,
              height: `${100 / scale}%`
            }}
          >
            {children}
          </div>
          {resizable && (
            <div
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                resizingRef.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                resizeStartRef.current = {
                  width: rect.width,
                  height: rect.height,
                  x: e.clientX,
                  y: e.clientY
                };
              }}
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: "20px",
                height: "20px",
                cursor: "nw-resize",
                background: "linear-gradient(135deg, transparent 0%, transparent 50%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.3) 100%)",
                borderBottomRightRadius: "10px"
              }}
              title="拖拽调整大小"
            />
          )}
        </div>
      </div>
    </>
  );

  return mountToBody ? createPortal(shell, document.body) : shell;
};

export default Modal;
