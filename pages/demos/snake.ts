import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  type LayoutCursor,
  type LayoutLine,
  type PreparedTextWithSegments,
} from '../../src/layout.ts'
import { carveTextLineSlots, type Interval } from './wrap-geometry.ts'
import {
  SNAKE_ARTICLE_DEK,
  SNAKE_ARTICLE_PARAGRAPHS,
  SNAKE_ARTICLE_TITLE,
} from './snake-article.ts'

type Point = { x: number, y: number }

type SceneRect = {
  x: number
  y: number
  w: number
  h: number
}

type SceneLayout = {
  width: number
  height: number
  pageRect: SceneRect
  articleBounds: SceneRect
  columns: SceneRect[]
  dropCapRect: SceneRect
  titleX: number
  titleY: number
  titleWidth: number
  titleFont: string
  titleLineHeight: number
  dekX: number
  dekY: number
  dekWidth: number
  dekFont: string
  dekLineHeight: number
  bodyFont: string
  bodyLineHeight: number
  snakeFont: string
  snakeLineHeight: number
  footerX: number
  footerY: number
}

type MotionState = {
  head: Point
  velocity: Point
  history: Point[]
  food: Point
  captures: number
  activeTargetWord: string
  flash: number
  growth: number
}

type PointerState = {
  x: number
  y: number
  inside: boolean
  lastMoveAt: number
}

type SnakeSample = {
  x: number
  y: number
  radius: number
  age: number
}

type SnakeRow = {
  x: number
  y: number
  width: number
  age: number
  glow: number
}

type ArticleFragment = {
  x: number
  y: number
  text: string
  alpha: number
}

type MediaFragment = {
  src: string
  x: number
  y: number
  width: number
  height: number
}

type ArticleLayoutResult = {
  fragments: ArticleFragment[]
  mediaFragments: MediaFragment[]
  paragraphIndex: number
  complete: boolean
}

const ARTICLE_LABEL = '新智元 / 微信文章'
const ARTICLE_TITLE = SNAKE_ARTICLE_TITLE
const ARTICLE_DEK = SNAKE_ARTICLE_DEK
const FOOTER_NOTE = '鼠标或方向键 / WASD 引导贪吃蛇去吃词'
const DROP_CAP = '网'

const ARTICLE_PARAGRAPHS = SNAKE_ARTICLE_PARAGRAPHS.slice(0, -1)

const SNAKE_WORDS = [
  '排版',
  '测量',
  'Reflow',
  'Canvas',
  '片段',
  '宽度',
  '缓存',
  '用户态',
  '流动',
  '布局',
]
const TARGET_WORDS = ['Pretext', '排版', 'Reflow', 'Canvas', '测量', '用户态']
const BASE_BODY_WORDS = 6
const MAX_BODY_WORDS = 22
const HISTORY_POINTS_PER_WORD = 6
const BASE_HISTORY_POINTS = 24
const MOBILE_BREAKPOINT = 760
const MOBILE_FRAME_MS = 1000 / 18
const DESKTOP_FRAME_MS = 1000 / 36
const ARTICLE_MEDIA = [
  {
    afterParagraph: 8,
    src: 'https://mmbiz.qpic.cn/sz_mmbiz_gif/Rvq8Ow69CYWFciaM3LdAVogpEn9bwTNuCDTnI8KATLlOPDNzic3z04QwcX1Sf7B3douWmsTWaA7O0sNdP4a3NvWibgKWVEpzQh89hQqNIVOxI8/640?wx_fmt=gif&from=appmsg',
    aspect: 1.45,
  },
  {
    afterParagraph: 36,
    src: 'https://mmbiz.qpic.cn/mmbiz_gif/Rvq8Ow69CYVgJYklJrbxsrVgY1YgdDm0lGiaEmFoKLXrk19loCBNOrG4Wq098FQxlHRoFAFiaWZVOGf0aRqhrOJkWicFyO4AkPe3CozxouMbDQ/640?wx_fmt=gif&from=appmsg',
    aspect: 1.48,
  },
  {
    afterParagraph: 38,
    src: 'https://mmbiz.qpic.cn/sz_mmbiz_gif/Rvq8Ow69CYXrrZEddxjqjQwkaeSZsXOxaXBouKC2kx6j1B5wfqNZ43hjGPnI30icZRicFeMl2Tj8OwZQlZJevxmMiac1uYDiciaD3DLgwn9bK3a4/640?wx_fmt=gif&from=appmsg',
    aspect: 1.36,
  },
  {
    afterParagraph: 40,
    src: 'https://mmbiz.qpic.cn/mmbiz_gif/Rvq8Ow69CYVKDZBcLtMN87hwIfxpiaQJ9zYSJeicOH3PvezKuuxKefTo5sHQ1Rt6grylntPzOU7WjcQgIsZ6ZdqH9bcfaXIF3yNL3ibc5mQqIU/640?wx_fmt=gif&from=appmsg',
    aspect: 1.34,
  },
  {
    afterParagraph: 54,
    src: 'https://mmbiz.qpic.cn/mmbiz_gif/Rvq8Ow69CYX6f2JXQWwDSm6XOUUnYOtnicBdyPYxmbCOGYepTYAZzUG3IbZeiaicxdNFOvtG6NpSibguXCZJwHMgrZpkpq4lQdIHubVmnecd9Kw/640?wx_fmt=gif&from=appmsg',
    aspect: 1.34,
  },
] as const

