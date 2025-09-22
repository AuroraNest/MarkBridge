<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface DocumentParagraphBlock {
  type: 'paragraph'
  text: string
  label?: string
}

interface DocumentHeadingBlock {
  type: 'heading'
  text: string
  level: number
}

interface DocumentListBlock {
  type: 'ul' | 'ol'
  items: string[]
}

type DocumentBlock = DocumentParagraphBlock | DocumentHeadingBlock | DocumentListBlock

type SourcePreview =
  | { type: 'empty' }
  | { type: 'document'; blocks: DocumentBlock[] }
  | { type: 'markdown'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }

type ConversionPreview =
  | { type: 'empty' }
  | { type: 'markdown'; text: string }
  | { type: 'document'; html: string }
  | { type: 'table'; headers: string[]; rows: string[][]; markdown: string }

interface ConversionResult {
  text: string
  preview: ConversionPreview
}

interface TableData {
  headers: string[]
  rows: string[][]
}

interface ConversionMode {
  id: string
  label: string
  fromLabel: string
  toLabel: string
  description: string
  accent: string
  sampleInput: string
  sampleFileName: string
  uploadHint: string
  demoExtensions: string[]
  download: { extension: string; mime: string }
  convert: (input: string) => ConversionResult
  sourcePreview: (input: string) => SourcePreview
}

const conversionModes: ConversionMode[] = [
  {
    id: 'word-to-markdown',
    label: 'Word → Markdown',
    fromLabel: 'Word 源文档',
    toLabel: 'Markdown 输出',
    description: '保留标题、段落与列表结构，自动生成规范的 Markdown。',
    accent: '#5860ff',
    sampleInput: `## 项目综述\nMarkBridge 让传统文档与知识库无缝协作。\n\n重点目标：\n- 提升团队协作效率\n- 保留文档层级结构\n- 支持导出多种格式\n\n时间线：\n1. 需求确认 - 3 月\n2. 架构设计 - 4 月\n3. 上线测试 - 5 月\n\n负责人：张敏 / docs@markbridge.dev`,
    sampleFileName: 'team-brief.docx',
    uploadHint: '演示环境支持粘贴文本或上传 .txt 示例，正式版将支持 .docx/.doc 自动解析。',
    demoExtensions: ['txt'],
    download: { extension: 'md', mime: 'text/markdown;charset=utf-8' },
    convert: (input: string) => {
      const blocks = createDocumentBlocks(input)
      const markdown = documentBlocksToMarkdown(blocks)
      return {
        text: markdown,
        preview: markdown.trim()
          ? { type: 'markdown', text: markdown }
          : { type: 'empty' },
      }
    },
    sourcePreview: (input: string) => {
      const blocks = createDocumentBlocks(input)
      return blocks.length ? { type: 'document', blocks } : { type: 'empty' }
    },
  },
  {
    id: 'excel-to-markdown',
    label: 'Excel → Markdown',
    fromLabel: 'Excel 表格',
    toLabel: 'Markdown 表格',
    description: '将表格快速排版为 Markdown 表格，方便贴入知识库或 Git 仓库。',
    accent: '#3fb984',
    sampleInput: `模块,负责人,进度,备注\n产品文档,王一,完成,等待评审\nAPI 清单,刘芳,进行中,补充示例\n发布计划,赵磊,未开始,待排期`,
    sampleFileName: 'documentation-plan.csv',
    uploadHint: '演示环境支持 .csv/.tsv 表格文本，正式版支持 .xlsx/.xls 自动处理。',
    demoExtensions: ['csv', 'tsv'],
    download: { extension: 'md', mime: 'text/markdown;charset=utf-8' },
    convert: (input: string) => {
      const table = parseTable(input)
      if (!table) {
        return { text: '', preview: { type: 'empty' } }
      }
      const markdown = tableToMarkdown(table)
      return {
        text: markdown,
        preview: {
          type: 'table',
          headers: table.headers,
          rows: table.rows,
          markdown,
        },
      }
    },
    sourcePreview: (input: string) => {
      const table = parseTable(input)
      if (!table) {
        return { type: 'empty' }
      }
      return { type: 'table', headers: table.headers, rows: table.rows }
    },
  },
  {
    id: 'markdown-to-word',
    label: 'Markdown → Word',
    fromLabel: 'Markdown 源文件',
    toLabel: 'Word 文档',
    description: '将 Markdown 布局渲染为 Word 可打开的文档，适用于汇报与分享。',
    accent: '#ff7b5f',
    sampleInput: `# 产品更新简报\n欢迎使用 MarkBridge。以下是本周亮点：\n\n## 新功能\n- 支持 Word/Excel 双向转换\n- Markdown 导出带来更好格式\n\n## 下一步计划\n1. 开放自动化 API\n2. 增加团队协作模板\n\n如需了解更多，请访问 [markbridge.dev](https://markbridge.dev)`,
    sampleFileName: 'release-notes.md',
    uploadHint: '支持直接粘贴 Markdown 内容，或上传 .md/.txt 文件。',
    demoExtensions: ['md', 'txt'],
    download: { extension: 'doc', mime: 'application/msword' },
    convert: (input: string) => {
      const { doc, preview } = markdownToWordDocument(input)
      return {
        text: doc,
        preview: preview.trim() ? { type: 'document', html: preview } : { type: 'empty' },
      }
    },
    sourcePreview: (input: string) => {
      return input.trim() ? { type: 'markdown', text: input } : { type: 'empty' }
    },
  },
]

