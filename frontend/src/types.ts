// 共享类型：元枢 API 契约（与 server.mjs 对齐）
export interface Model {
  provider: string
  id: string
  name: string
  contextWindow?: number
  vision?: boolean
  reasoning?: boolean
  capabilities?: Record<string, any>
  free?: boolean
  note?: string
}

export interface Session {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  preview: string
  messageCount: number
  file?: string
  cwd?: string
  group?: string
}

export interface ToolCall {
  id: string
  name: string
  args?: string
  argsText?: string // 流式态用（与 RunningTool 兼容）
  output?: string
  isError?: boolean
  running?: boolean
  status?: ToolStatus
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  files?: { path: string; name?: string }[]
  images?: string[]   // dataURI 或 URL
  audios?: string[]   // URL
  videos?: string[]   // URL
  notes?: string[]    // 系统提示条（SSE note 事件）
  tools?: ToolCall[]
  think?: string
  conclusion?: string // 流式阶段分区：工具开始后的结论文字（text 仍为完整逻辑文本；仅流式中传，历史消息不存）
  ts?: string
  model?: { provider: string; id: string } // provenance：实际使用的模型（Auto 路由时前端可见）
  streaming?: boolean // 是否正在流式生成中
  isDraft?: boolean   // 是否是本地未同步的草稿（刷新/卡住恢复用）
}

// 生成物（资产库）条目
export interface Artifact {
  name: string
  type: string
  date: string
  path: string
  size: number
  url: string
  prompt?: string
  mtimeMs?: number
}

export interface StoryAssetRef { id: string; role?: string; weight?: number; type?: string; url?: string; text?: string; prompt?: string }
export interface StoryCharacter { id: string; name: string; [key: string]: unknown }
export interface StoryLocation { id: string; name: string; [key: string]: unknown }
export interface StoryBible {
  characters: StoryCharacter[]
  locations: StoryLocation[]
  props: Record<string, unknown>[]
  wardrobe: Record<string, unknown>[]
  style: Record<string, unknown>
  rules: Record<string, unknown>[]
}
export interface StoryGenerationRun {
  id: string
  projectId: string
  sceneId: string
  beatId: string
  kind: 'novel' | 'image' | 'video'
  model: { provider: string; id: string }
  capabilities: { reference: boolean; keyframe: boolean; seed: boolean }
  params: Record<string, unknown>
  seed?: number
  inputAssets: StoryAssetRef[]
  outputAssets: StoryAssetRef[]
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'degraded'
  degradation?: string[]
  parentRunId?: string
  createdAt: string
  finishedAt?: string
}
export interface StoryBeat { id: string; kind: 'novel' | 'image' | 'video'; prompt: string; references: StoryAssetRef[]; inheritFromBeatId?: string; activeRunId?: string }
export interface StoryScene { id: string; index: number; title: string; summary: string; beats: StoryBeat[]; outputs: StoryGenerationRun[]; activeRunId?: string }
export interface StoryProject { id: string; title: string; logline?: string; bible: StoryBible; scenes: StoryScene[]; activeSceneId?: string; createdAt: string; updatedAt: string }

// 交付物（/api/ws/deliveries）条目
export interface AssetDelivery {
  name: string
  type: 'file' | 'dir'
  size: number
  url: string
  wsPath: string
  date?: string
  mtime?: string
  mtimeMs?: number
  openPath?: string
}

export type AssetKind = 'image' | 'video' | 'audio' | 'text' | 'presentation' | 'other'
export type AssetTimeRange = 'all' | 'today' | '7d' | '30d'

export interface AssetItem {
  id: string
  name: string
  path: string
  url: string
  size: number
  date: string
  mtimeMs: number
  kind: AssetKind
  source: 'artifact' | 'delivery'
  project: string
  isDirectory?: boolean
  openPath?: string
}

export interface AssetFilterQuery {
  kind?: AssetKind | 'all'
  source?: AssetItem['source'] | 'all'
  project?: string | 'all'
  timeRange?: AssetTimeRange
  search?: string
  now?: number
}

// 工具调用 5 态归一（AionUi normalizeToolCall 路线）——前端统一状态，不直接消费上游原始态
export type ToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled'

// 流式进行中的工具卡状态
export interface RunningTool {
  id: string
  name: string
  argsText: string
  output: string
  isError?: boolean
  running: boolean
  status?: ToolStatus
}

export interface SessionMessages {
  messages: ChatMessage[]
  leafId?: string | null
  truncated?: boolean
  total?: number
}

/** 技能库摘要：来源和用途由服务端根据安装位置及说明推导，前端只负责展示与筛选。 */
export interface SkillSummary {
  name: string
  description: string
  location: string
  path?: string
  source?: 'local' | 'online' | 'builtin'
  sourceLabel?: string
  category?: string
  categoryLabel?: string
  tags?: string[]
}

// SSE 事件（/api/sessions/:id/stream）
export interface SseEvent {
  type: string
  seq: number
  data: any
  ts: number
}