const dom = {
  stageWrap: getRequiredDiv('stage-wrap'),
  canvas: getRequiredCanvas('stage'),
  mediaOverlay: getRequiredDiv('media-overlay'),
}

const rawCtx = dom.canvas.getContext('2d')
if (rawCtx === null) throw new Error('2D context unavailable')
const ctx: CanvasRenderingContext2D = rawCtx

const preparedCache = new Map<string, PreparedTextWithSegments>()
const pointer: PointerState = {
  x: 0,
  y: 0,
  inside: false,
  lastMoveAt: -Infinity,
}
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
}
const st: MotionState = {
  head: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  history: [],
  food: { x: 0, y: 0 },
  captures: 0,
  activeTargetWord: TARGET_WORDS[0]!,
  flash: 0,
  growth: 0.16,
}

let lastFrameTime = 0
let lastRenderTime = 0
let sceneCache: { width: number, height: number, layout: SceneLayout } | null = null
let lastArticleStatus: ArticleLayoutResult = {
  fragments: [],
  mediaFragments: [],
  paragraphIndex: 0,
  complete: false,
}
const mediaNodes: HTMLImageElement[] = []

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}

function boot(): void {
  window.addEventListener('resize', () => {
    sceneCache = null
  })

  window.addEventListener('pointermove', event => {
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.inside = true
    pointer.lastMoveAt = performance.now()
  })

  window.addEventListener('pointerleave', () => {
    pointer.inside = false
  })

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase()
    if (key === 'arrowup' || key === 'w') {
      keys.up = true
      event.preventDefault()
    } else if (key === 'arrowdown' || key === 's') {
      keys.down = true
      event.preventDefault()
    } else if (key === 'arrowleft' || key === 'a') {
      keys.left = true
      event.preventDefault()
    } else if (key === 'arrowright' || key === 'd') {
      keys.right = true
      event.preventDefault()
    }
  })

  window.addEventListener('keyup', event => {
    const key = event.key.toLowerCase()
    if (key === 'arrowup' || key === 'w') keys.up = false
    else if (key === 'arrowdown' || key === 's') keys.down = false
    else if (key === 'arrowleft' || key === 'a') keys.left = false
    else if (key === 'arrowright' || key === 'd') keys.right = false
  })

  document.fonts.ready.then(() => {
    preparedCache.clear()
    sceneCache = null
  })

  Object.assign(window as unknown as Record<string, unknown>, {
    __snakeDebug: () => ({
      head: { ...st.head },
      food: { ...st.food },
      captures: st.captures,
      growth: st.growth,
      articleParagraphIndex: lastArticleStatus.paragraphIndex,
      articleComplete: lastArticleStatus.complete,
      articleParagraphsTotal: ARTICLE_PARAGRAPHS.length,
    }),
  })

  requestAnimationFrame(frame)
}

function frame(now: number): void {
  if (lastFrameTime === 0) lastFrameTime = now
  const deltaMs = Math.min(now - lastFrameTime, 40)
  lastFrameTime = now
  const targetFrameMs = window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_FRAME_MS : DESKTOP_FRAME_MS
  if (now - lastRenderTime < targetFrameMs) {
    requestAnimationFrame(frame)
    return
  }
  lastRenderTime = now

  stepMotion(deltaMs, now)
  render(now)
  requestAnimationFrame(frame)
}

