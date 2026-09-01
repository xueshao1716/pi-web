function visibleViewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight
}

function keyboardState(): { inset: number; open: boolean; overlay: boolean } {
  const viewport = window.visualViewport
  if (!viewport) return { inset: 0, open: false, overlay: false }
  // Android WebView 的软键盘有两种模式：adjustResize 会缩小布局视口，
  // overlay 模式只缩小 visualViewport。只在后一种模式额外抬高输入栏，避免重复上移。
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight)
  const visibleBottom = viewport.height + viewport.offsetTop
  const inset = Math.max(0, layoutHeight - visibleBottom)
  const open = inset > 80
  const overlay = open && layoutHeight - viewport.height > 80
  return { inset: overlay ? inset : 0, open, overlay }
}

function isTextEditorFocused(): boolean {
  const element = document.activeElement
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || element?.getAttribute('contenteditable') === 'true'
}

/** Keep the mobile app and composer aligned with the actually visible viewport. */
export function installVisualViewportHeight(): () => void {
  const update = () => {
    const height = visibleViewportHeight()
    const state = keyboardState()
    document.documentElement.style.setProperty('--pi-viewport-height', `${height}px`)
    document.documentElement.style.setProperty('--pi-keyboard-inset', `${state.inset}px`)
    const keyboardOpen = state.open && isTextEditorFocused()
    document.documentElement.classList.toggle('keyboard-open', keyboardOpen)
    document.documentElement.classList.toggle('keyboard-overlay', keyboardOpen && state.overlay)
  }
  const viewport = window.visualViewport

  update()
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  document.addEventListener('focusin', update)
  document.addEventListener('focusout', update)

  return () => {
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    document.removeEventListener('focusin', update)
    document.removeEventListener('focusout', update)
    document.documentElement.classList.remove('keyboard-open', 'keyboard-overlay')
    document.documentElement.style.removeProperty('--pi-keyboard-inset')
  }
}
