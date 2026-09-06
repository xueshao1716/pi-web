export const VIDEO_SCENES: Record<string, {
  name: string
  icon: string
  subject: string
  action: string
  scene: string
  lighting: string
  camera: string
  style: string
  quality: string
  constraint: string
  seconds: string
  frame: string
}>
export function buildVideoPrompt(input?: Record<string, string>): string
