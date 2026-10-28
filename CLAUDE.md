开始任何工作之前，先完整阅读项目里的 constitution.md，后续所有工作都不能违反其中的原则。

## App 工程位置（重要）

- 手机 App（React Native + Expo）工程在根目录下的 **`rnapp/`** 子目录中，不在仓库根目录。所有 npm、Expo、ESLint、Metro、EAS 命令都必须先 `cd rnapp` 再执行（例如 `cd rnapp && npx expo start`）。
- 技术约束（不得偏离）：
  - 平台：第一版只做 Android；Expo managed workflow（SDK 58）+ TypeScript + expo-router 文件式路由；状态管理用 Zustand；本机库用 Expo SQLite（M2 起接入）。
  - **路由严格按 `plan.md` 第 3.1 节执行，不新增、不替换方案**：Tab 固定三个（`app/(tabs)/` 下 index 首页、favorites 收藏、settings 设置），其余页面在 `app/onboarding.tsx`、`app/persons/*`、`app/occasion-detail.tsx`、`app/festival/[festivalCode]/select.tsx`、`app/day-list.tsx`、`app/service-notice.tsx`、`app/login.tsx`。
  - 视觉规范（D10 已拍板）严格按 `design/prototype.html` 与 `design/preview.png`：设计令牌集中在 `rnapp/src/theme/tokens.ts`，基础组件在 `rnapp/src/components/`，页面一律复用，不另造配色与组件。宋体标题用 Noto Serif SC、正文用 Noto Sans SC、贺卡祝福用马善政手写体，已在根布局用 expo-font 加载。
  - `design/preview.png` 顶部的「视频预览」概念屏不进 App，第一版不做任何视频功能。
- 里程碑与任务边界以 `tasks.md` 为准：每个里程碑只实现其 T 编号列出的内容，未列入的功能不得提前开发（宪法第一条：不超出 spec.md）。
- 常用命令（均在 `rnapp/` 内）：`npx expo start`（开发服务器 + Expo Go 扫码）、`npm run typecheck`、`npm run lint`。
- 本机环境注意：npm 需用 `rnapp/.npmrc` 中的 `legacy-peer-deps=true`；网络受限时可加 `--registry=https://registry.npmmirror.com`。