function stepMotion(deltaMs: number, now: number): void {
  const layout = getSceneLayout()
  seedMotionIfNeeded(layout)

  st.flash = Math.max(0, st.flash - deltaMs * 0.0013)
  const growthTarget = getBodyGrowth()
  st.growth += (growthTarget - st.growth) * Math.min(1, deltaMs * 0.006)

  const foodVector = normalize(st.food.x - st.head.x, st.food.y - st.head.y)
  const mouseGuide = getMouseGuide(layout, now)
  const keyboardGuide = getKeyboardGuide()
  const wanderAngle = now * 0.0011 + st.captures * 0.34

  let steerX = foodVector.x * 0.95 + Math.cos(wanderAngle) * 0.12
  let steerY = foodVector.y * 0.95 + Math.sin(wanderAngle * 0.88) * 0.12

  if (mouseGuide !== null) {
    steerX += mouseGuide.x * 1.18
    steerY += mouseGuide.y * 1.18
  }
  if (keyboardGuide !== null) {
    steerX += keyboardGuide.x * 1.35
    steerY += keyboardGuide.y * 1.35
  }

  const steer = normalize(steerX, steerY)
  const speed = lerp(54, 96, st.growth) * (keyboardGuide !== null ? 1.08 : 1)
  const ease = (mouseGuide !== null || keyboardGuide !== null ? 0.12 : 0.07) * Math.min(1, deltaMs / 16)

  st.velocity.x += (steer.x * speed - st.velocity.x) * ease
  st.velocity.y += (steer.y * speed - st.velocity.y) * ease

  const deltaSeconds = deltaMs / 1000
  st.head.x += st.velocity.x * deltaSeconds
  st.head.y += st.velocity.y * deltaSeconds

  const inset = 26
  if (st.head.x < layout.articleBounds.x + inset || st.head.x > layout.articleBounds.x + layout.articleBounds.w - inset) {
    st.velocity.x *= -0.7
  }
  if (st.head.y < layout.articleBounds.y + inset || st.head.y > layout.articleBounds.y + layout.articleBounds.h - inset) {
    st.velocity.y *= -0.7
  }
  st.head.x = clamp(st.head.x, layout.articleBounds.x + inset, layout.articleBounds.x + layout.articleBounds.w - inset)
  st.head.y = clamp(st.head.y, layout.articleBounds.y + inset, layout.articleBounds.y + layout.articleBounds.h - inset)

  pushHistoryPoint(st.head)

  if (Math.hypot(st.food.x - st.head.x, st.food.y - st.head.y) <= 24) {
    st.captures += 1
    st.flash = 1
    st.activeTargetWord = TARGET_WORDS[st.captures % TARGET_WORDS.length]!
    st.food = randomPointInRect(layout.articleBounds, 48, st.head)
  }
}

function render(now: number): void {
  const layout = getSceneLayout()
  resizeCanvas(layout.width, layout.height)

  const dpr = Math.max(1, window.devicePixelRatio || 1)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, layout.width, layout.height)

  drawBackdrop(layout, now)
  drawPage(layout)
  drawHeader(layout, now)

  const samples = buildSnakeSamples(layout)
  const articleLayout = layoutArticleFragments(layout, samples, now)
  lastArticleStatus = articleLayout
  drawArticleFragments(layout, articleLayout.fragments, now)
  syncMediaFragments(layout, articleLayout.mediaFragments)
  drawDropCap(layout)
  drawSnake(layout, samples, now)
  drawFood(layout, now)
  drawHead(layout, now)
  drawFooter(layout, now)
}

