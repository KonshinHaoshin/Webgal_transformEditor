import React from 'react';
import ReactDOM from 'react-dom/client';
import ScriptOutputWindow from './ScriptOutputWindow';

// 从主窗口获取初始数据（通过 Tauri 事件）
// 这里我们使用默认值，实际数据将通过事件更新
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ScriptOutputWindow />
  </React.StrictMode>
);

