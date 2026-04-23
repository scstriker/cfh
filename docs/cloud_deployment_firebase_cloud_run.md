# CFH 云端部署说明（Firebase Hosting + Cloud Run）

## 1. 架构与当前流程
- 前端：Firebase Hosting 托管 `Next.js output: export` 产物
- 后端：Cloud Run 托管 `cloud-run-proxy/`
- 运行模式：构建前设置 `NEXT_PUBLIC_DEPLOY_TARGET=cloud`

当前云端主流程已经收敛为：
1. 阶段一上传模板骨架
2. 阶段一导入金标准或显式跳过
3. 阶段一导入专家草稿并完成清洗确认
4. 阶段一自动生成并人工检查“术语工作单元”
5. 阶段二 AI 合并
6. 阶段三审阅
7. 阶段四导出

说明：
- 旧的“阶段零：概念映射”不再是独立主流程页面。
- 访问 `/phase0` 时会自动跳转到 `/phase1#term-unit-review`。
- 云端部署文档和验收都应以“阶段一内完成工作单元检查”为准，不再要求单独做 Phase 0。

## 2. 前端部署（Firebase Hosting）
```bash
cd /Users/scstriker/Documents/codex-projects/cfh
npm ci
NEXT_PUBLIC_DEPLOY_TARGET=cloud npm run build
firebase deploy --only hosting
```

当前 `firebase.json` 已配置：
- `public: out`
- `cleanUrls: true`
- `/api/**` rewrite 到 Cloud Run 服务 `cfh-gemini-proxy`

说明：
- 当前项目是静态导出多页面结构，所以 Firebase 这里使用 `cleanUrls`，而不是把所有路径 rewrite 到单个 `index.html`。
- 部署后应直接可访问：
  - `/`
  - `/phase1`
  - `/phase2`
  - `/phase3`
  - `/phase4`
  - `/tools/gold-standard-converter`

## 3. 后端部署（Cloud Run）
### 3.1 创建 Secret Manager 密钥
```bash
printf '%s' '你的-gemini-api-key' | gcloud secrets create gemini-api-key --data-file=-
```

如果 secret 已存在，改用：
```bash
printf '%s' '你的-gemini-api-key' | gcloud secrets versions add gemini-api-key --data-file=-
```

### 3.2 构建并部署服务
```bash
cd /Users/scstriker/Documents/codex-projects/cfh/cloud-run-proxy

gcloud run deploy cfh-gemini-proxy \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-env-vars ALLOW_ORIGIN=https://你的站点.web.app,https://你的自定义域名 \
  --set-env-vars DEFAULT_MODEL=gemini-3.1-pro-preview \
  --set-env-vars RATE_LIMIT_WINDOW_MS=60000 \
  --set-env-vars RATE_LIMIT_MAX_REQUESTS=20 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --concurrency 10 \
  --max-instances 3
```

### 3.3 健康检查
```bash
curl https://cfh-gemini-proxy-xxxxx.a.run.app/healthz
```

代理服务当前能力：
- `GET /healthz`
- `POST /api/gemini/generate`

代理当前约束：
- 仅允许 JSON 请求
- 仅允许白名单 `Origin`
- 默认仅允许 `gemini-3.1-pro-preview`
- 应用层请求体限制为 `2 MB`
- 内存级限流由 `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` 控制

## 4. 云端运行行为
- 云端构建下，顶部不再显示 Gemini API Key 输入框。
- 所有 Gemini 调用统一走 `/api/gemini/generate`。
- 阶段一中“术语工作单元检查”是进入阶段二前的硬前置。
- 模板内术语会自动汇总成工作单元；模板外术语会作为候选组供人工处理。

### 彩蛋登录保留规则
云端版必须保留当前前端彩蛋设计，不做真实鉴权替换：
- 首屏显示一个前端登录遮罩
- 用户名：`cfh`
- 密码：`chenboshizuimeili`
- **用户名和密码都留空也允许进入**
- 成功进入后，仅在浏览器本地写入前端标记
- 这个入口只做演示体验，不承担真实安全认证职责

验收时应明确检查：
1. 输入 `cfh / chenboshizuimeili` 可以进入
2. 用户名和密码全空也可以进入
3. 错误组合会提示“账号或密码不正确”
4. 云端站点仍然通过 Cloud Run 匿名代理调用 Gemini，而不是通过这个彩蛋登录做后端鉴权

## 5. 验收清单
部署完成后，至少验证以下行为：

### 前端
- 站点首页可访问
- `/phase1` 可访问，且能看到：
  - 模板骨架
  - 术语金标准
  - 专家草稿
  - 术语工作单元检查
- `/phase0` 会跳转到 `/phase1#term-unit-review`
- 顶部不再显示 Gemini API Key 输入框
- 金标准转换工具页可访问

### 后端
- `/api/gemini/generate` 能从前端正常调用
- 非法 `Origin` 会被拒绝
- 超大请求体会被拒绝
- 非白名单模型会被拒绝

### 前后端联调
- 阶段一完成专家稿确认后，会自动生成术语工作单元
- 未完成工作单元检查时，阶段二按钮不可用
- 完成工作单元检查后，阶段二可正常触发 AI 合并
- 金标准命中词条仍直接走 `gold_standard` 分支

## 6. 本地回归
本地开发继续使用原模式：
```bash
cd /Users/scstriker/Documents/codex-projects/cfh
npm run dev
```

- 默认 `NEXT_PUBLIC_DEPLOY_TARGET=local`
- 顶部仍显示 Gemini API Key 输入框
- 不依赖 Cloud Run 代理
- 不出现云端彩蛋登录遮罩
