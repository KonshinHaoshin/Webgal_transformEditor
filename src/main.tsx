import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // 样式导入（可选）

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
} else {
    console.error("❌ 没有找到 id 为 'root' 的元素，React 无法挂载。请检查 public/index.html");
}