const activeModeId = ref(conversionModes[0].id)
const activeMode = computed(() => conversionModes.find((mode) => mode.id === activeModeId.value) ?? conversionModes[0])
const sourceText = ref('')
const inputFileName = ref('')
const isProcessing = ref(false)
const toastMessage = ref('')
const workspaceRef = ref<HTMLElement | null>(null)
const featureRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

let toastTimer: ReturnType<typeof setTimeout> | null = null

watch(
  activeMode,
  (mode) => {
    sourceText.value = mode.sampleInput
    inputFileName.value = mode.sampleFileName
  },
  { immediate: true }
)

const sourcePreview = computed<SourcePreview>(() => {
  if (!sourceText.value.trim()) {
    return { type: 'empty' }
  }
  return activeMode.value.sourcePreview(sourceText.value)
})

const conversionResult = computed<ConversionResult>(() => {
  if (!sourceText.value.trim()) {
    return { text: '', preview: { type: 'empty' } }
  }
  return activeMode.value.convert(sourceText.value)
})

const convertedPreview = computed(() => conversionResult.value.preview)
const outputFileName = computed(() => {
  const base = inputFileName.value.replace(/\.[^.]+$/, '') || activeMode.value.id
  return `${base}.${activeMode.value.download.extension}`
})

const fromLabel = computed(() => activeMode.value.fromLabel)
const toLabel = computed(() => activeMode.value.toLabel)

function changeMode(id: string) {
  if (id === activeModeId.value) return
  const target = conversionModes.find((mode) => mode.id === id)
  if (!target) return
  activeModeId.value = id
  showToast(`已切换到 ${target.label}`)
}

function showToast(message: string) {
  toastMessage.value = message
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 3200)
}

function scrollToWorkspace() {
  workspaceRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function scrollToFeatures() {
  featureRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function openFileSelector() {
  fileInputRef.value?.click()
}

function triggerUpload() {
  scrollToWorkspace()
  requestAnimationFrame(() => {
    openFileSelector()
  })
}

function resetFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const allowed = activeMode.value.demoExtensions
  if (!allowed.includes(ext)) {
    showToast(`演示环境暂仅支持 ${allowed.map((item) => '.' + item).join(' / ')} 文件上传`)
    resetFileInput()
    return
  }

  try {
    const text = await file.text()
    sourceText.value = text
    inputFileName.value = file.name
    showToast(`已导入 ${file.name}`)
  } catch (error) {
    showToast('文件读取失败，请重试')
  } finally {
    resetFileInput()
  }
}

async function triggerConvert() {
  if (!sourceText.value.trim()) {
    showToast('请先输入或上传文档内容')
    return
  }
  isProcessing.value = true
  await new Promise((resolve) => setTimeout(resolve, 600))
  isProcessing.value = false
  showToast(`转换完成，可以下载 ${activeMode.value.toLabel}`)
}

function handleDownload() {
  const content = conversionResult.value.text
  if (!content.trim()) {
    showToast('暂无可下载的内容')
    return
  }
  const blob = new Blob([content], { type: activeMode.value.download.mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = outputFileName.value
  anchor.click()
  URL.revokeObjectURL(url)
  showToast(`已开始下载 ${outputFileName.value}`)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatInlineMarkdown(text: string): string {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

function createDocumentBlocks(text: string): DocumentBlock[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: DocumentBlock[] = []
  let paragraph: string[] = []
  let currentList: DocumentListBlock | null = null

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList)
      currentList = null
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      continue
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/)
    if (bulletMatch) {
      flushParagraph()
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push(bulletMatch[1])
      continue
    }

    const orderedMatch = trimmed.match(/^(\d+)[\.)]\s+(.*)$/)
    if (orderedMatch) {
      flushParagraph()
      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push(orderedMatch[2])
      continue
    }

    const colonMatch = trimmed.match(/^([^:：]{2,})[:：]\s*(.*)$/)
    if (colonMatch) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'paragraph', text: colonMatch[2], label: colonMatch[1] })
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()

  return blocks
}

