# WebGAL Transform Editor

🎥 基于 [Tauri](https://tauri.app) + [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org/) 开发的 WebGAL 运镜脚本编辑器。  
支持可视化设置立绘位置、缩放、旋转（弧度）、导出 `setTransform` 与 `changeFigure` 指令！

---

## ✨ 功能特色

- ✅ 支持解析与编辑 `setTransform` 脚本（位置、缩放、旋转）
- ✅ 支持 `changeFigure` 指令编辑与导出（motion / expression / id / transform）
- ✅ 鼠标拖拽自由移动模型
- ✅ 鼠标滚轮缩放（支持 Ctrl调整）
- ✅ Alt + 鼠标旋转模型，体验类似 Photoshop 旋转控件
- ✅ 多选编辑（Shift 选中多个）
- ✅ 实时导出 WebGAL 脚本片段

---

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/KonshinHaoshin/Webgal_transformEditor.git
cd Webgal_transformEditor
```
2. 安装依赖

本项目使用 bun 作为包管理器（也可改为 npm 或 pnpm）：
```bash
bun install
```

3. 启动开发环境
```bash
bun run tauri dev
```

启动后自动打开桌面窗口，进行可视化脚本编辑。