function getSceneLayout(): SceneLayout {
  const width = Math.max(390, Math.round(dom.canvas.clientWidth || window.innerWidth))
  const viewportHeight = Math.max(540, Math.round(window.innerHeight))
  if (sceneCache !== null && sceneCache.width === width && sceneCache.height === viewportHeight) return sceneCache.layout

  const outer = clamp(Math.round(Math.min(width, viewportHeight) * 0.024), 10, 26)
  const pageWidth = Math.min(width - outer * 2, 980)
  const pageX = Math.round((width - pageWidth) / 2)
  const pageY = outer

  const draftPageRect = { x: pageX, y: pageY, w: pageWidth, h: viewportHeight - outer * 2 }
  const inner = clamp(Math.round(draftPageRect.w * 0.075), 28, 72)
  const titleFontSize = clamp(Math.round(Math.min(draftPageRect.w * 0.056, viewportHeight * 0.07)), 28, 64)
  const bodyFontSize = clamp(Math.round(Math.min(draftPageRect.w * 0.018, 22)), 13, 22)
  const snakeFontSize = clamp(Math.round(Math.min(draftPageRect.w * 0.015, 19)), 10, 19)

  const titleFont = `700 ${titleFontSize}px "Songti SC", "STSong", "Noto Serif CJK SC", serif`
  const titleLineHeight = Math.round(titleFontSize * 0.9)
  const titleWidth = draftPageRect.w - inner * 2
  const titlePrepared = getPrepared(ARTICLE_TITLE, titleFont)
  const titleHeight = layoutWithLines(titlePrepared, titleWidth, titleLineHeight).height

  const dekFont = `${draftPageRect.w < 720 ? 14 : 16}px "Kaiti SC", "STKaiti", "Songti SC", serif`
  const dekLineHeight = draftPageRect.w < 720 ? 20 : 22
  const dekPrepared = getPrepared(ARTICLE_DEK, dekFont)
  const dekWidth = Math.min(draftPageRect.w - inner * 2, Math.max(260, draftPageRect.w * 0.56))
  const dekHeight = layoutWithLines(dekPrepared, dekWidth, dekLineHeight).height

  const articleTop = pageY + inner + 30 + titleHeight + 14 + dekHeight + 18
  const fullWidth = draftPageRect.w - inner * 2
  const isNarrow = fullWidth < 560
  const gutter = isNarrow ? 0 : clamp(Math.round(fullWidth * 0.065), 28, 54)
  const columnWidth = isNarrow ? fullWidth : Math.floor((fullWidth - gutter) / 2)
  const bodyFont = `500 ${bodyFontSize}px "Songti SC", "STSong", "Noto Serif CJK SC", serif`
  const bodyLineHeight = Math.round(bodyFontSize * 1.56)
  const paragraphGap = Math.round(bodyLineHeight * 0.72)
  let totalBodyHeight = 0
  for (let index = 0; index < ARTICLE_PARAGRAPHS.length; index++) {
    const prepared = getPrepared(ARTICLE_PARAGRAPHS[index]!, bodyFont)
    const result = layoutWithLines(prepared, columnWidth, bodyLineHeight)
    totalBodyHeight += result.height
    if (index < ARTICLE_PARAGRAPHS.length - 1) totalBodyHeight += paragraphGap
  }
  const columnCount = isNarrow ? 1 : 2
  const articleHeight = Math.max(
    Math.round(viewportHeight * 0.64),
    Math.ceil(totalBodyHeight / columnCount) + bodyLineHeight * 28,
  )
  const pageHeight = inner + 30 + titleHeight + 14 + dekHeight + 18 + articleHeight + inner + 18
  const pageRect: SceneRect = {
    x: pageX,
    y: pageY,
    w: pageWidth,
    h: pageHeight,
  }
  const totalHeight = Math.max(viewportHeight, pageRect.y + pageRect.h + outer)
  const columns: SceneRect[] = isNarrow
    ? [{
        x: pageX + inner,
        y: articleTop,
        w: fullWidth,
        h: articleHeight,
      }]
    : [
        {
          x: pageX + inner,
          y: articleTop,
          w: columnWidth,
          h: articleHeight,
        },
        {
          x: pageX + inner + columnWidth + gutter,
          y: articleTop,
          w: columnWidth,
          h: articleHeight,
        },
      ]
  const articleBounds: SceneRect = {
    x: columns[0]!.x,
    y: columns[0]!.y,
    w: columns.at(-1)!.x + columns.at(-1)!.w - columns[0]!.x,
    h: columns[0]!.h,
  }
  const dropCapRect: SceneRect = {
    x: columns[0]!.x,
    y: columns[0]!.y + 4,
    w: clamp(Math.round(columns[0]!.w * 0.17), 64, 100),
    h: bodyLineHeight * 5,
  }

  const layout: SceneLayout = {
    width,
    height: totalHeight,
    pageRect,
    articleBounds,
    columns,
    dropCapRect,
    titleX: pageX + inner,
    titleY: pageY + inner + 18,
    titleWidth,
    titleFont,
    titleLineHeight,
    dekX: pageX + inner,
    dekY: pageY + inner + 30 + titleHeight + 8,
    dekWidth,
    dekFont,
    dekLineHeight,
    bodyFont,
    bodyLineHeight,
    snakeFont: `700 ${snakeFontSize}px "Kaiti SC", "STKaiti", "Songti SC", serif`,
    snakeLineHeight: Math.max(11, Math.round(snakeFontSize * 0.9) - 1),
    footerX: pageX + pageWidth - inner,
    footerY: pageY + pageHeight - inner + 4,
  }

  sceneCache = { width, height: viewportHeight, layout }
  return layout
}

function seedMotionIfNeeded(layout: SceneLayout): void {
  if (st.history.length > 0) return
  st.head = {
    x: layout.articleBounds.x + layout.articleBounds.w * 0.56,
    y: layout.articleBounds.y + layout.articleBounds.h * 0.38,
  }
  st.food = randomPointInRect(layout.articleBounds, 64, st.head)
  st.velocity = { x: 38, y: -10 }
  st.history = Array.from({ length: 32 }, () => ({ x: st.head.x, y: st.head.y }))
}

function resizeCanvas(width: number, height: number): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const targetWidth = Math.max(1, Math.round(width * dpr))
  const targetHeight = Math.max(1, Math.round(height * dpr))

  if (dom.canvas.width !== targetWidth || dom.canvas.height !== targetHeight) {
    dom.canvas.width = targetWidth
    dom.canvas.height = targetHeight
  }
  dom.canvas.style.height = `${height}px`
  dom.stageWrap.style.height = `${height}px`
  dom.mediaOverlay.style.height = `${height}px`
}

