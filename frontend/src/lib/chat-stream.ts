import type { RunningTool } from '../types'

export interface ToolStartEvent {
  id: string
  name?: string
  args?: unknown
}

function toolArgsText(args: unknown): string {
  if (typeof args === 'object' && args !== null) {
    const value = args as { command?: unknown; path?: unknown }
    if (value.command != null) return String(value.command)
    if (value.path != null) return String(value.path)
    return JSON.stringify(args)
  }
  return String(args || '')
}

/** Add a tool start, or refresh the existing entry with the same tool-call id. */
export function upsertRunningTool(tools: RunningTool[], event: ToolStartEvent): RunningTool[] {
  const next: RunningTool = {
    id: event.id,
    name: event.name || 'tool',
    argsText: toolArgsText(event.args),
    output: '',
    running: true,
    status: 'running',
  }
  const index = tools.findIndex(tool => tool.id === event.id)
  if (index < 0) return [...tools, next]

  return tools.map((tool, toolIndex) => toolIndex === index ? {
    ...tool,
    name: next.name,
    argsText: next.argsText,
  } : tool)
}