function documentBlocksToMarkdown(blocks: DocumentBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === 'heading') {
      lines.push(`${'#'.repeat(block.level)} ${block.text}`)
      lines.push('')
    } else if (block.type === 'paragraph') {
      if (block.label) {
        lines.push(`**${block.label}:** ${block.text}`)
      } else {
        lines.push(block.text)
      }
      lines.push('')
    } else {
      block.items.forEach((item, index) => {
        if (block.type === 'ul') {
          lines.push(`- ${item}`)
        } else {
          lines.push(`${index + 1}. ${item}`)
        }
      })
      lines.push('')
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function splitTableRow(row: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if ((char === ',' || char === '\t') && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function parseTable(text: string): TableData | null {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => splitTableRow(row))

  if (!rows.length) {
    return null
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const normalizedRows = rows.map((row) => {
    if (row.length === columnCount) {
      return row
    }
    return [...row, ...Array(columnCount - row.length).fill('')]
  })

  const [headerRow, ...bodyRows] = normalizedRows
  return { headers: headerRow, rows: bodyRows }
}

function tableToMarkdown(table: TableData): string {
  const { headers, rows } = table
  const headerLine = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const bodyLines = rows.map((row) => `| ${row.join(' | ')} |`)
  return [headerLine, separator, ...bodyLines].join('\n')
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const html: string[] = []
  let inUl = false
  let inOl = false
  let inCode = false
  const codeLines: string[] = []

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>')
      inUl = false
    }
    if (inOl) {
      html.push('</ol>')
      inOl = false
    }
  }

  const flushCode = () => {
    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      codeLines.length = 0
      inCode = false
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (/^```/.test(line)) {
      if (inCode) {
        flushCode()
      } else {
        closeLists()
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeLines.push(rawLine)
      continue
    }

    if (!line.trim()) {
      closeLists()
      html.push('<div class="md-gap"></div>')
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      closeLists()
      const level = headingMatch[1].length
      html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    const bulletMatch = line.match(/^[-*+]\s+(.*)$/)
    if (bulletMatch) {
      if (!inUl) {
        closeLists()
        inUl = true
        html.push('<ul>')
      }
      html.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`)
      continue
    }

    const orderedMatch = line.match(/^(\d+)[\.)]\s+(.*)$/)
    if (orderedMatch) {
      if (!inOl) {
        closeLists()
        inOl = true
        html.push('<ol>')
      }
      html.push(`<li>${formatInlineMarkdown(orderedMatch[2])}</li>`)
      continue
    }

    closeLists()
    html.push(`<p>${formatInlineMarkdown(line.trim())}</p>`)
  }

  flushCode()
  closeLists()

  return html
    .filter((fragment, index, arr) => !(fragment === '<div class="md-gap"></div>' && (index === 0 || arr[index - 1] === '<div class="md-gap"></div>')))
    .join('\n')
}

