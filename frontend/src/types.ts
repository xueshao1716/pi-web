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
  args: string
  output?: string
  isError?: boolean
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
}

// 流式进行中的工具卡状态
export interface RunningTool {
  id: string
  name: string
  argsText: string
  output: string
  isError?: boolean
  running: boolean
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