function drawBackdrop(layout: SceneLayout, now: number): void {
  const outer = ctx.createLinearGradient(0, 0, 0, layout.height)
  outer.addColorStop(0, '#d8ccb9')
  outer.addColorStop(1, '#c8baa6')
  ctx.fillStyle = outer
  ctx.fillRect(0, 0, layout.width, layout.height)

  ctx.fillStyle = `rgba(96, 63, 31, ${0.05 + Math.sin(now * 0.0012) * 0.01})`
  ctx.beginPath()
  ctx.arc(layout.width * 0.14, layout.height * 0.72, layout.width * 0.14, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = `rgba(96, 63, 31, ${0.03 + Math.cos(now * 0.001) * 0.01})`
  ctx.beginPath()
  ctx.arc(layout.width * 0.84, layout.height * 0.24, layout.width * 0.11, 0, Math.PI * 2)
  ctx.fill()
}

function drawPage(layout: SceneLayout): void {
  const { pageRect } = layout
  ctx.save()
  ctx.shadowColor = 'rgba(47, 28, 14, 0.18)'
  ctx.shadowBlur = 30
  pathRoundedRect(pageRect.x, pageRect.y, pageRect.w, pageRect.h, 30)
  const fill = ctx.createLinearGradient(pageRect.x, pageRect.y, pageRect.x, pageRect.y + pageRect.h)
  fill.addColorStop(0, '#f3eadb')
  fill.addColorStop(1, '#efe1cf')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(118, 95, 63, 0.28)'
  ctx.lineWidth = 1
  pathRoundedRect(pageRect.x + 0.5, pageRect.y + 0.5, pageRect.w - 1, pageRect.h - 1, 29)
  ctx.stroke()
}

function drawHeader(layout: SceneLayout, now: number): void {
  ctx.textBaseline = 'top'
  ctx.font = '600 11px "SF Mono", ui-monospace, monospace'
  ctx.fillStyle = `rgba(142, 83, 40, ${0.9 + Math.sin(now * 0.0016) * 0.04})`
  ctx.fillText(ARTICLE_LABEL, layout.titleX, layout.pageRect.y + 16)

  const titlePrepared = getPrepared(ARTICLE_TITLE, layout.titleFont)
  const titleLines = layoutWithLines(titlePrepared, layout.titleWidth, layout.titleLineHeight).lines
  ctx.font = layout.titleFont
  ctx.fillStyle = 'rgba(45, 29, 19, 0.95)'
  for (let index = 0; index < titleLines.length; index++) {
    const line = titleLines[index]!
    ctx.fillText(line.text, layout.titleX + Math.sin(now * 0.0008 + index * 0.42) * 3, layout.titleY + index * layout.titleLineHeight)
  }

  const dekPrepared = getPrepared(ARTICLE_DEK, layout.dekFont)
  const dekLines = layoutWithLines(dekPrepared, layout.dekWidth, layout.dekLineHeight).lines
  ctx.font = layout.dekFont
  ctx.fillStyle = 'rgba(79, 59, 39, 0.82)'
  for (let index = 0; index < dekLines.length; index++) {
    const line = dekLines[index]!
    ctx.fillText(line.text, layout.dekX + Math.sin(now * 0.001 + index * 0.6) * 3, layout.dekY + index * layout.dekLineHeight)
  }
}

function layoutArticleFragments(layout: SceneLayout, samples: SnakeSample[], now: number): ArticleLayoutResult {
  const fragments: ArticleFragment[] = []
  const mediaFragments: MediaFragment[] = []
  let paragraphIndex = 0
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let paragraphGapPending = false

  for (let columnIndex = 0; columnIndex < layout.columns.length; columnIndex++) {
    const column = layout.columns[columnIndex]!
    let lineTop = column.y

    while (lineTop + layout.bodyLineHeight <= column.y + column.h) {
      if (paragraphIndex >= ARTICLE_PARAGRAPHS.length) {
        return {
          fragments,
          mediaFragments,
          paragraphIndex,
          complete: true,
        }
      }

      if (paragraphGapPending) {
        lineTop += Math.round(layout.bodyLineHeight * 0.72)
        paragraphGapPending = false
        continue
      }

      const blocked = getBlockedIntervals(
        samples,
        { x: st.food.x, y: st.food.y, radius: lerp(16, 28, st.growth) },
        lineTop,
        lineTop + layout.bodyLineHeight,
      )
      if (columnIndex === 0 && rectIntersectsBand(layout.dropCapRect, lineTop, lineTop + layout.bodyLineHeight)) {
        blocked.push({
          left: layout.dropCapRect.x - 10,
          right: layout.dropCapRect.x + layout.dropCapRect.w + 14,
        })
      }

      const slots = carveTextLineSlots(
        { left: column.x, right: column.x + column.w },
        blocked,
      ).sort((left, right) => left.left - right.left)

      if (slots.length === 0) {
        lineTop += layout.bodyLineHeight
        continue
      }

      let bandRendered = false
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        if (paragraphIndex >= ARTICLE_PARAGRAPHS.length) break
        const slot = slots[slotIndex]!
        const prepared = getPrepared(ARTICLE_PARAGRAPHS[paragraphIndex]!, layout.bodyFont)
        const indent =
          cursor.segmentIndex === 0 &&
          cursor.graphemeIndex === 0 &&
          !(columnIndex === 0 && rectIntersectsBand(layout.dropCapRect, lineTop, lineTop + layout.bodyLineHeight))
            ? Math.round(layout.bodyLineHeight * 0.68)
            : 0
        const width = slot.right - slot.left - indent
        if (width < 28) continue

        const line = layoutNextLine(prepared, cursor, width)
        if (line === null) {
          paragraphIndex += 1
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          paragraphGapPending = true
          break
        }

        const lineProgress = (lineTop - layout.articleBounds.y) / Math.max(1, layout.articleBounds.h)
        const hasDropCap = columnIndex === 0 && rectIntersectsBand(layout.dropCapRect, lineTop, lineTop + layout.bodyLineHeight)
        const text =
          paragraphIndex === 0 &&
          hasDropCap &&
          cursor.segmentIndex === 0 &&
          cursor.graphemeIndex === 0 &&
          line.text.startsWith(DROP_CAP)
            ? line.text.slice(DROP_CAP.length)
            : line.text
        fragments.push({
          x: slot.left + indent + Math.sin(now * 0.0008 + lineTop * 0.01) * 1.1,
          y: lineTop + Math.cos(now * 0.0007 + slot.left * 0.018) * 0.7,
          text,
          alpha: 0.84 - lineProgress * 0.14,
        })

        cursor = line.end
        bandRendered = true
        if (isPreparedExhausted(prepared, cursor)) {
          const media = ARTICLE_MEDIA.find(item => item.afterParagraph === paragraphIndex)
          if (media !== undefined) {
            const width = Math.min(column.w * 0.92, 320)
            const height = width / media.aspect
            mediaFragments.push({
              src: media.src,
              x: column.x + (column.w - width) * 0.5,
              y: lineTop + layout.bodyLineHeight + 10,
              width,
              height,
            })
            lineTop += Math.round(height + layout.bodyLineHeight * 0.9)
          }
          paragraphIndex += 1
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          paragraphGapPending = true
          break
        }
      }

      if (bandRendered) lineTop += layout.bodyLineHeight
      else lineTop += layout.bodyLineHeight
    }
  }

  return {
    fragments,
    mediaFragments,
    paragraphIndex,
    complete: paragraphIndex >= ARTICLE_PARAGRAPHS.length,
  }
}

