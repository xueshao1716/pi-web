export const ROUTE_LABELS = {
  chat: '对话',
  board: '工作台',
  lingxi: '灵感',
  workshop: '创作',
  models: '模型',
  assets: '资产',
  tasks: '任务',
  apps: '知识',
  engine: '能力',
  themes: '主题',
  sessiondb: '会话库',
  system: '系统',
} as const

export const RAIL_PRIMARY = ['chat', 'board', 'workshop', 'assets', 'tasks'] as const

export const RAIL_MORE = ['lingxi', 'apps', 'engine', 'sessiondb', 'system'] as const
