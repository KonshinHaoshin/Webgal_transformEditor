import React, { useEffect } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number | string;
  children: React.ReactNode;
  closeOnOverlay?: boolean; // 点击遮罩关闭，默认 true
};

export default function Modal({
  isOpen,
  onClose,
  title,
  width = 820,
  children,
  closeOnOverlay = true,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" style={{ ...contentStyle, width }}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={closeBtnStyle}>
            ×
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const contentStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
  maxHeight: "86vh",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid #eee",
};

const bodyStyle: React.CSSProperties = {
  padding: 16,
  overflow: "auto",
  maxHeight: "calc(86vh - 56px)",
};

const closeBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
};
