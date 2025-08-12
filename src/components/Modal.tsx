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
  disableBackdrop = false,
  mountToBody = false,
  initialPosition = { x: 80, y: 80 },
  children,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>(initialPosition);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ dx: 0, dy: 0 });

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

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      const { dx, dy } = offsetRef.current;
      let x = e.clientX - dx;
      let y = e.clientY - dy;
      const vw = window.innerWidth;
      const w = typeof width === "number" ? width : 800;
      x = Math.min(Math.max(x, - (Number(w) || 800) + 80), vw - 40);
      y = Math.min(Math.max(y, -200), window.innerHeight - 40);
      setPos({ x, y });
    };
    const onUp = () => (draggingRef.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

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
            <button
              onClick={onClose}
              style={{ all: "unset", cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.18)" }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ padding: 12, overflow: "auto", maxHeight: "70vh" }}>{children}</div>
        </div>
      </div>
    </>
  );

  return mountToBody ? createPortal(shell, document.body) : shell;
};

export default Modal;
