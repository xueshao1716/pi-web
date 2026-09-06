import { useEffect } from 'react'

const BOARD_HREF = '/static/workshop-ui/index.html?vanilla=1'

export default function WorkshopUiBoard() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem('yuanshu-open-ui') !== '1') return
      sessionStorage.removeItem('yuanshu-open-ui')
    } catch {
      return
    }
    window.location.assign(BOARD_HREF)
  }, [])

  return (
    <div className="rounded-pi-lg border border-pi-border-soft bg-pi-bg2 px-4 py-10 text-sm text-pi-dim">
      <p>界面工坊在整页打开官方画布。点上方「界面工坊」或下面的按钮进入。</p>
      <a href={BOARD_HREF} className="inline-flex min-h-11 items-center text-pi-accent"
        onClick={() => { try { sessionStorage.setItem('yuanshu-open-ui', '1') } catch {} }}>
        打开界面工坊
      </a>
    </div>
  )
}
