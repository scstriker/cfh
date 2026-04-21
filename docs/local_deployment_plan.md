# CFH 本地部署方案（Chrome 可访问）

## 1. 项目结构与技术栈分析
- 前端框架：Next.js App Router + React + TypeScript
- 样式方案：TailwindCSS + PostCSS
- 文档处理：`mammoth`（DOCX 解析）、`docx`（DOCX 导出）
- AI 调用：浏览器端直接调用 Gemini API（无后端代理）
- 状态管理：React Context + Reducer，审阅状态持久化到 `localStorage`
- 数据库/后端：无（本地部署不需要数据库服务）
- 静态导出：`next.config.js` 已配置 `output: "export"`，可导出 `out/`

## 2. 前置依赖与工具
- Node.js：建议 `22.x LTS`
- npm：随 Node.js 安装
- Chrome：建议最新稳定版

## 3. 环境变量与配置
- 浏览器主流程不依赖 `.env` 文件。
- Gemini API Key 在页面顶部输入框手动填写（运行时使用）。
- 如需命令行流水线，可用环境变量 `GEMINI_API_KEY`。

## 4. 依赖安装
```bash
cd /Users/scstriker/Documents/codex-projects/cfh
npm ci
```

## 5. 本地启动方案

### 方案 A：开发模式（推荐）
```bash
npm run dev
```
- 访问地址：`http://localhost:3000`
- 阶段页面：
  - `http://localhost:3000/phase0`
  - `http://localhost:3000/phase1`
  - `http://localhost:3000/phase2`
  - `http://localhost:3000/phase3`
  - `http://localhost:3000/phase4`

### 方案 B：静态部署模拟（接近 AI Studio）
```bash
npm run build
npx serve out -l 4173
```
- 访问地址：`http://localhost:4173`
- 静态页也可直接访问：
  - `http://localhost:4173/phase0.html`
  - `http://localhost:4173/phase1.html`
  - `http://localhost:4173/phase2.html`
  - `http://localhost:4173/phase3.html`
  - `http://localhost:4173/phase4.html`

## 6. 可选：命令行一键发布流水线
```bash
GEMINI_API_KEY=你的key npm run pipeline:release -- \
  --input-dir inbox/基础术语 \
  --primary-author 宋凤麒 \
  --output-path release/合并稿.docx
```

## 7. Chrome 兼容性说明
- 项目使用的关键能力（`fetch`、`File`、`DOMParser`、`Blob`、`localStorage`）在现代 Chrome 均可用。
- 建议使用最新 Chrome，避免旧版本在大文件解析与下载场景中的兼容性问题。

## 8. 常见问题与解决方案
- 端口占用（3000/4173）：
  ```bash
  PORT=3001 npm run dev
  npx serve out -l 4174
  ```
- AI 调用失败（401/429/超时）：
  - 检查 API Key 是否有效、有无额度、网络是否可访问 Gemini API 域名。
- 静态模式访问 `/phase1` 返回 404：
  - 直接访问 `phase1.html`（静态导出产物即该文件）。
- DOCX 解析失败：
  - 确认上传文件为 `.docx` 且内容结构符合当前解析策略。