function markdownToWordDocument(markdown: string): { doc: string; preview: string } {
  const bodyContent = markdownToHtml(markdown)
  const previewHtml = `<div class="doc-surface">${bodyContent}</div>`
  const documentHtml = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>MarkBridge Export</title><style>body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1a1f36;line-height:1.6;padding:32px;}h1,h2,h3,h4{color:#29304d;margin:24px 0 12px;}p{margin:0 0 12px;}ul,ol{margin:0 0 12px 24px;}code{background:#f1f3f8;padding:2px 6px;border-radius:4px;}pre{background:#f1f3f8;border-radius:8px;padding:16px;overflow:auto;}table{border-collapse:collapse;margin-bottom:16px;}th,td{border:1px solid #d5daed;padding:8px 12px;text-align:left;}a{color:#5860ff;}</style></head><body>${bodyContent}</body></html>`
  return { doc: documentHtml, preview: previewHtml }
}
</script>

<template>
  <div class="page">
    <header class="top-nav">
      <div class="logo">
        <span class="logo-mark">MB</span>
        <div class="logo-text">
          <span class="logo-title">MarkBridge</span>
          <span class="logo-sub">文档转换工作台</span>
        </div>
      </div>
      <nav class="nav-links">
        <button type="button" class="nav-link" @click="scrollToWorkspace">转换体验</button>
        <button type="button" class="nav-link" @click="scrollToFeatures">功能亮点</button>
        <a class="nav-docs" href="https://markbridge.dev" target="_blank" rel="noopener">产品官网</a>
      </nav>
      <button type="button" class="nav-cta" @click="triggerUpload">立即开始</button>
    </header>

    <section class="hero">
      <div class="hero-content">
        <h1>一键连接 Markdown 与 Office 世界</h1>
        <p>
          智能识别标题、列表与表格，保留排版结构。支持 Word、Excel 与 Markdown 之间自由转换。
        </p>
        <div class="hero-actions">
          <button type="button" class="hero-primary" @click="triggerUpload">上传文档体验</button>
          <button type="button" class="hero-secondary" @click="scrollToFeatures">了解更多</button>
        </div>
        <div class="hero-metrics">
          <div class="metric-item">
            <strong>3 种</strong>
            <span>常用转换模板</span>
          </div>
          <div class="metric-item">
            <strong>100%</strong>
            <span>结构识别覆盖率</span>
          </div>
          <div class="metric-item">
            <strong>&lt; 1s</strong>
            <span>本地预览响应</span>
          </div>
        </div>
      </div>
      <div class="hero-visual">
        <div class="hero-card">
          <div class="hero-card-header">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <div class="hero-card-body">
            <p class="hero-card-caption">Markdown 预览</p>
            <pre>
