<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type DocumentKind = 'word' | 'excel' | 'powerpoint' | 'text' | 'markdown'

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

interface SlideOutline {
  title: string
  bullets: string[]
}

type SourcePreview =
  | { type: 'empty' }
  | { type: 'document'; blocks: DocumentBlock[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'markdown'; text: string }
  | { type: 'slides'; slides: SlideOutline[] }
  | { type: 'plain'; text: string }

type ConversionPreview =
  | { type: 'empty' }
  | { type: 'markdown'; text: string }
  | { type: 'document'; html: string }
  | { type: 'table'; headers: string[]; rows: string[][]; markdown?: string }
  | { type: 'slides'; slides: SlideOutline[] }
  | { type: 'plain'; text: string }

interface ConversionResult {
  text: string
  preview: ConversionPreview
}

interface ChannelSamples {
  toMarkdown: { text: string; fileName: string }
  fromMarkdown: { text: string; fileName: string }
}

interface ChannelDescriptor {
  kind: Exclude<DocumentKind, 'markdown'>
  label: string
  accent: string
  description: string
  extensions: string[]
  uploadHint: string
  urlHint: string
  download: { extension: string; mime: string }
  samples: ChannelSamples
  toMarkdown: (input: string) => ConversionResult
  fromMarkdown: (markdown: string) => ConversionResult
  previewSource: (input: string) => SourcePreview
}

interface TableData {
  headers: string[]
  rows: string[][]
}

const channels: ChannelDescriptor[] = [
  {
    kind: 'word',
    label: 'Word',
    accent: '#5860ff',
    description: '识别段落、标题、列表结构，快速转换成语义化 Markdown。',
    extensions: ['docx', 'doc', 'rtf', 'txt'],
    uploadHint: '演示环境暂以 .txt 或 .rtf 轮廓文件模拟 Word 解析。',
    urlHint: '支持在线阅读器或公开分享的 Word 文档文本链接。',
    download: { extension: 'doc', mime: 'application/msword' },
    samples: {
      toMarkdown: {
        fileName: 'team-brief.docx',
        text: `## 项目综述\nMarkBridge 让传统文档与知识库无缝协作。\n\n重点目标：\n- 提升团队协作效率\n- 保留文档层级结构\n- 支持导出多种格式\n\n时间线：\n1. 需求确认 - 3 月\n2. 架构设计 - 4 月\n3. 上线测试 - 5 月\n\n负责人：张敏 / docs@markbridge.dev`,
      },
      fromMarkdown: {
        fileName: 'release-notes.md',
        text: `# 产品更新简报\n欢迎使用 MarkBridge。以下是本周亮点：\n\n## 新功能\n- 支持 Word/Excel 双向转换\n- Markdown 导出保留原始结构\n\n## 下一步计划\n1. 开放自动化 API\n2. 增加团队协作模板\n\n如需了解更多，请访问 [markbridge.dev](https://markbridge.dev)`
      },
    },
    toMarkdown: (input) => {
      const blocks = createDocumentBlocks(input)
      const markdown = documentBlocksToMarkdown(blocks)
      return {
        text: markdown,
        preview: markdown.trim() ? { type: 'markdown', text: markdown } : { type: 'empty' },
      }
    },
    fromMarkdown: (markdown) => {
      const { doc, preview } = markdownToWordDocument(markdown)
      return {
        text: doc,
        preview: preview.trim() ? { type: 'document', html: preview } : { type: 'empty' },
      }
    },
    previewSource: (input) => {
      const blocks = createDocumentBlocks(input)
      return blocks.length ? { type: 'document', blocks } : { type: 'empty' }
    },
  },
  {
    kind: 'excel',
    label: 'Excel',
    accent: '#3fb984',
    description: '提取表格结构并转换为 Markdown 表格语法。',
    extensions: ['xlsx', 'xls', 'csv', 'tsv'],
    uploadHint: '演示环境支持 .csv/.tsv 文本，正式版将直接解析 Excel。',
    urlHint: '可粘贴 CSV/TSV 直链或在线表格导出的文本链接。',
    download: { extension: 'csv', mime: 'text/csv;charset=utf-8' },
    samples: {
      toMarkdown: {
        fileName: 'documentation-plan.csv',
        text: `模块,负责人,进度,备注\n产品文档,王一,完成,等待评审\nAPI 清单,刘芳,进行中,补充示例\n发布计划,赵磊,未开始,待排期`,
      },
      fromMarkdown: {
        fileName: 'table.md',
        text: `# 版本路线图\n\n| 模块 | 负责人 | 进度 | 备注 |\n| --- | --- | --- | --- |\n| 产品文档 | 王一 | 完成 | 等待评审 |\n| API 清单 | 刘芳 | 进行中 | 补充示例 |\n| 发布计划 | 赵磊 | 未开始 | 待排期 |`,
      },
    },
    toMarkdown: (input) => {
      const table = parseTable(input)
      if (!table) {
        return { text: '', preview: { type: 'plain', text: '未检测到有效的表格数据。' } }
      }
      const markdown = tableToMarkdown(table)
      return {
        text: markdown,
        preview: { type: 'table', headers: table.headers, rows: table.rows, markdown },
      }
    },
    fromMarkdown: (markdown) => {
      const table = parseMarkdownTable(markdown)
      if (!table) {
        return { text: '', preview: { type: 'plain', text: 'Markdown 中未找到表格，输出为空。' } }
      }
      const csv = tableToCsv(table)
      return {
        text: csv,
        preview: { type: 'table', headers: table.headers, rows: table.rows, markdown: tableToMarkdown(table) },
      }
    },
    previewSource: (input) => {
      const table = parseTable(input)
      if (!table) {
        return { type: 'plain', text: input }
      }
      return { type: 'table', headers: table.headers, rows: table.rows }
    },
  },
  {
    kind: 'powerpoint',
    label: 'PowerPoint',
    accent: '#ff7b5f',
    description: '自动梳理幻灯片标题和要点列表，生成结构化 Markdown。',
    extensions: ['pptx', 'ppt', 'md', 'txt'],
    uploadHint: '演示环境采用提纲文本模拟 PPT，支持 .txt/.md。',
    urlHint: '可输入在线演示提纲或导出的 Markdown 链接。',
    download: { extension: 'pptx', mime: 'text/plain;charset=utf-8' },
    samples: {
      toMarkdown: {
        fileName: 'quarterly-review.pptx',
        text: `季度回顾\n- 团队规模扩大 30%\n- 客户满意度达 92%\n\n产品路线\n- 支持 Word / Excel 双向转换\n- 集成团队模板中心\n\n下一步计划\n- 推出自动化 API\n- 打通企业单点登录`,
      },
      fromMarkdown: {
        fileName: 'deck-outline.md',
        text: `# 季度回顾\n- 团队规模扩大 30%\n- 客户满意度达 92%\n\n## 产品路线\n- 支持 Word / Excel 双向转换\n- 集成团队模板中心\n\n## 下一步计划\n- 推出自动化 API\n- 打通企业单点登录`,
      },
    },
    toMarkdown: (input) => {
      const slides = parseSlidesFromOutline(input)
      if (!slides.length) {
        return { text: '', preview: { type: 'plain', text: '未识别到幻灯片提纲，请检查格式。' } }
      }
      const markdown = slidesToMarkdown(slides)
      return { text: markdown, preview: { type: 'slides', slides } }
    },
    fromMarkdown: (markdown) => {
      const slides = markdownToSlides(markdown)
      if (!slides.length) {
        return { text: '', preview: { type: 'plain', text: 'Markdown 中未识别到幻灯片结构。' } }
      }
      const outline = slidesToOutline(slides)
      return { text: outline, preview: { type: 'slides', slides } }
    },
    previewSource: (input) => {
      const slides = parseSlidesFromOutline(input)
      if (!slides.length) {
        return { type: 'plain', text: input }
      }
      return { type: 'slides', slides }
    },
  },
  {
    kind: 'text',
    label: '纯文本',
    accent: '#ffa93a',
    description: '为聊天记录、公告等纯文本增加 Markdown 层级结构。',
    extensions: ['txt', 'md', 'log'],
    uploadHint: '支持任意 UTF-8 文本。',
    urlHint: '可输入纯文本或 Markdown 文件链接。',
    download: { extension: 'txt', mime: 'text/plain;charset=utf-8' },
    samples: {
      toMarkdown: {
        fileName: 'team-note.txt',
        text: `会议主题：MarkBridge 数据同步\n时间：3 月 12 日 10:00\n参会：产品 / 研发 / 运营\n\n重点结论：\n- 统一 Markdown 输出\n- 接入权限控制\n- 增加导出模板\n\n行动项：\n1. 4 月底完成 API 设计\n2. 5 月完善权限方案\n3. 6 月发布 Beta`,
      },
      fromMarkdown: {
        fileName: 'announcement.md',
        text: `# 公告\n欢迎加入 MarkBridge！\n\n## 核心能力\n- 支持常见文档 ↔ Markdown\n- 提供在线预览与下载\n\n## 联系方式\n邮件：hi@markbridge.dev`,
      },
    },
    toMarkdown: (input) => {
      const blocks = createDocumentBlocks(input)
      const markdown = documentBlocksToMarkdown(blocks)
      return {
        text: markdown,
        preview: markdown.trim() ? { type: 'markdown', text: markdown } : { type: 'empty' },
      }
    },
    fromMarkdown: (markdown) => {
      const plain = stripMarkdown(markdown)
      return {
        text: plain,
        preview: plain.trim() ? { type: 'plain', text: plain } : { type: 'empty' },
      }
    },
    previewSource: (input) => {
      return input.trim() ? { type: 'plain', text: input } : { type: 'empty' }
    },
  },
]

const channelMap = new Map(channels.map((channel) => [channel.kind, channel]))

const markdownDownload = { extension: 'md', mime: 'text/markdown;charset=utf-8' }

const conversionDirection = ref<'to-markdown' | 'from-markdown'>('to-markdown')
const sourceKind = ref<Exclude<DocumentKind, 'markdown'>>('word')
const targetKind = ref<Exclude<DocumentKind, 'markdown'>>('word')
const sourceText = ref('')
const inputFileName = ref('')
const toastMessage = ref('')
const isProcessing = ref(false)
const isFetchingRemote = ref(false)
const remoteUrl = ref('')
const dropActive = ref(false)
const workspaceRef = ref<HTMLElement | null>(null)
const featureRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isUsingSample = ref(true)

let toastTimer: ReturnType<typeof setTimeout> | null = null

const allExtensions = computed(() => {
  const unique = new Set<string>()
  channels.forEach((channel) => channel.extensions.forEach((ext) => unique.add(ext)))
  unique.add('md')
  return Array.from(unique)
})

const directionLabel = computed(() => {
  const channel = conversionDirection.value === 'to-markdown' ? channelMap.get(sourceKind.value) : channelMap.get(targetKind.value)
  if (!channel) return ''
  return conversionDirection.value === 'to-markdown'
    ? `${channel.label} → Markdown`
    : `Markdown → ${channel.label}`
})

const currentUploadHint = computed(() => {
  if (conversionDirection.value === 'to-markdown') {
    return channelMap.get(sourceKind.value)?.uploadHint ?? ''
  }
  return '上传或粘贴 Markdown (.md/.markdown/.txt) 内容，系统会输出所选格式。'
})

const currentUrlHint = computed(() => {
  if (conversionDirection.value === 'to-markdown') {
    return channelMap.get(sourceKind.value)?.urlHint ?? ''
  }
  const channel = channelMap.get(targetKind.value)
  return channel ? `可粘贴 Markdown 链接，随后转换为 ${channel.label} 格式。` : ''
})

const currentSample = computed(() => {
  if (conversionDirection.value === 'to-markdown') {
    return channelMap.get(sourceKind.value)?.samples.toMarkdown
  }
  return channelMap.get(targetKind.value)?.samples.fromMarkdown
})

const sourcePreview = computed<SourcePreview>(() => {
  if (!sourceText.value.trim()) {
    return { type: 'empty' }
  }
  if (conversionDirection.value === 'to-markdown') {
    return channelMap.get(sourceKind.value)?.previewSource(sourceText.value) ?? { type: 'plain', text: sourceText.value }
  }
  return { type: 'markdown', text: sourceText.value }
})

const conversionResult = computed<ConversionResult>(() => {
  if (!sourceText.value.trim()) {
    return { text: '', preview: { type: 'empty' } }
  }
  if (conversionDirection.value === 'to-markdown') {
    const channel = channelMap.get(sourceKind.value)
    return channel ? channel.toMarkdown(sourceText.value) : { text: '', preview: { type: 'empty' } }
  }
  const channel = channelMap.get(targetKind.value)
  return channel ? channel.fromMarkdown(sourceText.value) : { text: '', preview: { type: 'empty' } }
})

const convertedPreview = computed(() => conversionResult.value.preview)

const outputFileName = computed(() => {
  const base = inputFileName.value.replace(/\.[^.]+$/, '') || (conversionDirection.value === 'to-markdown' ? channelMap.get(sourceKind.value)?.kind ?? 'document' : channelMap.get(targetKind.value)?.kind ?? 'document')
  if (conversionDirection.value === 'to-markdown') {
    return `${base}.${markdownDownload.extension}`
  }
  const channel = channelMap.get(targetKind.value)
  return channel ? `${base}.${channel.download.extension}` : `${base}.txt`
})

const downloadMime = computed(() => {
  if (conversionDirection.value === 'to-markdown') {
    return markdownDownload.mime
  }
  return channelMap.get(targetKind.value)?.download.mime ?? 'text/plain;charset=utf-8'
})

watch(
  () => [conversionDirection.value, sourceKind.value, targetKind.value],
  () => {
    if (!isUsingSample.value) return
    const sample = currentSample.value
    if (sample) {
      setSource(sample.text, sample.fileName, true)
    }
  },
  { immediate: true }
)

function setSource(text: string, name: string, markSample: boolean) {
  sourceText.value = text
  inputFileName.value = name
  isUsingSample.value = markSample
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

function changeDirection(direction: 'to-markdown' | 'from-markdown') {
  if (conversionDirection.value === direction) return
  conversionDirection.value = direction
  isUsingSample.value = true
  const sample = currentSample.value
  if (sample) {
    setSource(sample.text, sample.fileName, true)
  }
  showToast(`已切换到 ${direction === 'to-markdown' ? '文档 → Markdown' : 'Markdown → 文档'} 模式`)
}

function selectSourceKind(kind: Exclude<DocumentKind, 'markdown'>) {
  if (sourceKind.value === kind) return
  sourceKind.value = kind
  isUsingSample.value = true
  const sample = currentSample.value
  if (sample) {
    setSource(sample.text, sample.fileName, true)
  }
  showToast(`当前识别类型：${channelMap.get(kind)?.label ?? ''}`)
}

function selectTargetKind(kind: Exclude<DocumentKind, 'markdown'>) {
  if (targetKind.value === kind) return
  targetKind.value = kind
  isUsingSample.value = true
  const sample = currentSample.value
  if (sample) {
    setSource(sample.text, sample.fileName, true)
  }
  showToast(`已选择输出：Markdown → ${channelMap.get(kind)?.label ?? ''}`)
}

function handleSourceInput() {
  isUsingSample.value = false
}

function openFileSelector() {
  fileInputRef.value?.click()
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
  await processFile(file)
  resetFileInput()
}

async function processFile(file: File) {
  try {
    const text = await file.text()
    applyDetection(file.name, text)
  } catch (error) {
    showToast('文件读取失败，请重试')
  }
}

function detectKind(fileName: string, content: string): DocumentKind {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext) {
    if (['md', 'markdown'].includes(ext)) return 'markdown'
    for (const channel of channels) {
      if (channel.extensions.includes(ext)) {
        return channel.kind
      }
    }
  }
  if (/^\s*#/.test(content) || /\|\s.+\|/.test(content)) {
    return 'markdown'
  }
  if (/,\s*|\t/.test(content) && content.split('\n').some((line) => /,|\t/.test(line))) {
    return 'excel'
  }
  if (/^[-*•]\s+/m.test(content) && /\n{2,}/.test(content)) {
    return 'powerpoint'
  }
  return 'text'
}

function applyDetection(name: string, text: string) {
  const detected = detectKind(name, text)
  if (detected === 'markdown') {
    conversionDirection.value = 'from-markdown'
    isUsingSample.value = false
    setSource(text, name || 'document.md', false)
    showToast('检测到 Markdown 内容，可选择输出格式。')
    return
  }
  const nextKind = detected as Exclude<DocumentKind, 'markdown'>
  conversionDirection.value = 'to-markdown'
  sourceKind.value = nextKind
  isUsingSample.value = false
  setSource(text, name || `${nextKind}.txt`, false)
  const label = channelMap.get(sourceKind.value)?.label ?? '文档'
  showToast(`已自动识别为 ${label}，可立即转换为 Markdown。`)
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  dropActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  await processFile(file)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  dropActive.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  dropActive.value = false
}

async function openRemoteFile() {
  if (!remoteUrl.value.trim()) {
    showToast('请输入可访问的链接')
    return
  }
  try {
    isFetchingRemote.value = true
    const response = await fetch(remoteUrl.value.trim())
    if (!response.ok) {
      throw new Error('网络响应异常')
    }
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    const name = deriveFileNameFromUrl(remoteUrl.value.trim(), contentType)
    applyDetection(name, text)
    showToast('已从链接导入内容')
  } catch (error) {
    showToast('无法获取远程内容，请检查链接或跨域限制')
  } finally {
    isFetchingRemote.value = false
  }
}

function deriveFileNameFromUrl(url: string, contentType: string): string {
  const cleanUrl = url.split('?')[0].split('#')[0]
  const tail = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1)
  if (tail) {
    return tail
  }
  if (contentType.includes('markdown')) return 'document.md'
  if (contentType.includes('csv')) return 'sheet.csv'
  if (contentType.includes('msword')) return 'document.docx'
  return 'content.txt'
}

