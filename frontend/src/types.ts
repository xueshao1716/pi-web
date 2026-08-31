// 共享类型：pi-web API 契约（与 server.mjs 对齐）
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
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  files?: { path: string; name?: string }[]
  images?: string[]   // dataURI 或 URL
  audios?: string[]   // URL
  notes?: string[]    // 系统提示条（SSE note 事件）
  tools?: ToolCall[]
  think?: string
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
}

// SSE 事件（/api/sessions/:id/stream）
export interface SseEvent {
  type: string
  seq: number
  data: any
  ts: number
}