function syncMediaFragments(_layout: SceneLayout, mediaFragments: MediaFragment[]): void {
  while (mediaNodes.length < mediaFragments.length) {
    const node = document.createElement('img')
    node.className = 'article-media'
    node.loading = 'lazy'
    node.decoding = 'async'
    node.referrerPolicy = 'no-referrer'
    mediaNodes.push(node)
    dom.mediaOverlay.appendChild(node)
  }
  while (mediaNodes.length > mediaFragments.length) {
    mediaNodes.pop()!.remove()
  }

  for (let index = 0; index < mediaFragments.length; index++) {
    const media = mediaFragments[index]!
    const node = mediaNodes[index]!
    const viewTop = window.scrollY - 320
    const viewBottom = window.scrollY + window.innerHeight + 320
    const visible = media.y + media.height >= viewTop && media.y <= viewBottom
    node.style.display = visible ? 'block' : 'none'
    if (visible && node.src !== media.src) node.src = media.src
    node.style.left = `${media.x}px`
    node.style.top = `${media.y}px`
    node.style.width = `${media.width}px`
    node.style.height = `${media.height}px`
  }
}

function getBlockedIntervals(
  samples: SnakeSample[],
  food: { x: number, y: number, radius: number },
  bandTop: number,
  bandBottom: number,
): Interval[] {
  const intervals: Interval[] = []
  pushCircleIntervals(intervals, samples, bandTop, bandBottom, 12, 4)
  pushCircleIntervals(intervals, [food], bandTop, bandBottom, 18, 6)
  intervals.sort((left, right) => left.left - right.left)

  const merged: Interval[] = []
  for (let index = 0; index < intervals.length; index++) {
    const interval = intervals[index]!
    const previous = merged[merged.length - 1]
    if (previous === undefined || interval.left > previous.right) {
      merged.push({ left: interval.left, right: interval.right })
      continue
    }
    if (interval.right > previous.right) previous.right = interval.right
  }
  return merged
}

function pushCircleIntervals(
  target: Interval[],
  circles: Array<{ x: number, y: number, radius: number }>,
  bandTop: number,
  bandBottom: number,
  horizontalPadding: number,
  verticalPadding: number,
): void {
  const sampleTop = bandTop - verticalPadding
  const sampleBottom = bandBottom + verticalPadding

  for (let index = 0; index < circles.length; index++) {
    const circle = circles[index]!
    let dy = 0
    if (circle.y < sampleTop) dy = sampleTop - circle.y
    else if (circle.y > sampleBottom) dy = circle.y - sampleBottom
    if (dy >= circle.radius) continue

    const halfWidth = Math.sqrt(circle.radius * circle.radius - dy * dy)
    target.push({
      left: circle.x - halfWidth - horizontalPadding,
      right: circle.x + halfWidth + horizontalPadding,
    })
  }
}

function drawArticleFragments(layout: SceneLayout, fragments: ArticleFragment[], now: number): void {
  ctx.font = layout.bodyFont
  ctx.textBaseline = 'top'
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index]!
    const wave = Math.sin(now * 0.001 + fragment.y * 0.013) * 0.02
    ctx.fillStyle = `rgba(45, 29, 19, ${fragment.alpha + wave})`
    ctx.fillText(fragment.text, fragment.x, fragment.y)
  }
}