async function triggerConvert() {
  if (!sourceText.value.trim()) {
    showToast('请先粘贴内容或上传文件')
    return
  }
  isProcessing.value = true
  await new Promise((resolve) => setTimeout(resolve, 600))
  isProcessing.value = false
  showToast('转换完成，可在右侧查看预览或下载文件')
}

function handleDownload() {
  const content = conversionResult.value.text
  if (!content.trim()) {
    showToast('暂无可下载的内容')
    return
  }
  const blob = new Blob([content], { type: downloadMime.value })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = outputFileName.value
  anchor.click()
  URL.revokeObjectURL(url)
  showToast(`已开始下载 ${outputFileName.value}`)
}

function fillSample() {
  const sample = currentSample.value
  if (!sample) return
  setSource(sample.text, sample.fileName, true)
  showToast('已填充示例内容，可直接体验转换效果')
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
  const [headers, ...body] = normalizedRows
  return { headers, rows: body }
}

function tableToMarkdown(table: TableData): string {
  const { headers, rows } = table
  const headerLine = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const bodyLines = rows.map((row) => `| ${row.join(' | ')} |`)
  return [headerLine, separator, ...bodyLines].join('\n')
}

function tableToCsv(table: TableData): string {
  const escapeCell = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
  const lines = [table.headers, ...table.rows].map((row) => row.map(escapeCell).join(','))
  return lines.join('\n')
}

