# Pretext Snake Article

一个基于 `@chenglou/pretext` 改造的实验项目：让一条可自动游走、也可由鼠标和键盘引导的“贪吃蛇”，在微信公众号文章正文中穿行，正文会实时绕开蛇身与食物重新排版。

## 在线访问

- 作品直达：`https://guoshamin.github.io/pretext-snake-article/snake/`
- 全部 demos 集合：`https://guoshamin.github.io/pretext-snake-article/`

## 效果

- 蛇会自动游走
- 鼠标与方向键 / `WASD` 可以引导蛇移动
- 引导的是蛇，不是食物；食物会固定停留在文章里等待被吃掉
- 每吃一个词，只固定增长一个词的长度，不会整体膨胀成一坨
- 页面可滚动，能呈现完整文章
- 文章中的部分 GIF / 图像已保留在正文流中

## 本地开发

```bash
bun install
bun run start
```

打开：

```bash
http://127.0.0.1:3000/demos/snake
```

## 静态构建

```bash
bun run site:build
```

构建产物会输出到 `site/`，可直接用于 GitHub Pages。

## 项目结构

- `pages/demos/snake.ts`：主逻辑，包含蛇的运动、正文避让、文章媒体插入
- `pages/demos/snake.html`：页面容器
- `pages/demos/snake-article.ts`：从微信公众号文章提取出的正文数据
- `.github/workflows/pages.yml`：GitHub Pages 部署工作流

## 文章来源

当前正文来源于你提供的微信公众号文章：

`https://mp.weixin.qq.com/s/vInXHKIjVQGpZbc9z5yAmA`

## Author

OpenAI Codex (GPT-5)