## MarkBridge
- Word → Markdown
- Excel → Markdown
- Markdown → Word
            </pre>
          </div>
        </div>
      </div>
    </section>

    <section class="workspace" ref="workspaceRef">
      <header class="workspace-header">
        <div>
          <h2>{{ activeMode.label }}</h2>
          <p>{{ activeMode.description }}</p>
        </div>
        <span class="workspace-badge">实时预览</span>
      </header>

      <div class="mode-selector">
        <button
          v-for="mode in conversionModes"
          :key="mode.id"
          type="button"
          class="mode-chip"
          :class="{ active: mode.id === activeModeId }"
          @click="changeMode(mode.id)"
        >
          <span class="chip-indicator" :style="{ background: mode.accent }"></span>
          <div class="chip-text">
            <span class="chip-title">{{ mode.label }}</span>
            <span class="chip-desc">{{ mode.description }}</span>
          </div>
        </button>
      </div>

      <div class="workspace-body">
        <div class="control-panel">
          <div class="upload-card">
            <div class="upload-info">
              <h3>导入 {{ fromLabel }}</h3>
              <p>{{ activeMode.uploadHint }}</p>
            </div>
            <div class="upload-actions">
              <input
                ref="fileInputRef"
                id="file-input"
                type="file"
                class="file-input"
                :accept="activeMode.demoExtensions.map((ext) => '.' + ext).join(',')"
                @change="handleFileUpload"
              />
              <label class="upload-dropzone" for="file-input">
                <span class="icon">📁</span>
                <span>点击选择文件或拖拽到此处</span>
              </label>
              <button type="button" class="paste-btn" @click="openFileSelector">从本地选择</button>
            </div>
          </div>

          <div class="editor-card">
            <header class="editor-header">
              <div>
                <span class="editor-label">当前内容</span>
                <strong class="editor-name">{{ inputFileName }}</strong>
              </div>
              <span class="editor-type">{{ fromLabel }}</span>
            </header>
            <textarea
              v-model="sourceText"
              class="editor-textarea"
              rows="12"
              placeholder="在此粘贴或编辑文档内容..."
            ></textarea>
          </div>

          <div class="actions">
            <button type="button" class="primary" :disabled="isProcessing" @click="triggerConvert">
              <span v-if="isProcessing" class="spinner"></span>
              <span>{{ isProcessing ? '智能处理中...' : '立即转换' }}</span>
            </button>
            <button type="button" class="ghost" @click="handleDownload">下载 {{ toLabel }}</button>
          </div>

          <transition name="fade">
            <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
          </transition>
        </div>

        <div class="preview-panel">
          <div class="preview-grid">
            <div class="preview-card">
              <header class="preview-card-header">
                <span class="pill">{{ fromLabel }}</span>
                <span class="preview-title">转前预览</span>
              </header>
              <div class="preview-card-body">
                <template v-if="sourcePreview.type === 'document'">
                  <div class="doc-page">
                    <div
                      v-for="(block, index) in sourcePreview.blocks"
                      :key="index"
                      class="doc-block"
                    >
                      <h3 v-if="block.type === 'heading'" :class="`doc-heading level-${block.level}`">
                        {{ block.text }}
                      </h3>
                      <p v-else-if="block.type === 'paragraph'" class="doc-paragraph">
                        <strong v-if="block.label">{{ block.label }}：</strong>
                        {{ block.text }}
                      </p>
                      <ul v-else-if="block.type === 'ul'" class="doc-list">
                        <li v-for="(item, idx) in block.items" :key="idx">{{ item }}</li>
                      </ul>
                      <ol v-else-if="block.type === 'ol'" class="doc-list ordered">
                        <li v-for="(item, idx) in block.items" :key="idx">{{ item }}</li>
                      </ol>
                    </div>
                  </div>
                </template>
                <template v-else-if="sourcePreview.type === 'table'">
                  <div class="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th v-for="(header, index) in sourcePreview.headers" :key="index">
                            {{ header }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in sourcePreview.rows" :key="rowIndex">
                          <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                            {{ cell }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
                <template v-else-if="sourcePreview.type === 'markdown'">
                  <pre class="markdown-preview">{{ sourcePreview.text }}</pre>
                </template>
                <p v-else class="preview-empty">上传文件或在左侧粘贴内容即可查看预览</p>
              </div>
            </div>

            <div class="preview-card">
              <header class="preview-card-header">
                <span class="pill accent">{{ toLabel }}</span>
                <span class="preview-title">转后预览</span>
              </header>
              <div class="preview-card-body">
                <template v-if="convertedPreview.type === 'markdown'">
                  <pre class="markdown-preview">{{ convertedPreview.text }}</pre>
                </template>
                <template v-else-if="convertedPreview.type === 'table'">
                  <div class="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th v-for="(header, index) in convertedPreview.headers" :key="index">
                            {{ header }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in convertedPreview.rows" :key="rowIndex">
                          <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                            {{ cell }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="code-block">
                    <div class="code-header">Markdown 表格</div>
                    <pre>{{ convertedPreview.markdown }}</pre>
                  </div>
                </template>
                <template v-else-if="convertedPreview.type === 'document'">
                  <div class="doc-page" v-html="convertedPreview.html"></div>
                </template>
                <p v-else class="preview-empty">完成转换后将在此显示结果</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="feature-grid" ref="featureRef">
      <h2>功能亮点</h2>
      <div class="feature-list">
        <article class="feature-card">
          <h3>精准结构识别</h3>
          <p>自动识别标题层级、列表与标签信息，轻松获得干净的 Markdown 语法。</p>
        </article>
        <article class="feature-card">
          <h3>双向格式守护</h3>
          <p>从 Markdown 回写 Word 时保留字体、间距与链接样式，适合交付与分享。</p>
        </article>
        <article class="feature-card">
          <h3>团队协作无缝</h3>
          <p>配合知识库、Git 仓库使用，帮助产品、设计与研发共享一套文档语言。</p>
        </article>
      </div>
    </section>

    <footer class="page-footer">
      <div>
        <strong>MarkBridge</strong>
        <span>让 Markdown 与 Office 更近一步</span>
      </div>
      <button type="button" class="footer-cta" @click="scrollToWorkspace">立即体验</button>
    </footer>
  </div>
</template>

<style scoped>
.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 24px 80px;
  color: #1a1f36;
}

.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 48px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, #5860ff, #9b5cff);
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.6px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logo-title {
  font-weight: 700;
  font-size: 20px;
}

.logo-sub {
  font-size: 12px;
  color: #6f7691;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-link {
  border: none;
  background: transparent;
  font-size: 14px;
  color: #4b516b;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease;
}

.nav-link:hover {
  background: rgba(88, 96, 255, 0.08);
  color: #2f3570;
}

.nav-docs {
  font-size: 14px;
  color: #5860ff;
  padding: 8px 12px;
  border-radius: 999px;
  transition: background 0.2s ease;
}

.nav-docs:hover {
  background: rgba(88, 96, 255, 0.12);
}

.nav-cta {
  border: none;
  padding: 10px 24px;
  border-radius: 999px;
  background: linear-gradient(135deg, #5860ff, #7a66ff);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(88, 96, 255, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.nav-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(88, 96, 255, 0.28);
}

.hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 48px;
  margin-bottom: 72px;
}

.hero-content h1 {
  font-size: 40px;
  line-height: 1.2;
  margin-bottom: 12px;
}

.hero-content p {
  margin-bottom: 24px;
  color: #4b516b;
  font-size: 16px;
}

.hero-actions {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
}

.hero-primary,
.hero-secondary {
  border-radius: 999px;
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.hero-primary {
  background: linear-gradient(135deg, #5860ff, #7f55ff);
  color: #fff;
  box-shadow: 0 14px 24px rgba(88, 96, 255, 0.22);
}

.hero-primary:hover {
  box-shadow: 0 18px 32px rgba(88, 96, 255, 0.28);
  transform: translateY(-2px);
}

.hero-secondary {
  background: rgba(88, 96, 255, 0.12);
  color: #394064;
}

.hero-secondary:hover {
  background: rgba(88, 96, 255, 0.18);
}

.hero-metrics {
  display: flex;
  gap: 28px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #4b516b;
}

.metric-item strong {
  font-size: 20px;
  color: #29304d;
}

.hero-visual {
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-card {
  width: 320px;
  border-radius: 24px;
  background: linear-gradient(150deg, rgba(88, 96, 255, 0.14), rgba(150, 102, 255, 0.1));
  box-shadow: 0 30px 60px rgba(38, 51, 124, 0.18);
  overflow: hidden;
}

.hero-card-header {
  display: flex;
  gap: 6px;
  padding: 16px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot-red {
  background: #ff5f57;
}

.dot-yellow {
  background: #febc2e;
}

.dot-green {
  background: #27c93f;
}

.hero-card-body {
  padding: 0 24px 24px;
  color: #29304d;
}

.hero-card-caption {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1.8px;
  color: #7780a3;
}

.hero-card pre {
  background: rgba(255, 255, 255, 0.8);
  padding: 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.6;
  overflow: hidden;
}

.workspace {
  background: rgba(255, 255, 255, 0.94);
  border-radius: 28px;
  padding: 32px;
  box-shadow: 0 24px 60px rgba(31, 45, 123, 0.12);
  backdrop-filter: blur(8px);
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.workspace-header h2 {
  margin: 0 0 8px;
  font-size: 26px;
}

.workspace-header p {
  margin: 0;
  color: #59607d;
}

.workspace-badge {
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(88, 96, 255, 0.12);
  color: #394064;
  font-size: 12px;
  font-weight: 600;
}

.mode-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 28px;
}

.mode-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 18px;
  border: 1px solid rgba(88, 96, 255, 0.12);
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  min-width: 220px;
  transition: all 0.2s ease;
}

.mode-chip.active {
  border-color: rgba(88, 96, 255, 0.45);
  box-shadow: 0 10px 26px rgba(88, 96, 255, 0.14);
  background: rgba(88, 96, 255, 0.08);
}

.mode-chip:hover {
  transform: translateY(-2px);
}

.chip-indicator {
  width: 10px;
  height: 40px;
  border-radius: 999px;
}

.chip-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.chip-title {
  font-weight: 600;
  color: #29304d;
}

.chip-desc {
  font-size: 12px;
  color: #6b7190;
}

.workspace-body {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 28px;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-card {
  background: rgba(88, 96, 255, 0.08);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.upload-info h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

.upload-info p {
  margin: 0;
  font-size: 13px;
  color: #4f5775;
}

.upload-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-input {
  display: none;
}

.upload-dropzone {
  border: 1px dashed rgba(88, 96, 255, 0.4);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #394064;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.6);
  transition: background 0.2s ease, border-color 0.2s ease;
}

.upload-dropzone:hover {
  background: rgba(88, 96, 255, 0.12);
  border-color: rgba(88, 96, 255, 0.6);
}

.paste-btn {
  align-self: flex-start;
  padding: 8px 16px;
  border-radius: 12px;
  border: none;
  background: rgba(57, 64, 100, 0.08);
  color: #394064;
  cursor: pointer;
}

.editor-card {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  padding: 20px;
  box-shadow: inset 0 0 0 1px rgba(88, 96, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-label {
  font-size: 12px;
  color: #6b7190;
}

.editor-name {
  display: block;
  color: #29304d;
  margin-top: 4px;
}

.editor-type {
  font-size: 12px;
  color: #5860ff;
  background: rgba(88, 96, 255, 0.12);
  padding: 4px 10px;
  border-radius: 999px;
}

.editor-textarea {
  border: none;
  border-radius: 16px;
  padding: 16px;
  resize: vertical;
  min-height: 220px;
  font-size: 14px;
  line-height: 1.6;
  background: rgba(88, 96, 255, 0.05);
  color: #1f2440;
  font-family: 'Fira Code', 'Menlo', monospace;
}

.editor-textarea:focus {
  outline: 2px solid rgba(88, 96, 255, 0.4);
  background: rgba(255, 255, 255, 0.9);
}

.actions {
  display: flex;
  gap: 12px;
}

.primary {
  flex: 1;
  border: none;
  border-radius: 14px;
  padding: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, #5860ff, #7f55ff);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 16px 30px rgba(88, 96, 255, 0.22);
}

.primary:disabled {
  opacity: 0.7;
  cursor: wait;
  box-shadow: none;
}

.primary:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 22px 44px rgba(88, 96, 255, 0.28);
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.ghost {
  padding: 14px 20px;
  border-radius: 14px;
  border: 1px solid rgba(88, 96, 255, 0.25);
  background: rgba(255, 255, 255, 0.8);
  color: #394064;
  cursor: pointer;
  font-weight: 600;
  transition: border 0.2s ease, background 0.2s ease;
}

.ghost:hover {
  border-color: rgba(88, 96, 255, 0.45);
  background: rgba(88, 96, 255, 0.08);
}

.toast {
  background: rgba(45, 51, 92, 0.92);
  color: #fff;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  margin-top: 4px;
  box-shadow: 0 14px 34px rgba(31, 45, 123, 0.2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.preview-panel {
  background: rgba(255, 255, 255, 0.82);
  border-radius: 24px;
  padding: 24px;
  box-shadow: inset 0 0 0 1px rgba(88, 96, 255, 0.08);
}

.preview-grid {
  display: grid;
  gap: 18px;
}

.preview-card {
  background: rgba(249, 250, 255, 0.78);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 260px;
  box-shadow: 0 18px 36px rgba(41, 48, 77, 0.08);
}

.preview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pill {
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(57, 64, 100, 0.12);
  color: #2f3570;
  font-size: 12px;
  font-weight: 600;
}

.pill.accent {
  background: rgba(88, 96, 255, 0.18);
  color: #3940a6;
}

.preview-title {
  color: #59607d;
  font-size: 13px;
}

.preview-card-body {
  flex: 1;
  background: rgba(255, 255, 255, 0.76);
  border-radius: 16px;
  padding: 16px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(88, 96, 255, 0.06);
}

.preview-empty {
  margin: 0;
  color: #7b82a5;
  text-align: center;
  padding: 32px 12px;
}

.doc-page {
  background: linear-gradient(180deg, #ffffff, #f6f7fb);
  border-radius: 18px;
  padding: 24px;
  box-shadow: inset 0 0 0 1px rgba(219, 223, 246, 0.7);
  max-height: 360px;
  overflow: auto;
}

.doc-block + .doc-block {
  margin-top: 12px;
}

.doc-heading {
  margin: 0;
  color: #2f3570;
}

.doc-heading.level-1 {
  font-size: 24px;
}

.doc-heading.level-2 {
  font-size: 20px;
}

.doc-heading.level-3,
.doc-heading.level-4,
.doc-heading.level-5,
.doc-heading.level-6 {
  font-size: 18px;
}

.doc-paragraph {
  margin: 0;
  color: #3f4668;
  line-height: 1.6;
}

.doc-list {
  margin: 0;
  padding-left: 20px;
  color: #3f4668;
}

.doc-list.ordered {
  list-style-type: decimal;
}

.markdown-preview {
  margin: 0;
  background: #0f172a;
  color: #cbd5f5;
  border-radius: 16px;
  padding: 18px;
  font-family: 'Fira Code', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 360px;
  overflow: auto;
}

.table-wrapper {
  overflow-x: auto;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 0 1px rgba(88, 96, 255, 0.06);
}

.table-wrapper table {
  width: 100%;
  border-collapse: collapse;
  min-width: 420px;
}

.table-wrapper th,
.table-wrapper td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(88, 96, 255, 0.12);
  text-align: left;
  font-size: 13px;
}

.table-wrapper thead th {
  background: rgba(88, 96, 255, 0.1);
  font-weight: 600;
  color: #2f3570;
}

.code-block {
  margin-top: 16px;
  background: #0f172a;
  color: #cbd5f5;
  border-radius: 14px;
  overflow: hidden;
}

.code-header {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #94a3ff;
}

.code-block pre {
  margin: 0;
  padding: 16px;
  font-family: 'Fira Code', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.feature-grid {
  margin: 80px 0 60px;
  text-align: center;
}

.feature-grid h2 {
  font-size: 28px;
  margin-bottom: 32px;
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.feature-card {
  background: rgba(255, 255, 255, 0.82);
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 18px 30px rgba(31, 45, 123, 0.12);
  text-align: left;
}

.feature-card h3 {
  margin: 0 0 12px;
  color: #29304d;
}

.feature-card p {
  margin: 0;
  color: #4f5775;
  line-height: 1.6;
}

.page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.86);
  border-radius: 18px;
  padding: 20px 28px;
  box-shadow: 0 18px 38px rgba(31, 45, 123, 0.16);
}

.page-footer strong {
  font-size: 18px;
  color: #29304d;
}

.page-footer span {
  display: block;
  font-size: 13px;
  color: #6f7691;
}

.footer-cta {
  border: none;
  background: linear-gradient(135deg, #5860ff, #7f55ff);
  color: #fff;
  padding: 10px 24px;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 16px 28px rgba(88, 96, 255, 0.22);
}

.footer-cta:hover {
  box-shadow: 0 20px 36px rgba(88, 96, 255, 0.3);
}

:deep(.doc-surface) {
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #2f3570;
  line-height: 1.7;
}

:deep(.doc-surface h1),
:deep(.doc-surface h2),
:deep(.doc-surface h3) {
  margin: 0 0 12px;
}

:deep(.doc-surface p) {
  margin: 0 0 12px;
}

:deep(.doc-surface ul),
:deep(.doc-surface ol) {
  margin: 0 0 12px 20px;
  padding: 0;
}

:deep(.doc-surface a) {
  color: #5860ff;
}

@media (max-width: 1080px) {
  .workspace-body {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    padding: 20px;
  }
}

@media (max-width: 768px) {
  .page {
    padding: 24px 16px 60px;
  }

  .top-nav {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .hero {
    grid-template-columns: 1fr;
  }

  .hero-metrics {
    flex-direction: column;
    gap: 12px;
  }

  .actions {
    flex-direction: column;
  }
}
</style>