function drawDropCap(layout: SceneLayout): void {
  ctx.save()
  ctx.font = `700 ${Math.round(layout.dropCapRect.h * 0.78)}px "Kaiti SC", "STKaiti", "Songti SC", serif`
  ctx.fillStyle = 'rgba(124, 58, 35, 0.9)'
  ctx.textBaseline = 'top'
  ctx.fillText(DROP_CAP, layout.dropCapRect.x + 2, layout.dropCapRect.y - 6)
  ctx.restore()
}

function drawSnake(layout: SceneLayout, samples: SnakeSample[], now: number): void {
  const rows = collectSnakeRows(layout, samples, now)
  const prepared = getPrepared(getSnakeText(), layout.snakeFont)
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!
    let line = layoutNextLine(prepared, cursor, row.width)
    if (line === null) {
      cursor = { segmentIndex: 0, graphemeIndex: 0 }
      line = layoutNextLine(prepared, cursor, row.width)
    }
    if (line === null) continue

    cursor = line.end
    const x = row.x - line.width * 0.5 + Math.sin(now * 0.0013 + row.age * 8) * (4 + st.growth * 8)
    const alpha = 0.14 + (1 - row.age) * 0.28
    const tone = Math.round(138 + row.glow * 24)

    ctx.save()
    ctx.font = layout.snakeFont
    ctx.textBaseline = 'top'
    ctx.shadowColor = `rgba(176, 108, 62, ${0.06 + row.glow * 0.12})`
    ctx.shadowBlur = 7 + row.glow * 10
    ctx.fillStyle = `rgba(${tone}, ${tone - 34}, ${tone - 52}, ${alpha})`
    ctx.fillText(line.text, x, row.y)
    ctx.restore()
  }
}

function collectSnakeRows(layout: SceneLayout, samples: SnakeSample[], now: number): SnakeRow[] {
  const rows: SnakeRow[] = []
  const rowCount = Math.floor(layout.articleBounds.h / layout.snakeLineHeight)

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const progress = rowCount <= 1 ? 0 : rowIndex / (rowCount - 1)
    const y =
      layout.articleBounds.y +
      rowIndex * layout.snakeLineHeight +
      Math.sin(now * 0.001 + rowIndex * 0.42) * (0.8 + st.growth * 4)
    let widest = 0
    let weightedX = 0
    let weightSum = 0
    let youngest = 1

    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      const sample = samples[sampleIndex]!
      const dy = Math.abs(y - sample.y)
      if (dy >= sample.radius) continue
      const halfWidth = Math.sqrt(sample.radius * sample.radius - dy * dy)
      const weight = halfWidth * (1.2 - sample.age * 0.55)
      if (halfWidth > widest) widest = halfWidth
      weightedX += sample.x * weight
      weightSum += weight
      if (sample.age < youngest) youngest = sample.age
    }

    if (widest < 10 || weightSum === 0) continue

    rows.push({
      x: clamp(
        weightedX / weightSum + Math.sin(now * 0.0012 + progress * 7) * (3 + st.growth * 12),
        layout.articleBounds.x + 18,
        layout.articleBounds.x + layout.articleBounds.w - 18,
      ),
      y,
      width: Math.min(widest * 1.52, layout.articleBounds.w - 16),
      age: youngest,
      glow: 1 - youngest,
    })
  }

  return rows
}

function buildSnakeSamples(layout: SceneLayout): SnakeSample[] {
  const samples: SnakeSample[] = []
  const sampleCount = Math.min(st.history.length, BASE_HISTORY_POINTS + (getBodyWordCount() - BASE_BODY_WORDS) * HISTORY_POINTS_PER_WORD)
  const maxRadius = layout.pageRect.w * 0.03
  const minRadius = layout.pageRect.w * 0.011

  for (let index = 0; index < sampleCount; index++) {
    const historyIndex = st.history.length - 1 - index
    const point = st.history[historyIndex]
    if (point === undefined) break
    const age = sampleCount <= 1 ? 1 : index / (sampleCount - 1)
    samples.push({
      x: point.x,
      y: point.y,
      radius: lerp(maxRadius, minRadius, age),
      age,
    })
  }

  return samples
}

function drawFood(_layout: SceneLayout, now: number): void {
  const fontSize = 17
  const targetFont = `700 ${fontSize}px "SF Mono", ui-monospace, monospace`
  const prepared = getPrepared(st.activeTargetWord, targetFont)
  const lines = layoutWithLines(prepared, 320, Math.round(fontSize * 1.2)).lines
  const textWidth = getMaxWidth(lines)
  const pulse = 0.78 + Math.sin(now * 0.005) * 0.12 + st.flash * 0.16

  ctx.save()
  ctx.translate(st.food.x, st.food.y)
  ctx.rotate(Math.sin(now * 0.001 + st.captures * 0.4) * 0.12)
  ctx.fillStyle = `rgba(170, 69, 28, ${0.9 * pulse})`
  ctx.font = targetFont
  ctx.textBaseline = 'middle'
  ctx.fillText(st.activeTargetWord, -textWidth * 0.5, 0)
  ctx.restore()
}

