function visibleViewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight
}

/** Keep the mobile app height aligned with the actually visible viewport. */
export function installVisualViewportHeight(): () => void {
  const update = () => {
    document.documentElement.style.setProperty('--pi-viewport-height', `${visibleViewportHeight()}px`)
  }
  const viewport = window.visualViewport

  update()
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)

  return () => {
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
  }
}
