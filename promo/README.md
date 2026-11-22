# 宣传片（抖音横屏 16:9）

用真实项目画面逐帧合成的约 54 秒宣传片：米白打字开场 → 雪夜构建与点亮 → 6 个特色 → 彩蛋 → 结尾卡。配乐和音效全部由 WebAudio 程序合成（《铃儿响叮当》为公有领域曲目）。

## 文件
- `index.html` / `promo.css` / `promo.ts`：合成页面，所有画面都由时间 `t` 决定；内嵌 5 个项目实例（iframe）。
- `music.ts`：离线渲染配乐与音效（`full` 含配乐，`effects` 只有音效）。
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