function drawHead(_layout: SceneLayout, now: number): void {
  const headGlyph = 'O.o'
  const headFont = '700 22px "SF Mono", ui-monospace, monospace'
  const prepared = getPrepared(headGlyph, headFont)
  const lines = layoutWithLines(prepared, 200, 24).lines
  const textWidth = getMaxWidth(lines)
  const aura = 12 + Math.sin(now * 0.006) * 2 + st.flash * 6

  ctx.save()
  ctx.translate(st.head.x, st.head.y)
  ctx.shadowColor = 'rgba(255, 245, 221, 0.3)'
  ctx.shadowBlur = 18 + st.flash * 12
  ctx.fillStyle = `rgba(248, 241, 226, ${0.88 + st.flash * 0.08})`
  ctx.beginPath()
  ctx.arc(0, 0, aura, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = headFont
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1c1611'
  ctx.fillText(headGlyph, -textWidth * 0.5, 0)
  ctx.restore()
}

function drawFooter(layout: SceneLayout, now: number): void {
  ctx.font = '600 11px "SF Mono", ui-monospace, monospace'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = `rgba(99, 77, 55, ${0.72 + Math.sin(now * 0.0014) * 0.04})`
  ctx.textAlign = 'right'
  ctx.fillText(FOOTER_NOTE, layout.footerX, layout.footerY)
  ctx.textAlign = 'left'
}

function getMouseGuide(layout: SceneLayout, now: number): Point | null {
  if (!pointer.inside || now - pointer.lastMoveAt > 1800) return null
  if (!pointInRect(pointer, layout.pageRect)) return null
  return normalize(pointer.x - st.head.x, pointer.y - st.head.y)
}

function getKeyboardGuide(): Point | null {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0)
  if (x === 0 && y === 0) return null
  return normalize(x, y)
}

function pushHistoryPoint(point: Point): void {
  const previous = st.history[st.history.length - 1]
  if (previous !== undefined && Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return
  st.history.push({ x: point.x, y: point.y })
  const maxLength = BASE_HISTORY_POINTS + (getBodyWordCount() - BASE_BODY_WORDS) * HISTORY_POINTS_PER_WORD
  while (st.history.length > maxLength) st.history.shift()
}

function getBodyWordCount(): number {
  return Math.min(BASE_BODY_WORDS + st.captures, MAX_BODY_WORDS)
}

function getBodyGrowth(): number {
  return (getBodyWordCount() - BASE_BODY_WORDS) / Math.max(1, MAX_BODY_WORDS - BASE_BODY_WORDS)
}

function getSnakeText(): string {
  const wordCount = getBodyWordCount()
  const words: string[] = []
  for (let index = 0; index < wordCount; index++) {
    words.push(SNAKE_WORDS[index % SNAKE_WORDS.length]!)
  }
  return words.join(' ')
}

function randomPointInRect(rect: SceneRect, inset: number, awayFrom?: Point): Point {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = {
      x: rect.x + inset + Math.random() * Math.max(1, rect.w - inset * 2),
      y: rect.y + inset + Math.random() * Math.max(1, rect.h - inset * 2),
    }
    if (awayFrom === undefined || Math.hypot(candidate.x - awayFrom.x, candidate.y - awayFrom.y) > rect.w * 0.16) {
      return candidate
    }
  }
  return {
    x: rect.x + rect.w * 0.5,
    y: rect.y + rect.h * 0.5,
  }
}

function rectIntersectsBand(rect: SceneRect, top: number, bottom: number): boolean {
  return bottom > rect.y && top < rect.y + rect.h
}

function pointInRect(point: Point, rect: SceneRect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

function pathRoundedRect(x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) * 0.5))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}\u0000${text}`
  const cached = preparedCache.get(key)
  if (cached !== undefined) return cached
  const prepared = prepareWithSegments(text, font)
  preparedCache.set(key, prepared)
  return prepared
}

function isPreparedExhausted(prepared: PreparedTextWithSegments, cursor: LayoutCursor): boolean {
  return layoutNextLine(prepared, cursor, 100_000) === null
}

function getMaxWidth(lines: LayoutLine[]): number {
  let max = 0
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]!.width > max) max = lines[index]!.width
  }
  return max
}

function normalize(x: number, y: number): Point {
  const length = Math.hypot(x, y)
  if (length <= 0.0001) return { x: 0, y: 0 }
  return { x: x / length, y: y / length }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

function getRequiredCanvas(id: string): HTMLCanvasElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`#${id} not found`)
  return element
}

function getRequiredDiv(id: string): HTMLDivElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLDivElement)) throw new Error(`#${id} not found`)
  return element
}