function parseMarkdownTable(markdown: string): TableData | null {
  const lines = markdown.replace(/\r/g, '').split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*\|.+\|\s*$/.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1 || start + 1 >= lines.length) {
    return null
  }
  const header = lines[start]
  const separator = lines[start + 1]
  if (!/\|\s*:?-{3,}:?\s*/.test(separator)) {
    return null
  }
  const headers = header
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
  const rows: string[][] = []
  for (let i = start + 2; i < lines.length; i += 1) {
    const line = lines[i]
    if (!/^\s*\|.+\|\s*$/.test(line)) {
      break
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    rows.push(cells)
  }
  return headers.length ? { headers, rows } : null
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
    } else if (block.type === 'paragraph') {
      if (block.label) {
        lines.push(`**${block.label}:** ${block.text}`)
      } else {
        lines.push(block.text)
      }
    } else {
      block.items.forEach((item, index) => {
        if (block.type === 'ul') {
          lines.push(`- ${item}`)
        } else {
          lines.push(`${index + 1}. ${item}`)
        }
      })
    }
    lines.push('')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
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
    html.push(`<p>${formatInlineMarkdown(line)}</p>`)
  }

  closeLists()
  flushCode()

  return html.join('')
}

function markdownToWordDocument(markdown: string): { doc: string; preview: string } {
  const html = markdownToHtml(markdown)
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>${html}</body></html>`
  return { doc, preview: html }
}

function slidesToMarkdown(slides: SlideOutline[]): string {
  const lines: string[] = []
  slides.forEach((slide, index) => {
    lines.push(`${index === 0 ? '#' : '##'} ${slide.title}`)
    slide.bullets.forEach((bullet) => {
      lines.push(`- ${bullet}`)
    })
    lines.push('')
  })
  return lines.join('\n').trim()
}

function slidesToOutline(slides: SlideOutline[]): string {
  return slides
    .map((slide) => {
      const bullets = slide.bullets.map((bullet) => `- ${bullet}`).join('\n')
      return `${slide.title}\n${bullets}`
    })
    .join('\n\n')
}

function parseSlidesFromOutline(input: string): SlideOutline[] {
  const normalized = input.replace(/\r/g, '').trim()
  if (!normalized) return []
  const segments = normalized.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean)
  return segments.map((segment, index) => {
    const lines = segment.split('\n').map((line) => line.trim()).filter(Boolean)
    const title = lines.shift() || `幻灯片 ${index + 1}`
    const bullets = lines.map((line) => line.replace(/^[-*•]\s*/, '').replace(/^[0-9]+[\.)]\s*/, ''))
    return { title, bullets }
  })
}

function markdownToSlides(markdown: string): SlideOutline[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const slides: SlideOutline[] = []
  let current: SlideOutline | null = null
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      if (current) {
        slides.push(current)
      }
      current = { title: headingMatch[2], bullets: [] }
      continue
    }
    if (/^[-*+]\s+/.test(line)) {
      if (!current) {
        current = { title: '概览', bullets: [] }
      }
      current.bullets.push(line.replace(/^[-*+]\s+/, ''))
      continue
    }
    if (/^[0-9]+[\.)]\s+/.test(line)) {
      if (!current) {
        current = { title: '概览', bullets: [] }
      }
      current.bullets.push(line.replace(/^[0-9]+[\.)]\s+/, ''))
      continue
    }
    if (!current) {
      current = { title: line, bullets: [] }
    } else {
      current.bullets.push(line)
    }
  }
  if (current) {
    slides.push(current)
  }
  return slides
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^[0-9]+[\.)]\s+/gm, '')
    .trim()
}
</script>

<template>
  <div class="page">
    <header class="top-nav">
      <div class="logo">
        <span class="logo-mark">MB</span>
        <div class="logo-text">
          <span class="logo-title">MarkBridge</span>
          <span class="logo-sub">Markdown ↔ Office 智能转换</span>
        </div>
      </div>
      <nav class="nav-links">
        <button type="button" class="nav-link" @click="scrollToWorkspace">立即体验</button>
        <button type="button" class="nav-link" @click="scrollToFeatures">功能亮点</button>
        <a class="nav-docs" href="https://markbridge.dev" target="_blank" rel="noopener">官网介绍</a>
        <button type="button" class="nav-cta" @click="scrollToWorkspace">开始使用</button>
      </nav>
    </header>

    <section class="hero">
      <div class="hero-text">
        <div class="hero-badge">多格式一站式转换</div>
        <h1>智能桥接常见文档与 Markdown</h1>
        <p>
          自动识别 Word、Excel、PPT、纯文本等格式，生成高质量 Markdown；同样也能将 Markdown 回写成这些格式。拖拽上传或粘贴链接，即刻获得转前&转后双预览与可下载结果。
        </p>
        <div class="hero-actions">
          <button type="button" class="hero-primary" @click="scrollToWorkspace">体验在线转换</button>
          <button type="button" class="hero-secondary" @click="scrollToFeatures">了解特性</button>
        </div>
      </div>
      <div class="hero-visual">
        <div class="hero-card">
          <span class="hero-pill">智能检测</span>
          <h3>{{ directionLabel }}</h3>
          <p>上传后自动识别文档类型，转后结果支持即时下载。</p>
          <ul>
            <li>支持 Word / Excel / PPT / TXT</li>
            <li>Markdown ↔ 多格式对等转换</li>
            <li>双栏预览，实时可视化比对</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="workspace" ref="workspaceRef">
      <header class="workspace-header">
        <div>
          <span class="workspace-badge">转换工作台</span>
          <h2>一键完成 Markdown 与 Office 文档互转</h2>
          <p>支持自动识别上传类型，也可选择 Markdown 输出目标，预览与下载同步更新。</p>
        </div>
        <button type="button" class="workspace-help" @click="fillSample">填充示例内容</button>
      </header>

      <div class="direction-switch">
        <button
          type="button"
          :class="['direction-button', { active: conversionDirection === 'to-markdown' }]"
          @click="changeDirection('to-markdown')"
        >
          文档 → Markdown
        </button>
        <button
          type="button"
          :class="['direction-button', { active: conversionDirection === 'from-markdown' }]"
          @click="changeDirection('from-markdown')"
        >
          Markdown → 文档
        </button>
      </div>

      <div v-if="conversionDirection === 'to-markdown'" class="channel-strip">
        <button
          v-for="channel in channels"
          :key="channel.kind"
          type="button"
          :class="['channel-chip', { active: sourceKind === channel.kind }]"
          @click="selectSourceKind(channel.kind)"
        >
          <span class="chip-indicator" :style="{ background: channel.accent }"></span>
          <div class="chip-text">
            <strong>{{ channel.label }}</strong>
            <span>{{ channel.description }}</span>
          </div>
        </button>
      </div>

      <div v-else class="channel-strip">
        <button
          v-for="channel in channels"
          :key="channel.kind"
          type="button"
          :class="['channel-chip', { active: targetKind === channel.kind }]"
          @click="selectTargetKind(channel.kind)"
        >
          <span class="chip-indicator" :style="{ background: channel.accent }"></span>
          <div class="chip-text">
            <strong>Markdown → {{ channel.label }}</strong>
            <span>{{ channel.description }}</span>
          </div>
        </button>
      </div>

      <div class="workspace-body">
        <div class="control-panel">
          <div class="upload-card">
            <header>
              <h3>{{ directionLabel }}</h3>
              <p>{{ currentUploadHint }}</p>
            </header>
            <div
              class="upload-dropzone"
              :class="{ active: dropActive }"
              @dragover.prevent="handleDragOver"
              @dragleave="handleDragLeave"
              @drop.prevent="handleDrop"
            >
              <div class="drop-inner">
                <span class="drop-icon">📄</span>
                <div>
                  <p class="drop-title">拖拽文件到此处或</p>
                  <button type="button" class="link" @click="openFileSelector">点击上传</button>
                </div>
              </div>
              <p class="drop-hint">支持 {{ allExtensions.join(' / ') }}，自动识别类型后转换。</p>
            </div>
            <input ref="fileInputRef" type="file" class="file-input" @change="handleFileUpload" />
            <div class="url-import">
              <input
                v-model="remoteUrl"
                type="url"
                class="url-input"
                placeholder="https://example.com/document.md"
              />
              <button type="button" class="url-button" :disabled="isFetchingRemote" @click="openRemoteFile">
                {{ isFetchingRemote ? '获取中...' : '从链接打开' }}
              </button>
            </div>
            <p class="url-hint">{{ currentUrlHint }}</p>
          </div>

          <div class="editor-card">
            <header class="editor-header">
              <span class="editor-label">输入区</span>
              <span class="editor-file" v-if="inputFileName">{{ inputFileName }}</span>
            </header>
            <textarea
              v-model="sourceText"
              class="editor-textarea"
              rows="14"
              placeholder="在此粘贴或编辑文档内容..."
              @input="handleSourceInput"
            ></textarea>
            <div class="actions">
              <button type="button" class="primary" :disabled="isProcessing" @click="triggerConvert">
                <span v-if="isProcessing" class="spinner"></span>
                <span>{{ isProcessing ? '智能处理中...' : '立即转换' }}</span>
              </button>
              <button type="button" class="ghost" @click="handleDownload">下载结果</button>
            </div>
          </div>

          <transition name="fade">
            <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
          </transition>
        </div>

        <div class="preview-panel">
          <div class="preview-grid">
            <div class="preview-card">
              <header class="preview-card-header">
                <span class="pill">转前预览</span>
                <span class="preview-title">{{ directionLabel.split('→')[0]?.trim() }}</span>
              </header>
              <div class="preview-card-body">
                <template v-if="sourcePreview.type === 'document'">
                  <div class="doc-page">
                    <div v-for="(block, index) in sourcePreview.blocks" :key="index" class="doc-block">
                      <h3 v-if="block.type === 'heading'" :class="['doc-heading', `level-${block.level}`]">
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
                          <th v-for="(header, index) in sourcePreview.headers" :key="index">{{ header }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in sourcePreview.rows" :key="rowIndex">
                          <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
                <template v-else-if="sourcePreview.type === 'markdown'">
                  <pre class="markdown-preview">{{ sourcePreview.text }}</pre>
                </template>
                <template v-else-if="sourcePreview.type === 'slides'">
                  <div class="slides-preview">
                    <article v-for="(slide, index) in sourcePreview.slides" :key="index" class="slide-card">
                      <h4>{{ slide.title }}</h4>
                      <ul>
                        <li v-for="(bullet, idx) in slide.bullets" :key="idx">{{ bullet }}</li>
                      </ul>
                    </article>
                  </div>
                </template>
                <template v-else-if="sourcePreview.type === 'plain'">
                  <pre class="plain-preview">{{ sourcePreview.text }}</pre>
                </template>
                <p v-else class="preview-empty">上传文件或在左侧粘贴内容即可查看预览</p>
              </div>
            </div>
            <div class="preview-card">
              <header class="preview-card-header">
                <span class="pill accent">转后预览</span>
                <span class="preview-title">{{ directionLabel.split('→')[1]?.trim() }}</span>
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
                          <th v-for="(header, index) in convertedPreview.headers" :key="index">{{ header }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in convertedPreview.rows" :key="rowIndex">
                          <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-if="convertedPreview.markdown" class="code-block">
                    <div class="code-header">Markdown 表格</div>
                    <pre>{{ convertedPreview.markdown }}</pre>
                  </div>
                </template>
                <template v-else-if="convertedPreview.type === 'document'">
                  <div class="doc-page" v-html="convertedPreview.html"></div>
                </template>
                <template v-else-if="convertedPreview.type === 'slides'">
                  <div class="slides-preview">
                    <article v-for="(slide, index) in convertedPreview.slides" :key="index" class="slide-card">
                      <h4>{{ slide.title }}</h4>
                      <ul>
                        <li v-for="(bullet, idx) in slide.bullets" :key="idx">{{ bullet }}</li>
                      </ul>
                    </article>
                  </div>
                </template>
                <template v-else-if="convertedPreview.type === 'plain'">
                  <pre class="plain-preview">{{ convertedPreview.text }}</pre>
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
          <h3>自动识别多格式</h3>
          <p>上传后即可识别 Word、Excel、PPT、TXT、Markdown，省去手动选择烦恼。</p>
        </article>
        <article class="feature-card">
          <h3>双向转换链路</h3>
          <p>有多少格式支持转 Markdown，就支持 Markdown 回写这些格式，保持信息对等。</p>
        </article>
        <article class="feature-card">
          <h3>实时预览与下载</h3>
          <p>转前、转后并排对比，随时下载 Markdown、表格、幻灯片或文档成品。</p>
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
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
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
}

.hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 36px;
  align-items: center;
  margin-bottom: 80px;
}

.hero-badge {
  display: inline-flex;
  padding: 6px 16px;
  background: rgba(88, 96, 255, 0.12);
  color: #394064;
  font-weight: 600;
  border-radius: 999px;
  font-size: 12px;
  margin-bottom: 18px;
}

.hero-text h1 {
  font-size: 36px;
  margin: 0 0 16px;
}

.hero-text p {
  color: #5c6486;
  line-height: 1.7;
  margin: 0 0 28px;
}

.hero-actions {
  display: flex;
  gap: 12px;
}

.hero-primary,
.hero-secondary {
  border-radius: 14px;
  padding: 12px 24px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.hero-primary {
  background: linear-gradient(135deg, #5860ff, #7a66ff);
  color: #fff;
  box-shadow: 0 14px 30px rgba(88, 96, 255, 0.25);
}

.hero-secondary {
  background: rgba(88, 96, 255, 0.12);
  color: #2e3661;
}

.hero-visual {
  display: flex;
  justify-content: center;
}

.hero-card {
  background: linear-gradient(165deg, rgba(88, 96, 255, 0.12), rgba(255, 255, 255, 0.92));
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 20px 45px rgba(88, 96, 255, 0.12);
  max-width: 320px;
}

.hero-card h3 {
  margin: 18px 0 12px;
  font-size: 20px;
}

.hero-card p {
  color: #545c7c;
  margin: 0 0 16px;
}

.hero-card ul {
  margin: 0;
  padding-left: 18px;
  color: #454c6b;
  line-height: 1.7;
}

.hero-pill {
  display: inline-flex;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fff;
  color: #5860ff;
  font-weight: 600;
  font-size: 12px;
}

.workspace {
  background: rgba(88, 96, 255, 0.05);
  border-radius: 32px;
  padding: 36px;
  margin-bottom: 96px;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.workspace-header h2 {
  margin: 8px 0;
  font-size: 28px;
}

.workspace-header p {
  margin: 0;
  color: #5a6285;
}

.workspace-badge {
  display: inline-flex;
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(88, 96, 255, 0.16);
  color: #374063;
  font-size: 12px;
  font-weight: 600;
}

.workspace-help {
  border: none;
  background: #fff;
  color: #5860ff;
  border-radius: 12px;
  padding: 10px 18px;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 12px 24px rgba(88, 96, 255, 0.18);
}

.direction-switch {
  display: inline-flex;
  padding: 6px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 16px;
  gap: 6px;
  margin-bottom: 20px;
}

.direction-button {
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  background: transparent;
  color: #55608a;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.direction-button.active {
  background: linear-gradient(135deg, rgba(88, 96, 255, 0.18), rgba(127, 138, 255, 0.25));
  color: #2f3570;
}

.channel-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}

.channel-chip {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(88, 96, 255, 0.12);
  background: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  min-height: 88px;
}

.channel-chip.active {
  border-color: rgba(88, 96, 255, 0.4);
  box-shadow: 0 12px 26px rgba(88, 96, 255, 0.18);
  background: #fff;
}

.channel-chip:hover {
  transform: translateY(-2px);
}

.chip-indicator {
  width: 10px;
  height: 46px;
  border-radius: 999px;
  flex-shrink: 0;
}

.chip-text strong {
  display: block;
  color: #2d3558;
}

.chip-text span {
  font-size: 12px;
  color: #59607d;
  line-height: 1.5;
}

.workspace-body {
  display: grid;
  grid-template-columns: minmax(320px, 360px) 1fr;
  gap: 28px;
  align-items: start;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-card {
  background: #fff;
  border-radius: 22px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 20px 40px rgba(88, 96, 255, 0.12);
}

.upload-card header h3 {
  margin: 0 0 4px;
  font-size: 18px;
}

.upload-card header p {
  margin: 0;
  font-size: 13px;
  color: #4f5775;
}

.upload-dropzone {
  border: 1px dashed rgba(88, 96, 255, 0.35);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: rgba(88, 96, 255, 0.05);
  transition: border 0.2s ease, background 0.2s ease;
}

.upload-dropzone.active {
  border-color: rgba(88, 96, 255, 0.6);
  background: rgba(88, 96, 255, 0.12);
}

.drop-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drop-icon {
  font-size: 32px;
}

.drop-title {
  margin: 0;
  font-weight: 600;
  color: #2e3560;
}

.link {
  border: none;
  background: none;
  color: #5860ff;
  cursor: pointer;
  font-weight: 600;
}

.drop-hint {
  margin: 0;
  font-size: 12px;
  color: #5f6787;
}

.file-input {
  display: none;
}

.url-import {
  display: flex;
  gap: 10px;
}

.url-input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(88, 96, 255, 0.2);
  font-size: 13px;
}

.url-button {
  padding: 10px 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #5860ff, #7a66ff);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  min-width: 120px;
}

.url-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.url-hint {
  margin: 0;
  font-size: 12px;
  color: #5f6787;
}

.editor-card {
  background: #fff;
  border-radius: 22px;
  padding: 22px;
  box-shadow: 0 20px 40px rgba(88, 96, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.editor-label {
  font-weight: 600;
  color: #2f3570;
}

.editor-file {
  font-size: 12px;
  color: #6b7094;
  background: rgba(88, 96, 255, 0.12);
  padding: 4px 10px;
  border-radius: 999px;
}

.editor-textarea {
  width: 100%;
  min-height: 260px;
  border-radius: 18px;
  border: 1px solid rgba(88, 96, 255, 0.2);
  padding: 16px;
  resize: vertical;
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
  background: rgba(88, 96, 255, 0.04);
}

.actions {
  display: flex;
  gap: 12px;
}

.primary {
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #5860ff, #7a66ff);
  color: #fff;
  padding: 12px 20px;
  font-weight: 600;
  cursor: pointer;
  min-width: 140px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost {
  border-radius: 14px;
  background: rgba(88, 96, 255, 0.1);
  border: none;
  color: #2f3570;
  padding: 12px 20px;
  font-weight: 600;
  cursor: pointer;
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

.toast {
  margin-top: 8px;
  background: rgba(88, 96, 255, 0.9);
  color: #fff;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  box-shadow: 0 16px 30px rgba(88, 96, 255, 0.2);
}

.preview-panel {
  background: #fff;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(88, 96, 255, 0.12);
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.preview-card {
  background: rgba(248, 249, 255, 0.9);
  border-radius: 20px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 260px;
}

.preview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pill {
  display: inline-flex;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(88, 96, 255, 0.12);
  color: #2f3570;
  font-weight: 600;
  font-size: 12px;
}

.pill.accent {
  background: rgba(63, 185, 132, 0.16);
  color: #24795c;
}

.preview-title {
  font-weight: 600;
  color: #2f3570;
}

.preview-card-body {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  flex: 1;
  overflow: hidden;
  display: flex;
}

.preview-card-body > * {
  flex: 1;
}

.preview-empty {
  margin: auto;
  text-align: center;
  color: #6b7291;
}

.markdown-preview {
  width: 100%;
  overflow: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.table-wrapper {
  width: 100%;
  overflow: auto;
}

.table-wrapper table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table-wrapper th,
.table-wrapper td {
  border: 1px solid rgba(26, 31, 54, 0.1);
  padding: 8px 10px;
  text-align: left;
}

.table-wrapper thead {
  background: rgba(88, 96, 255, 0.12);
}

.doc-page {
  width: 100%;
  max-width: 100%;
  background: #fff;
  border-radius: 12px;
  border: 1px solid rgba(26, 31, 54, 0.08);
  padding: 16px 20px;
  box-shadow: inset 0 0 0 1px rgba(26, 31, 54, 0.03);
  overflow: auto;
}

.doc-block + .doc-block {
  margin-top: 12px;
}

.doc-heading {
  margin: 0 0 4px;
  font-weight: 600;
  color: #2d3558;
}

.doc-heading.level-1 {
  font-size: 20px;
}

.doc-heading.level-2 {
  font-size: 18px;
}

.doc-heading.level-3 {
  font-size: 16px;
}

.doc-paragraph {
  margin: 0;
  color: #444b6a;
  line-height: 1.7;
}

.doc-list {
  margin: 0;
  padding-left: 18px;
  color: #3f4668;
  line-height: 1.6;
}

.doc-list.ordered {
  list-style: decimal;
}

.code-block {
  margin-top: 16px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  overflow: auto;
}

.code-header {
  font-weight: 600;
  margin-bottom: 8px;
}

.slides-preview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.slide-card {
  background: rgba(88, 96, 255, 0.08);
  border-radius: 14px;
  padding: 14px;
}

.slide-card h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #2f3570;
}

.slide-card ul {
  margin: 0;
  padding-left: 18px;
  color: #41486a;
  line-height: 1.5;
}

.plain-preview {
  width: 100%;
  background: #f8f9ff;
  border-radius: 12px;
  padding: 16px;
  color: #374063;
  line-height: 1.6;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.feature-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.feature-grid h2 {
  margin: 0;
  font-size: 28px;
  text-align: center;
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.feature-card {
  background: rgba(248, 249, 255, 0.8);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(88, 96, 255, 0.1);
}

.feature-card h3 {
  margin: 0 0 12px;
}

.feature-card p {
  margin: 0;
  color: #555e82;
  line-height: 1.7;
}

.page-footer {
  margin-top: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(88, 96, 255, 0.1);
  border-radius: 20px;
  padding: 18px 24px;
}

.page-footer div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #2f3570;
}

.footer-cta {
  border: none;
  background: linear-gradient(135deg, #5860ff, #7a66ff);
  color: #fff;
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1024px) {
  .workspace-body {
    grid-template-columns: 1fr;
  }

  .control-panel {
    order: 2;
  }

  .preview-panel {
    order: 1;
  }
}

@media (max-width: 768px) {
  .page {
    padding: 24px 18px 64px;
  }

  .top-nav {
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
  }

  .hero-text h1 {
    font-size: 28px;
  }

  .workspace {
    padding: 24px;
  }

  .channel-strip {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-direction: column;
  }

  .preview-grid {
    grid-template-columns: 1fr;
  }

  .feature-grid h2 {
    font-size: 24px;
  }
}
</style>

