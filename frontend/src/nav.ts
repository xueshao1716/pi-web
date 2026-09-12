export const ROUTE_LABELS = {
  chat: '对话',
  board: '工作台',
  review: '改动验收',
  lingxi: '灵感',
  workshop: '创作',
  models: '模型',
  assets: '资产',
  tasks: '任务',
  downloads: '下载中心',
  apps: '知识',
  engine: '能力',
  themes: '主题',
  sessiondb: '会话库',
  system: '系统',
} as const

// 桌面主栏只放用户每天会找的工作入口；引擎从“更多”提升为一等入口。
export const RAIL_PRIMARY = ['chat', 'board', 'review', 'workshop', 'assets', 'tasks', 'engine'] as const

export const RAIL_MORE = ['lingxi', 'apps', 'sessiondb', 'downloads', 'system'] as const
