# 宣传片（抖音横屏 16:9）

用真实项目画面逐帧合成的约 54 秒宣传片：米白打字开场 → 雪夜构建与点亮 → 6 个特色 → 彩蛋 → 结尾卡。配乐和音效全部由 WebAudio 程序合成（《铃儿响叮当》为公有领域曲目）。

## 两个版本
- `index.html`：带字幕的特色介绍版（约 54 秒）。
- `film.html`：无字版，仿模型发布“作品展示”短片：打字下需求 → 方案文档滚动 → 纸面设计稿（枝叶贴图、线稿树）→ 粒子聚树点亮 → 拆礼物 → 彩蛋 → 黑场（47 秒）。渲染时加 `--url http://localhost:5173/promo/film.html --out film.mp4`。
- `motion.html`：动效版（52 秒）：2 秒高光钩子 → 打字 → 输入框变形成窗口、粒子聚树点亮 → 6 个实时画面宫格 + 线条图标，按节拍逐个放大展示真实操作（许愿推近金卡、手机收到消息后点亮）→ 彩蛋 → 项目名。渲染时加 `--url http://localhost:5173/promo/motion.html --out motion.mp4`。

## 文件
- `index.html` / `promo.css` / `promo.ts`：合成页面，所有画面都由时间 `t` 决定；内嵌 5 个项目实例（iframe）。
- `music.ts`：离线渲染配乐与音效（`full` 含配乐，`effects` 只有音效）；`renderFilmAudio` 是无字版的《平安夜》配乐。
- `shared.ts`：两个版本共用的缓动、DOM、项目实例与镜头工具。
- `vt.js`：虚拟时钟，注入每个页面，让定时器、动画帧和 CSS 动画只随渲染脚本推进，保证逐帧一致。
- `render.mjs`：用系统 Chrome（DevTools 协议，无 npm 依赖）逐帧截图，交给 ffmpeg 编码。

## 渲染
先启动开发服务器（`npm run dev`，端口 5173），再在项目根目录运行：

```
node promo/render.mjs --preview          # 960x540 30fps 草稿
node promo/render.mjs                    # 1920x1080 60fps 成片 + 仅音效版
node promo/render.mjs --stills 3,12.5    # 指定秒数的 PNG 静帧
```

默认 ffmpeg 路径为 `D:/Tools/ffmpeg/ffmpeg-9.1-full_build/bin/ffmpeg.exe`，可用 `--ffmpeg` 或环境变量 `FFMPEG` 指定。输出在 `promo/out/`（不进 Git）。
