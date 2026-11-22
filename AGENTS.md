# 雪夜礼物树 · 项目规则（Claude 与 Codex 共用）

完整设计见 `PLAN.md`，当前进度见 `PROJECT_MEMORY.md`。

## 技术栈
- Vite + TypeScript（strict）+ Three.js（WebGLRenderer，不用 WebGPU）
- 后期：`postprocessing`（pmndrs）
- 动画：自写的轻量 tween / timeline 工具（`src/core/`），不引入 GSAP
- 界面：原生 TypeScript + CSS，不用 React / Vue 等框架
- 不新增依赖，除非确有必要并在汇报中说明

## 约束
- 外部素材只用 CC0（如 Poly Haven）或 AI 原创生成的图片，放在 `public/assets/`，每个目录附 `SOURCES.md` 写明来源与协议；不加载外部字体。
- 界面文字用中文；代码标识符用英文；只在不直观处写简短注释。
- 性能：桌面高画质 ≥ 60fps，中端手机中画质 ≥ 30fps；所有重型效果必须受画质分档控制。
- 大量重复物体用 InstancedMesh / Points；灯串用自发光 + 泛光，不用大量真实点光源。
- `vite.config.ts` 使用 `base: './'`，方便部署到 GitHub Pages 子路径。
- 调试入口：`window.__tree`（开发模式下暴露场景状态和关键方法，便于自动化验收）。

## 命令
- 开发：`npm run dev`
- 构建 + 类型检查：`npm run build`（必须通过）
